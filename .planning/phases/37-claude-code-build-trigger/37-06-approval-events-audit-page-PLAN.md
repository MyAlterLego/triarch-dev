---
phase: 37-claude-code-build-trigger
plan: 06
type: execute
wave: 3
depends_on: [37-01]
files_modified:
  - src/app/admin/platform/approval-audit/page.tsx
  - src/app/admin/platform/approval-audit/ApprovalAuditClient.tsx
  - src/app/admin/platform/approval-audit/ApprovalAuditClient.test.tsx
  - src/app/api/platform/approval-events/route.ts
  - src/app/api/platform/approval-events/route.test.ts
autonomous: true
requirements: [TRIG-06]
must_haves:
  truths:
    - "New page /admin/platform/approval-audit (staff-only) renders the most recent 50 approval_events rows in reverse chronological order"
    - "Page renders a filter chip / select for subject_type so staff can narrow to 'build_trigger' (the only value in v2.4; the chip exists so the page is forward-compatible with v3.0 customer approvals etc.)"
    - "Page renders a project filter (reuses useProjectOptions pattern from access-audit/page.tsx)"
    - "Each row displays: actor_email, decision badge, surface, project, subject_type/subject_id, created_at (locale string), and the first ~60 chars of comment with a hover/expand affordance for the full 200"
    - "GET /api/platform/approval-events endpoint returns {events, total} JSON; supports query params subject_type, project, limit (default 50, max 200)"
    - "Endpoint requires staff auth (requireStaff); non-staff get 401/403 response"
    - "Endpoint orders by created_at DESC (matches approval_events_subject_idx + approval_events_project_idx indexes from 37-01)"
    - "Vitest coverage: >= 5 cases on the route (staff-only, project filter, subject_type filter, limit cap, DESC ordering); >= 5 cases on the client (renders rows, filter chip changes URL, project filter changes URL, empty state copy, comment-truncation)"
    - "Page is reachable via existing admin sidebar navigation (extension of menu_sections OR direct link insertion in AdminSidebar — choose lowest-disruption path; if menu_sections is DB-driven, add a row via the same provisioning admin's prior pattern)"
    - "Pitfall 9 (Next.js 16 async params/searchParams): page.tsx awaits searchParams before destructuring"
  artifacts:
    - path: "src/app/admin/platform/approval-audit/page.tsx"
      provides: "Server component: staff gate + initial fetch + render ApprovalAuditClient"
      contains: "approval-audit"
    - path: "src/app/admin/platform/approval-audit/ApprovalAuditClient.tsx"
      provides: "Client component: filter chips/selects, row list, URL-param state mirroring"
      exports: ["default"]
    - path: "src/app/api/platform/approval-events/route.ts"
      provides: "GET endpoint: staff-gated; reads approval_events with subject_type + project filters + limit; ORDER BY created_at DESC"
      exports: ["GET"]
  key_links:
    - from: "src/app/admin/platform/approval-audit/ApprovalAuditClient.tsx"
      to: "GET /api/platform/approval-events"
      via: "fetch with URLSearchParams for subject_type, project, limit"
      pattern: "/api/platform/approval-events"
    - from: "src/app/api/platform/approval-events/route.ts"
      to: "approvalEvents table"
      via: "drizzle SELECT ... ORDER BY createdAt DESC LIMIT"
      pattern: "approvalEvents"
    - from: "src/app/admin/platform/approval-audit/page.tsx"
      to: "ApprovalAuditClient component"
      via: "JSX render"
      pattern: "<ApprovalAuditClient"
---

<objective>
Ship the TRIG-06 audit surface. CONTEXT.md decision: "Surface approval_events in existing access-audit (or equivalent) page with subject_type='build_trigger' filter." Two reasons to ship as a NEW sibling page rather than extending access-audit: (a) access-audit reads access_logs which is a different IAM-event table; merging them would conflate two unrelated event domains; (b) approval_events is a new entity-agnostic surface designed to grow (v3.0 customer approvals, future build phases), so it deserves its own page with its own filter affordances. The new page lives at `/admin/platform/approval-audit` and reads the approval_events table via a new staff-only GET endpoint.

Purpose: Every Generate build click writes an approval_events row (Plan 37-03 enforces this server-side). This page makes those rows visible to staff for audit + trust + debugging. ROADMAP success criterion: "Every trigger writes a row to approval_events with the prompt excerpt for audit; visible in existing Slack audit page" — interpreted faithfully as "visible in an audit page in the same family as slack-audit / access-audit."
Output: New GET API route + Vitest, new server-component page + client component + Vitest, sidebar nav entry. 10+ Vitest cases total.
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/execute-plan.md
@~/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/37-claude-code-build-trigger/37-CONTEXT.md
@.planning/phases/37-claude-code-build-trigger/37-01-shared-schema-additions-PLAN.md

# Source-of-truth references
@src/app/admin/platform/slack-audit/page.tsx
@src/app/admin/platform/slack-audit/SlackAuditClient.tsx
@src/app/admin/modules/access-audit/page.tsx
@src/app/api/platform/access-logs/route.ts
@src/lib/use-projects.ts
@src/components/AdminSidebar.tsx

<interfaces>
<!-- Key types and contracts executors will use. -->

From packages/triarch-shared/src/schema.ts (37-01 output):
```typescript
export const approvalEvents = pgTable('approval_events', {
  id, subjectType, subjectId, decision, surface, actorEmail, comment, metadata, project, createdAt
});
// Indexes (from 37-01):
//   approval_events_subject_idx ON (subject_type, subject_id, created_at DESC)
//   approval_events_project_idx ON (project, created_at DESC)
```

From src/app/admin/platform/slack-audit/page.tsx (golden server-component pattern for an audit page):
- getServerSession → getCurrentUserContext → ctx.isStaff guard → redirect on non-staff
- searchParams: Promise<Record<string, string | string[] | undefined>>
- const params = await searchParams; (Pitfall 9 / Next.js 16)
- SELECT with conditions + ORDER BY desc(createdAt) + LIMIT PAGE_SIZE + 1 for hasMore detection
- Render <SlackAuditClient initialRows={...} hasMore={...} />

From src/app/admin/modules/access-audit/page.tsx (lighter alternative pattern — client-only, fetches via API):
- 'use client' module; useProjectOptions; useEffect to fetch; setLogs/setTotal/setLoading
- We follow THIS pattern (client-only) because the row count is small (10s of approval_events per week initially) and the filter UX is simpler.

From src/lib/use-projects.ts (existing helper — reuse for the project filter):
```typescript
export function useProjectOptions(): ProjectOption[];  // returns [{value:'all', label:'All Projects'}, ...]
```

From src/components/AdminSidebar.tsx (sidebar nav):
- Read this file to determine: does sidebar render from DB-driven `menu_sections` (Phase 4: DB-Driven Navigation) or from a hardcoded list?
- If DB-driven: a new entry requires INSERT into menu_sections (no code change in this plan; defer to a one-shot migration script).
- If hardcoded: add a one-line entry next to the slack-audit entry.

API contract (locked):
- GET /api/platform/approval-events?subject_type=build_trigger&project=tmi&limit=50
- Auth: staff only
- Response: 200 { events: ApprovalEventRow[], total: number }
- Where ApprovalEventRow = pick of the table columns + serialized metadata + ISO-string createdAt
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Implement GET /api/platform/approval-events with staff auth, filters, limit cap, DESC ordering + Vitest coverage</name>
  <files>src/app/api/platform/approval-events/route.ts, src/app/api/platform/approval-events/route.test.ts</files>
  <read_first>
    - src/app/api/platform/access-logs/route.ts (golden pattern: staff guard + filters + JSON response shape)
    - src/app/admin/platform/slack-audit/page.tsx (for the ORDER BY desc(createdAt) pattern and conditions array shape)
    - src/lib/api-auth.ts (requireStaff helper)
    - packages/triarch-shared/src/schema.ts (approvalEvents table — confirm exported)
    - .planning/phases/37-claude-code-build-trigger/37-CONTEXT.md (TRIG-06: subject_type='build_trigger' is the v2.4 filter value; surface='web' for trigger events from the modal)
  </read_first>
  <behavior>
    - GET with no params + staff session → 200 with up to 50 rows ordered by created_at DESC + total count of matching rows
    - GET with ?subject_type=build_trigger → only rows with subject_type='build_trigger' returned
    - GET with ?project=tmi → only rows where project='tmi' returned
    - GET with ?subject_type=X&project=Y → AND of the two filters applied
    - GET with ?limit=10 → returns at most 10 rows
    - GET with ?limit=999 → capped at 200 (no unbounded queries)
    - GET with non-staff session → returns requireStaff's error response (401/403)
    - Response shape: { events: Array<row-shape>, total: number }
    - Row shape: subjectType, subjectId, decision, surface, actorEmail, comment, metadata (parsed jsonb), project, createdAt (ISO string)
  </behavior>
  <action>
    1. Create directory: `mkdir -p src/app/api/platform/approval-events`.

    2. WRITE TEST FIRST (RED). Create `src/app/api/platform/approval-events/route.test.ts` cloning the mock pattern from `src/app/api/platform/bug-reports/route.test.ts` (or `src/app/api/platform/access-logs/route.test.ts` if it exists; otherwise use the bug-reports route test as the model):
    ```typescript
    import { describe, it, expect, vi, beforeEach } from 'vitest';
    import { NextRequest } from 'next/server';

    const requireStaffMock = vi.fn();
    vi.mock('@/lib/api-auth', () => ({ requireStaff: () => requireStaffMock() }));

    const selectMock = vi.fn();
    const countMock = vi.fn();
    // Mock db with a builder that records the final shape — use the same pattern as
    // src/app/api/platform/bug-reports/route.test.ts. Implementation per executor's
    // judgement; the assertions below pin behaviour, not query syntax.
    vi.mock('@/lib/db', () => ({
      db: {
        select: (...args: unknown[]) => ({
          from: () => ({
            where: () => ({
              orderBy: () => ({ limit: (n: number) => selectMock(n) }),
              // For count(*) path: add a parallel mock when needed.
            }),
            orderBy: () => ({ limit: (n: number) => selectMock(n) }),
          }),
        }),
      },
    }));

    import { GET } from './route';

    beforeEach(() => {
      vi.clearAllMocks();
      requireStaffMock.mockResolvedValue({ error: null, session: { user: { email: 'staff@triarch.dev' } } });
      selectMock.mockResolvedValue([]);
    });

    function req(qs: string): NextRequest {
      return new NextRequest(`http://localhost/api/platform/approval-events${qs}`, { method: 'GET' });
    }

    describe('GET /api/platform/approval-events', () => {
      it('200 with default limit when no params', async () => {
        const res = await GET(req(''));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(Array.isArray(body.events)).toBe(true);
        expect(typeof body.total).toBe('number');
        expect(selectMock).toHaveBeenCalledWith(50);
      });
      it('caps limit at 200 when caller requests more', async () => {
        await GET(req('?limit=999'));
        expect(selectMock).toHaveBeenCalledWith(200);
      });
      it('returns requireStaff error response when non-staff', async () => {
        const err = new Response('forbidden', { status: 403 });
        requireStaffMock.mockResolvedValue({ error: err });
        const res = await GET(req(''));
        expect(res.status).toBe(403);
      });
      it('applies subject_type filter to the where clause', async () => {
        // Spy on the .where invocation via a richer mock — see access-logs/route.test.ts model.
        await GET(req('?subject_type=build_trigger'));
        // Assertion: SELECT was reached (so the route did not 4xx); deeper assertion that
        // eq(subjectType, 'build_trigger') was in the conditions belongs in a richer mock setup.
        expect(selectMock).toHaveBeenCalled();
      });
      it('applies project filter to the where clause', async () => {
        await GET(req('?project=tmi'));
        expect(selectMock).toHaveBeenCalled();
      });
    });
    ```
    NOTE: The shape above is the SKELETON — the executor should mirror the working mock structure from `src/app/api/platform/bug-reports/route.test.ts` (which is the established codebase pattern). If a richer mock is needed for the filter-where assertions, follow that file's structure.

    3. Run `npx vitest run src/app/api/platform/approval-events/route.test.ts` — MUST FAIL with "Cannot find module './route'" (RED).

    4. WRITE IMPLEMENTATION. Create `src/app/api/platform/approval-events/route.ts`:
    ```typescript
    import { NextRequest, NextResponse } from 'next/server';
    import { and, desc, eq, sql } from 'drizzle-orm';
    import { requireStaff } from '@/lib/api-auth';
    import { db } from '@/lib/db';
    import { approvalEvents } from '@/db/schema';

    const DEFAULT_LIMIT = 50;
    const MAX_LIMIT = 200;

    export async function GET(req: NextRequest) {
      const { error } = await requireStaff();
      if (error) return error;

      const url = req.nextUrl;
      const subjectType = url.searchParams.get('subject_type');
      const projectKey = url.searchParams.get('project');
      const limitRaw = url.searchParams.get('limit');
      const limit = Math.min(
        Number.isFinite(Number(limitRaw)) && Number(limitRaw) > 0 ? Number(limitRaw) : DEFAULT_LIMIT,
        MAX_LIMIT,
      );

      const conditions = [
        subjectType ? eq(approvalEvents.subjectType, subjectType) : undefined,
        projectKey ? eq(approvalEvents.project, projectKey) : undefined,
      ].filter((c): c is NonNullable<typeof c> => c !== undefined);

      const whereClause = conditions.length ? and(...conditions) : undefined;

      const [rows, totalRows] = await Promise.all([
        db.select().from(approvalEvents).where(whereClause).orderBy(desc(approvalEvents.createdAt)).limit(limit),
        db.select({ count: sql<number>`count(*)::int` }).from(approvalEvents).where(whereClause),
      ]);

      const total = totalRows[0]?.count ?? 0;

      const events = rows.map((r) => ({
        id: r.id,
        subjectType: r.subjectType,
        subjectId: r.subjectId,
        decision: r.decision,
        surface: r.surface,
        actorEmail: r.actorEmail,
        comment: r.comment,
        metadata: r.metadata,
        project: r.project,
        createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
      }));

      return NextResponse.json({ events, total });
    }
    ```

    5. Run `npx vitest run src/app/api/platform/approval-events/route.test.ts` — all 5+ cases MUST PASS (GREEN). Adjust mock structure as needed to match the dual SELECT (rows + count) pattern.

    6. Verify `npx next build` exits 0.
  </action>
  <verify>
    <automated>npx vitest run src/app/api/platform/approval-events/route.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - File `src/app/api/platform/approval-events/route.ts` exists and exports GET
    - File `src/app/api/platform/approval-events/route.test.ts` exists with >= 5 cases
    - `npx vitest run src/app/api/platform/approval-events/route.test.ts` reports 0 failures
    - `grep -c "requireStaff" src/app/api/platform/approval-events/route.ts` returns 1 (staff-gated)
    - `grep -c "desc(approvalEvents.createdAt)" src/app/api/platform/approval-events/route.ts` returns 1 (DESC ordering anchored)
    - `grep -c "MAX_LIMIT" src/app/api/platform/approval-events/route.ts` returns >= 1 (limit cap defined)
    - `npx next build` exits 0
  </acceptance_criteria>
  <done>GET endpoint shipped + tests green; client can fetch with subject_type + project + limit filters.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Build ApprovalAuditClient client component + server-component wrapper page + Vitest coverage</name>
  <files>src/app/admin/platform/approval-audit/page.tsx, src/app/admin/platform/approval-audit/ApprovalAuditClient.tsx, src/app/admin/platform/approval-audit/ApprovalAuditClient.test.tsx</files>
  <read_first>
    - src/app/admin/modules/access-audit/page.tsx (client-component-only pattern with useProjectOptions; clone this shape — approval-audit is the same family)
    - src/app/admin/platform/slack-audit/page.tsx (server-component pattern with auth gate; clone for the wrapper page)
    - src/lib/use-projects.ts (useProjectOptions reuse)
    - .planning/phases/37-claude-code-build-trigger/37-CONTEXT.md (subject_type='build_trigger' default; comment is first 200 chars truncated in row display to ~60 chars with expand)
  </read_first>
  <behavior>
    - Server-component page does the staff auth gate (mirrors slack-audit/page.tsx); on non-staff redirects with ?error=forbidden; renders <ApprovalAuditClient />
    - Client component on mount fetches /api/platform/approval-events?subject_type={current}&project={current}&limit=50; loading state then list render
    - Renders a subject_type selector (default 'build_trigger') and a project selector (default 'all' — uses useProjectOptions)
    - Each row card displays: actor_email (bold), decision badge (colored: 'triggered' = teal, future 'approved' = green, future 'rejected' = red — gradient extensible), surface chip, project chip, subject_type/subject_id (mono small text), created_at (locale string), comment truncated to ~60 chars with "Show more" toggle to reveal full 200
    - URL search params mirror state (?subject_type=build_trigger&project=tmi) so deep-linking + back button work
    - Empty state: when total === 0 shows "No approval events recorded yet" with a small explainer like access-audit's pattern
  </behavior>
  <action>
    1. Create directory: `mkdir -p src/app/admin/platform/approval-audit`.

    2. WRITE TEST FIRST (RED). Create `src/app/admin/platform/approval-audit/ApprovalAuditClient.test.tsx`:
    ```typescript
    import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
    import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
    import ApprovalAuditClient from './ApprovalAuditClient';

    afterEach(cleanup);

    let fetchMock: ReturnType<typeof vi.fn>;
    beforeEach(() => {
      fetchMock = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            events: [
              {
                id: 'e1', subjectType: 'build_trigger', subjectId: 'proj-uuid-1',
                decision: 'triggered', surface: 'web', actorEmail: 'mike@triarch.dev',
                comment: 'A'.repeat(200), metadata: { mode: 'local_claude', item_count: 3 },
                project: 'tmi', createdAt: '2026-05-18T18:00:00.000Z',
              },
            ],
            total: 1,
          }),
          { status: 200 },
        ),
      );
      globalThis.fetch = fetchMock;
    });

    describe('ApprovalAuditClient', () => {
      it('renders rows after fetch resolves', async () => {
        render(<ApprovalAuditClient />);
        await waitFor(() => expect(screen.getByText(/mike@triarch.dev/)).toBeInTheDocument());
        expect(screen.getByText(/build_trigger/)).toBeInTheDocument();
        expect(screen.getByText(/triggered/)).toBeInTheDocument();
        expect(screen.getByText(/tmi/)).toBeInTheDocument();
      });
      it('fetches with subject_type=build_trigger by default', async () => {
        render(<ApprovalAuditClient />);
        await waitFor(() => expect(fetchMock).toHaveBeenCalled());
        const url = (fetchMock.mock.calls[0][0] as string);
        expect(url).toContain('subject_type=build_trigger');
      });
      it('changing project filter re-fetches with new project param', async () => {
        render(<ApprovalAuditClient />);
        await waitFor(() => screen.getByText(/mike@triarch.dev/));
        // Find the project select and change it; useProjectOptions returns at minimum [all]; in tests it
        // may not have populated, so simulate by triggering the visible select element directly.
        const projectSelect = screen.getByLabelText(/Project/i) as HTMLSelectElement;
        fireEvent.change(projectSelect, { target: { value: 'tmi' } });
        await waitFor(() => {
          const lastCallUrl = fetchMock.mock.calls.at(-1)?.[0] as string;
          expect(lastCallUrl).toContain('project=tmi');
        });
      });
      it('empty state renders when total === 0', async () => {
        fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ events: [], total: 0 }), { status: 200 }));
        render(<ApprovalAuditClient />);
        await waitFor(() => expect(screen.getByText(/No approval events recorded yet/i)).toBeInTheDocument());
      });
      it('comment truncates to ~60 chars in the row; Show more toggles to full text', async () => {
        render(<ApprovalAuditClient />);
        await waitFor(() => screen.getByText(/mike@triarch.dev/));
        // truncated display should NOT contain all 200 As initially.
        // (assert by counting A's in the rendered comment cell or by absence of full-string match)
        // Then click Show more and assert full string is present.
        fireEvent.click(screen.getByRole('button', { name: /Show more/i }));
        // After expand, the full 200-char comment is visible somewhere in DOM.
        const allText = document.body.textContent ?? '';
        expect(allText.includes('A'.repeat(200))).toBe(true);
      });
    });
    ```

    3. Run `npx vitest run src/app/admin/platform/approval-audit/ApprovalAuditClient.test.tsx` — MUST FAIL with "Cannot find module './ApprovalAuditClient'" (RED).

    4. WRITE IMPLEMENTATION. Create `src/app/admin/platform/approval-audit/ApprovalAuditClient.tsx`:
    ```typescript
    'use client';

    import React, { useCallback, useEffect, useState } from 'react';
    import { useRouter, useSearchParams } from 'next/navigation';
    import { useProjectOptions } from '@/lib/use-projects';
    import { Shield, User, Clock } from 'lucide-react';

    interface ApprovalEventRow {
      id: string;
      subjectType: string;
      subjectId: string;
      decision: string;
      surface: string;
      actorEmail: string;
      comment: string | null;
      metadata: Record<string, unknown>;
      project: string;
      createdAt: string;
    }

    const SUBJECT_TYPE_OPTIONS = [
      { value: 'build_trigger', label: 'Build Trigger' },
      // future v3.0: { value: 'release_approval', label: 'Release Approval' }
    ];

    const DECISION_COLORS: Record<string, string> = {
      triggered: 'bg-teal-500/10 text-teal-400 border-teal-500/20',
      approved: 'bg-green-500/10 text-green-400 border-green-500/20',
      rejected: 'bg-red-500/10 text-red-400 border-red-500/20',
    };

    const TRUNCATE_LEN = 60;

    export default function ApprovalAuditClient() {
      const router = useRouter();
      const sp = useSearchParams();
      const PROJECTS = useProjectOptions();

      const [subjectType, setSubjectType] = useState<string>(sp?.get('subject_type') ?? 'build_trigger');
      const [projectFilter, setProjectFilter] = useState<string>(sp?.get('project') ?? 'all');
      const [events, setEvents] = useState<ApprovalEventRow[]>([]);
      const [total, setTotal] = useState(0);
      const [loading, setLoading] = useState(true);
      const [expanded, setExpanded] = useState<Set<string>>(new Set());

      const fetchEvents = useCallback(async () => {
        setLoading(true);
        const params = new URLSearchParams({ limit: '50' });
        if (subjectType) params.set('subject_type', subjectType);
        if (projectFilter && projectFilter !== 'all') params.set('project', projectFilter);
        const res = await fetch(`/api/platform/approval-events?${params}`);
        const data = await res.json();
        setEvents(data.events ?? []);
        setTotal(data.total ?? 0);
        setLoading(false);
      }, [subjectType, projectFilter]);

      useEffect(() => { fetchEvents(); }, [fetchEvents]);

      // Mirror state in URL so deep-link + back button work (no scroll on update).
      useEffect(() => {
        const next = new URLSearchParams();
        if (subjectType) next.set('subject_type', subjectType);
        if (projectFilter && projectFilter !== 'all') next.set('project', projectFilter);
        router.replace(`?${next.toString()}`, { scroll: false });
      }, [subjectType, projectFilter, router]);

      function toggle(id: string) {
        setExpanded((prev) => {
          const n = new Set(prev);
          if (n.has(id)) n.delete(id); else n.add(id);
          return n;
        });
      }

      return (
        <div className="p-8 max-w-4xl">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <Shield size={24} className="text-violet-400" />
              <div>
                <h1 className="text-2xl font-bold text-white">Approval Audit</h1>
                <p className="text-sm text-zinc-500 mt-0.5">
                  {total} event{total !== 1 ? 's' : ''} logged
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 mb-6">
            <label className="text-xs text-zinc-500">
              <span className="block mb-1">Type</span>
              <select
                aria-label="Subject Type"
                value={subjectType}
                onChange={(e) => setSubjectType(e.target.value)}
                className="px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-md text-sm text-zinc-200"
              >
                {SUBJECT_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
            <label className="text-xs text-zinc-500">
              <span className="block mb-1">Project</span>
              <select
                aria-label="Project"
                value={projectFilter}
                onChange={(e) => setProjectFilter(e.target.value)}
                className="px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-md text-sm text-zinc-200"
              >
                {PROJECTS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </label>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-20 bg-zinc-800/50 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : events.length === 0 ? (
            <div className="p-12 text-center rounded-lg bg-zinc-900 border border-zinc-800">
              <Shield size={32} className="mx-auto text-zinc-600 mb-3" />
              <p className="text-zinc-500">No approval events recorded yet</p>
              <p className="text-xs text-zinc-600 mt-1">
                Events appear here when staff clicks "Generate build" on the Next Build Plan page.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {events.map((ev) => {
                const date = new Date(ev.createdAt);
                const comment = ev.comment ?? '';
                const isExpanded = expanded.has(ev.id);
                const shownComment = isExpanded || comment.length <= TRUNCATE_LEN
                  ? comment
                  : `${comment.slice(0, TRUNCATE_LEN)}...`;
                return (
                  <div key={ev.id} className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
                    <div className="flex items-start gap-3">
                      <User size={16} className="text-zinc-500 mt-1" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-zinc-200">{ev.actorEmail}</span>
                          <span className={`px-1.5 py-0.5 rounded text-[10px] border ${DECISION_COLORS[ev.decision] ?? 'bg-zinc-800 text-zinc-400 border-zinc-700'}`}>
                            {ev.decision}
                          </span>
                          <span className="text-[10px] text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded">{ev.surface}</span>
                          <span className="text-[10px] text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded">{ev.project}</span>
                          <span className="text-xs text-zinc-500">{ev.subjectType} : {ev.subjectId.slice(0, 8)}</span>
                        </div>
                        {comment && (
                          <div className="text-xs text-zinc-400 mt-2 font-mono whitespace-pre-wrap">
                            {shownComment}
                            {comment.length > TRUNCATE_LEN && (
                              <button
                                type="button"
                                onClick={() => toggle(ev.id)}
                                className="ml-2 text-violet-400 hover:text-violet-300"
                              >
                                {isExpanded ? 'Show less' : 'Show more'}
                              </button>
                            )}
                          </div>
                        )}
                        <div className="flex items-center gap-3 mt-2 text-[10px] text-zinc-600">
                          <span className="flex items-center gap-1">
                            <Clock size={10} />
                            {date.toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      );
    }
    ```

    5. Create `src/app/admin/platform/approval-audit/page.tsx` (server component wrapper — staff auth gate; mirrors slack-audit/page.tsx but lighter because the client component does its own fetching):
    ```typescript
    import { getServerSession } from 'next-auth';
    import { redirect } from 'next/navigation';
    import { authOptions } from '@/lib/auth';
    import { getCurrentUserContext } from '@/lib/auth-context';
    import ApprovalAuditClient from './ApprovalAuditClient';

    export default async function ApprovalAuditPage() {
      const session = await getServerSession(authOptions);
      const ctx = await getCurrentUserContext(session);
      if (!ctx?.isStaff) {
        redirect('/admin?error=forbidden');
      }
      return <ApprovalAuditClient />;
    }
    ```

    6. Run `npx vitest run src/app/admin/platform/approval-audit/ApprovalAuditClient.test.tsx` — all 5 cases MUST PASS (GREEN).

    7. Verify `npx next build` exits 0.

    8. Verify the new page is reachable in the admin sidebar:
       - Read `src/components/AdminSidebar.tsx`.
       - If the sidebar is hardcoded: add a one-line entry next to the existing /admin/platform/slack-audit entry, label "Approval Audit", path /admin/platform/approval-audit, icon Shield (already imported there).
       - If the sidebar is DB-driven (menu_sections): write a small script `scripts/seed-approval-audit-nav.mjs` that INSERTs the row, document its invocation in the SUMMARY (do NOT run it as part of this task — Mike runs it once post-merge against prod DB). Either way the navigation surface is testable manually post-deploy.
       - If neither path is workable in this plan: ship without sidebar entry; document deferral in SUMMARY. The page is still reachable via direct URL.
  </action>
  <verify>
    <automated>npx vitest run src/app/admin/platform/approval-audit/ApprovalAuditClient.test.tsx</automated>
  </verify>
  <acceptance_criteria>
    - File `src/app/admin/platform/approval-audit/page.tsx` exists with staff-gate redirect pattern
    - File `src/app/admin/platform/approval-audit/ApprovalAuditClient.tsx` exists and default-exports the component
    - File `src/app/admin/platform/approval-audit/ApprovalAuditClient.test.tsx` exists with >= 5 cases
    - `npx vitest run src/app/admin/platform/approval-audit/ApprovalAuditClient.test.tsx` reports 0 failures
    - `grep -c "subject_type=build_trigger" src/app/admin/platform/approval-audit/ApprovalAuditClient.tsx` returns >= 1 (default subject_type)
    - `grep -c "useProjectOptions" src/app/admin/platform/approval-audit/ApprovalAuditClient.tsx` returns 1 (reuse existing helper)
    - `grep -c "No approval events recorded yet" src/app/admin/platform/approval-audit/ApprovalAuditClient.tsx` returns 1 (empty-state copy locked)
    - `grep -c "Show more" src/app/admin/platform/approval-audit/ApprovalAuditClient.tsx` returns >= 1 (comment truncation toggle)
    - Sidebar entry exists OR SUMMARY documents deferral with explicit reason
    - `npx next build` exits 0
  </acceptance_criteria>
  <done>Approval audit page reachable at /admin/platform/approval-audit; lists approval_events filtered by subject_type + project; deep-linkable via URL params; Phase 37 ROADMAP success criterion "visible in existing Slack audit page (or equivalent)" satisfied.</done>
</task>

</tasks>

<verification>
- GET /api/platform/approval-events exists and is staff-gated (grep + 5 tests)
- New page renders rows with truncation + expand affordance (5 tests + screenshot in UAT)
- Pitfall 9 (Next.js 16 async params/searchParams) anchored — page.tsx does not consume params directly; client component derives state from useSearchParams which is the recommended pattern (no async-params hazard)
- `npx vitest run` for both new test files exits 0
- `npx next build` exits 0
- Mike can visually inspect TMI's recent Generate Build clicks after Phase 37 close UAT
</verification>

<success_criteria>
- 37-05 modal click writes an approval_events row; staff visits /admin/platform/approval-audit and sees the row within ~1s of clicking Generate Build
- Page supports filtering by subject_type (forward-compatible with v3.0 customer approvals) and by project (today: TMI is the only consumer)
- The "first 200 chars of prompt" stored in approval_events.comment is visible (truncated to ~60 chars by default; full 200 on Show more click) — closes TRIG-06 audit-trail loop
- ROADMAP success criterion: "Every trigger writes a row to approval_events with the prompt excerpt for audit; visible in existing Slack audit page" — satisfied via the new sibling audit page (interpretation justified by CONTEXT.md "or equivalent")
</success_criteria>

<output>
After completion, create `.planning/phases/37-claude-code-build-trigger/37-06-approval-events-audit-page-SUMMARY.md` documenting:
- Final endpoint URL + response shape
- Page URL + filter parameters supported
- Sidebar nav: whether entry was added directly, via seed script, or deferred (explain choice)
- Test counts: route (>= 5) + ApprovalAuditClient (>= 5)
- Sample row screenshot description or saved JSON of one TMI build_trigger event after UAT
- Any drift in approval_events schema relative to 37-01 (should be 0 — if any, surface immediately)
</output>
</content>
</invoke>