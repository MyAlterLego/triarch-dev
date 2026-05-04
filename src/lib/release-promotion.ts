import { db } from '@/lib/db';
import { releaseLogs, projects } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { dispatchWorkflow } from '@/lib/github-app';
import { postSlackThreadedReply, updateSlackMessage } from '@/lib/slack';
import type { ReleaseRow } from '@/lib/release-actions';

export type PromoteAndAuditInput = {
  release: ReleaseRow;
  actorEmail: string;          // mapped staff email of the Slack actor
  channelId: string;           // Slack channel where the original message lives
  messageTs: string;           // ts of the original message (parent for thread + target for chat.update)
  slackUserName: string;       // display name of the actor for the failure message
};

export type PromoteAndAuditResult = {
  ok: boolean;
  error?: string;
};

const PROMOTION_FAILED_MSG_TEMPLATE = (slackUserName: string, email: string) =>
  `:warning: *Approved (promotion failed - see logs)* by @${slackUserName} (${email})`;

/**
 * Background promotion dispatcher. Called fire-and-forget from /api/slack/interact
 * AFTER approveRelease has succeeded (and only when !alreadyApproved).
 *
 * Performs:
 * 1. Look up the project's githubRepo via release.project
 * 2. Call dispatchWorkflow(deploy-prod.yml, ref=main, inputs={tag: release.version})
 * 3. Update release_logs.promotion_dispatched_at + promotion_dispatched_by atomically
 *    with the dispatch attempt result
 * 4. Post a threaded Slack reply with the result
 * 5. On failure: chat.update the original Slack message to flag the failure
 *
 * Never throws explicitly. All errors caught + logged + surfaced to Slack.
 */
export async function promoteAndAudit(input: PromoteAndAuditInput): Promise<PromoteAndAuditResult> {
  const { release, actorEmail, channelId, messageTs, slackUserName } = input;

  // Project lookup
  const [project] = await db
    .select({ githubRepo: projects.githubRepo })
    .from(projects)
    .where(eq(projects.key, release.project));

  if (!project || !project.githubRepo) {
    const reason = `project repository not configured for ${release.project}`;
    console.error(`[promotion] dispatch skipped: ${reason} (release ${release.id})`);
    await postSlackThreadedReply({
      channel: channelId,
      thread_ts: messageTs,
      text: `:warning: Promotion dispatch failed: ${reason}`,
    });
    await updateSlackMessage({
      channel: channelId,
      ts: messageTs,
      text: PROMOTION_FAILED_MSG_TEMPLATE(slackUserName, actorEmail),
      blocks: [
        {
          type: 'section',
          text: { type: 'mrkdwn', text: PROMOTION_FAILED_MSG_TEMPLATE(slackUserName, actorEmail) },
        },
      ],
    });
    return { ok: false, error: reason };
  }

  const slashIdx = project.githubRepo.indexOf('/');
  if (slashIdx <= 0 || slashIdx === project.githubRepo.length - 1) {
    const reason = `invalid githubRepo format: '${project.githubRepo}' (expected owner/repo)`;
    console.error(`[promotion] dispatch skipped: ${reason} (release ${release.id})`);
    await postSlackThreadedReply({
      channel: channelId,
      thread_ts: messageTs,
      text: `:warning: Promotion dispatch failed: ${reason}`,
    });
    await updateSlackMessage({
      channel: channelId,
      ts: messageTs,
      text: PROMOTION_FAILED_MSG_TEMPLATE(slackUserName, actorEmail),
      blocks: [
        {
          type: 'section',
          text: { type: 'mrkdwn', text: PROMOTION_FAILED_MSG_TEMPLATE(slackUserName, actorEmail) },
        },
      ],
    });
    return { ok: false, error: reason };
  }

  const owner = project.githubRepo.slice(0, slashIdx);
  const repo = project.githubRepo.slice(slashIdx + 1);

  // Attempt dispatch
  let dispatchOk = false;
  let dispatchError: string | null = null;
  try {
    await dispatchWorkflow({
      owner,
      repo,
      workflowFile: 'deploy-prod.yml',
      ref: 'main',
      inputs: { tag: release.version },
    });
    dispatchOk = true;
  } catch (err) {
    dispatchError = err instanceof Error ? err.message : String(err);
    // Truncate to 200 chars for the Slack message - error message MIGHT contain GitHub error body but never tokens (per github-app.ts contract)
    if (dispatchError.length > 200) dispatchError = `${dispatchError.slice(0, 197)}...`;
    console.error(`[promotion] dispatch failed for release ${release.id}: ${dispatchError}`);
  }

  // Audit columns updated atomically with the result (success or failure - both are dispatch ATTEMPTS)
  await db
    .update(releaseLogs)
    .set({
      promotionDispatchedAt: new Date(),
      promotionDispatchedBy: actorEmail,
    })
    .where(eq(releaseLogs.id, release.id));

  if (dispatchOk) {
    console.log(`[promotion] dispatched deploy-prod.yml for ${owner}/${repo} tag=${release.version} release=${release.id}`);
    await postSlackThreadedReply({
      channel: channelId,
      thread_ts: messageTs,
      text: `:rocket: Workflow dispatched: deploy-prod.yml (${owner}/${repo}, tag=${release.version})`,
    });
    return { ok: true };
  }

  // Failure path - threaded reply + chat.update
  await postSlackThreadedReply({
    channel: channelId,
    thread_ts: messageTs,
    text: `:warning: Promotion dispatch failed: ${dispatchError}`,
  });
  await updateSlackMessage({
    channel: channelId,
    ts: messageTs,
    text: PROMOTION_FAILED_MSG_TEMPLATE(slackUserName, actorEmail),
    blocks: [
      {
        type: 'section',
        text: { type: 'mrkdwn', text: PROMOTION_FAILED_MSG_TEMPLATE(slackUserName, actorEmail) },
      },
    ],
  });
  return { ok: false, error: dispatchError ?? 'unknown' };
}
