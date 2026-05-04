import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { bugReports, workflowTransitions } from '@/db/schema';
import type { SlackHandlerContext, SlackActionResponse } from './types';

export const BUG_ACTION_IDS = ['approve_fix', 'defer_fix'] as const;

export async function handleBugAction(ctx: SlackHandlerContext): Promise<SlackActionResponse> {
  const { action, payload } = ctx;
  const bugId = action.value;
  const actionId = action.action_id;
  const userName = payload.user?.name ?? 'slack-user';

  const [bug] = await db.select().from(bugReports).where(eq(bugReports.id, bugId));
  if (!bug) {
    return { text: 'Bug report not found' };
  }

  let newStatus: string;
  if (actionId === 'approve_fix') {
    newStatus = 'approved';
  } else if (actionId === 'defer_fix') {
    newStatus = 'deferred';
  } else {
    return { text: 'Unknown bug action' };
  }

  await db.update(bugReports)
    .set({ status: newStatus, updatedAt: new Date() })
    .where(eq(bugReports.id, bugId));

  await db.insert(workflowTransitions).values({
    entityType: 'bug_report',
    entityId: bugId,
    fromStatus: bug.status,
    toStatus: newStatus,
    transitionedBy: `slack:${userName}`,
  });

  const responseText = actionId === 'approve_fix'
    ? `:white_check_mark: *${userName}* approved fix for "${bug.title}"`
    : `:hourglass: *${userName}* deferred "${bug.title}" to next build`;

  return {
    response_type: 'in_channel',
    replace_original: false,
    text: responseText,
  };
}
