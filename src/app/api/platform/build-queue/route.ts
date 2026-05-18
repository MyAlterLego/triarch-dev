import { NextRequest, NextResponse } from 'next/server';
import { eq, inArray, and, desc } from 'drizzle-orm';
import { requireSignedIn } from '@/lib/api-auth';
import { getCurrentUserContext } from '@/lib/auth-context';
import { db } from '@/lib/db';
import { bugReportsWithPlan, featureRequests } from '@/db/schema';

/**
 * GET /api/platform/build-queue
 *
 * Staff-only. Returns bug reports + feature requests grouped into the four
 * Kanban buckets used by /admin/modules/build-queue:
 *
 *   backlog       — items not yet picked up for a release
 *   next_release  — approved/queued items ready to be picked up
 *   in_progress   — actively being worked
 *   done          — shipped/fixed/closed (limited to 20 newest)
 *
 * Query:
 *   ?project=<slug>  optional. 'all' or omit for cross-project view.
 *                    Filtering happens at the SQL level (WHERE clauses)
 *                    so we don't fetch all rows then filter in JS.
 *
 * Status mapping ported from security-admin@7b133f1; the inclusion_state
 * machine introduced in Phase 36 is orthogonal — that drives the
 * per-project /admin/modules/next-build-plan view, not this Kanban.
 *
 * Bug reads use bugReportsWithPlan so that consumers (e.g. the Kanban
 * card) can read estimatedEffort and buildPlanStatus from the same row.
 */

export const runtime = 'nodejs';

// ── Status buckets — single source of truth for the Kanban columns. ────
// Bugs and features have separate status vocabularies so each gets its
// own set; same column on the UI groups them together.
const BUG_BACKLOG_STATUSES = ['submitted', 'triaged', 'deferred'];
const BUG_IN_PROGRESS_STATUSES = ['in_progress', 'needs_review', 'needs_human'];
const BUG_DONE_STATUSES = ['fixed', 'verified', 'closed'];
const BUG_APPROVED_STATUSES = ['approved'];

const FEATURE_BACKLOG_STATUSES = ['submitted', 'plan_generated', 'reviewed'];
const FEATURE_IN_PROGRESS_STATUSES = ['in_progress'];
const FEATURE_DONE_STATUSES = ['shipped', 'closed', 'declined'];
const FEATURE_APPROVED_STATUSES = ['approved', 'queued'];

const DONE_LIMIT = 20;

export async function GET(req: NextRequest) {
  // ── Auth: signed-in + staff. Cross-project view requires staff;
  // a non-staff member would only see their own project anyway, and the
  // Kanban is a staff-ops surface per the security-admin precedent.
  const { error, session } = await requireSignedIn();
  if (error) return error;

  const ctx = await getCurrentUserContext(session);
  if (!ctx?.isStaff) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const project = req.nextUrl.searchParams.get('project');
  const filterByProject = project && project !== 'all';

  try {
    // Helper: AND together status-filter + (optional) project-filter
    function bugWhere(statuses: string[]) {
      return filterByProject
        ? and(inArray(bugReportsWithPlan.status, statuses), eq(bugReportsWithPlan.project, project!))
        : inArray(bugReportsWithPlan.status, statuses);
    }
    function featureWhere(statuses: string[]) {
      return filterByProject
        ? and(inArray(featureRequests.status, statuses), eq(featureRequests.project, project!))
        : inArray(featureRequests.status, statuses);
    }

    // ── Run all 8 queries in parallel ────────────────────────────────
    const [
      backlogBugs,
      inProgressBugs,
      nextReleaseBugs,
      doneBugs,
      backlogFeatures,
      inProgressFeatures,
      nextReleaseFeatures,
      doneFeatures,
    ] = await Promise.all([
      db.select().from(bugReportsWithPlan).where(bugWhere(BUG_BACKLOG_STATUSES)).orderBy(desc(bugReportsWithPlan.createdAt)),
      db.select().from(bugReportsWithPlan).where(bugWhere(BUG_IN_PROGRESS_STATUSES)).orderBy(desc(bugReportsWithPlan.createdAt)),
      db.select().from(bugReportsWithPlan).where(bugWhere(BUG_APPROVED_STATUSES)).orderBy(desc(bugReportsWithPlan.createdAt)),
      db.select().from(bugReportsWithPlan).where(bugWhere(BUG_DONE_STATUSES)).orderBy(desc(bugReportsWithPlan.createdAt)).limit(DONE_LIMIT),
      db.select().from(featureRequests).where(featureWhere(FEATURE_BACKLOG_STATUSES)).orderBy(desc(featureRequests.createdAt)),
      db.select().from(featureRequests).where(featureWhere(FEATURE_IN_PROGRESS_STATUSES)).orderBy(desc(featureRequests.createdAt)),
      db.select().from(featureRequests).where(featureWhere(FEATURE_APPROVED_STATUSES)).orderBy(desc(featureRequests.createdAt)),
      db.select().from(featureRequests).where(featureWhere(FEATURE_DONE_STATUSES)).orderBy(desc(featureRequests.createdAt)).limit(DONE_LIMIT),
    ]);

    // Tag each row with `type` so the client can render bug vs feature
    // cards differently. Spread after `type` so a future row column
    // named 'type' would override (none exists in either table today).
    const taggedBugs = (bugs: typeof backlogBugs) =>
      bugs.map((b) => ({ type: 'bug' as const, ...b }));
    const taggedFeatures = (features: typeof backlogFeatures) =>
      features.map((f) => ({ type: 'feature' as const, ...f }));

    return NextResponse.json({
      backlog: [...taggedBugs(backlogBugs), ...taggedFeatures(backlogFeatures)],
      next_release: [...taggedBugs(nextReleaseBugs), ...taggedFeatures(nextReleaseFeatures)],
      in_progress: [...taggedBugs(inProgressBugs), ...taggedFeatures(inProgressFeatures)],
      done: [...taggedBugs(doneBugs), ...taggedFeatures(doneFeatures)],
    });
  } catch (e: unknown) {
    console.error('[build-queue] query failed', e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
