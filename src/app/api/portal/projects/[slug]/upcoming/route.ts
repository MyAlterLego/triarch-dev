/**
 * INCL-08: admin authoritative read endpoint for portal /upcoming page.
 *
 * Portal cannot read bugReports/featureRequests directly (DML-only portal_runtime
 * role + admin owns inclusion-state truth per CONTEXT D-Portal). Portal
 * HMAC-signs a POST to this route with intent='read_upcoming'; admin returns
 * customer-safe items[] (approved_for_build + built states only).
 *
 * Method choice — POST not GET (see 36-CONTEXT.md <amendments> 2026-05-18):
 *   HMAC integrity verification requires a deterministic body to sign. INCL-08
 *   spec line said GET; the operational reality is POST so we can reuse the
 *   v2.2 Phase 22 WRITE-04 POST-with-signed-body pattern (admin's
 *   /api/internal/dispatch). Path is unchanged.
 *
 * Pitfall 6 (closed by Plan 36-06 Task 1): InternalHmacBody is a discriminated
 *   union on `intent`; this route accepts read_upcoming only.
 *
 * Pitfall 7 (customer-safe field allowlist): the SELECT below projects ONLY
 *   the customer-visible columns. Staff-only columns on bug/feature rows
 *   (internal notes, slack thread refs, build-plan jsonb, fix-commit metadata)
 *   are deliberately not in the SELECT projection. Defense in depth: even if
 *   the mock/DB returns extra columns, the items[] construction below maps
 *   explicit fields only — staff-only column names do not appear ANYWHERE in
 *   this source file by design (grep-verifiable).
 *
 * Pitfall 9 (Next.js 16 async params): params is `Promise<{slug:string}>` and
 *   awaited before use.
 */
import { NextRequest, NextResponse } from 'next/server';
import { verifyRequest, createMemoryNonceStore } from '@triarchsecurity/triarch-shared/internal-hmac';
import { getSecret } from '@triarchsecurity/secrets';
import { db } from '@/lib/db';
import { projects, bugReports, featureRequests } from '@/db/schema';
import { eq, and, inArray, desc } from 'drizzle-orm';

// Module-level nonce store (matches /api/internal/dispatch pattern).
// Multi-instance FAH: each instance has its own store; cross-instance replay
// is bounded by the 5-min skew window (acceptable per Phase 22 decision).
const nonceStore = createMemoryNonceStore();

const INCLUSION_STATES_VISIBLE_TO_CUSTOMER = ['approved_for_build', 'built'] as const;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  // 1. Resolve secret. Fail closed if vault is unreachable.
  let secret: string;
  try {
    secret = await getSecret('INTERNAL_HMAC_SECRET');
  } catch {
    return NextResponse.json({ error: 'no_secret' }, { status: 500 });
  }

  // 2. HMAC verify (signature + timestamp skew + nonce replay).
  const rawBody = await req.text();
  const signature = req.headers.get('x-hmac-signature');
  const verified = verifyRequest({ rawBody, signature, secret, nonceStore });
  if (!verified.ok) {
    // DO NOT log rawBody — may contain customer email + project info.
    console.warn(`[upcoming] verify failed: ${verified.reason}`);
    const status = verified.reason === 'no_secret' ? 500 : 401;
    return NextResponse.json({ error: verified.reason }, { status });
  }

  // 3. Intent guard — this endpoint serves read_upcoming ONLY.
  if (verified.body.intent !== 'read_upcoming') {
    console.warn(`[upcoming] rejected non-read intent: ${verified.body.intent}`);
    return NextResponse.json({ error: 'wrong_intent' }, { status: 400 });
  }
  // verified.body is now narrowed to ReadUpcomingBody

  // 4. Defense in depth: signed body.projectKey must match URL slug.
  //    HMAC alone proves the signer knows the secret. The URL says which
  //    project the caller WANTS; the signed body says which they intended to
  //    sign for. Mismatch is a programmer error or attack attempt.
  const { slug } = await params;
  if (verified.body.projectKey !== slug) {
    console.warn(`[upcoming] projectKey/slug mismatch: ${verified.body.projectKey} vs ${slug}`);
    return NextResponse.json({ error: 'project_mismatch' }, { status: 400 });
  }

  // 5. Project must exist.
  const [project] = await db
    .select({ key: projects.key })
    .from(projects)
    .where(eq(projects.key, slug));

  if (!project) {
    return NextResponse.json({ error: 'project_not_found' }, { status: 404 });
  }

  // 6. SELECT customer-safe fields ONLY — Pitfall 7 allowlist.
  //    Bugs include severity; features do not (they have no severity column).
  //    Both filtered to inclusion_state IN ('approved_for_build', 'built')
  //    per CONTEXT D-Portal (exclude triaged/pending_inclusion/deferred/deployed).
  const bugs = await db
    .select({
      id: bugReports.id,
      title: bugReports.title,
      severity: bugReports.severity,
      inclusionState: bugReports.inclusionState,
      updatedAt: bugReports.updatedAt,
    })
    .from(bugReports)
    .where(and(
      eq(bugReports.project, slug),
      inArray(bugReports.inclusionState, [...INCLUSION_STATES_VISIBLE_TO_CUSTOMER]),
    ))
    .orderBy(desc(bugReports.updatedAt));

  const features = await db
    .select({
      id: featureRequests.id,
      title: featureRequests.title,
      inclusionState: featureRequests.inclusionState,
      updatedAt: featureRequests.updatedAt,
    })
    .from(featureRequests)
    .where(and(
      eq(featureRequests.project, slug),
      inArray(featureRequests.inclusionState, [...INCLUSION_STATES_VISIBLE_TO_CUSTOMER]),
    ))
    .orderBy(desc(featureRequests.updatedAt));

  // 7. Merge + sort by updatedAt desc. Explicit field construction means even
  //    if the DB row (or test mock) carries extra columns, only the allowlist
  //    fields end up in the response payload.
  const items = [
    ...bugs.map((b) => ({
      id: b.id,
      type: 'bug' as const,
      title: b.title,
      severity: b.severity,
      inclusionState: b.inclusionState,
      updatedAt: b.updatedAt,
    })),
    ...features.map((f) => ({
      id: f.id,
      type: 'feature' as const,
      title: f.title,
      severity: null,
      inclusionState: f.inclusionState,
      updatedAt: f.updatedAt,
    })),
  ].sort((a, b) => {
    const aTime = a.updatedAt instanceof Date ? a.updatedAt.getTime() : new Date(a.updatedAt as string).getTime();
    const bTime = b.updatedAt instanceof Date ? b.updatedAt.getTime() : new Date(b.updatedAt as string).getTime();
    return bTime - aTime;
  });

  return NextResponse.json({ items });
}
