import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { releaseLogs, releaseApprovals } from '@/db/schema';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { verifySlackSignature, verifyPayload } from '@/lib/slack-crypto';
import { resolveSlackUserEmail } from '@/lib/slack-identity';
import { rejectRelease } from '@/lib/release-actions';
import { promoteAndAudit } from '@/lib/release-promotion';
import { getActionHandler } from '@/lib/slack-actions';
import type { SlackInteractivePayload } from '@/lib/slack-actions';
import { recordSlackAudit } from '@/lib/slack-audit';

type ActionId = 'slack_promote' | 'slack_reject';
const ACTION_TO_EXPECTED: Record<ActionId, 'promote' | 'reject'> = {
  slack_promote: 'promote',
  slack_reject: 'reject',
};

/**
 * Signature-verified Slack interactive callback for release approval.
 * Dispatches to approveRelease (slack_promote) or rejectRelease (slack_reject)
 * after verifying the Slack request signature and embedded button payload.
 */
export async function POST(req: NextRequest) {
  // STEP 0: Capture request start time for audit latency (D-13).
  // Must be BEFORE req.text() to include body-read latency.
  const requestReceivedAt = Date.now();

  // STEP 1: Read raw body ONCE — this is the exact bytes Slack signed.
  // Must happen before any parsing. Using formData() would consume the stream
  // and leave nothing for signature verification — raw text preserves exact bytes for HMAC.
  const rawBody = await req.text();

  // STEP 2: Read signature headers
  const timestamp = req.headers.get('x-slack-request-timestamp');
  const signature = req.headers.get('x-slack-signature');

  // STEP 3: Verify Slack signature — BEFORE any payload interpretation or DB access.
  // A 5-minute replay window is enforced inside verifySlackSignature.
  // On failure (bad_signature, stale, malformed, no_secret) → 401.
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

  // STEP 4: Parse URL-encoded body to extract the `payload` form field
  const params = new URLSearchParams(rawBody);
  const payloadStr = params.get('payload');
  if (!payloadStr) {
    void recordSlackAudit({
      actionId: '_parse_failed',
      actorEmail: null,
      actorSlackId: 'unknown',
      rawBody,
      responseStatus: 400,
      latencyMs: Date.now() - requestReceivedAt,
    });
    return NextResponse.json({ error: 'no_payload' }, { status: 400 });
  }

  let payload: SlackInteractivePayload;

  try {
    payload = JSON.parse(payloadStr);
  } catch {
    void recordSlackAudit({
      actionId: '_parse_failed',
      actorEmail: null,
      actorSlackId: 'unknown',
      rawBody,
      responseStatus: 400,
      latencyMs: Date.now() - requestReceivedAt,
    });
    return NextResponse.json({ error: 'malformed_payload' }, { status: 400 });
  }

  // STEP 5: Validate payload structure
  if (payload?.type !== 'block_actions' || !Array.isArray(payload.actions) || !payload.actions[0]) {
    void recordSlackAudit({
      actionId: '_parse_failed',
      actorEmail: null,
      actorSlackId: (payload as SlackInteractivePayload | undefined)?.user?.id ?? 'unknown',
      rawBody,
      responseStatus: 400,
      latencyMs: Date.now() - requestReceivedAt,
    });
    return NextResponse.json({ error: 'unsupported_payload' }, { status: 400 });
  }

  const action = payload.actions[0];
  const actionId = action.action_id as string;
  const packedValue = action.value as string;
  const slackUserId = payload.user?.id as string | undefined;
  const slackUserName = (payload.user?.username ?? payload.user?.name ?? 'someone') as string;

  // STEP 6: Capture audit context shared across all action handlers
  const ipAddress = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  const userAgent = req.headers.get('user-agent')?.slice(0, 512) ?? null;

  // STEP 7: Dispatch by action_id.
  //   - 'slack_*' actions are release-gating (Phase 3) — handled inline below
  //     with embedded payload signature verification (GATE-08).
  //   - All other action_ids (bug/feature workflows, future expansions) route
  //     through the unified registry in @/lib/slack-actions.
  if (actionId !== 'slack_promote' && actionId !== 'slack_reject') {
    const handler = getActionHandler(actionId);
    if (!handler) {
      void recordSlackAudit({
        actionId,
        actorEmail: null,
        actorSlackId: slackUserId ?? 'unknown',
        rawBody,
        responseStatus: 200,
        latencyMs: Date.now() - requestReceivedAt,
      });
      return NextResponse.json({
        response_type: 'ephemeral',
        replace_original: false,
        text: 'Unknown action',
      });
    }
    try {
      const result = await handler({ payload, action, rawBody, ipAddress, userAgent });
      void recordSlackAudit({
        actionId,
        actorEmail: null,
        actorSlackId: slackUserId ?? 'unknown',
        rawBody,
        responseStatus: 200,
        latencyMs: Date.now() - requestReceivedAt,
      });
      return NextResponse.json(result);
    } catch (err) {
      console.error(`[slack-interact] handler for action_id=${actionId} threw`, err);
      void recordSlackAudit({
        actionId,
        actorEmail: null,
        actorSlackId: slackUserId ?? 'unknown',
        rawBody,
        responseStatus: 200,
        latencyMs: Date.now() - requestReceivedAt,
      });
      return NextResponse.json({
        response_type: 'ephemeral',
        replace_original: false,
        text: 'Action failed — see server logs.',
      });
    }
  }

  // STEP 8: Verify the embedded button value signature — BEFORE release DB lookup.
  // This defends against button-value tampering (GATE-08).
  const expected = ACTION_TO_EXPECTED[actionId as ActionId];
  const verifiedPayload = await verifyPayload(packedValue, expected);
  if (!verifiedPayload.ok) {
    void recordSlackAudit({
      actionId,
      actorEmail: null,
      actorSlackId: slackUserId ?? 'unknown',
      rawBody,
      responseStatus: 401,
      latencyMs: Date.now() - requestReceivedAt,
    });
    return NextResponse.json({ error: 'invalid_payload_signature' }, { status: 401 });
  }

  // STEP 9: Resolve Slack user_id to staff email — BEFORE any DB writes.
  // Unmapped users get an ephemeral message and no action is taken.
  const email = await resolveSlackUserEmail(slackUserId);
  if (!email) {
    console.warn('[slack-interact] unmapped user', { slackUserId });
    void recordSlackAudit({
      actionId,
      actorEmail: null,
      actorSlackId: slackUserId ?? 'unknown',
      rawBody,
      responseStatus: 200,
      latencyMs: Date.now() - requestReceivedAt,
    });
    return NextResponse.json({
      response_type: 'ephemeral',
      replace_original: false,
      text: 'Your Slack user is not mapped to a staff account. Contact admin.',
    });
  }

  // STEP 10: Look up release by id (extracted from the verified packed payload)
  const [release] = await db
    .select()
    .from(releaseLogs)
    .where(eq(releaseLogs.id, verifiedPayload.releaseId));

  if (!release) {
    void recordSlackAudit({
      actionId,
      actorEmail: email,
      actorSlackId: slackUserId ?? 'unknown',
      rawBody,
      responseStatus: 200,
      latencyMs: Date.now() - requestReceivedAt,
    });
    return NextResponse.json({
      response_type: 'ephemeral',
      replace_original: false,
      text: 'Release not found',
    });
  }

  // STEP 11: Stale-message guard — release is in a TERMINAL state.
  // Slack flow semantics:
  //   - status='dev'      → customer hasn't approved yet (Slack message shouldn't have fired; if it did, neither button is valid)
  //   - status='approved' → customer approved; staff Slack click promote/reject is the next step (NOT terminal)
  //   - status='promoted' → workflow dispatched + completed; terminal
  //   - status='rejected' → terminal
  const wantsApprove = actionId === 'slack_promote';
  const wantsReject = actionId === 'slack_reject';
  const isTerminal = release.status === 'promoted' || release.status === 'rejected';

  if (isTerminal) {
    const [existing] = await db
      .select()
      .from(releaseApprovals)
      .where(
        and(
          eq(releaseApprovals.releaseId, release.id),
          eq(releaseApprovals.decision, release.status!)
        )
      )
      .orderBy(desc(releaseApprovals.approvedAt))
      .limit(1);

    const date = existing?.approvedAt?.toISOString().slice(0, 10) ?? 'earlier';
    const actor = existing?.approverEmail ?? 'someone';
    const verb = release.status === 'promoted' ? 'promoted' : 'rejected';

    void recordSlackAudit({
      actionId,
      actorEmail: email,
      actorSlackId: slackUserId ?? 'unknown',
      rawBody,
      responseStatus: 200,
      latencyMs: Date.now() - requestReceivedAt,
    });
    return NextResponse.json({
      response_type: 'ephemeral',
      replace_original: true,
      text: `Already ${verb} by ${actor} on ${date}`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: release.status === 'promoted'
              ? `:white_check_mark: *Already promoted by ${actor} on ${date}*`
              : `:x: *Already rejected by ${actor} on ${date}*`,
          },
        },
      ],
    });
  }

  // STEP 13 + 14: Dispatch (ipAddress/userAgent captured at STEP 6).
  // slack_promote on a customer-approved release → fire workflow_dispatch + write promotion audit columns.
  // (Customer's approve already happened on the customer page; we do NOT re-call approveRelease.)
  if (wantsApprove) {
    if (release.status !== 'approved') {
      void recordSlackAudit({
        actionId,
        actorEmail: email,
        actorSlackId: slackUserId ?? 'unknown',
        rawBody,
        responseStatus: 200,
        latencyMs: Date.now() - requestReceivedAt,
      });
      return NextResponse.json({
        response_type: 'ephemeral',
        replace_original: false,
        text: `Cannot promote: release status is "${release.status}", expected "approved". Customer must approve first on the releases page.`,
      });
    }
    // Atomic race guard — same mechanism as POST /api/admin/releases/[id]/promote.
    // Only the first concurrent caller (web or Slack) gets the UPDATE row back;
    // the loser gets an empty array and MUST NOT call promoteAndAudit.
    const [claimed] = await db
      .update(releaseLogs)
      .set({ promotionDispatchedAt: new Date(), promotionDispatchedBy: email })
      .where(and(eq(releaseLogs.id, release.id), isNull(releaseLogs.promotionDispatchedAt)))
      .returning({ id: releaseLogs.id });

    if (!claimed) {
      // Web (or another Slack click) won the race — skip dispatch entirely.
      void recordSlackAudit({
        actionId,
        actorEmail: email,
        actorSlackId: slackUserId ?? 'unknown',
        rawBody,
        responseStatus: 200,
        latencyMs: Date.now() - requestReceivedAt,
      });
      return NextResponse.json({
        response_type: 'ephemeral',
        replace_original: false,
        text: 'Already promoted by another route — no second dispatch fired',
      });
    }

    // Fire-and-forget promotion dispatch. Slack 3-second rule: respond before any GitHub API calls.
    if (payload.channel?.id && payload.message?.ts) {
      const channelId = payload.channel.id;
      const messageTs = payload.message.ts;
      promoteAndAudit({
        release,
        actorEmail: email,
        channelId,
        messageTs,
        slackUserName,
      }).catch((err) => {
        console.error('[slack-interact] promoteAndAudit unexpected error', err);
      });
    }

    // STEP 15: Replace original message to reflect new promoted state
    void recordSlackAudit({
      actionId,
      actorEmail: email,
      actorSlackId: slackUserId ?? 'unknown',
      rawBody,
      responseStatus: 200,
      latencyMs: Date.now() - requestReceivedAt,
    });
    return NextResponse.json({
      replace_original: true,
      text: `Promoted to production by @${slackUserName}`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `:white_check_mark: *Promoted to production by @${slackUserName}* (${email})`,
          },
        },
      ],
    });
  }

  // wantsReject — fixed reason string for v1.14 (modal input deferred, CONTEXT.md Area 4)
  const rejectResult = await rejectRelease({
    release,
    approverEmail: email,
    reason: 'Rejected via Slack',
    ipAddress,
    userAgent,
  });

  if (!rejectResult.ok) {
    void recordSlackAudit({
      actionId,
      actorEmail: email,
      actorSlackId: slackUserId ?? 'unknown',
      rawBody,
      responseStatus: 200,
      latencyMs: Date.now() - requestReceivedAt,
    });
    return NextResponse.json({
      response_type: 'ephemeral',
      replace_original: false,
      text: rejectResult.message,
    });
  }

  // STEP 15: Replace original message to reflect rejected state
  void recordSlackAudit({
    actionId,
    actorEmail: email,
    actorSlackId: slackUserId ?? 'unknown',
    rawBody,
    responseStatus: 200,
    latencyMs: Date.now() - requestReceivedAt,
  });
  return NextResponse.json({
    replace_original: true,
    text: `Rejected by @${slackUserName}`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `:x: *Rejected by @${slackUserName}* (${email})`,
        },
      },
    ],
  });
}
