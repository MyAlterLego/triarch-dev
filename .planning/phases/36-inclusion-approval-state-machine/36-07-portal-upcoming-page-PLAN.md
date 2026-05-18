---
phase: 36-inclusion-approval-state-machine
plan: 07
type: execute
wave: 4
depends_on: [36-06]
files_modified:
  - ../portal/package.json
  - ../portal/package-lock.json
  - ../portal/src/lib/internal-dispatch.ts
  - ../portal/src/lib/admin-fetch-upcoming.ts
  - ../portal/src/lib/admin-fetch-upcoming.test.ts
  - ../portal/src/app/projects/[slug]/upcoming/page.tsx
  - ../portal/src/app/projects/[slug]/upcoming/UpcomingClient.tsx
  - ../portal/src/app/projects/[slug]/upcoming/UpcomingClient.test.tsx
  - ../portal/src/app/projects/[slug]/layout.tsx
autonomous: false
requirements: [INCL-08]
must_haves:
  truths:
    - "Portal pins @triarchsecurity/triarch-shared@^0.5.0 (the discriminated-union version from Plan 36-06)"
    - "Portal's internal-dispatch.ts dispatchPromotion call adds intent: 'dispatch_promotion' to satisfy the new discriminated-union type"
    - "New portal helper src/lib/admin-fetch-upcoming.ts signs read_upcoming HMAC body, POSTs to admin /api/portal/projects/{slug}/upcoming, returns parsed items[]"
    - "Portal page /projects/[slug]/upcoming is membership-gated (404 for non-members per PORTAL-03)"
    - "Customer view shows: title + type-pill + severity (bugs only) + state-pill (approved_for_build = violet 'Approved'; built = teal 'Built') + relative timestamp"
    - "Customer view does NOT render any staff-only field (verified via renderToStaticMarkup grep assertion)"
    - "Portal sub-nav layout.tsx adds Upcoming link active when pathname matches /projects/[slug]/upcoming"
    - "Existing portal Phase 22 dispatchPromotion path still works (existing tests pass)"
  artifacts:
    - path: "../portal/src/lib/admin-fetch-upcoming.ts"
      provides: "Server-side helper: signs read_upcoming HMAC body, POSTs to admin, returns typed UpcomingItem[]"
      exports: ["fetchUpcomingFromAdmin", "UpcomingItem"]
    - path: "../portal/src/app/projects/[slug]/upcoming/page.tsx"
      provides: "Server-component page: auth + membership gate + fetchUpcomingFromAdmin call + render UpcomingClient"
      contains: "fetchUpcomingFromAdmin"
    - path: "../portal/src/app/projects/[slug]/upcoming/UpcomingClient.tsx"
      provides: "Client component: renders the list with state pills + relative timestamps; read-only per CONTEXT v2.4 hard constraint"
      contains: "Approved"
    - path: "../portal/src/lib/internal-dispatch.ts"
      provides: "Existing dispatchPromotion updated to include intent: 'dispatch_promotion' after 0.5.0 refactor"
      contains: "dispatch_promotion"
    - path: "../portal/src/app/projects/[slug]/layout.tsx"
      provides: "Sub-nav extended with Upcoming tab"
      contains: "Upcoming"
  key_links:
    - from: "../portal/src/app/projects/[slug]/upcoming/page.tsx"
      to: "fetchUpcomingFromAdmin"
      via: "server-side helper that signs+fetches admin endpoint"
      pattern: "fetchUpcomingFromAdmin"
    - from: "../portal/src/lib/admin-fetch-upcoming.ts"
      to: "POST {admin}/api/portal/projects/{slug}/upcoming"
      via: "signRequest({intent:'read_upcoming'}) + fetch with X-HMAC-Signature header"
      pattern: "intent: 'read_upcoming'"
    - from: "../portal/src/app/projects/[slug]/layout.tsx"
      to: "/projects/[slug]/upcoming"
      via: "sub-nav Link with usePathname startsWith activeness check"
      pattern: "/upcoming"
---

<objective>
Land the customer-facing piece of INCL-08: portal page `/projects/[slug]/upcoming` that renders the "what's coming in the next build" view by fetching from the admin endpoint shipped in Plan 36-06. Portal must (1) bump pin to `@triarchsecurity/triarch-shared@^0.5.0`, (2) update existing `dispatchPromotion` to include `intent: 'dispatch_promotion'` (required after discriminated-union refactor), (3) ship a new `fetchUpcomingFromAdmin` helper that signs `intent: 'read_upcoming'` HMAC bodies and POSTs to admin, (4) build the page with membership gating (404 per PORTAL-03), and (5) add the Upcoming tab to the existing customer sub-nav.

Purpose: INCL-08 — customers see "what's coming next" with transparency. Read-only (v2.4 hard constraint — no mutation). Closes Phase 36's customer-visible surface.
Output: Portal pinned to 0.5.0, dispatchPromotion still works, new page renders membership-gated upcoming view, no staff-only field leaks, sub-nav updated.
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
@.planning/phases/36-inclusion-approval-state-machine/36-06-admin-upcoming-api-PLAN.md

# Source-of-truth references (portal codebase — admin's working dir is admin/, portal lives at ../portal/)
@../portal/src/lib/internal-dispatch.ts
@../portal/src/app/projects/[slug]/releases/page.tsx
@../portal/src/app/projects/[slug]/layout.tsx
@../portal/package.json

<interfaces>
<!-- Portal's current dispatchPromotion. From ../portal/src/lib/internal-dispatch.ts:34-87. -->

```typescript
export type DispatchPromotionInput = Omit<InternalHmacBody, 'timestamp' | 'nonce'>;
// After 0.5.0 refactor, becomes: Omit<DispatchPromotionBody, 'timestamp' | 'nonce' | 'intent'>
// because dispatchPromotion now sets intent internally.
```

Existing membership-gate pattern from ../portal/src/app/projects/[slug]/releases/page.tsx:20-50:
```typescript
const session = await getPortalSession();
if (!session?.user?.email) redirect('/login');
const ctx = await getCurrentUserContext({ user: { email: session.user.email } });
const { slug } = await params;
const [project] = await db.select({...}).from(projects).where(eq(projects.key, slug));
if (!project) notFound();
const membership = ctx?.memberships.find((m) => m.project_key === project.key);
const isMember = !!ctx && (ctx.isStaff || !!membership);
if (!isMember) notFound();
```

Admin endpoint contract (from Plan 36-06):
- POST to `{ADMIN_PORTAL_API_URL}/api/portal/projects/{slug}/upcoming` (separate env var from ADMIN_INTERNAL_DISPATCH_URL — different endpoint)
- Body: signed `{intent: 'read_upcoming', projectKey: slug, actorEmail, timestamp, nonce}`
- Headers: `X-HMAC-Signature: {signature}`
- Response: `{items: Array<{id, type: 'bug'|'feature', title, severity: string|null, inclusionState: 'approved_for_build'|'built', updatedAt: Date}>}`

State pill mapping (CONTEXT D-Portal):
- approved_for_build → "Approved" violet pill
- built → "Built" teal pill
- (deployed is NOT shown here — that's the /releases page surface)
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Bump portal pin to 0.5.0 + adjust existing dispatchPromotion caller for discriminated union</name>
  <files>../portal/package.json, ../portal/package-lock.json, ../portal/src/lib/internal-dispatch.ts</files>
  <read_first>
    - ../portal/package.json (current pin: @triarchsecurity/triarch-shared ^0.3.1 — bump to ^0.5.0; current portal version 0.7.2)
    - ../portal/src/lib/internal-dispatch.ts (entire 87-line file — current DispatchPromotionInput type + dispatchPromotion signature)
    - ../portal/src/lib/release-mutations.ts (search for dispatchPromotion call sites)
    - .planning/phases/36-inclusion-approval-state-machine/36-06-admin-upcoming-api-PLAN.md (the DispatchPromotionBody / ReadUpcomingBody type definitions)
  </read_first>
  <behavior>
    - Portal package.json shows @triarchsecurity/triarch-shared ^0.5.0; portal version 0.8.0
    - Portal package-lock.json resolves @triarchsecurity/triarch-shared to 0.5.0
    - Portal tsc compiles cleanly (no narrowing errors)
    - Portal vitest run still passes ALL existing tests (no Phase 22-04 / 23-04 regressions)
    - dispatchPromotion call sites work unchanged (intent injected internally by dispatchPromotion)
  </behavior>
  <action>
    1. In `/Users/mikegeehan/claude/triarch/development/portal/`, edit `package.json`:
       - Change `"@triarchsecurity/triarch-shared": "^0.3.1"` → `"@triarchsecurity/triarch-shared": "^0.5.0"`
       - Bump portal version `"version": "0.7.2"` → `"version": "0.8.0"` (minor — new customer-visible page)

    2. Run npm install in portal directory:
       ```bash
       cd /Users/mikegeehan/claude/triarch/development/portal
       npm install
       grep -A 2 "triarchsecurity/triarch-shared" package-lock.json | head -10
       # Verify shows 0.5.0
       ```

    3. EDIT `../portal/src/lib/internal-dispatch.ts`:

       a. Update imports:
       ```typescript
       import {
         signRequest,
         type DispatchPromotionBody,
       } from '@triarchsecurity/triarch-shared/internal-hmac';
       ```
       (Remove the now-stale `type InternalHmacBody` import; if anything else uses it elsewhere in portal, update those imports too — grep first.)

       b. Update `DispatchPromotionInput` type:
       ```typescript
       export type DispatchPromotionInput = Omit<DispatchPromotionBody, 'timestamp' | 'nonce' | 'intent'>;
       ```

       c. Inside `dispatchPromotion`, update the signRequest call (around line 57):
       ```typescript
       const { body, signature } = signRequest(
         { ...input, intent: 'dispatch_promotion' as const },
         secret,
       );
       ```

    4. SEARCH for any other consumers of `InternalHmacBody`:
       ```bash
       grep -rn "InternalHmacBody" /Users/mikegeehan/claude/triarch/development/portal/src/ 2>/dev/null
       ```
       If found, update them to use the discriminated union (likely just import a specific variant).

    5. Verify portal compiles and tests pass:
       ```bash
       cd /Users/mikegeehan/claude/triarch/development/portal
       npx tsc --noEmit
       npx vitest run
       ```
  </action>
  <verify>
    <automated>cd /Users/mikegeehan/claude/triarch/development/portal &amp;&amp; jq -r '.dependencies["@triarchsecurity/triarch-shared"]' package.json &amp;&amp; npx tsc --noEmit 2>&amp;1 | tail -5 &amp;&amp; npx vitest run 2>&amp;1 | tail -10</automated>
  </verify>
  <acceptance_criteria>
    - `jq -r '.dependencies["@triarchsecurity/triarch-shared"]' /Users/mikegeehan/claude/triarch/development/portal/package.json` returns `^0.5.0`
    - `jq -r .version /Users/mikegeehan/claude/triarch/development/portal/package.json` returns `0.8.0`
    - `grep -c "triarchsecurity/triarch-shared.*0\\.5" /Users/mikegeehan/claude/triarch/development/portal/package-lock.json` returns >= 1
    - `grep -c "intent: 'dispatch_promotion'" /Users/mikegeehan/claude/triarch/development/portal/src/lib/internal-dispatch.ts` returns 1
    - `grep -c "DispatchPromotionBody" /Users/mikegeehan/claude/triarch/development/portal/src/lib/internal-dispatch.ts` returns >= 1
    - Portal tsc and vitest run with 0 errors / 0 failures
  </acceptance_criteria>
  <done>Portal pinned to 0.5.0; existing dispatchPromotion shim auto-injects intent; no test regressions.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Create portal-side fetchUpcomingFromAdmin helper that signs read_upcoming HMAC and POSTs to admin</name>
  <files>../portal/src/lib/admin-fetch-upcoming.ts, ../portal/src/lib/admin-fetch-upcoming.test.ts</files>
  <read_first>
    - ../portal/src/lib/internal-dispatch.ts (THE pattern to mirror — signRequest + canonicalize + fetch with X-HMAC-Signature; error model)
    - .planning/phases/36-inclusion-approval-state-machine/36-06-admin-upcoming-api-PLAN.md (admin endpoint contract — POST, body shape, response shape)
    - .planning/phases/36-inclusion-approval-state-machine/36-RESEARCH.md (Pattern 4 portal page + admin endpoint; signRequest canonical byte-for-byte matching is CRITICAL)
  </read_first>
  <behavior>
    - Test 1 (happy path): fetchUpcomingFromAdmin('tmi', 'mike@triarch.dev') returns parsed items[] array with the expected fields
    - Test 2 (network failure): admin returns 502 → helper returns {items: []} (graceful — page should still render with empty state, not crash)
    - Test 3 (HMAC reject): admin returns 401 → helper returns {items: []} + console.warn (no_secret/bad_signature shouldn't happen in practice, but graceful degradation)
    - Test 4 (missing env var): ADMIN_PORTAL_API_URL not set → returns {items: []} + console.error
    - Test 5 (canonical byte-stability): rawBody is `JSON.stringify(body, Object.keys(body).sort())` — exact same canonicalization as signRequest internal
    - Test 6 (type-safety): helper has return type `Promise<{items: UpcomingItem[]}>` where UpcomingItem = `{id: string; type: 'bug'|'feature'; title: string; severity: string|null; inclusionState: 'approved_for_build'|'built'; updatedAt: Date}`
  </behavior>
  <action>
    1. WRITE TESTS FIRST. Create `../portal/src/lib/admin-fetch-upcoming.test.ts`. Use the Vitest pattern from `../portal/src/lib/release-mutations.test.ts` (or wherever portal mocks fetch). Mock `global.fetch`. Mock `@triarchsecurity/secrets.getSecret`. Tests 1-6 above.

    2. CREATE `../portal/src/lib/admin-fetch-upcoming.ts`:
    ```typescript
    /**
     * INCL-08 portal-side helper. Signs a read_upcoming HMAC body, POSTs to admin's
     * /api/portal/projects/{slug}/upcoming endpoint, returns the customer-safe items[].
     *
     * Mirrors the canonicalization / error-model of dispatchPromotion (Plan 22-04).
     */
    import {
      signRequest,
    } from '@triarchsecurity/triarch-shared/internal-hmac';
    import { getSecret } from '@triarchsecurity/secrets';

    export interface UpcomingItem {
      id: string;
      type: 'bug' | 'feature';
      title: string;
      severity: string | null;          // 'critical'|'high'|'medium'|'low' for bugs, null for features
      inclusionState: 'approved_for_build' | 'built';
      updatedAt: string;                // ISO timestamp (JSON serialized from admin Date)
    }

    export async function fetchUpcomingFromAdmin(
      projectKey: string,
      actorEmail: string,
    ): Promise<{ items: UpcomingItem[] }> {
      const baseUrl = process.env.ADMIN_PORTAL_API_URL;
      if (!baseUrl) {
        console.error('[admin-fetch-upcoming] ADMIN_PORTAL_API_URL not set');
        return { items: [] };
      }

      let secret: string;
      try {
        secret = await getSecret('INTERNAL_HMAC_SECRET');
      } catch {
        console.error('[admin-fetch-upcoming] INTERNAL_HMAC_SECRET unavailable');
        return { items: [] };
      }

      const { body, signature } = signRequest(
        { intent: 'read_upcoming' as const, projectKey, actorEmail },
        secret,
      );
      // CRITICAL: canonical form must match signRequest's internal canonicalize()
      // (see Phase 22-04 dispatchPromotion pattern at portal/src/lib/internal-dispatch.ts:60-62)
      const rawBody = JSON.stringify(body, Object.keys(body).sort());

      try {
        const url = `${baseUrl}/api/portal/projects/${encodeURIComponent(projectKey)}/upcoming`;
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-HMAC-Signature': signature,
          },
          body: rawBody,
          // No cache — inclusion state changes frequently during a build cycle
          cache: 'no-store',
        });

        if (!res.ok) {
          const text = await res.text().catch(() => '');
          const safeDetail = text.length > 200 ? text.slice(0, 197) + '...' : text;
          console.warn(`[admin-fetch-upcoming] admin returned ${res.status}: ${safeDetail}`);
          return { items: [] };
        }

        const data = (await res.json()) as { items?: UpcomingItem[] };
        return { items: data.items ?? [] };
      } catch (err) {
        console.warn(`[admin-fetch-upcoming] fetch failed: ${String(err)}`);
        return { items: [] };
      }
    }
    ```

    3. ADD `ADMIN_PORTAL_API_URL` env var binding to portal:
       - `apphosting.yaml` and `apphosting.dev.yaml`: add `ADMIN_PORTAL_API_URL` as plain value (RUNTIME-only). For prod: `https://admin.triarch.dev`. For dev: `https://admin-dev.triarch.dev` (or whatever the dev backend resolves to — check CL-1 hostname state).
       - This is a NEW env var (not `ADMIN_INTERNAL_DISPATCH_URL`, which targets a different endpoint). Plan ahead so the human Task 4 step also binds this.

    4. Run portal tests:
       ```bash
       cd /Users/mikegeehan/claude/triarch/development/portal
       npx vitest run src/lib/admin-fetch-upcoming.test.ts
       ```
  </action>
  <verify>
    <automated>cd /Users/mikegeehan/claude/triarch/development/portal &amp;&amp; npx vitest run src/lib/admin-fetch-upcoming.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - File `/Users/mikegeehan/claude/triarch/development/portal/src/lib/admin-fetch-upcoming.ts` exists
    - `grep -c "intent: 'read_upcoming'" /Users/mikegeehan/claude/triarch/development/portal/src/lib/admin-fetch-upcoming.ts` returns 1
    - `grep -c "ADMIN_PORTAL_API_URL" /Users/mikegeehan/claude/triarch/development/portal/src/lib/admin-fetch-upcoming.ts` returns >= 1
    - `grep -c "X-HMAC-Signature" /Users/mikegeehan/claude/triarch/development/portal/src/lib/admin-fetch-upcoming.ts` returns 1
    - `grep -c "Object.keys(body).sort()" /Users/mikegeehan/claude/triarch/development/portal/src/lib/admin-fetch-upcoming.ts` returns 1 (canonical-byte stability — matches Phase 22-04 pattern)
    - `grep -c "items: \[\]" /Users/mikegeehan/claude/triarch/development/portal/src/lib/admin-fetch-upcoming.ts` returns >= 3 (graceful fallback for env/secret/fetch failure)
    - All 6 tests pass
  </acceptance_criteria>
  <done>Portal has the signing+fetching helper; degrades gracefully on any failure mode; tests cover happy path + 4 failure modes + type-safety.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Build portal /projects/[slug]/upcoming page + UpcomingClient + sub-nav extension</name>
  <files>../portal/src/app/projects/[slug]/upcoming/page.tsx, ../portal/src/app/projects/[slug]/upcoming/UpcomingClient.tsx, ../portal/src/app/projects/[slug]/upcoming/UpcomingClient.test.tsx, ../portal/src/app/projects/[slug]/layout.tsx</files>
  <read_first>
    - ../portal/src/app/projects/[slug]/releases/page.tsx (auth + membership gate pattern; THE template)
    - ../portal/src/app/projects/[slug]/layout.tsx (current sub-nav structure — Phase 23.1-01 added tabs)
    - ../portal/src/app/projects/[slug]/bugs/page.tsx (customer-facing read pattern from Phase 23-02)
    - ../portal/src/lib/admin-fetch-upcoming.ts (the helper created in Task 2)
    - .planning/phases/36-inclusion-approval-state-machine/36-CONTEXT.md (D-Portal customer-visible fields — locked)
    - STATE.md Phase 23.1-01 entries (sub-nav active styling: text-teal-300 + border-b-2 border-teal-400)
  </read_first>
  <behavior>
    - Test 1 (UpcomingClient renders): 2 bugs + 1 feature → table with 3 rows; each shows type-pill, title, state-pill
    - Test 2 (state pills): approved_for_build → 'Approved' violet pill; built → 'Built' teal pill
    - Test 3 (severity column): bug rows show severity badge, feature rows show empty severity cell
    - Test 4 (relative timestamp): updatedAt rendered as 'N min ago' / 'N hr ago' (reuse helper from /releases if available)
    - Test 5 (empty state): zero items → 'No items currently approved for the next build for {projectName}.'
    - Test 6 (server-component page): non-member → notFound() (404); member → renders client with items
    - Test 7 (staff-only leak guard): mock admin response with extra `triarchNotes` field on items → renderToStaticMarkup output does NOT contain 'triarchNotes' or any test sentinel value
    - Test 8 (sub-nav Upcoming tab): pathname /projects/tmi/upcoming → Upcoming link has active styling; pathname /projects/tmi/releases → not active
  </behavior>
  <action>
    1. WRITE TESTS FIRST for UpcomingClient — `../portal/src/app/projects/[slug]/upcoming/UpcomingClient.test.tsx`. Use @testing-library/react + the existing pattern from portal/src/app/projects/[slug]/releases/ReleasesClient.test.tsx. Tests 1-5 + 7 above. Also write a small layout test for Test 8 if you can isolate the nav rendering.

    2. CREATE `../portal/src/app/projects/[slug]/upcoming/page.tsx` (server component):
    ```typescript
    import { notFound, redirect } from 'next/navigation';
    import { getCurrentUserContext } from '@triarchsecurity/triarch-shared/auth';
    import { db } from '@/lib/db';
    import { projects } from '@triarchsecurity/triarch-shared/schema';
    import { eq } from 'drizzle-orm';
    import { getPortalSession } from '@/lib/session';
    import { fetchUpcomingFromAdmin } from '@/lib/admin-fetch-upcoming';
    import UpcomingClient from './UpcomingClient';

    export default async function UpcomingPage({ params }: { params: Promise<{ slug: string }> }) {
      // Auth (same pattern as /releases/page.tsx)
      const session = await getPortalSession();
      if (!session?.user?.email) redirect('/login');
      const ctx = await getCurrentUserContext({ user: { email: session.user.email } });

      const { slug } = await params;

      // Project lookup
      const [project] = await db
        .select({ key: projects.key, name: projects.name })
        .from(projects)
        .where(eq(projects.key, slug));
      if (!project) notFound();

      // PORTAL-03 membership check — 404 not 403
      const membership = ctx?.memberships.find((m) => m.project_key === project.key);
      const isMember = !!ctx && (ctx.isStaff || !!membership);
      if (!isMember) notFound();

      // Fetch via admin HMAC endpoint (Plan 36-06)
      const { items } = await fetchUpcomingFromAdmin(slug, session.user.email);

      return <UpcomingClient projectName={project.name} projectSlug={slug} items={items} />;
    }
    ```

    3. CREATE `../portal/src/app/projects/[slug]/upcoming/UpcomingClient.tsx`:
    ```typescript
    'use client';

    import type { UpcomingItem } from '@/lib/admin-fetch-upcoming';

    interface Props {
      projectName: string;
      projectSlug: string;
      items: UpcomingItem[];
    }

    // State pill palette — locked by CONTEXT D-Portal (parallels admin INCLUSION_COLORS)
    const STATE_PILL: Record<string, { label: string; className: string }> = {
      approved_for_build: { label: 'Approved', className: 'bg-violet-500/20 text-violet-300' },
      built:              { label: 'Built',    className: 'bg-teal-500/20 text-teal-300' },
    };

    const TYPE_PILL: Record<string, string> = {
      bug:     'bg-red-500/20 text-red-400',
      feature: 'bg-amber-500/20 text-amber-400',
    };

    function relativeTime(iso: string): string {
      const then = new Date(iso).getTime();
      const now = Date.now();
      const diffMs = now - then;
      const diffMin = Math.floor(diffMs / 60000);
      if (diffMin < 1) return 'just now';
      if (diffMin < 60) return `${diffMin} min ago`;
      const diffHr = Math.floor(diffMin / 60);
      if (diffHr < 24) return `${diffHr} hr ago`;
      const diffDays = Math.floor(diffHr / 24);
      return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
    }

    export default function UpcomingClient({ projectName, projectSlug: _slug, items }: Props) {
      if (items.length === 0) {
        return (
          <div className="p-8 max-w-4xl">
            <h1 className="text-2xl font-bold text-white mb-4">Upcoming in {projectName}</h1>
            <div className="p-12 text-center rounded-lg bg-zinc-900 border border-zinc-800">
              <p className="text-zinc-500">No items currently approved for the next build for {projectName}.</p>
            </div>
          </div>
        );
      }

      return (
        <div className="p-8 max-w-4xl">
          <h1 className="text-2xl font-bold text-white mb-2">Upcoming in {projectName}</h1>
          <p className="text-sm text-zinc-400 mb-6">{items.length} item{items.length === 1 ? '' : 's'} approved for the next build.</p>
          <div className="space-y-2">
            {items.map((item) => {
              const pill = STATE_PILL[item.inclusionState] ?? { label: item.inclusionState, className: 'bg-zinc-700 text-zinc-300' };
              return (
                <div key={item.id} className="p-4 rounded-lg bg-zinc-900 border border-zinc-800 flex items-baseline gap-3">
                  <span className={`text-xs px-2 py-1 rounded-md uppercase ${TYPE_PILL[item.type]}`}>{item.type}</span>
                  <span className="flex-1 text-zinc-100">{item.title}</span>
                  {item.severity && (
                    <span className="text-xs text-zinc-400 uppercase">{item.severity}</span>
                  )}
                  <span className={`text-xs px-2 py-1 rounded-md ${pill.className}`}>{pill.label}</span>
                  <span className="text-xs text-zinc-500 whitespace-nowrap">{relativeTime(item.updatedAt)}</span>
                </div>
              );
            })}
          </div>
        </div>
      );
    }
    ```

    4. EDIT `../portal/src/app/projects/[slug]/layout.tsx` to add the "Upcoming" sub-nav tab. Look at the existing tabs (Releases, Bugs, Features from Phase 23.1-01) and add a parallel entry:
       - Add `{ href: \`/projects/${slug}/upcoming\`, label: 'Upcoming' }` to the tabs array
       - The existing usePathname startsWith check handles activeness automatically (Phase 23.1-01 pattern)

    5. Run tests + build:
       ```bash
       cd /Users/mikegeehan/claude/triarch/development/portal
       npx vitest run src/app/projects/[slug]/upcoming/
       npx next build
       ```
  </action>
  <verify>
    <automated>cd /Users/mikegeehan/claude/triarch/development/portal &amp;&amp; npx vitest run "src/app/projects/[slug]/upcoming/" 2>&amp;1 | tail -10 &amp;&amp; npx next build 2>&amp;1 | tail -10</automated>
  </verify>
  <acceptance_criteria>
    - File `/Users/mikegeehan/claude/triarch/development/portal/src/app/projects/[slug]/upcoming/page.tsx` exists
    - File `/Users/mikegeehan/claude/triarch/development/portal/src/app/projects/[slug]/upcoming/UpcomingClient.tsx` exists
    - `grep -c "notFound()" /Users/mikegeehan/claude/triarch/development/portal/src/app/projects/[slug]/upcoming/page.tsx` returns >= 2 (project + membership both 404)
    - `grep -c "fetchUpcomingFromAdmin" /Users/mikegeehan/claude/triarch/development/portal/src/app/projects/[slug]/upcoming/page.tsx` returns >= 1
    - `grep -c "Approved" /Users/mikegeehan/claude/triarch/development/portal/src/app/projects/[slug]/upcoming/UpcomingClient.tsx` returns >= 1
    - `grep -c "Built" /Users/mikegeehan/claude/triarch/development/portal/src/app/projects/[slug]/upcoming/UpcomingClient.tsx` returns >= 1
    - `grep -c "violet-500/20" /Users/mikegeehan/claude/triarch/development/portal/src/app/projects/[slug]/upcoming/UpcomingClient.tsx` returns 1 (locked palette)
    - `grep -c "teal-500/20" /Users/mikegeehan/claude/triarch/development/portal/src/app/projects/[slug]/upcoming/UpcomingClient.tsx` returns 1
    - `grep -c "triarchNotes" /Users/mikegeehan/claude/triarch/development/portal/src/app/projects/[slug]/upcoming/UpcomingClient.tsx` returns 0 (Pitfall 7 — never reference staff fields)
    - `grep -c "buildPlan" /Users/mikegeehan/claude/triarch/development/portal/src/app/projects/[slug]/upcoming/UpcomingClient.tsx` returns 0
    - `grep -c "Upcoming" /Users/mikegeehan/claude/triarch/development/portal/src/app/projects/[slug]/layout.tsx` returns >= 1
    - All UpcomingClient tests pass
    - `npx next build` exits 0
  </acceptance_criteria>
  <done>Portal /upcoming page renders membership-gated customer view; sub-nav extended; no staff-only field leak; tests cover render, pills, empty state, and Pitfall 7 grep assertion.</done>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 4: Portal commit + PR + apphosting env binding + visual UAT against TMI</name>
  <what-built>
    - Portal pinned to @triarchsecurity/triarch-shared@^0.5.0
    - dispatchPromotion shim updated for discriminated union
    - New fetchUpcomingFromAdmin helper
    - New /projects/[slug]/upcoming page + UpcomingClient
    - Sub-nav extended with Upcoming tab
    - All portal tests pass
  </what-built>
  <how-to-verify>
    1. **Commit and push portal changes**:
       ```bash
       cd /Users/mikegeehan/claude/triarch/development/portal
       git checkout -b feat/inclusion-upcoming-page
       git add package.json package-lock.json src/lib/internal-dispatch.ts src/lib/admin-fetch-upcoming.ts src/lib/admin-fetch-upcoming.test.ts "src/app/projects/[slug]/upcoming/page.tsx" "src/app/projects/[slug]/upcoming/UpcomingClient.tsx" "src/app/projects/[slug]/upcoming/UpcomingClient.test.tsx" "src/app/projects/[slug]/layout.tsx"
       git commit -m "v0.8.0: feat(36-07): customer /upcoming page (INCL-08)

       - Pin @triarchsecurity/triarch-shared ^0.3.1 → ^0.5.0
       - Update dispatchPromotion to set intent: 'dispatch_promotion' (discriminated union)
       - New fetchUpcomingFromAdmin helper (signs intent: 'read_upcoming' HMAC, POSTs to admin)
       - New /projects/[slug]/upcoming page — membership-gated (PORTAL-03 404), customer-safe field set
       - Sub-nav: Upcoming tab added
       "
       git push origin feat/inclusion-upcoming-page
       ```

    2. **Bind the new env var** `ADMIN_PORTAL_API_URL`:
       - Edit `apphosting.yaml` (prod): add `- variable: ADMIN_PORTAL_API_URL\n  value: "https://admin.triarch.dev"\n  availability:\n    - RUNTIME`
       - Edit `apphosting.dev.yaml` (dev): add same with `value: "https://admin-dev.triarch.dev"` (assuming CL-1 hostname is live; otherwise reuse current admin dev URL)
       - Commit + push:
       ```bash
       git add apphosting.yaml apphosting.dev.yaml
       git commit -m "v0.8.0: bind ADMIN_PORTAL_API_URL for INCL-08 /upcoming fetcher"
       git push origin feat/inclusion-upcoming-page
       ```

    3. **Open PR against portal's dev branch** (per workspace per-push checklist):
       ```bash
       gh pr create --base dev --head feat/inclusion-upcoming-page --title "v0.8.0: customer /upcoming page (Phase 36-07 INCL-08)" --body "Phase 36 final Wave (Wave 4). Depends on admin shared@0.5.0 publish from Plan 36-06."
       ```

    4. **CI verification**:
       - quality-gate, type-check, build all pass on the PR
       - If anything fails, fix forward (do NOT merge with red CI)

    5. **Merge to dev, watch FAH auto-deploy to portal-dev backend**:
       - Merge the PR
       - Confirm portal-dev backend deploys clean (check Firebase console or `gh run watch`)

    6. **Visual UAT** at https://portal-dev.triarch.dev/projects/tmi/upcoming:
       - Log in as Mike (staff)
       - Confirm: page renders, shows TMI items in approved_for_build + built states (whatever was set up during 36-05 dogfood)
       - Confirm: type pills (red bug / amber feature) and state pills (violet Approved / teal Built) render correctly
       - Confirm: severity column shows for bugs, blank for features
       - Confirm: relative timestamps render ("just now" / "N min ago")
       - Confirm: sub-nav "Upcoming" tab is active when on this page; click to other tabs to verify it goes inactive
       - **Negative test**: navigate to `/projects/some-other-project/upcoming` where you have no membership → expect 404 (PORTAL-03)
       - **Field-leak test**: open browser devtools → Network → inspect the page HTML → grep for any TMI bug's known staff-only field value (like `triarchNotes`) → should NOT appear in the page source

    7. **Promote dev → main** once UAT passes:
       ```bash
       # PR dev → main per workspace promotion path
       gh pr create --base main --head dev --title "Promote v0.8.0 to production"
       ```

    Expected outcomes (all true):
    - portal-dev backend renders /projects/tmi/upcoming correctly
    - No staff-only field leak (devtools grep confirms)
    - Non-members get 404
    - Sub-nav active styling works
    - CI green throughout
  </how-to-verify>
  <resume-signal>Type "approved" once visual UAT passes against portal-dev + all CI checks green on both PRs. If anything fails (HMAC reject from admin, missing ADMIN_PORTAL_API_URL binding, field leak, sub-nav broken), describe with logs/screenshots and stop.</resume-signal>
  <files>none — human-only orchestration of CLI/git/npm/firebase commands</files>
  <action>See &lt;how-to-verify&gt; block below for the full step-by-step sequence the human runs in their shell. This task gates downstream plans because publish/install/db:push are human-orchestrated.</action>
  <verify>
    <automated>MISSING — verification is human-only per &lt;how-to-verify&gt; block</automated>
  </verify>
  <done>Human types "approved" per &lt;resume-signal&gt; after every step in &lt;how-to-verify&gt; passes.</done>

</task>

</tasks>

<verification>
- Portal pinned to ^0.5.0 (verifiable: jq on portal/package.json)
- dispatchPromotion still works after discriminated-union refactor (verifiable: existing portal vitest passes)
- fetchUpcomingFromAdmin helper exists with HMAC sign + canonical bytes + graceful failure modes (verifiable: grep + tests)
- /projects/[slug]/upcoming page exists with notFound() membership gate (verifiable: grep)
- UpcomingClient renders correct pills (verifiable: grep for "Approved" + "Built" + violet/teal colors)
- No staff-only field references in UpcomingClient (verifiable: grep returns 0 for triarchNotes/buildPlan)
- Sub-nav extended (verifiable: grep "Upcoming" in layout.tsx)
- portal-dev visual UAT confirms end-to-end render + no field leak (human checkpoint)
</verification>

<success_criteria>
- TMI customer (or Mike preview-as-customer per Phase 23.1-04) sees the /upcoming page rendering exactly what staff approved in admin /next-build-plan/tmi
- Phase 36 fully closes: schema (01) → admin transitions (02) → commit-parser auto-flip (03) → prod-ingest auto-flip (04) → admin UI (05) → admin HMAC endpoint (06) → portal page (07)
- Customer sees inclusion-state transparency: "approved" → "built" → (vanishes from /upcoming; appears on /releases as deployed)
- 30-day-dogfooding window can begin: Mike uses /admin/modules/next-build-plan/tmi to approve, customers see /projects/tmi/upcoming, commit auto-flips work, prod-ingest auto-flips work
- TMI dogfooding feedback informs the v3.0 hard-gate decision per CONTEXT
</success_criteria>

<output>
After completion, create `.planning/phases/36-inclusion-approval-state-machine/36-07-portal-upcoming-page-SUMMARY.md` documenting:
- Portal version shipped (0.8.0)
- ADMIN_PORTAL_API_URL bound values for prod + dev
- TMI visual UAT result (any surprises in the customer-facing pill copy or layout?)
- Whether the sub-nav active styling matched the established v2.2 Phase 23.1-01 pattern
- Confirmation that the staff-only field-leak devtools grep returned zero matches
- Both PR URLs (portal feat/inclusion-upcoming-page → dev, and the dev → main promotion PR)
- Phase 36 close: pending 30-day dogfooding signal-collection per CONTEXT — what to watch for, where Mike notes feedback (e.g., do orphan-link warnings clutter logs? Do customers find /upcoming?)
</output>
