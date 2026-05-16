import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { and, eq, gte, desc } from 'drizzle-orm';
import { requireApiKey } from '@/lib/api-key-auth';
import { db } from '@/lib/db';
import { releaseLogs, deployGateCheck } from '@/db/schema';
import { stampLinksFromCommit } from '@/lib/link-stamper';

const CL6_LOOKBACK_MS = 15 * 60 * 1000;
const CL6_LOOKBACK_SECONDS = 900;

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

  // CL-6 server-side adoption enforcement (Phase 27).
  // When env='prod' and CL6_ENFORCEMENT_MODE != 'off', require a paired
  // pass-verdict in deploy_gate_check within the prior 15 min for the
  // same project_key, target_version, and Bearer apiKey hash.
  //
  // warn mode: log + audit row, but still insert release_logs (safe ship default)
  // enforce mode: return 409, write audit row, do NOT insert release_logs
  const enforcementMode = process.env.CL6_ENFORCEMENT_MODE ?? 'warn';

  if (env === 'prod' && enforcementMode !== 'off') {
    const authHeader = req.headers.get('authorization') ?? '';
    const rawKey = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    const currentApiKeyHash = createHash('sha256').update(rawKey).digest('hex');

    const cutoff = new Date(Date.now() - CL6_LOOKBACK_MS);
    const [latestVerdict] = await db
      .select()
      .from(deployGateCheck)
      .where(
        and(
          eq(deployGateCheck.projectKey, project!.key),
          gte(deployGateCheck.createdAt, cutoff),
        )
      )
      .orderBy(desc(deployGateCheck.createdAt))
      .limit(1);

    const normalizedIngestVersion = String(version).trim();
    const matched =
      latestVerdict &&
      latestVerdict.verdict === 'pass' &&
      latestVerdict.targetVersion.trim() === normalizedIngestVersion &&
      latestVerdict.apiKeyHash === currentApiKeyHash;

    if (!matched) {
      let rejectReason: string;
      if (!latestVerdict) {
        rejectReason = 'No deploy_gate_check row found in prior 15 minutes';
      } else if (latestVerdict.verdict !== 'pass') {
        rejectReason = `Latest verdict was '${latestVerdict.verdict}', expected 'pass'`;
      } else if (latestVerdict.targetVersion.trim() !== normalizedIngestVersion) {
        rejectReason = `target_version mismatch: verdict had '${latestVerdict.targetVersion}', ingest had '${normalizedIngestVersion}'`;
      } else {
        rejectReason = 'api_key_hash mismatch (key may have rotated between gate and deploy)';
      }

      try {
        await db.insert(deployGateCheck).values({
          projectKey: project!.key,
          targetVersion: normalizedIngestVersion,
          verdict: 'reject_no_pair',
          devVersion: latestVerdict?.devVersion ?? normalizedIngestVersion,
          apiKeyHash: currentApiKeyHash,
          reason: rejectReason,
          workflowRunUrl: null,
        }).returning();
      } catch (auditErr) {
        console.error('[ingest/release-logs] CL-6 audit write failed (non-blocking)', auditErr);
      }

      if (enforcementMode === 'enforce') {
        return NextResponse.json(
          {
            error: 'gate_required',
            code: 'CL6-VIOLATION',
            reason: rejectReason,
            expected: {
              project_key: project!.key,
              target_version: normalizedIngestVersion,
              max_age_seconds: CL6_LOOKBACK_SECONDS,
            },
            remediation_url: '/admin/modules/ci-cd',
          },
          { status: 409 }
        );
      }

      console.error('[ingest/release-logs] CL-6 violation (warn mode - not blocking):', {
        project_key: project!.key,
        target_version: normalizedIngestVersion,
        reason: rejectReason,
      });
    }
  }

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
