---
phase: 36-inclusion-approval-state-machine
plan: 06
type: execute
wave: 3
depends_on: [36-01, 36-03, 36-04]
files_modified:
  - packages/triarch-shared/src/internal-hmac.ts
  - packages/triarch-shared/src/internal-hmac.test.ts
  - packages/triarch-shared/package.json
  - src/app/api/portal/projects/[slug]/upcoming/route.ts
  - src/app/api/portal/projects/[slug]/upcoming/route.test.ts
  - package.json
  - package-lock.json
autonomous: false
requirements: [INCL-08]
must_haves:
  truths:
    - "InternalHmacBody type in @triarchsecurity/triarch-shared/internal-hmac is a discriminated union on intent: 'dispatch_promotion' (existing fields) | 'read_upcoming' (projectKey + actorEmail + timestamp + nonce only, no branch/version/releaseId)"
    - "signRequest and verifyRequest still produce/verify byte-exact canonical signatures across BOTH intents (canonicalize sorts keys; new intent-discriminated fields just shrink the payload)"
    - "All existing Phase 22 InternalHmacBody consumers (admin /api/internal/dispatch, portal /lib/internal-dispatch) continue to type-check and pass tests — the existing fields are still required when intent='dispatch_promotion'"
    - "New admin endpoint GET /api/portal/projects/{slug}/upcoming validates HMAC signature with intent='read_upcoming', looks up the project, and returns a JSON payload of items where inclusion_state IN ('approved_for_build', 'built') for that project"
    - "Endpoint EXPLICITLY projects only customer-safe fields per row: {id, type:'bug'|'feature', title, severity (bugs only, null for features), inclusionState, updatedAt}; NO triarchNotes, NO buildPlan, NO internal Slack thread refs (Pitfall 7)"
    - "Endpoint rejects requests with intent='dispatch_promotion' or any other intent — read_upcoming ONLY for this route"
    - "Endpoint returns 401 with structured error on bad HMAC; 404 on unknown project; 200 with payload on success"
    - "Shared package version bumped 0.4.0 → 0.5.0 (the discriminated-union change is additive — old consumers still work — but the type-shape is significant enough to warrant a minor bump)"
  artifacts:
    - path: "packages/triarch-shared/src/internal-hmac.ts"
      provides: "InternalHmacBody as discriminated union on `intent` field; signRequest + verifyRequest + isValidBody updated to handle both variants"
      contains: "intent"
    - path: "packages/triarch-shared/src/internal-hmac.test.ts"
      provides: "Tests for both intents — sign+verify round trip for read_upcoming AND dispatch_promotion; cross-intent rejection (signed as one, verified expecting the other)"
      contains: "read_upcoming"
    - path: "src/app/api/portal/projects/[slug]/upcoming/route.ts"
      provides: "GET handler: HMAC verify (intent=read_upcoming) → project lookup → mixed bugs+features SELECT (inclusion_state in ['approved_for_build', 'built']) → customer-safe field projection → JSON response"
      contains: "read_upcoming"
  key_links:
    - from: "src/app/api/portal/projects/[slug]/upcoming/route.ts"
      to: "verifyRequest from @triarchsecurity/triarch-shared/internal-hmac"
      via: "import + verifyRequest({rawBody, signature, secret, nonceStore})"
      pattern: "verifyRequest"
    - from: "src/app/api/portal/projects/[slug]/upcoming/route.ts"
      to: "bugReports.inclusionState IN ('approved_for_build', 'built')"
      via: "drizzle SELECT WHERE eq(project,slug) AND inArray(inclusionState, [...])"
      pattern: "approved_for_build.*built"
    - from: "packages/triarch-shared/src/internal-hmac.ts"
      to: "discriminated union on intent field"
      via: "type InternalHmacBody = DispatchPromotionBody | ReadUpcomingBody"
      pattern: "discriminated union|intent: 'read_upcoming'|intent: 'dispatch_promotion'"
---

<objective>
Solve RESEARCH Pitfall 6 (HMAC body schema mismatch for non-dispatch intents) by extending `InternalHmacBody` to a discriminated union on `intent: 'dispatch_promotion' | 'read_upcoming'`, then ship the new admin endpoint `GET /api/portal/projects/{slug}/upcoming` that verifies HMAC with `intent='read_upcoming'` and returns customer-safe inclusion-state data for the project. Shared package bumps 0.4.0 → 0.5.0. The endpoint explicitly projects only customer-safe fields (Pitfall 7) and rejects cross-intent requests.

Purpose: INCL-08 — admin is authoritative for inclusion-state data; portal must fetch via HMAC from admin (CONTEXT D-Portal). This plan ships the SERVER side; Plan 36-07 ships the portal page that calls this endpoint. The discriminated-union refactor pays for itself across all future internal HMAC intents (read_upcoming today, more to come in v2.5+).
Output: Discriminated-union HMAC schema, sign/verify round-trip tested for both intents, new admin endpoint with customer-safe field projection, shared package 0.5.0 published, admin re-installed.
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/execute-plan.md
@~/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/36-inclusion-approval-state-machine/36-CONTEXT.md
@.planning/phases/36-inclusion-approval-state-machine/36-RESEARCH.md

# Source-of-truth references
@packages/triarch-shared/src/internal-hmac.ts
@packages/triarch-shared/src/internal-hmac.test.ts
@src/app/api/internal/dispatch/route.ts

<interfaces>
<!-- Current InternalHmacBody shape (Phase 22 — single-intent for dispatch_promotion). From packages/triarch-shared/src/internal-hmac.ts:7-17. -->

```typescript
export type InternalHmacBody = {
  actorEmail: string;
  branch: string;
  nonce: string;
  projectKey: string;
  releaseId: string;
  slackChannelId: string | null;
  slackMessageTs: string | null;
  timestamp: number;
  version: string;
};
```

Target shape after this plan:
```typescript
// Common fields shared by all intents
type BaseHmacFields = {
  actorEmail: string;
  nonce: string;
  projectKey: string;
  timestamp: number;
};

export type DispatchPromotionBody = BaseHmacFields & {
  intent: 'dispatch_promotion';
  branch: string;
  releaseId: string;
  slackChannelId: string | null;
  slackMessageTs: string | null;
  version: string;
};

export type ReadUpcomingBody = BaseHmacFields & {
  intent: 'read_upcoming';
};

export type InternalHmacBody = DispatchPromotionBody | ReadUpcomingBody;
```

CRITICAL back-compat note for Phase 22 consumers:
- `signRequest` in portal/src/lib/internal-dispatch.ts passes the OLD shape (no `intent` field). After the union refactor, sign callers MUST add `intent: 'dispatch_promotion'`. portal will pick up this requirement automatically on `npm install` of 0.5.0 — TypeScript will refuse to compile if portal doesn't add `intent`. THIS PLAN updates portal-side dependents in the next plan (36-07). Within THIS plan, we ship the admin-side change + shared-package bump + the admin /api/internal/dispatch handler update (admin's own consumer).

Existing admin consumer to update:
- src/app/api/internal/dispatch/route.ts (lines 34-50) — destructures fields directly from verified.body. After union, we narrow on intent before destructuring branch/version/releaseId.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Refactor InternalHmacBody to discriminated union on intent; update sign/verify/canonicalize; bump shared package to 0.5.0; update admin /api/internal/dispatch consumer</name>
  <files>packages/triarch-shared/src/internal-hmac.ts, packages/triarch-shared/src/internal-hmac.test.ts, packages/triarch-shared/package.json, src/app/api/internal/dispatch/route.ts</files>
  <read_first>
    - packages/triarch-shared/src/internal-hmac.ts (entire file — 201 lines; understand canonicalize, signRequest, verifyRequest, isValidBody)
    - packages/triarch-shared/src/internal-hmac.test.ts (existing test pattern for sign + verify round trip)
    - src/app/api/internal/dispatch/route.ts (lines 33-58 — current destructure of verified.body; uses branch/version/releaseId/slackChannelId/slackMessageTs)
    - .planning/phases/36-inclusion-approval-state-machine/36-RESEARCH.md (Pattern 4 + Pitfall 6 + Open Question 3 — discriminated union is the recommended approach)
  </read_first>
  <behavior>
    - InternalHmacBody is now a discriminated union — TypeScript narrows correctly when checking `body.intent === 'read_upcoming'`
    - signRequest({intent: 'read_upcoming', projectKey: 'tmi', actorEmail: 'mike@triarch...'}, secret) produces a signature; verifyRequest accepts it
    - signRequest({intent: 'dispatch_promotion', branch: 'release/v4.46.1', version: 'v4.46.1', ...}, secret) still works for existing callers
    - Cross-intent rejection: a body signed as read_upcoming but DECLARED as dispatch_promotion (or vice versa) is rejected as malformed
    - canonicalize still sorts keys alphabetically — the `intent` field gets sorted in just like any other field; signatures are byte-stable per intent
    - isValidBody narrows on intent field and validates ONLY the required fields for that intent
    - All existing Phase 22 tests in internal-hmac.test.ts still pass (with the addition of `intent: 'dispatch_promotion'` in test inputs)
    - admin's /api/internal/dispatch route updated to: (1) verify HMAC, (2) check `verified.body.intent === 'dispatch_promotion'` (reject 400 if not), (3) then destructure dispatch-specific fields
    - Shared package version: 0.4.0 → 0.5.0
  </behavior>
  <action>
    1. EDIT `packages/triarch-shared/src/internal-hmac.ts`:

       a. Replace lines 7-17 with the discriminated-union types described in the interfaces block above.

       b. Update `signRequest`'s input type from `Omit<InternalHmacBody, 'timestamp' | 'nonce'>` to `Omit<DispatchPromotionBody, 'timestamp' | 'nonce'> | Omit<ReadUpcomingBody, 'timestamp' | 'nonce'>`. The function body remains structurally identical — `{ ...input, timestamp: now, nonce }` continues to spread.

       c. Update `isValidBody` (currently lines 153-166) to narrow on `intent` field:
       ```typescript
       function isValidBody(obj: Record<string, unknown>): obj is InternalHmacBody {
         // Common fields required for all intents
         if (
           typeof obj['actorEmail'] !== 'string' ||
           typeof obj['nonce'] !== 'string' ||
           typeof obj['projectKey'] !== 'string' ||
           typeof obj['timestamp'] !== 'number' ||
           (obj['nonce'] as string).length !== 32
         ) return false;

         const intent = obj['intent'];

         if (intent === 'dispatch_promotion') {
           return (
             typeof obj['branch'] === 'string' &&
             typeof obj['version'] === 'string' &&
             typeof obj['releaseId'] === 'string' &&
             (typeof obj['slackChannelId'] === 'string' || obj['slackChannelId'] === null) &&
             (typeof obj['slackMessageTs'] === 'string' || obj['slackMessageTs'] === null)
           );
         }
         if (intent === 'read_upcoming') {
           return true; // No additional fields required beyond base
         }
         return false;
       }
       ```

       d. canonicalize() remains UNCHANGED — `JSON.stringify(body, Object.keys(body).sort())` works for both shapes; `intent` gets sorted alphabetically along with every other key.

       e. The VerifyResult type's `body: InternalHmacBody` automatically gets the union shape — callers can narrow on `body.intent`.

    2. UPDATE `packages/triarch-shared/src/internal-hmac.test.ts`:

       a. ADD `intent: 'dispatch_promotion'` to every existing test that constructs a body. Tests should still pass.

       b. ADD NEW TEST SUITE (RED-then-GREEN):
       ```typescript
       describe('discriminated union: read_upcoming intent', () => {
         it('signs and verifies a read_upcoming body', () => {
           const { body, signature } = signRequest(
             { intent: 'read_upcoming', actorEmail: 'mike@triarch.dev', projectKey: 'tmi' },
             'test-secret',
           );
           expect(body.intent).toBe('read_upcoming');
           const result = verifyRequest({
             rawBody: JSON.stringify(body, Object.keys(body).sort()),
             signature,
             secret: 'test-secret',
           });
           expect(result.ok).toBe(true);
           if (result.ok) expect(result.body.intent).toBe('read_upcoming');
         });

         it('rejects read_upcoming body with extra dispatch fields when intent declared as read_upcoming', () => {
           // This is enforced at the TS level for signRequest; verify enforcement on the wire too
           // by feeding malformed raw body
           const result = verifyRequest({
             rawBody: JSON.stringify({
               intent: 'read_upcoming',
               actorEmail: 'mike@triarch.dev',
               projectKey: 'tmi',
               nonce: 'a'.repeat(32),
               timestamp: Date.now(),
               // Extra fields are tolerated by isValidBody (it only checks required fields)
             }, ['actorEmail','intent','nonce','projectKey','timestamp']),
             signature: 'bogus',
             secret: 'test-secret',
           });
           expect(result.ok).toBe(false);  // bad_signature, not malformed
         });

         it('rejects body with unknown intent value', () => {
           const result = verifyRequest({
             rawBody: JSON.stringify({
               intent: 'unknown_intent',
               actorEmail: 'mike@triarch.dev',
               projectKey: 'tmi',
               nonce: 'a'.repeat(32),
               timestamp: Date.now(),
             }, ['actorEmail','intent','nonce','projectKey','timestamp']),
             signature: 'whatever',
             secret: 'test-secret',
           });
           expect(result.ok).toBe(false);
           if (!result.ok) expect(result.reason).toBe('malformed');
         });
       });
       ```

    3. EDIT `packages/triarch-shared/package.json`: change `"version": "0.4.0"` → `"version": "0.5.0"` (line 3).

    4. UPDATE admin's existing consumer at `src/app/api/internal/dispatch/route.ts`:

       a. After `if (!verified.ok) { ... }` block (around line 32), and BEFORE the destructure at line 34, add an intent guard:
       ```typescript
       if (verified.body.intent !== 'dispatch_promotion') {
         console.warn(`[internal-dispatch] rejected non-dispatch intent: ${verified.body.intent}`);
         return NextResponse.json({ error: 'wrong_intent' }, { status: 400 });
       }
       // From here on, verified.body is narrowed to DispatchPromotionBody
       const { branch, version, projectKey, releaseId, actorEmail, slackChannelId, slackMessageTs } = verified.body;
       ```

       b. The rest of the route file stays unchanged. TypeScript should now type-narrow correctly after the intent check.

    5. Build and test shared package:
       ```bash
       cd packages/triarch-shared && npx tsc --build && npx vitest run src/internal-hmac.test.ts
       ```
       Then build admin: `npx next build` (verifies admin's /api/internal/dispatch consumer still compiles).
  </action>
  <verify>
    <automated>cd packages/triarch-shared &amp;&amp; npx tsc --build &amp;&amp; npx vitest run src/internal-hmac.test.ts &amp;&amp; cd ../.. &amp;&amp; grep -c "intent !== 'dispatch_promotion'" src/app/api/internal/dispatch/route.ts &amp;&amp; jq -r .version packages/triarch-shared/package.json</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "DispatchPromotionBody" packages/triarch-shared/src/internal-hmac.ts` returns >= 1
    - `grep -c "ReadUpcomingBody" packages/triarch-shared/src/internal-hmac.ts` returns >= 1
    - `grep -c "intent: 'dispatch_promotion'" packages/triarch-shared/src/internal-hmac.ts` returns >= 1
    - `grep -c "intent: 'read_upcoming'" packages/triarch-shared/src/internal-hmac.ts` returns >= 1
    - `grep -c "intent !== 'dispatch_promotion'" src/app/api/internal/dispatch/route.ts` returns 1
    - `grep -c "wrong_intent" src/app/api/internal/dispatch/route.ts` returns 1
    - `jq -r .version packages/triarch-shared/package.json` returns `0.5.0`
    - `npx vitest run src/internal-hmac.test.ts` reports 0 failures (existing Phase 22 tests + new read_upcoming tests all pass)
    - Admin `npx next build` exits 0 (the intent guard satisfies TS narrowing)
  </acceptance_criteria>
  <done>Shared package 0.5.0 ships discriminated-union HMAC body; admin /api/internal/dispatch enforces intent='dispatch_promotion' for the existing path; new ReadUpcomingBody shape is available for the new endpoint in Task 2.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Create admin endpoint GET /api/portal/projects/[slug]/upcoming with HMAC verify + customer-safe field projection</name>
  <files>src/app/api/portal/projects/[slug]/upcoming/route.ts, src/app/api/portal/projects/[slug]/upcoming/route.test.ts</files>
  <read_first>
    - src/app/api/internal/dispatch/route.ts (HMAC verify pattern — nonceStore, verifyRequest, error responses)
    - .planning/phases/36-inclusion-approval-state-machine/36-CONTEXT.md (D-Portal: customer-visible fields = title + type-pill + severity (bugs only) + state pill + relative timestamp; NO triarchNotes, NO Slack refs)
    - .planning/phases/36-inclusion-approval-state-machine/36-RESEARCH.md (Pattern 4 portal page + admin endpoint; Pitfall 7 staff-only field leak)
    - src/app/api/platform/bug-reports/[id]/route.ts (existing PATCH for SELECT pattern reference)
    - packages/triarch-shared/src/internal-hmac.ts (the updated file from Task 1 — use ReadUpcomingBody)
  </read_first>
  <behavior>
    - Test 1 (happy path): Valid HMAC signature on `{intent: 'read_upcoming', projectKey: 'tmi', actorEmail, timestamp, nonce}` → 200 with `{items: [...]}` payload; each item has exactly the fields {id, type, title, severity (bug only), inclusionState, updatedAt} and NO triarchNotes/buildPlan/slackMessageTs
    - Test 2 (only approved_for_build + built returned): Setup DB with bugs in every inclusion_state for tmi → endpoint returns only those in approved_for_build + built (per CONTEXT — excludes triaged, pending_inclusion, deferred, rejected, deployed)
    - Test 3 (cross-intent rejection): Valid HMAC with `intent: 'dispatch_promotion'` body → 400 with `{error: 'wrong_intent'}`; NO DB query issued
    - Test 4 (bad signature): HMAC mismatch → 401 with `{error: 'bad_signature'}`
    - Test 5 (unknown project): Valid HMAC for `projectKey: 'nonexistent'` → 404
    - Test 6 (no_secret): INTERNAL_HMAC_SECRET unavailable → 500 with `{error: 'no_secret'}`
    - Test 7 (replay protection): Same nonce replayed within TTL → 401 with `{error: 'replay'}`
    - Test 8 (timestamp skew): Body with timestamp older than 5 minutes → 401 with `{error: 'expired'}`
    - Test 9 (field allowlist enforcement): Mock DB row contains triarchNotes='SECRET-NOTE'; response payload string does NOT contain 'SECRET-NOTE' (Pitfall 7 grep-style assertion)
  </behavior>
  <action>
    1. WRITE TESTS FIRST. Create `src/app/api/portal/projects/[slug]/upcoming/route.test.ts`. Mock `@triarchsecurity/triarch-shared/internal-hmac` (or use real signRequest with a known test secret), mock `@triarchsecurity/secrets.getSecret`, mock `@/lib/db`. Tests 1-9 above must initially FAIL because the route doesn't yet exist (RED).

    2. CREATE the directory tree: `src/app/api/portal/projects/[slug]/upcoming/`

    3. CREATE `src/app/api/portal/projects/[slug]/upcoming/route.ts`:
    ```typescript
    /**
     * INCL-08: admin authoritative read endpoint for portal /upcoming page.
     *
     * Portal cannot read bugReports/featureRequests directly (DML-only portal_runtime role
     * + admin owns inclusion-state truth). Portal HMAC-signs a GET-shaped POST to this
     * route (intent='read_upcoming'), admin returns customer-safe field projection.
     *
     * Pitfall 7: explicit field allowlist on the SELECT — NO SELECT * from bugReports.
     * Pitfall 6: relies on Plan 36-06 Task 1 discriminated-union InternalHmacBody.
     */
    import { NextRequest, NextResponse } from 'next/server';
    import { verifyRequest, createMemoryNonceStore } from '@triarchsecurity/triarch-shared/internal-hmac';
    import { getSecret } from '@triarchsecurity/secrets';
    import { db } from '@/lib/db';
    import { projects, bugReports, featureRequests } from '@/db/schema';
    import { eq, and, inArray, desc } from 'drizzle-orm';

    // Module-level nonce store (matches /api/internal/dispatch pattern)
    const nonceStore = createMemoryNonceStore();

    export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
      // Note: this is a POST despite being semantically a read — HMAC verify requires
      // a request body for signature recomputation. Body carries the intent + auth fields.

      let secret: string;
      try {
        secret = await getSecret('INTERNAL_HMAC_SECRET');
      } catch {
        return NextResponse.json({ error: 'no_secret' }, { status: 500 });
      }

      const rawBody = await req.text();
      const signature = req.headers.get('x-hmac-signature');
      const verified = verifyRequest({ rawBody, signature, secret, nonceStore });
      if (!verified.ok) {
        console.warn(`[upcoming] verify failed: ${verified.reason}`);
        const status = verified.reason === 'no_secret' ? 500 : 401;
        return NextResponse.json({ error: verified.reason }, { status });
      }

      // Intent guard — this endpoint serves read_upcoming ONLY
      if (verified.body.intent !== 'read_upcoming') {
        console.warn(`[upcoming] rejected non-read intent: ${verified.body.intent}`);
        return NextResponse.json({ error: 'wrong_intent' }, { status: 400 });
      }

      const { slug } = await params;

      // Defense in depth: body.projectKey must match the URL slug
      // (HMAC is a generic auth; URL says which project the caller WANTS, body says which they SIGNED for)
      if (verified.body.projectKey !== slug) {
        console.warn(`[upcoming] projectKey/slug mismatch: ${verified.body.projectKey} vs ${slug}`);
        return NextResponse.json({ error: 'project_mismatch' }, { status: 400 });
      }

      const [project] = await db
        .select({ key: projects.key })
        .from(projects)
        .where(eq(projects.key, slug));
      if (!project) {
        return NextResponse.json({ error: 'project_not_found' }, { status: 404 });
      }

      // EXPLICIT field allowlist — Pitfall 7: do NOT select * from bugReports
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
          inArray(bugReports.inclusionState, ['approved_for_build', 'built']),
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
          inArray(featureRequests.inclusionState, ['approved_for_build', 'built']),
        ))
        .orderBy(desc(featureRequests.updatedAt));

      const items = [
        ...bugs.map(b => ({ id: b.id, type: 'bug' as const, title: b.title, severity: b.severity, inclusionState: b.inclusionState, updatedAt: b.updatedAt })),
        ...features.map(f => ({ id: f.id, type: 'feature' as const, title: f.title, severity: null, inclusionState: f.inclusionState, updatedAt: f.updatedAt })),
      ].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

      return NextResponse.json({ items });
    }
    ```

    4. Run `npx vitest run src/app/api/portal/projects/[slug]/upcoming/route.test.ts` — all 9 tests pass.

    5. Run `npx next build` to confirm admin compiles end-to-end.
  </action>
  <verify>
    <automated>npx vitest run "src/app/api/portal/projects/[slug]/upcoming/route.test.ts" &amp;&amp; npx next build 2>&amp;1 | tail -10</automated>
  </verify>
  <acceptance_criteria>
    - File `src/app/api/portal/projects/[slug]/upcoming/route.ts` exists
    - `grep -c "intent !== 'read_upcoming'" src/app/api/portal/projects/[slug]/upcoming/route.ts` returns 1
    - `grep -c "wrong_intent" src/app/api/portal/projects/[slug]/upcoming/route.ts` returns 1
    - `grep -c "inArray(bugReports.inclusionState, \['approved_for_build', 'built'\])" src/app/api/portal/projects/[slug]/upcoming/route.ts` returns 1
    - `grep -c "inArray(featureRequests.inclusionState, \['approved_for_build', 'built'\])" src/app/api/portal/projects/[slug]/upcoming/route.ts` returns 1
    - `grep -c "triarchNotes" src/app/api/portal/projects/[slug]/upcoming/route.ts` returns 0 (NEVER selected — Pitfall 7)
    - `grep -c "slackMessageTs" src/app/api/portal/projects/[slug]/upcoming/route.ts` returns 0 (NEVER selected — Pitfall 7)
    - `grep -c "buildPlan" src/app/api/portal/projects/[slug]/upcoming/route.ts` returns 0 (NEVER selected — Pitfall 7)
    - `grep -c "verifyRequest" src/app/api/portal/projects/[slug]/upcoming/route.ts` returns 1
    - `grep -c "params: Promise<{ slug: string }>" src/app/api/portal/projects/[slug]/upcoming/route.ts` returns 1 (Pitfall 9 Next.js 16 async params)
    - All route tests pass (9 tests including Pitfall 7 grep-style payload assertion)
    - `npx next build` exits 0
  </acceptance_criteria>
  <done>Admin endpoint ships with HMAC verify + intent guard + project slug cross-check + customer-safe field projection; all 9 tests including Pitfall 7 grep assertion pass.</done>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 3: Publish shared package 0.5.0 + re-install in admin + commit</name>
  <what-built>
    - InternalHmacBody refactored to discriminated union (shared package source ready)
    - New admin /api/portal/projects/[slug]/upcoming endpoint (source ready)
    - admin /api/internal/dispatch updated for intent narrowing
    - All tests pass locally; admin builds clean
  </what-built>
  <how-to-verify>
    1. **On the same feature branch (or a new one off it)**:
       ```bash
       cd /Users/mikegeehan/claude/triarch/development/admin
       git checkout feat/inclusion-state-machine   # branch from Plan 36-01
       # If subsequent plans live on different branches, decide branching strategy
       ```

    2. **Commit the shared-package changes AND the admin-side consumer updates**:
       ```bash
       git add packages/triarch-shared/src/internal-hmac.ts packages/triarch-shared/src/internal-hmac.test.ts packages/triarch-shared/package.json src/app/api/internal/dispatch/route.ts "src/app/api/portal/projects/[slug]/upcoming/route.ts" "src/app/api/portal/projects/[slug]/upcoming/route.test.ts"
       git commit -m "feat(36-06): discriminated-union HMAC body + INCL-08 admin endpoint

       - Shared: InternalHmacBody → DispatchPromotionBody | ReadUpcomingBody (intent discriminator)
       - Shared: 0.4.0 → 0.5.0 (discriminated-union refactor; back-compat for dispatch_promotion callers via TS narrowing)
       - Admin: /api/internal/dispatch guards on intent='dispatch_promotion'; rejects others with 400
       - Admin: NEW /api/portal/projects/[slug]/upcoming (POST, HMAC-verified, intent='read_upcoming') — INCL-08 source of truth
       - Pitfall 7: explicit field allowlist; no triarchNotes/buildPlan/slackMessageTs leak
       "
       ```

    3. **Tag and push the shared package** (publish-shared.yml fires):
       ```bash
       git tag shared/v0.5.0
       git push origin feat/inclusion-state-machine
       git push origin shared/v0.5.0
       gh run watch
       # Wait for publish-shared workflow to succeed
       # Verify: npm view @triarchsecurity/triarch-shared@0.5.0
       ```

    4. **Update admin pin and re-install**:
       ```bash
       # Edit admin's package.json: change @triarchsecurity/triarch-shared from "^0.4.0" → "^0.5.0"
       npm install
       grep -A 2 "triarchsecurity/triarch-shared" package-lock.json | head -10
       # Should show 0.5.0
       ```

    5. **Bump admin version and commit pin update**:
       ```bash
       # Edit admin's package.json version: 2.14.0 → 2.14.1 (patch — additive endpoint)
       git add package.json package-lock.json
       git commit -m "v2.14.1: pin @triarchsecurity/triarch-shared@^0.5.0"
       git push origin feat/inclusion-state-machine
       ```

    6. **Run admin build + tests again to confirm 0.5.0 install works**:
       ```bash
       npx next build
       npx vitest run src/app/api/internal/dispatch src/app/api/portal/projects
       ```

    7. **NOTE on portal coordination**: Portal will need its `@triarchsecurity/triarch-shared` pin updated to `^0.5.0` AND its `signRequest` callers updated to include `intent: 'dispatch_promotion'`. THIS happens in Plan 36-07 (portal page + portal-side fetcher). Do NOT attempt to update portal in this plan — it's a separate execution context with its own branch.

    Expected outcomes (all must be true):
    - npm has @triarchsecurity/triarch-shared@0.5.0 published
    - admin pins ^0.5.0 in package.json + package-lock.json
    - admin version 2.14.1
    - admin build clean, all tests pass
    - PR can stay open against dev; Plan 36-07 lands in a follow-up PR (portal-side)
  </how-to-verify>
  <resume-signal>Type "approved" once `npm view @triarchsecurity/triarch-shared@0.5.0` returns metadata AND admin builds + tests pass on ^0.5.0 pin. If publish-shared workflow fails (non-cosmetically), or if a Phase 22 test regresses, describe the error and stop.</resume-signal>
  <files>none — human-only orchestration of CLI/git/npm/firebase commands</files>
  <action>See &lt;how-to-verify&gt; block below for the full step-by-step sequence the human runs in their shell. This task gates downstream plans because publish/install/db:push are human-orchestrated.</action>
  <verify>
    <automated>MISSING — verification is human-only per &lt;how-to-verify&gt; block</automated>
  </verify>
  <done>Human types "approved" per &lt;resume-signal&gt; after every step in &lt;how-to-verify&gt; passes.</done>

</task>

</tasks>

<verification>
- Shared package 0.5.0 has discriminated-union HMAC body (verifiable: grep for DispatchPromotionBody + ReadUpcomingBody)
- Both intents sign+verify correctly (verifiable: vitest run on internal-hmac.test.ts)
- Admin /api/internal/dispatch enforces intent='dispatch_promotion' (verifiable: grep for `intent !== 'dispatch_promotion'`)
- New admin endpoint /api/portal/projects/[slug]/upcoming exists with HMAC verify + intent guard + customer-safe field projection (verifiable via grep + tests)
- Pitfall 7 guard: zero references to triarchNotes/buildPlan/slackMessageTs in the new endpoint source (verifiable via grep)
- Pitfall 6 closed: discriminated union eliminates the placeholder-string ugliness
- Shared package published, admin re-installed, build + tests pass
</verification>

<success_criteria>
- Portal can sign a request with `{intent: 'read_upcoming', projectKey: 'tmi', actorEmail}` and successfully fetch upcoming items from admin (will be wired in Plan 36-07)
- Customer payload contains zero staff-only fields — `triarchNotes`, `buildPlan`, `slackMessageTs`, internal Slack thread refs are physically impossible to leak (allowlist on SELECT, not on response filter)
- Future internal HMAC intents (e.g., v2.5 managed-agent webhook variants) can be added by extending the discriminated union without breaking existing callers
- All Phase 22 dispatch flow tests + admin tests + new INCL-08 tests all GREEN
</success_criteria>

<output>
After completion, create `.planning/phases/36-inclusion-approval-state-machine/36-06-admin-upcoming-api-SUMMARY.md` documenting:
- Whether the discriminated union required any unexpected TypeScript narrowing in admin/portal consumers (besides /api/internal/dispatch which we updated explicitly)
- npm published version + npm-view output
- Admin version bumped to 2.14.1
- Confirmation that the Pitfall 7 grep assertion in Test 9 caught any accidental triarchNotes leak (it should return 0; if it didn't, that's a critical bug to surface in summary)
- Whether any portal-side test broke (it shouldn't because portal's pin is still on ^0.4.0 at this point — portal pickup happens in 36-07)
</output>
