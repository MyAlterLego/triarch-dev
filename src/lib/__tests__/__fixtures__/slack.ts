/**
 * Shared Slack fixture factory for Phase 7 Wave 0.
 *
 * Centralizes Slack request body generation and HMAC signing so tests for
 * /api/slack/interact, /api/slack/commands, /api/slack/events, and the
 * recordSlackAudit helper all use the same fixture surface.
 *
 * The HMAC pattern matches src/lib/slack-crypto.ts verifySlackSignature
 * exactly: basestring = `v0:${timestamp}:${rawBody}`, signature prefix `v0=`.
 *
 * Default signing secret 'test_signing_secret' must be set as
 * process.env.SLACK_SIGNING_SECRET in the consuming test file's beforeEach
 * so the route handler's verifySlackSignature reads the same secret.
 */
import { createHmac } from 'node:crypto';

const DEFAULT_SIGNING = 'test_signing_secret';

// ─── Slash command payload (application/x-www-form-urlencoded) ───────────────

export function makeSlashCommandPayload(overrides: Partial<{
  command: string;
  text: string;
  userId: string;
  userName: string;
  channelId: string;
  responseUrl: string;
}> = {}): string {
  const params = new URLSearchParams({
    command: overrides.command ?? '/triarch',
    text: overrides.text ?? '',
    user_id: overrides.userId ?? 'U_STAFF',
    user_name: overrides.userName ?? 'mike',
    channel_id: overrides.channelId ?? 'C_GENERAL',
    response_url: overrides.responseUrl ?? 'https://hooks.slack.com/commands/test',
    team_id: 'T_TEST',
    api_app_id: 'A_TEST',
  });
  return params.toString();
}

// ─── Events API payload (application/json) ───────────────────────────────────

export function makeEventPayload(overrides: Partial<{
  type: string;
  eventId: string;
  eventType: string;
  userId: string;
  text: string;
  channel: string;
  ts: string;
  challenge: string;
}> = {}): string {
  if (overrides.type === 'url_verification' || overrides.challenge) {
    return JSON.stringify({
      type: 'url_verification',
      challenge: overrides.challenge ?? 'test-challenge-abc',
      token: 'test-token',
    });
  }
  return JSON.stringify({
    type: 'event_callback',
    token: 'test-token',
    team_id: 'T_TEST',
    api_app_id: 'A_TEST',
    event_id: overrides.eventId ?? 'Ev_TEST_001',
    event_time: 1715000000,
    event: {
      type: overrides.eventType ?? 'app_mention',
      user: overrides.userId ?? 'U_CUSTOMER',
      text: overrides.text ?? '<@UBOT> status truth-treason',
      ts: overrides.ts ?? '1715000000.000100',
      channel: overrides.channel ?? 'C_GENERAL',
      event_ts: overrides.ts ?? '1715000000.000100',
    },
  });
}

// ─── Interactive payload (existing /api/slack/interact format) ───────────────

export function makeSlackInteractPayload(overrides: Partial<{
  actionId: string;
  value: string;
  userId: string;
  channelId: string;
  messageTs: string;
}> = {}): string {
  const p = {
    type: 'block_actions',
    user: { id: overrides.userId ?? 'U_STAFF', name: 'mike', username: 'mike' },
    actions: [{ action_id: overrides.actionId ?? 'slack_promote', value: overrides.value ?? 'test', block_id: 'b1' }],
    channel: { id: overrides.channelId ?? 'C_RELEASE', name: 'release-approvals' },
    message: { ts: overrides.messageTs ?? '1714000000.000100' },
  };
  return new URLSearchParams({ payload: JSON.stringify(p) }).toString();
}

// ─── Signed Request builder (reusable across all 3 Slack routes) ─────────────

export function buildSignedSlackRequest(
  url: string,
  rawBody: string,
  contentType: 'application/x-www-form-urlencoded' | 'application/json',
  opts: { signingSecret?: string; tsOffsetSec?: number; tamperSig?: boolean } = {}
): Request {
  const secret = opts.signingSecret ?? DEFAULT_SIGNING;
  const ts = String(Math.floor(Date.now() / 1000) + (opts.tsOffsetSec ?? 0));
  let sig = 'v0=' + createHmac('sha256', secret).update(`v0:${ts}:${rawBody}`).digest('hex');
  if (opts.tamperSig) {
    sig = sig.slice(0, -2) + (sig.endsWith('aa') ? 'bb' : 'aa');
  }
  return new Request(url, {
    method: 'POST',
    body: rawBody,
    headers: new Headers({
      'x-slack-request-timestamp': ts,
      'x-slack-signature': sig,
      'content-type': contentType,
    }),
  });
}
