import { db } from '@/lib/db';
import { projects } from '@/db/schema';
import { or, eq, sql, asc } from 'drizzle-orm';
import { fetchProjectStatus } from '@/lib/slack-status';
import type { ProjectStatusData } from '@triarchsecurity/triarch-shared/slack';

/**
 * Resolves any project identifier — the canonical `key`, a custom domain,
 * a subdomain, a deployed App Hosting URL, or a `github_repo` (full
 * `owner/repo` or just the trailing `repo` segment) — to the project's
 * canonical key.
 *
 * Returns null when nothing matches. Callers should surface an "unknown
 * project" message + a hint to run `/triarch projects`.
 *
 * Backs the multi-identifier Slack lookup so `/triarch promote platform`,
 * `/triarch promote admin.triarch.dev`, and `/triarch promote triarch-dev`
 * all hit the same row.
 */
export async function resolveProjectKey(input: string): Promise<string | null> {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const [row] = await db
    .select({ key: projects.key })
    .from(projects)
    .where(
      or(
        eq(projects.key, trimmed),
        eq(projects.customDomain, trimmed),
        eq(projects.subdomain, trimmed),
        eq(projects.deployedUrl, trimmed),
        eq(projects.githubRepo, trimmed),
        sql`${projects.githubRepo} ILIKE '%/' || ${trimmed}`,
      ),
    )
    .limit(1);

  return row?.key ?? null;
}

/**
 * Convenience wrapper that resolves any identifier first, then loads the full
 * status. Returns null if the identifier resolves to nothing OR if the
 * project has no status rows.
 */
export async function fetchProjectStatusByAnyIdentifier(
  input: string,
): Promise<ProjectStatusData | null> {
  const key = await resolveProjectKey(input);
  if (!key) return null;
  return fetchProjectStatus(key);
}

export type ProjectListing = {
  key: string;
  name: string;
  customDomain: string | null;
  githubRepo: string | null;
};

/**
 * Returns every active project in key order. Used by `/triarch projects` to
 * show Mike (and future staff) what identifiers exist when none come to mind.
 */
export async function listAllProjects(): Promise<ProjectListing[]> {
  return db
    .select({
      key: projects.key,
      name: projects.name,
      customDomain: projects.customDomain,
      githubRepo: projects.githubRepo,
    })
    .from(projects)
    .where(eq(projects.status, 'active'))
    .orderBy(asc(projects.key));
}
