import { NextRequest, NextResponse } from 'next/server';
import { requireApiKey } from '@/lib/api-key-auth';
import { db } from '@/lib/db';
import { releaseLogs } from '@/db/schema';
import { stampLinksFromCommit } from '@/lib/link-stamper';

type ReleaseEnv = 'dev' | 'prod';
const VALID_ENVS: ReadonlyArray<ReleaseEnv> = ['dev', 'prod'];

export async function POST(req: NextRequest) {
  const { error, project } = await requireApiKey(req);
  if (error) return error;

  const body = await req.json();
  const {
    version,
    releaseType,
    summary,
    entries,
    metadata,
    releasedBy,
    env: envInput,
    commitSha,
    deployedAt,
    branch,
  } = body;

  if (!version || !releaseType) {
    return NextResponse.json({ error: 'version and releaseType are required' }, { status: 400 });
  }

  // REL-A5: env is optional, defaults to 'dev' for backwards compat with v1.13 CI payloads.
  const env: ReleaseEnv = VALID_ENVS.includes(envInput) ? envInput : 'dev';

  // REL-A4: parse ISO string for deployed_at if provided.
  let deployedAtParsed: Date | null = null;
  if (typeof deployedAt === 'string') {
    const d = new Date(deployedAt);
    if (!Number.isNaN(d.getTime())) {
      deployedAtParsed = d;
    }
  }

  // SCHEMA-01: branch is optional (Phase 2 shared-workflows will start passing it). Default to 'main' for omitted/empty values.
  const branchValue: string =
    typeof branch === 'string' && branch.trim().length > 0 ? branch.trim() : 'main';

  const [release] = await db.insert(releaseLogs).values({
    project: project!.key,
    version,
    releaseType,
    summary: summary ?? null,
    entries: entries ?? [],
    metadata: metadata ?? {},
    releasedBy: releasedBy ?? null,
    // v1.14.0 columns:
    env,
    status: 'dev',                                                // new rows always start in 'dev'; gating moves them forward
    commitSha: typeof commitSha === 'string' ? commitSha : null,  // REL-A3
    deployedAt: deployedAtParsed,                                 // REL-A4
    // v2.0 Phase 3: branch (SCHEMA-01) — shared-workflows will pass once Phase 2 ships
    branch: branchValue,
  }).returning();

  // LINK-02 / LINK-03: best-effort auto-stamp commit refs onto release_log_links.
  // Wrapped in try/catch so any stamper failure NEVER blocks a release ingest.
  // The stamper is itself forgiving (catches internal errors) but defense-in-depth here.
  try {
    // Build the message text the parser will scan. Prefer explicit commitMessage on the body,
    // fall back to summary, then synthesize from entries[] descriptions if neither present.
    const messageText: string = (() => {
      if (typeof body.commitMessage === 'string' && body.commitMessage.trim().length > 0) {
        return body.commitMessage;
      }
      if (typeof summary === 'string' && summary.trim().length > 0) {
        return summary;
      }
      if (Array.isArray(entries)) {
        return entries
          .map((e: { description?: string }) => (typeof e?.description === 'string' ? e.description : ''))
          .filter(Boolean)
          .join('\n');
      }
      return '';
    })();

    if (messageText.length > 0) {
      await stampLinksFromCommit({
        releaseId: release.id,
        commitMessage: messageText,
        projectKey: project!.key,
      });
    }
  } catch (err) {
    console.error('[ingest/release-logs] link stamping failed (non-blocking)', err);
  }

  return NextResponse.json(release, { status: 201 });
}
