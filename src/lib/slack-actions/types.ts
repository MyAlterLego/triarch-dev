/**
 * Shared Slack interactivity payload types — used by the unified
 * /api/slack/interact dispatcher and the per-domain handler modules
 * (release, bug, feature). All handlers receive the same parsed payload
 * shape after Slack signature verification has already passed.
 */

export interface SlackUser {
  id: string;
  name: string;
  username?: string;
}

export interface SlackAction {
  action_id: string;
  block_id: string;
  value: string;
}

export interface SlackInteractivePayload {
  type: string;
  user: SlackUser;
  actions: SlackAction[];
  response_url?: string;
  message?: { ts: string };
  channel?: { id: string; name?: string };
}

export interface SlackHandlerContext {
  payload: SlackInteractivePayload;
  action: SlackAction;
  rawBody: string;
  ipAddress: string | null;
  userAgent: string | null;
}

/**
 * A handler returns a Slack-compatible response body that the dispatcher
 * forwards directly. The handler is responsible for its own DB writes and
 * any background work it spawns (fire-and-forget Promises are fine).
 */
export type SlackActionResponse = Record<string, unknown>;
