import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { requireApiKey } from '@/lib/api-key-auth';
import { db } from '@/lib/db';
import { deployGateCheck } from '@/db/schema';

// CL-6 server-side adoption enforcement — write side (Phase 27 / Plan 02).
//
// POST /api/platform/cicd/gate-verdict — called by shared-workflows' gate
// job BEFORE a prod deploy fires. Writes a `deploy_gate_check` row that
// /api/platform/ingest/release-logs (Plan 03) will read on the paired
// prod ingest. The 15-min lookback at read time gives the gate workflow
// up to 15 min to also fire the deploy step.

const VALID_CALLER_VERDICTS = new Set(['pass', 'fail']);
// 'reject_no_pair' is server-synthesized only — never accepted from caller.

export async function POST(req: NextRequest) {
  // Extract Bearer token BEFORE requireApiKey so the hash is available
  // regardless of project-lookup outcome (per RESEARCH Pitfall 2).
  const authHeader = req.headers.get('authorization') ?? '';
  const rawKey = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

  const { error, project } = await requireApiKey(req);
  if (error) return error;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { target_version, verdict, dev_version, reason, workflow_run_url } = body as {
    target_version?: unknown;
    verdict?: unknown;
    dev_version?: unknown;
    reason?: unknown;
    workflow_run_url?: unknown;
  };

  if (typeof target_version !== 'string' || target_version.trim().length === 0) {
    return NextResponse.json(
      { error: 'target_version is required (non-empty string)' },
      { status: 400 }
    );
  }
  if (typeof dev_version !== 'string' || dev_version.trim().length === 0) {
    return NextResponse.json(
      { error: 'dev_version is required (non-empty string)' },
      { status: 400 }
    );
  }
  if (typeof verdict !== 'string' || !VALID_CALLER_VERDICTS.has(verdict)) {
    return NextResponse.json(
      { error: "verdict must be 'pass' or 'fail'" },
      { status: 400 }
    );
  }

  // Hash AFTER auth + validation — but rawKey was captured before the
  // auth roundtrip. Pitfall 4: normalize target_version on the way in
  // so Plan 03's read comparison can match byte-for-byte.
  const apiKeyHash = createHash('sha256').update(rawKey).digest('hex');

  const [row] = await db.insert(deployGateCheck).values({
    projectKey: project!.key,
    targetVersion: target_version.trim(),
    verdict,
    devVersion: dev_version.trim(),
    apiKeyHash,
    reason: typeof reason === 'string' && reason.trim().length > 0 ? reason : null,
    workflowRunUrl:
      typeof workflow_run_url === 'string' && workflow_run_url.trim().length > 0
        ? workflow_run_url
        : null,
  }).returning();

  return NextResponse.json(row, { status: 201 });
}
