import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { featureRequests, workflowTransitions } from '@/db/schema';
import type { SlackHandlerContext, SlackActionResponse } from './types';

export const FEATURE_ACTION_IDS = ['approve_feature', 'discuss_feature', 'decline_feature'] as const;

export async function handleFeatureAction(ctx: SlackHandlerContext): Promise<SlackActionResponse> {
  const { action, payload } = ctx;
  const featureId = action.value;
  const actionId = action.action_id;
  const userName = payload.user?.name ?? 'slack-user';

  const [feature] = await db.select().from(featureRequests).where(eq(featureRequests.id, featureId));
  if (!feature) {
    return { text: 'Feature request not found' };
  }

  let newStatus: string;
  if (actionId === 'approve_feature') {
    newStatus = 'approved';
  } else if (actionId === 'discuss_feature') {
    newStatus = 'reviewed';
  } else if (actionId === 'decline_feature') {
    newStatus = 'declined';
  } else {
    return { text: 'Unknown feature action' };
  }

  await db.update(featureRequests)
    .set({ status: newStatus, updatedAt: new Date() })
    .where(eq(featureRequests.id, featureId));

  await db.insert(workflowTransitions).values({
    entityType: 'feature_request',
    entityId: featureId,
    fromStatus: feature.status,
    toStatus: newStatus,
    transitionedBy: `slack:${userName}`,
  });

  const emoji = actionId === 'approve_feature' ? ':white_check_mark:' : actionId === 'decline_feature' ? ':x:' : ':speech_balloon:';
  const verb = actionId === 'approve_feature' ? 'approved' : actionId === 'decline_feature' ? 'declined' : 'flagged for discussion';

  return {
    response_type: 'in_channel',
    replace_original: false,
    text: `${emoji} *${userName}* ${verb} "${feature.title}"`,
  };
}
