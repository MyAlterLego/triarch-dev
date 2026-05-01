/**
 * Backfill + ongoing integration of release_logs from GitHub.
 *
 * Two signal sources, in priority order:
 *   1. GitHub Releases API (formal releases — most projects don't use this)
 *   2. main-branch commits with `vX.Y.Z` prefix (the actual versioning
 *      pattern used across all Triarch projects per workspace CLAUDE.md)
 *
 * Used by:
 *   - POST /api/platform/release-logs/backfill (one-shot historical fill)
 *   - POST /api/webhooks/github-deploy (ongoing — extended in v1.12.0)
 *   - scripts/backfill-releases.ts (CLI)
 */
import { db } from './db';
import { releaseLogs, projects } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

type Project = typeof projects.$inferSelect;

export type ReleaseEntry = {
  project: string;
  version: string;
  releaseType: 'major' | 'minor' | 'patch' | 'unknown';
  releasedAt: Date;
  releasedBy: string;
  summary: string;
  source: 'github_release' | 'commit_message';
  metadata: Record<string, unknown>;
};

export type SyncProjectResult = {
  project: string;
  found: number;
  inserted: number;
  skipped: number;
  errors: string[];
};

const SEMVER = /^v?(\d+)\.(\d+)\.(\d+)(?:[\w.-]+)?/;

function parseVersion(s: string): { version: string; major: number; minor: number; patch: number } | null {
  const m = s.match(SEMVER);
  if (!m) return null;
  return {
    version: `v${m[1]}.${m[2]}.${m[3]}${s.slice(m[0].length).match(/^[\w.-]+/)?.[0] ?? ''}`,
    major: parseInt(m[1], 10),
    minor: parseInt(m[2], 10),
    patch: parseInt(m[3], 10),
  };
}

function classifyReleaseType(curr: ReturnType<typeof parseVersion>, prev: ReturnType<typeof parseVersion>): 'major' | 'minor' | 'patch' | 'unknown' {
  if (!curr || !prev) return 'unknown';
  if (curr.major !== prev.major) return 'major';
  if (curr.minor !== prev.minor) return 'minor';
  if (curr.patch !== prev.patch) return 'patch';
  return 'unknown';
}

async function ghJson<T>(path: string, ghToken: string): Promise<T | null> {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${ghToken}`,
      Accept: 'application/vnd.github+json',
    },
  });
  if (res.status === 404) return null;
  if (res.status === 403) {
    throw new Error(`GitHub rate limit / permission: ${path}`);
  }
  if (!res.ok) {
    throw new Error(`GitHub ${path}: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

/**
 * Pull all candidate release events for a project from GitHub.
 * De-duplicates by version (one entry per unique version).
 */
export async function fetchProjectReleases(
  project: Project,
  ghToken: string,
  limit = 100
): Promise<ReleaseEntry[]> {
  if (!project.githubRepo) return [];
  const [owner, repo] = project.githubRepo.split('/');
  if (!owner || !repo) return [];

  const byVersion = new Map<string, ReleaseEntry>();

  const releases = await ghJson<
    Array<{
      tag_name: string;
      name: string | null;
      body: string | null;
      published_at: string | null;
      author: { login?: string } | null;
      html_url: string;
      draft: boolean;
      prerelease: boolean;
    }>
  >(`/repos/${owner}/${repo}/releases?per_page=${limit}`, ghToken).catch(() => null);

  for (const r of releases ?? []) {
    if (r.draft || !r.tag_name || !r.published_at) continue;
    const parsed = parseVersion(r.tag_name);
    if (!parsed) continue;
    byVersion.set(parsed.version, {
      project: project.key,
      version: parsed.version,
      releaseType: 'unknown',
      releasedAt: new Date(r.published_at),
      releasedBy: r.author?.login ?? 'github',
      summary: r.name || r.tag_name,
      source: 'github_release',
      metadata: { html_url: r.html_url, prerelease: r.prerelease, body: r.body ?? '' },
    });
  }

  const commits = await ghJson<
    Array<{
      sha: string;
      commit: { message: string; author: { name?: string; email?: string; date: string } };
      author: { login?: string } | null;
      html_url: string;
    }>
  >(`/repos/${owner}/${repo}/commits?sha=main&per_page=${limit}`, ghToken).catch(() => null);

  for (const c of commits ?? []) {
    const firstLine = c.commit.message.split('\n')[0] ?? '';
    const parsed = parseVersion(firstLine);
    if (!parsed) continue;
    if (byVersion.has(parsed.version)) continue;
    const summary = firstLine.replace(SEMVER, '').replace(/^[:\s-]+/, '').trim() || firstLine;
    byVersion.set(parsed.version, {
      project: project.key,
      version: parsed.version,
      releaseType: 'unknown',
      releasedAt: new Date(c.commit.author.date),
      releasedBy: c.author?.login ?? c.commit.author.name ?? 'unknown',
      summary,
      source: 'commit_message',
      metadata: { sha: c.sha, html_url: c.html_url, full_message: c.commit.message },
    });
  }

  const sorted = Array.from(byVersion.values()).sort(
    (a, b) => a.releasedAt.getTime() - b.releasedAt.getTime()
  );
  for (let i = 1; i < sorted.length; i++) {
    sorted[i].releaseType = classifyReleaseType(parseVersion(sorted[i].version), parseVersion(sorted[i - 1].version));
  }
  return sorted;
}

/**
 * Insert release entries that don't already exist (by project+version).
 * Idempotent — safe to run repeatedly for incremental backfill.
 */
export async function persistReleases(entries: ReleaseEntry[]): Promise<{ inserted: number; skipped: number }> {
  let inserted = 0;
  let skipped = 0;
  for (const entry of entries) {
    const existing = await db
      .select({ id: releaseLogs.id })
      .from(releaseLogs)
      .where(and(eq(releaseLogs.project, entry.project), eq(releaseLogs.version, entry.version)))
      .limit(1);
    if (existing.length > 0) {
      skipped++;
      continue;
    }
    await db.insert(releaseLogs).values({
      project: entry.project,
      version: entry.version,
      releaseType: entry.releaseType,
      releasedAt: entry.releasedAt,
      releasedBy: entry.releasedBy,
      summary: entry.summary,
      entries: [],
      metadata: { source: entry.source, ...entry.metadata },
    });
    inserted++;
  }
  return { inserted, skipped };
}

/**
 * Backfill release_logs for one project from GitHub.
 */
export async function syncProject(
  project: Project,
  ghToken: string,
  limit = 100
): Promise<SyncProjectResult> {
  const result: SyncProjectResult = {
    project: project.key,
    found: 0,
    inserted: 0,
    skipped: 0,
    errors: [],
  };
  try {
    const entries = await fetchProjectReleases(project, ghToken, limit);
    result.found = entries.length;
    const persisted = await persistReleases(entries);
    result.inserted = persisted.inserted;
    result.skipped = persisted.skipped;
  } catch (err) {
    result.errors.push(err instanceof Error ? err.message : String(err));
  }
  return result;
}
