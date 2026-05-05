/**
 * Phase 7 OTTOBOT-05 — Slack Events API webhook.
 *
 * Handles two event types:
 *   1. url_verification — Slack's one-time handshake when configuring the
 *      Events API URL. Returns the challenge token. Bypasses HMAC because
 *      Slack sends this BEFORE the signing secret relationship is fully
 *      established (RESEARCH Pitfall 2 / CONTEXT D-19).
 *   2. event_callback with event.type='app_mention' — `@OttoBot status <project>`
 *      mentions. Strips the bot mention prefix, parses subcommand+args,
 *      and posts a threaded reply with the same Block Kit as
 *      /triarch status (shared via src/lib/slack-status.ts from plan 07-03).
 *
 * Deduplication: in-memory Map<event_id, timestamp> with 1000-entry cap and
 * FIFO eviction (CONTEXT D-20 / RESEARCH §7). Duplicate event_id returns 200
 * immediately — no handler invocation, no audit row (RESEARCH §7).
 *
 * Per Phase 7 D-08: every non-dedup response path calls void recordSlackAudit(...)
 * so the audit row write never blocks Slack's 3-second response window.
 */
import { NextRequest, NextResponse } from 'next/server';
import { verifySlackSignature } from '@/lib/slack-crypto';
import { resolveSlackUserEmail } from '@/lib/slack-identity';
import { recordSlackAudit } from '@/lib/slack-audit';
import { postSlackThreadedReply } from '@/lib/slack';
import { fetchProjectStatus, buildStatusBlocks, listProjectKeys } from '@/lib/slack-status';

// ─── In-memory event dedup (CONTEXT D-20 / RESEARCH §7) ──────────────────────

const DEDUP_MAX = 1000;
const dedupMap = new Map<string, number>(); // eventId → insertedAt timestamp

function isDuplicateEvent(eventId: string): boolean {
  if (!eventId) return false; // missing id → never dedup
  if (dedupMap.has(eventId)) return true;
  // FIFO eviction at capacity. Map preserves insertion order → keys().next() = oldest
  if (dedupMap.size >= DEDUP_MAX) {
    const firstKey = dedupMap.keys().next().value as string;
    dedupMap.delete(firstKey);
  }
  dedupMap.set(eventId, Date.now());
  return false;
}

/** Test-only helper. Resets in-memory dedup state between test cases. */
export function resetDedupForTests(): void {
  dedupMap.clear();
}

// ─── Mention text parser (RESEARCH §5) ───────────────────────────────────────

const MENTION_PREFIX_RE = /^<@[A-Z0-9]+>\s*/i;

function parseMentionText(rawText: string): { subcommand: string; args: string[] } {
  const stripped = rawText.replace(MENTION_PREFIX_RE, '').trim();
  if (!stripped) return { subcommand: '', args: [] };
  const tokens = stripped.split(/\s+/);
  const [subcommand, ...args] = tokens;
  return { subcommand: subcommand ?? '', args };
}

const HELP_TEXT_MENTION = [
  'Hi! Try one of these:',
  '• `@OttoBot status <project>` — Show release status for `<project>`',
  '• Use `/triarch deploy <project> <version>` (Slack slash command, staff only) to promote a release',
].join('\n');

// ─── POST handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const requestReceivedAt = Date.now();

  // STEP 1: Read raw body ONCE (RESEARCH Pitfall 1 — never call req.text() twice)
  const rawBody = await req.text();

  // STEP 2: Parse JSON. Must happen before url_verification check (D-19).
  let body: {
    type?: string;
    challenge?: string;
    event_id?: string;
    event?: {
      type?: string;
      user?: string;
      text?: string;
      ts?: string;
      channel?: string;
    };
  };
  try {
    body = JSON.parse(rawBody) as typeof body;
  } catch {
    void recordSlackAudit({
      actionId: '_parse_failed',
      actorEmail: null,
      actorSlackId: 'unknown',
      rawBody,
      responseStatus: 400,
      latencyMs: Date.now() - requestReceivedAt,
    });
    return NextResponse.json({ error: 'malformed_json' }, { status: 400 });
  }

  // STEP 3: url_verification — bypass HMAC entirely (CONTEXT D-19 / RESEARCH Pitfall 2)
  // Slack sends this BEFORE the signing relationship is established.
  if (body.type === 'url_verification') {
    void recordSlackAudit({
      actionId: 'event_url_verification',
      actorEmail: null,
      actorSlackId: 'unknown',
      rawBody,
      responseStatus: 200,
      latencyMs: Date.now() - requestReceivedAt,
    });
    return NextResponse.json({ challenge: body.challenge ?? '' }, { status: 200 });
  }

  // STEP 4: HMAC verify for all non-url_verification payloads
  const timestamp = req.headers.get('x-slack-request-timestamp');
  const signature = req.headers.get('x-slack-signature');
  const sigResult = await verifySlackSignature({ rawBody, timestamp, signature });
  if (!sigResult.ok) {
    void recordSlackAudit({
      actionId: '_sig_failed',
      actorEmail: null,
      actorSlackId: 'unknown',
      rawBody,
      responseStatus: 401,
      latencyMs: Date.now() - requestReceivedAt,
    });
    return NextResponse.json({ error: sigResult.reason }, { status: 401 });
  }

  // STEP 5: Require event_callback type with a nested event object
  if (body.type !== 'event_callback' || !body.event) {
    void recordSlackAudit({
      actionId: 'event_unsupported',
      actorEmail: null,
      actorSlackId: body.event?.user ?? 'unknown',
      rawBody,
      responseStatus: 200,
      latencyMs: Date.now() - requestReceivedAt,
    });
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  // STEP 6: In-memory dedup — short-circuit BEFORE any handler or audit (RESEARCH §7)
  const eventId = body.event_id ?? '';
  if (isDuplicateEvent(eventId)) {
    return NextResponse.json({ ok: true, dedup: true }, { status: 200 });
  }

  // STEP 7: app_mention handler
  if (body.event.type === 'app_mention') {
    const { subcommand, args } = parseMentionText(body.event.text ?? '');
    const slackUserId = body.event.user ?? 'unknown';
    const channel = body.event.channel ?? '';
    const threadTs = body.event.ts ?? '';
    const actorEmail = await resolveSlackUserEmail(slackUserId);

    if (subcommand === 'status') {
      const [projectArg] = args;

      if (!projectArg) {
        // status with no project → usage help
        if (channel && threadTs) {
          try {
            await postSlackThreadedReply({
              channel,
              thread_ts: threadTs,
              text: ':warning: Usage: `@OttoBot status <project>`',
            });
          } catch (err) {
            console.warn('[slack-events] threaded reply failed:', err);
          }
        }
        void recordSlackAudit({
          actionId: 'event_app_mention_help',
          actorEmail,
          actorSlackId: slackUserId,
          rawBody,
          responseStatus: 200,
          latencyMs: Date.now() - requestReceivedAt,
        });
        return NextResponse.json({ ok: true }, { status: 200 });
      }

      // Fetch project status (shared with /triarch status — plan 07-03)
      const status = await fetchProjectStatus(projectArg);

      if (channel && threadTs) {
        try {
          if (!status) {
            const knownKeys = await listProjectKeys(5);
            const hint = knownKeys.length ? ` Try: ${knownKeys.join(', ')}` : '';
            await postSlackThreadedReply({
              channel,
              thread_ts: threadTs,
              text: `:warning: Project '${projectArg}' not found.${hint}`,
            });
          } else {
            const blocks = buildStatusBlocks(
              status.project.key,
              status.devRelease,
              status.prodRelease,
              status.activeRCs,
              status.lastDeploys
            );
            await postSlackThreadedReply({
              channel,
              thread_ts: threadTs,
              text: `${status.project.key} — Release Status`,
              blocks,
            } as Parameters<typeof postSlackThreadedReply>[0] & { blocks?: unknown[] });
          }
        } catch (err) {
          // Slack best-effort per Phase 6 D-15 — audit still records 200
          console.warn('[slack-events] threaded reply failed:', err);
        }
      }

      void recordSlackAudit({
        actionId: 'event_app_mention_status',
        actorEmail,
        actorSlackId: slackUserId,
        rawBody,
        responseStatus: 200,
        latencyMs: Date.now() - requestReceivedAt,
      });
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    // Unknown / empty subcommand under app_mention → help text
    if (channel && threadTs) {
      try {
        await postSlackThreadedReply({
          channel,
          thread_ts: threadTs,
          text: HELP_TEXT_MENTION,
        });
      } catch (err) {
        console.warn('[slack-events] threaded help reply failed:', err);
      }
    }
    void recordSlackAudit({
      actionId: 'event_app_mention_help',
      actorEmail,
      actorSlackId: slackUserId,
      rawBody,
      responseStatus: 200,
      latencyMs: Date.now() - requestReceivedAt,
    });
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  // STEP 8: Other event types — acknowledge politely
  void recordSlackAudit({
    actionId: 'event_unsupported',
    actorEmail: null,
    actorSlackId: body.event.user ?? 'unknown',
    rawBody,
    responseStatus: 200,
    latencyMs: Date.now() - requestReceivedAt,
  });
  return NextResponse.json({ ok: true }, { status: 200 });
}
