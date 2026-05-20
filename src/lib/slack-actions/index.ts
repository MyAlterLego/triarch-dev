/**
 * Unified Slack action dispatcher registry.
 *
 * OttoBot's single Interactivity Request URL points at /api/slack/interact.
 * That endpoint verifies the Slack signature, parses the payload, and
 * dispatches to the appropriate handler based on `action_id`.
 *
 * Adding a new action_id:
 *   1. Implement a handler module in this directory exporting an async function
 *      that takes a SlackHandlerContext and returns a SlackActionResponse.
 *   2. Register it below in ACTION_HANDLERS keyed by action_id.
 *
 * Action_ids starting with 'slack_' are handled inline by the route (release
 * gating with payload signature verification — see /api/slack/interact).
 * Everything else falls through to this registry.
 */

import { handleBugAction, BUG_ACTION_IDS } from './bug';
import { handleFeatureAction, FEATURE_ACTION_IDS } from './feature';
import { handlePromoteAction, PROMOTE_ACTION_IDS } from './promote';
import type { SlackHandlerContext, SlackActionResponse } from './types';

export type SlackActionHandler = (ctx: SlackHandlerContext) => Promise<SlackActionResponse>;

export const ACTION_HANDLERS: Record<string, SlackActionHandler> = Object.fromEntries([
  ...BUG_ACTION_IDS.map((id) => [id, handleBugAction] as const),
  ...FEATURE_ACTION_IDS.map((id) => [id, handleFeatureAction] as const),
  ...PROMOTE_ACTION_IDS.map((id) => [id, handlePromoteAction] as const),
]);

export function getActionHandler(actionId: string): SlackActionHandler | null {
  return ACTION_HANDLERS[actionId] ?? null;
}

export type { SlackHandlerContext, SlackActionResponse, SlackInteractivePayload, SlackAction, SlackUser } from './types';
