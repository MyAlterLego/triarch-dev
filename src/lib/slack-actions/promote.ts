// src/lib/slack-actions/promote.ts
//
// Handler for the inline "Promote" button in the proactive Slack push.
// The promotable-projects-cron posts Block Kit messages with a Promote
// button per ready-to-promote project; clicking the button dispatches
// through /api/slack/interact → here.
//
// We mirror the /triarch promote slash command's behavior: open-or-reuse
// the dev→main PR and merge it as a real merge commit (preserves
// verify-dev-deployed ancestry). Reuses the same github-app helpers as
// the slash command and the admin UI button — three surfaces, one flow.

import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { projects, approvalEvents } from '@/db/schema';
import { ensurePullRequest, mergeBranchToMain } from '@/lib/github-app';
import type { SlackHandlerContext, SlackActionResponse } from './types';

export const PROMOTE_ACTION_IDS = ['promote_project'] as const;

export async function handlePromoteAction(ctx: SlackHandlerContext): Promise<SlackActionResponse> {
  const { action, payload } = ctx;
  const projectKey = action.value;
  const userName = payload.user?.name ?? payload.user?.id ?? 'slack-user';
  const actorEmail = `slack:${userName}`;

  if (!projectKey) {
    return { text: ':x: Promote button is missing project key.' };
  }

  const [project] = await db
    .select({ id: projects.id, key: projects.key, name: projects.name, githubRepo: projects.githubRepo })
    .from(projects)
    .where(eq(projects.key, projectKey))
    .limit(1);

  if (!project) {
    return { text: `:x: Project '${projectKey}' not found.` };
  }

  if (!project.githubRepo || !project.githubRepo.includes('/')) {
    return { text: `:warning: Project '${projectKey}' has no github_repo configured.` };
  }

  const [owner, repo] = project.githubRepo.split('/');
  const headBranch = 'dev';
  const baseBranch = 'main';

  // Audit: record the click intent. Either branch (success or fail) writes the outcome.
  const baseAudit = {
    subjectType: 'cicd_promote_dev_to_main',
    subjectId: `${project.key}:dev-to-main`,
    surface: 'slack',
    actorEmail,
    project: project.key,
  } as const;

  try {
    const ensured = await ensurePullRequest({
      owner,
      repo,
      headBranch,
      baseBranch,
      title: `Promote ${headBranch} → ${baseBranch}`,
      body: `Auto-opened by OttoBot proactive push (clicked by ${userName}).\n\nMerge_method='merge' preserves dev commit hashes in ${baseBranch}'s ancestry for verify-dev-deployed.`,
    });

    if ('ok' in ensured && ensured.ok === false) {
      if (ensured.reason === 'no_commits_ahead') {
        await db.insert(approvalEvents).values({
          ...baseAudit,
          decision: 'no_diff',
          metadata: { owner, repo, reason: ensured.reason },
        });
        return { text: `:information_source: Nothing to promote for *${project.name}* — dev has no commits ahead of main.` };
      }
      // create_failed
      await db.insert(approvalEvents).values({
        ...baseAudit,
        decision: 'failed',
        metadata: { owner, repo, reason: ensured.reason, statusCode: ensured.statusCode, message: ensured.message },
      });
      return { text: `:x: Couldn't open promotion PR for *${project.name}* (HTTP ${ensured.statusCode}: ${ensured.message}).` };
    }

    // narrowed to { existed:true; prNumber; htmlUrl } | { created:true; prNumber; htmlUrl }
    // Both success variants carry the same shape — read with a structural cast.
    const success = ensured as { prNumber: number; htmlUrl: string; created?: true; existed?: true };
    const prUrl = success.htmlUrl;
    const wasCreated = success.created === true;

    const result = await mergeBranchToMain({ owner, repo, headBranch, baseBranch });

    if (result.merged) {
      await db.insert(approvalEvents).values({
        ...baseAudit,
        decision: 'merged',
        metadata: { owner, repo, pr_number: result.prNumber, sha: result.sha, pr_url: result.htmlUrl, was_created: wasCreated },
      });
      const verb = wasCreated ? ':rocket: Opened + merged' : ':white_check_mark: Merged';
      return {
        text: `${verb} *${project.name}* dev → main as merge commit. <${result.htmlUrl}|PR #${result.prNumber}> · sha \`${result.sha.slice(0, 7)}\``,
      };
    }

    if (result.reason === 'no_open_pr') {
      await db.insert(approvalEvents).values({ ...baseAudit, decision: 'no_open_pr', metadata: { owner, repo } });
      return { text: `:warning: Lost PR between create and merge for *${project.name}*. Try again or open the PR manually: ${prUrl ?? `https://github.com/${owner}/${repo}/pulls`}` };
    }

    await db.insert(approvalEvents).values({
      ...baseAudit,
      decision: 'merge_failed',
      metadata: { owner, repo, pr_number: result.prNumber, status_code: result.statusCode, message: result.message },
    });
    return { text: `:x: Merge failed for PR #${result.prNumber} on *${project.name}* (HTTP ${result.statusCode}): ${result.message}` };
  } catch (err) {
    await db.insert(approvalEvents).values({
      ...baseAudit,
      decision: 'error',
      metadata: { owner, repo, message: (err as Error).message?.slice(0, 500) ?? 'unknown' },
    }).catch(() => {});
    return { text: `:x: Promote failed for *${project.name}* — ${(err as Error).message?.slice(0, 200) ?? 'unknown error'}. Check server logs.` };
  }
}
