// WORKFLOW-05: promote-branch.yml callback ingest.
// Decision refs: 04-CONTEXT.md D-10..D-13. Snake_case wire format (matches /api/releases/promoted convention).
import { NextRequest, NextResponse } from 'next/server';
import { requireApiKey } from '@/lib/api-key-auth';
import { db } from '@/lib/db';
import { promoteAttempts } from '@/db/schema';

type PromoteResult = 'merged' | 'conflict' | 'ci_failed';
const VALID_RESULTS: ReadonlyArray<PromoteResult> = ['merged', 'conflict', 'ci_failed'];

export async function POST(req: NextRequest) {
  // Auth — same per-project Bearer token pattern as releases/promoted (D-11).
  const { error, project } = await requireApiKey(req);
  if (error) return error;

  const body = await req.json();
  const { branch, result, merge_sha, conflict_files, rebase_error, ci_run_url } = body as {
    branch: unknown;
    result: unknown;
    merge_sha: unknown;
    conflict_files: unknown;
    rebase_error: unknown;
    ci_run_url: unknown;
  };

  // Validate required fields (D-12 — branch and result are mandatory).
  const missingFields: string[] = [];
  if (!branch || typeof branch !== 'string') missingFields.push('branch');
  if (!result || typeof result !== 'string' || !VALID_RESULTS.includes(result as PromoteResult)) {
    missingFields.push('result');
  }
  if (missingFields.length > 0) {
    return NextResponse.json(
      { error: `Missing required field(s): ${missingFields.join(', ')}` },
      { status: 400 }
    );
  }

  // Insert into promote_attempts (camelCase TS property names → snake_case DB columns via Drizzle).
  const [row] = await db
    .insert(promoteAttempts)
    .values({
      project: project!.key,
      branch: branch as string,
      result: result as PromoteResult,
      mergeSha: typeof merge_sha === 'string' ? merge_sha : null,
      conflictFiles: Array.isArray(conflict_files) ? conflict_files : [],
      rebaseError: typeof rebase_error === 'string' ? rebase_error : null,
      ciRunUrl: typeof ci_run_url === 'string' ? ci_run_url : null,
    })
    .returning();

  return NextResponse.json(row, { status: 201 });
}
