/**
 * Backfill the github-deploy webhook onto every existing project repo.
 *
 * scaffold-repo auto-registers the webhook for FUTURE projects (v1.8.0).
 * For projects created before that, this lib walks the registry and
 * installs the webhook on each repo. Idempotent — checks for an existing
 * hook with the same target URL before adding a new one.
 *
 * Used by:
 *   - POST /api/platform/webhooks/backfill (admin UI / curl)
 *   - scripts/backfill-webhooks.ts          (CLI)
 */
import { registerDeployWebhook } from './github-push';
import type { projects } from '@/db/schema';

type Project = typeof projects.$inferSelect;

export type WebhookBackfillResult = {
  project: string;
  repo: string | null;
  status: 'installed' | 'already_present' | 'no_repo' | 'error' | 'repo_missing';
  hookId?: number;
  detail: string;
};

type GhHook = {
  id: number;
  config: { url?: string; content_type?: string };
  events: string[];
  active: boolean;
};

async function listHooks(
  owner: string,
  repo: string,
  ghToken: string
): Promise<GhHook[] | { notFound: true } | { error: string }> {
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/hooks`, {
    headers: {
      Authorization: `Bearer ${ghToken}`,
      Accept: 'application/vnd.github+json',
    },
  });
  if (res.status === 404) return { notFound: true };
  if (!res.ok) {
    const body = await res.text();
    return { error: `GitHub ${res.status}: ${body.slice(0, 120)}` };
  }
  return (await res.json()) as GhHook[];
}

export async function backfillWebhookForProject(
  project: Project,
  webhookUrl: string,
  webhookSecret: string,
  ghToken: string
): Promise<WebhookBackfillResult> {
  const base = {
    project: project.key,
    repo: project.githubRepo,
  };
  if (!project.githubRepo) {
    return { ...base, status: 'no_repo', detail: 'project has no github_repo' };
  }
  const [owner, repo] = project.githubRepo.split('/');
  if (!owner || !repo) {
    return { ...base, status: 'no_repo', detail: `malformed github_repo: ${project.githubRepo}` };
  }

  const hooks = await listHooks(owner, repo, ghToken);
  if ('notFound' in hooks) {
    return {
      ...base,
      status: 'repo_missing',
      detail: `${project.githubRepo} returns 404 (deleted or never created)`,
    };
  }
  if ('error' in hooks) {
    return { ...base, status: 'error', detail: hooks.error };
  }

  const existing = hooks.find((h) => h.config.url === webhookUrl);
  if (existing) {
    return {
      ...base,
      status: 'already_present',
      hookId: existing.id,
      detail: `hook ${existing.id} already targets this URL`,
    };
  }

  try {
    const created = await registerDeployWebhook({
      owner,
      repo,
      webhookUrl,
      secret: webhookSecret,
      ghToken,
    });
    if (!created) {
      return { ...base, status: 'error', detail: 'registerDeployWebhook returned null' };
    }
    return {
      ...base,
      status: 'installed',
      hookId: created.id,
      detail: `created hook ${created.id} (events: workflow_run, release)`,
    };
  } catch (err) {
    return { ...base, status: 'error', detail: err instanceof Error ? err.message : String(err) };
  }
}
