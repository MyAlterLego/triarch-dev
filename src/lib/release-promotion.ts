import { db } from '@/lib/db';
import { releaseLogs, projects } from '@/db/schema';
import { eq, sql } from 'drizzle-orm';
import { dispatchWorkflow } from '@/lib/github-app';
import { postSlackThreadedReply, updateSlackMessage, postSlackChannelMessage } from '@/lib/slack';
import type { ReleaseRow } from '@/lib/release-actions';

export type PromoteAndAuditInput = {
  release: ReleaseRow;
  actorEmail: string;          // mapped staff email of the actor (Slack or web)
  channelId: string | null;    // null when invoked from web Promote (no Slack thread context)
  messageTs: string | null;    // null when invoked from web Promote (no Slack thread context)
  slackUserName: string | null; // null when invoked from web Promote (no Slack actor name)
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
 * 2. Call dispatchWorkflow(promote-branch.yml, ref=main, inputs={branch: release.branch ?? 'main'})
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
    .select({ githubRepo: projects.githubRepo, slackChannelId: projects.slackChannelId })
    .from(projects)
    .where(eq(projects.key, release.project));

  if (!project || !project.githubRepo) {
    const reason = `project repository not configured for ${release.project}`;
    console.error(`[promotion] dispatch skipped: ${reason} (release ${release.id})`);
    if (channelId !== null) {
      await postSlackThreadedReply({
        channel: channelId,
        thread_ts: messageTs!,
        text: `:warning: Promotion dispatch failed: ${reason}`,
      });
      await updateSlackMessage({
        channel: channelId,
        ts: messageTs!,
        text: PROMOTION_FAILED_MSG_TEMPLATE(slackUserName ?? actorEmail, actorEmail),
        blocks: [
          {
            type: 'section',
            text: { type: 'mrkdwn', text: PROMOTION_FAILED_MSG_TEMPLATE(slackUserName ?? actorEmail, actorEmail) },
          },
        ],
      });
    } else if (project?.slackChannelId) {
      await postSlackChannelMessage({
        channel: project.slackChannelId,
        text: `:warning: Promotion dispatch failed (initiated by ${actorEmail}): ${reason}`,
      });
    }
    return { ok: false, error: reason };
  }

  const slashIdx = project.githubRepo.indexOf('/');
  if (slashIdx <= 0 || slashIdx === project.githubRepo.length - 1) {
    const reason = `invalid githubRepo format: '${project.githubRepo}' (expected owner/repo)`;
    console.error(`[promotion] dispatch skipped: ${reason} (release ${release.id})`);
    if (channelId !== null) {
      await postSlackThreadedReply({
        channel: channelId,
        thread_ts: messageTs!,
        text: `:warning: Promotion dispatch failed: ${reason}`,
      });
      await updateSlackMessage({
        channel: channelId,
        ts: messageTs!,
        text: PROMOTION_FAILED_MSG_TEMPLATE(slackUserName ?? actorEmail, actorEmail),
        blocks: [
          {
            type: 'section',
            text: { type: 'mrkdwn', text: PROMOTION_FAILED_MSG_TEMPLATE(slackUserName ?? actorEmail, actorEmail) },
          },
        ],
      });
    } else if (project.slackChannelId) {
      await postSlackChannelMessage({
        channel: project.slackChannelId,
        text: `:warning: Promotion dispatch failed (initiated by ${actorEmail}): ${reason}`,
      });
    }
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
      workflowFile: 'promote-branch.yml',
      ref: 'main',
      inputs: { branch: release.branch ?? 'main' },
    });
    dispatchOk = true;
  } catch (err) {
    dispatchError = err instanceof Error ? err.message : String(err);
    // Truncate to 200 chars for the Slack message - error message MIGHT contain GitHub error body but never tokens (per github-app.ts contract)
    if (dispatchError.length > 200) dispatchError = `${dispatchError.slice(0, 197)}...`;
    console.error(`[promotion] dispatch failed for release ${release.id}: ${dispatchError}`);
  }

  // Audit columns updated atomically with the result (success or failure - both are dispatch ATTEMPTS)
  const actorSource = channelId === null ? 'web' : 'slack';
  const dispatchMetaJson = JSON.stringify({
    slackChannelId: channelId,
    slackMessageTs: messageTs,
    dispatchedAt: new Date().toISOString(),
    actorSource,
  });
  await db
    .update(releaseLogs)
    .set({
      promotionDispatchedAt: new Date(),
      promotionDispatchedBy: actorEmail,
      metadata: sql`jsonb_set(
        COALESCE(${releaseLogs.metadata}, '{}'::jsonb),
        '{dispatch}',
        ${dispatchMetaJson}::jsonb,
        true
      )`,
    })
    .where(eq(releaseLogs.id, release.id));

  if (dispatchOk) {
    console.log(`[promotion] dispatched promote-branch.yml for ${owner}/${repo} branch=${release.branch ?? 'main'} release=${release.id} origin=${actorSource}`);
    if (channelId !== null) {
      // Slack-origin: post threaded reply on the original approval message
      await postSlackThreadedReply({
        channel: channelId,
        thread_ts: messageTs!,
        text: `:rocket: Workflow dispatched: promote-branch.yml (${owner}/${repo}, branch=${release.branch ?? 'main'})`,
      });
    } else {
      // Web-origin: post fresh standalone message to the project's release-approvals channel
      const notifyChannel = project.slackChannelId;
      if (notifyChannel) {
        await postSlackChannelMessage({
          channel: notifyChannel,
          text: `:rocket: Workflow dispatched by ${actorEmail}: promote-branch.yml (${owner}/${repo}, branch=${release.branch ?? 'main'})`,
        });
      } else {
        console.warn(`[promotion] web-origin: slackChannelId not set for project ${release.project} — skipping Slack notification`);
      }
    }
    return { ok: true };
  }

  // Failure path
  if (channelId !== null) {
    // Slack-origin: threaded reply + chat.update
    await postSlackThreadedReply({
      channel: channelId,
      thread_ts: messageTs!,
      text: `:warning: Promotion dispatch failed: ${dispatchError}`,
    });
    await updateSlackMessage({
      channel: channelId,
      ts: messageTs!,
      text: PROMOTION_FAILED_MSG_TEMPLATE(slackUserName ?? actorEmail, actorEmail),
      blocks: [
        {
          type: 'section',
          text: { type: 'mrkdwn', text: PROMOTION_FAILED_MSG_TEMPLATE(slackUserName ?? actorEmail, actorEmail) },
        },
      ],
    });
  } else {
    // Web-origin: fresh standalone failure message
    const notifyChannel = project.slackChannelId;
    if (notifyChannel) {
      await postSlackChannelMessage({
        channel: notifyChannel,
        text: `:warning: Promotion dispatch failed (initiated by ${actorEmail}): ${dispatchError}`,
      });
    } else {
      console.warn(`[promotion] web-origin: slackChannelId not set for project ${release.project} — skipping Slack failure notification`);
    }
  }
  return { ok: false, error: dispatchError ?? 'unknown' };
}
