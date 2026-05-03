import { NextRequest, NextResponse } from 'next/server';
import { requireApiKey } from '@/lib/api-key-auth';
import { db } from '@/lib/db';
import { releaseLogs } from '@/db/schema';

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
  }).returning();

  return NextResponse.json(release, { status: 201 });
}
