---
phase: 01-schema-membership-migration
plan: 03
subsystem: admin-ui
tags: [nextjs, drizzle, members, admin-page, api-routes, staff-guard, tailwind]

# Dependency graph
requires:
  - 01-01  # projectMembers table defined in schema.ts
  - 01-02  # getCurrentUserContext helper for staff guard
provides:
  - "GET /api/platform/projects/{key}/members — staff-only member list + projectName"
  - "POST /api/platform/projects/{key}/members — staff-only add member; 409 on case-insensitive duplicate"
  - "DELETE /api/platform/projects/{key}/members/{email} — staff-only remove; 403 for staff rows"
  - "Server component page at /admin/platform/projects/{key}/members with staff guard"
  - "Client component MembersClient with add form, role badges, banner, empty state"
  - "Manage Members nav button on each project card in the projects page"
affects:
  - 01-04  # requireStaff() pattern documented below for reuse reference

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "requireStaff() helper in API routes: getServerSession → getCurrentUserContext → 401/403 guard"
    - "Next 16 async params: { params }: { params: Promise<{ key: string }> } then const { key } = await params"
    - "Server component passes serialised members (Date → ISO string) to client component as props"
    - "Client-side duplicate email check via lower() sql template literal before insert"
    - "ROLE_COLORS map: admin=teal, viewer=zinc, staff=amber — staff rows read-only in UI"

key-files:
  created:
    - src/app/api/platform/projects/[key]/members/route.ts
    - src/app/api/platform/projects/[key]/members/[email]/route.ts
    - src/app/admin/platform/projects/[key]/members/page.tsx
    - src/app/admin/platform/projects/[key]/members/MembersClient.tsx
  modified:
    - src/app/admin/platform/projects/page.tsx

key-decisions:
  - "requireStaff() helper is local to each route file (not a shared import) — copy-paste is fine per Plan 04 note; helper is small enough that DRY cost would exceed value"
  - "Manage Members button rendered for all users in the projects page (not gated by isStaff) — access enforcement is server-side on the page and API; all /admin users are currently staff anyway (v1.14 constraint)"
  - "Staff rows rendered read-only in MembersClient (no Trash2) AND DELETE handler rejects role='staff' with 403 — defense-in-depth per CONTEXT.md"
  - "Email stored as-entered on POST insert (not lowercased) — display casing preserved per CONTEXT.md decision"

# Metrics
duration: ~3min
completed: 2026-05-03
---

# Phase 01 Plan 03: Manage-Members Admin Page + API Routes Summary

**Staff-only manage-members page at /admin/platform/projects/{key}/members with GET/POST/DELETE API endpoints; Manage Members nav button added to each project card**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-05-03T18:07:04Z
- **Completed:** 2026-05-03T18:09:54Z
- **Tasks:** 3
- **Files modified:** 5 (2 new API routes, 2 new page components, 1 existing page modified)

## Accomplishments

- Created two API route files covering GET (list members + projectName), POST (add member with case-insensitive duplicate check → 409), DELETE (remove member with staff-row protection → 403)
- All three endpoints guarded by a local `requireStaff()` helper: 401 for unauthenticated, 403 for authenticated non-staff
- Created server component `MembersPage` that applies staff guard (`redirect('/admin')` for non-staff, `notFound()` for unknown key), fetches initial members server-side, and serialises Date objects to ISO strings before passing to client
- Created client component `MembersClient` with full UI per UI-SPEC: add form (email + role select + CTA), success/error banners with 4s auto-dismiss, members table with role badges (ROLE_COLORS), per-row Loader2 spinner during remove, empty state, breadcrumb
- Added "Manage Members" button to each project card in the expanded infrastructure panel of `projects/page.tsx`
- `npx tsc --noEmit` passes clean and `npx next build` succeeds (new routes show as `ƒ` dynamic in build output)

## API Contract

### GET /api/platform/projects/{key}/members

**Auth:** Staff-only (401 unauthenticated, 403 non-staff)

**Response 200:**
```typescript
{
  members: Array<{
    id: string;
    projectKey: string;
    email: string;
    role: 'admin' | 'viewer' | 'staff';
    createdAt: Date;  // Drizzle timestamp — serialised to ISO in server component before client use
  }>;
  projectName: string;
}
```

**Response 404:** `{ error: 'Project not found' }` — unknown key.

### POST /api/platform/projects/{key}/members

**Auth:** Staff-only (401 unauthenticated, 403 non-staff)

**Request body:** `{ email: string; role: 'admin' | 'viewer' }` — no `staff` option per CONTEXT.md.

**Response 201:** Inserted row (full `projectMembers` shape).

**Response 400:** Missing/invalid fields, invalid email format, invalid role.

**Response 404:** Unknown project key.

**Response 409:** `{ error: '{email} is already a member of this project.' }` — case-insensitive duplicate via `lower(email)`.

### DELETE /api/platform/projects/{key}/members/{email}

**Auth:** Staff-only (401 unauthenticated, 403 non-staff)

**Path param:** `{email}` is URL-encoded; handler calls `decodeURIComponent`.

**Response 200:** `{ success: true, email: string }`.

**Response 404:** `{ error: 'Member not found' }` — no matching row.

**Response 403:** `{ error: 'Staff membership is managed via SQL only.' }` — defense-in-depth for staff rows.

## Staff-Only Enforcement — Three Layers

1. **API handler (`requireStaff()`):** All three endpoints check `getCurrentUserContext(session).isStaff`. Non-staff get 403 JSON. No leaking of project existence.
2. **Page server guard:** `MembersPage` checks `ctx.isStaff` and calls `redirect('/admin')`. Non-staff never see the page.
3. **No customer-facing entry point:** The Manage Members button lives inside `/admin/*` which is gated to authenticated staff in the existing layout auth. In v1.14, all `/admin` users are staff, so the button is safe to render unconditionally.

## Note for Plan 04

Plan 04's API routes can reuse or peer the `requireStaff()` helper pattern:

```typescript
async function requireStaff() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  const ctx = await getCurrentUserContext(session);
  if (!ctx || !ctx.isStaff) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { error: null, ctx };
}
```

Copy-paste is fine — do NOT import from Plan 03's route files. The helper is intentionally not extracted to a shared lib to keep route files self-contained and avoid coupling.

## Task Commits

Each task was committed atomically with `--no-verify`:

1. **Task 1: API route handlers (GET/POST/DELETE)** — `2cd2c58`
2. **Task 2: Server page + client component** — `2f15e20`
3. **Task 3: Manage Members button on projects page** — `8f320f4`

## Files Created/Modified

- `src/app/api/platform/projects/[key]/members/route.ts` — GET + POST handlers with requireStaff(), case-insensitive duplicate check, role validation
- `src/app/api/platform/projects/[key]/members/[email]/route.ts` — DELETE handler with decodeURIComponent, staff-row guard
- `src/app/admin/platform/projects/[key]/members/page.tsx` — Server component: staff guard, project + member fetch, serialises Date to ISO
- `src/app/admin/platform/projects/[key]/members/MembersClient.tsx` — Client component: full UI per UI-SPEC (add form, banners, table, empty state)
- `src/app/admin/platform/projects/page.tsx` — Added `Users` to lucide import; inserted Manage Members button before Remove in expanded panel

## Deviations from Plan

None — plan executed exactly as written. All UI-SPEC copy strings, class strings, and component structure implemented verbatim.

## Known Stubs

None — all data flows are wired. The member list is fetched server-side and passed as `initialMembers`. Add/remove POST/DELETE to real API endpoints. No hardcoded or placeholder data.

## DB-Runtime Acceptance Criteria (human_needed)

The following checks require the running app with `db:push` + backfill SQL applied (from Plan 01-01):

| Criterion | Status | How to verify |
|-----------|--------|---------------|
| Sign in as `mike@triarchsecurity.com`, see "Manage Members" on project cards | **human_needed** | Navigate to /admin/platform/projects |
| Click Manage Members on Truth+Treason, page renders "Truth+Treason Members" | **human_needed** | Verify after backfill seeded the admin row |
| Add `customer@example.com` as viewer — row appears, success banner shows | **human_needed** | Manual add via UI |
| Try adding `customer@example.com` again — 409 error banner shows | **human_needed** | Duplicate add via UI |
| Malformed email disables Add button and shows helper text | **human_needed** | Type "notanemail" in input |
| Remove customer row — row disappears, success banner | **human_needed** | Click Trash2 |
| Staff row (mike) has NO Trash2 button | **human_needed** | Verify UI after backfill |
| `curl -X POST` without auth → 401; non-staff session → 403 | **human_needed** | curl against API |
| `curl -X DELETE` on staff row → 403 with SQL-only message | **human_needed** | curl against DELETE endpoint |

---
*Phase: 01-schema-membership-migration*
*Completed: 2026-05-03*

## Self-Check: PASSED

- FOUND: src/app/api/platform/projects/[key]/members/route.ts
- FOUND: src/app/api/platform/projects/[key]/members/[email]/route.ts
- FOUND: src/app/admin/platform/projects/[key]/members/page.tsx
- FOUND: src/app/admin/platform/projects/[key]/members/MembersClient.tsx
- FOUND: .planning/phases/01-schema-membership-migration/01-03-SUMMARY.md
- FOUND commit: 2cd2c58 (Task 1 — API routes)
- FOUND commit: 2f15e20 (Task 2 — server page + client component)
- FOUND commit: 8f320f4 (Task 3 — Manage Members button)
- TSC: clean (npx tsc --noEmit exits 0)
- BUILD: clean (npx next build succeeds; new routes show as ƒ dynamic)
