// POST /api/internal/promotable-projects-cron
//
// Proactive Slack push: scans every project, computes the same dev→main
// gate verdict that /admin/modules/ci-cd renders, and posts a Block Kit
// message to the configured Slack channel listing every project ready to
// promote with an inline [Promote] button per row.
//
// Closes the daily-driver loop:
//   notification → one-click button → existing promote endpoint → done.
//
// Each [Promote] button click dispatches through /api/slack/interact →
// slack-actions/promote.ts → the same ensurePullRequest + mergeBranchToMain
// helpers used by the slash command and the admin UI button.
//
// Auth: Bearer <INTERNAL_HMAC_SECRET> in Authorization header. Same secret
// already used by /api/internal/dispatch; reusing avoids a new secret.
//
// Idempotency: a project is included in the message only when:
//   - the gate verdict is 'pass' or 'never_promoted_pass', AND
//   - no `cicd_promote_notification` approval_events row exists for this
//     project within the last NOTIFY_COOLDOWN_MS (default 2h)
//
// This keeps the channel quiet — one ping per promotable window per project,
// not one per cron tick.

import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq, gte } from 'drizzle-orm';
import { getSecret } from '@triarchsecurity/secrets';
import { db } from '@/lib/db';
import { projects, approvalEvents } from '@/db/schema';
import { getProjectPipelineSummaries, type PipelineSummary } from '@/lib/pipeline-summary';
import { postSlackChannelMessage } from '@/lib/slack';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MIN_DEV_AGE_S = 300;
const NOTIFY_COOLDOWN_MS = 2 * 60 * 60 * 1000; // 2h
const SUBJECT_TYPE = 'cicd_promote_notification';

type Verdict = 'pass' | 'block' | 'no_dev' | 'never_promoted_pass';

// Mirrors computeVerdict in /admin/modules/ci-cd/page.tsx. Pre-extraction
// shared lib is a refactor; duplicating 30 lines is cheaper than the lib
// rename + import update across both surfaces.
function semverCmp(a: string, b: string): number {
  const norm = (s: string) => s.replace(/^v/, '').split('-')[0];
  const ap = norm(a).split('.').map((n) => parseInt(n, 10) || 0);
  const bp = norm(b).split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const av = ap[i] ?? 0;
    const bv = bp[i] ?? 0;
    if (av < bv) return -1;
    if (av > bv) return 1;
  }
  return 0;
}

function computeVerdict(summary: PipelineSummary | null): Verdict {
  if (!summary || !summary.devVersion) return 'no_dev';
  const dev = summary.devVersion;
  const prod = summary.prodVersion;
  const devAt = summary.devDeployedAt;
  const ageS = devAt ? (Date.now() - new Date(devAt).getTime()) / 1000 : Infinity;
  if (!prod) return ageS < MIN_DEV_AGE_S ? 'block' : 'never_promoted_pass';
  if (semverCmp(dev, prod) <= 0) return 'block';
  if (ageS < MIN_DEV_AGE_S) return 'block';
  return 'pass';
}

interface PromotableRow {
  key: string;
  name: string;
  verdict: Extract<Verdict, 'pass' | 'never_promoted_pass'>;
  devVersion: string;
  prodVersion: string | null;
  whatChanged: string | null;
}

async function recentlyNotified(projectKey: string): Promise<boolean> {
  const cutoff = new Date(Date.now() - NOTIFY_COOLDOWN_MS);
  const rows = await db
    .select({ id: approvalEvents.id })
    .from(approvalEvents)
    .where(
      and(
        eq(approvalEvents.subjectType, SUBJECT_TYPE),
        eq(approvalEvents.project, projectKey),
        gte(approvalEvents.createdAt, cutoff),
      ),
    )
    .orderBy(desc(approvalEvents.createdAt))
    .limit(1);
  return rows.length > 0;
}

function buildBlocks(rows: PromotableRow[]): unknown[] {
  const header = {
    type: 'header',
    text: {
      type: 'plain_text',
      text: `🚀 Promotable now (${rows.length})`,
      emoji: true,
    },
  };
  const projectBlocks: unknown[] = rows.flatMap((r) => {
    const changed = r.whatChanged ? `\n${r.whatChanged}` : '';
    const prodLabel = r.prodVersion ? `→ main \`v${r.prodVersion}\`` : '→ first promotion (no prod yet)';
    return [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${r.name}* · dev \`v${r.devVersion}\` ${prodLabel} · gate: ✓ ${r.verdict.replace(/_/g, ' ')}${changed}`,
        },
        accessory: {
          type: 'button',
          action_id: 'promote_project',
          text: { type: 'plain_text', text: 'Promote', emoji: true },
          value: r.key,
          style: 'primary',
          confirm: {
            title: { type: 'plain_text', text: `Promote ${r.name}?` },
            text: {
              type: 'mrkdwn',
              text: `This opens (or reuses) the dev→main PR on \`${r.name}\` and merges it as a real merge commit. That triggers a prod deploy. Continue?`,
            },
            confirm: { type: 'plain_text', text: 'Promote' },
            deny: { type: 'plain_text', text: 'Cancel' },
          },
        },
      },
    ];
  });
  return [header, ...projectBlocks];
}

export async function POST(req: NextRequest) {
  // Auth: Bearer <INTERNAL_HMAC_SECRET>
  let secret: string;
  try {
    secret = await getSecret('INTERNAL_HMAC_SECRET');
  } catch {
    return NextResponse.json({ error: 'server_misconfigured' }, { status: 500 });
  }
  const auth = req.headers.get('authorization') ?? '';
  const presented = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (presented !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let dryRun = false;
  try {
    if (req.headers.get('content-length') && Number(req.headers.get('content-length')) > 0) {
      const body = (await req.json()) as { dry_run?: boolean };
      dryRun = body.dry_run === true;
    }
  } catch {
    // empty/invalid body — treat as no body
  }

  // Channel to post to: SLACK_PROMOTE_CHANNEL env var (override), else default.
  // The default '#ottobot-actions' matches OttoBot's existing notification channel.
  const channel = process.env.SLACK_PROMOTE_CHANNEL ?? '#ottobot-actions';

  // 1. Load all projects + their pipeline summaries.
  const projectRows = await db.select({ key: projects.key, name: projects.name }).from(projects);
  if (projectRows.length === 0) {
    return NextResponse.json({ ok: true, promotable: 0, notified: 0, channel, dry_run: dryRun, projects: [] });
  }
  const summaries = await getProjectPipelineSummaries(projectRows.map((p) => p.key));
  const byKey = new Map(summaries.map((s) => [s.projectKey, s]));

  // 2. Filter to promotable + not recently notified.
  const promotable: PromotableRow[] = [];
  const skippedCooldown: string[] = [];
  for (const p of projectRows) {
    const summary = byKey.get(p.key) ?? null;
    const verdict = computeVerdict(summary);
    if (verdict !== 'pass' && verdict !== 'never_promoted_pass') continue;

    if (await recentlyNotified(p.key)) {
      skippedCooldown.push(p.key);
      continue;
    }
    promotable.push({
      key: p.key,
      name: p.name,
      verdict,
      devVersion: summary?.devVersion ?? '?',
      prodVersion: summary?.prodVersion ?? null,
      whatChanged: summary?.whatChangedOneliner ?? null,
    });
  }

  // 3. If nothing to say, exit quietly — no channel noise on empty ticks.
  if (promotable.length === 0) {
    return NextResponse.json({
      ok: true,
      promotable: 0,
      notified: 0,
      skipped_cooldown: skippedCooldown.length,
      channel,
      dry_run: dryRun,
      projects: [],
    });
  }

  // 4. Dry-run returns the candidate list without posting.
  if (dryRun) {
    return NextResponse.json({
      ok: true,
      promotable: promotable.length,
      notified: 0,
      skipped_cooldown: skippedCooldown.length,
      channel,
      dry_run: true,
      projects: promotable,
    });
  }

  // 5. Post the Block Kit message.
  const blocks = buildBlocks(promotable);
  const fallbackText = `${promotable.length} project${promotable.length === 1 ? '' : 's'} ready to promote: ${promotable.map((r) => r.name).join(', ')}`;
  const post = await postSlackChannelMessage({ channel, text: fallbackText, blocks });

  if (!post.ok) {
    return NextResponse.json(
      { ok: false, error: 'slack_post_failed', detail: post.error, promotable: promotable.length, channel },
      { status: 502 },
    );
  }

  // 6. Audit one row per project notified so the cooldown filter sees them next tick.
  for (const r of promotable) {
    await db.insert(approvalEvents).values({
      subjectType: SUBJECT_TYPE,
      subjectId: `${r.key}:dev-to-main`,
      decision: 'notified',
      surface: 'slack',
      actorEmail: 'system:promotable-projects-cron',
      metadata: {
        channel,
        slack_ts: post.ts ?? null,
        dev_version: r.devVersion,
        prod_version: r.prodVersion,
        verdict: r.verdict,
        what_changed: r.whatChanged,
      },
      project: r.key,
    }).catch((err) => console.error('[promotable-projects-cron] audit insert failed for', r.key, err));
  }

  return NextResponse.json({
    ok: true,
    promotable: promotable.length,
    notified: promotable.length,
    skipped_cooldown: skippedCooldown.length,
    channel,
    slack_ts: post.ts,
    dry_run: false,
    projects: promotable,
  });
}
