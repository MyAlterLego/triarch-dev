---
phase: 01-schema-membership-migration
plan: 02
subsystem: auth
tags: [nextauth, drizzle, membership, auth-context, signIn, fallback, cockroachdb]

# Dependency graph
requires:
  - 01-01  # project_members table defined in schema.ts
provides:
  - "src/lib/auth-context.ts exporting getCurrentUserContext(session) → UserContext | null"
  - "UserContext type: {email, isStaff, memberships[{project_key, role}]}"
  - "src/lib/auth.ts signIn callback uses DB-backed membership check with env-allowlist fallback"
affects:
  - 01-03  # manage-members page will import getCurrentUserContext for page guard
  - 02-*   # customer releases UI uses getCurrentUserContext for project-scoped filtering
  - 03-*   # approval flow uses getCurrentUserContext to verify approver role

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "getCurrentUserContext takes session as parameter (not getServerSession) — callers pass their own session, enabling synthetic sessions in API key auth"
    - "try/catch in DB helper returns null on any error; caller owns fallback policy — clean separation of concerns"
    - "case-insensitive lookup: sql`lower(${projectMembers.email}) = lower(${email})` matches the unique index strategy from Plan 01-01"

key-files:
  created:
    - src/lib/auth-context.ts
  modified:
    - src/lib/auth.ts

key-decisions:
  - "getCurrentUserContext returns null (not fallback context) on DB error — caller decides fallback policy; future callers can have different semantics"
  - "signIn fallback uses email.toLowerCase().endsWith(...) — explicit lowercase to match DB lookup semantics even though Google returns lowercase emails"
  - "env-allowlist fallback is intentional for v1.14 rollout and slated for removal in v1.15 once staff seeding is stable"
  - "No caching of membership lookups in v1 — per-request DB query per CONTEXT.md decision; admin traffic is low"

# Metrics
duration: ~1min
completed: 2026-05-03
---

# Phase 01 Plan 02: Auth-Context Helper + signIn Cutover Summary

**DB-backed membership lookup helper (getCurrentUserContext) replaces hardcoded @triarchsecurity.com allowlist in signIn callback, with try/catch fallback to env-allowlist for safe v1.14 rollout**

## Performance

- **Duration:** ~1 min
- **Completed:** 2026-05-03
- **Tasks:** 2
- **Files modified:** 2 (new auth-context.ts + modified auth.ts)

## Accomplishments

- Created `src/lib/auth-context.ts` with `UserContext` interface and `getCurrentUserContext(session)` function
- DB query selects all `project_members` rows for the session email via case-insensitive `lower(email)` match
- Staff detection: wildcard row `project_key='*'` with `role='staff'` (per CONTEXT.md decision from Plan 01-01)
- Helper never throws: try/catch returns `null` on any DB error; caller decides the fallback policy
- Refactored `src/lib/auth.ts` `signIn` callback: primary path uses DB lookup; falls back to env-allowlist on `null` context
- `jwt` and `session` callbacks left completely unchanged — only `signIn` and the import block changed
- `npx tsc --noEmit` passes clean for the entire repo

## New File: src/lib/auth-context.ts

**Signature:**
```typescript
export interface UserContext {
  email: string;
  isStaff: boolean;
  memberships: Array<{ project_key: string; role: 'admin' | 'viewer' | 'staff' }>;
}

export async function getCurrentUserContext(
  session: { user?: { email?: string | null } | null } | null
): Promise<UserContext | null>
```

**Contract:**
- Returns `null` if the session has no email
- Returns `{ email, isStaff, memberships }` for any authenticated session (memberships may be empty `[]`)
- Returns `null` if the DB query throws — never throws itself
- `isStaff = true` iff a row exists with `project_key='*'` AND `role='staff'`
- Imports: `@/lib/db` (Drizzle client), `@/db/schema` (projectMembers table), `drizzle-orm` (sql template)
- Does NOT call `getServerSession` — session is passed in by the caller

## Modified File: src/lib/auth.ts — signIn Callback

**Before:**
```typescript
async signIn({ user }) {
  const email = user.email ?? '';
  return email === process.env.ADMIN_EMAIL || email.endsWith('@triarchsecurity.com');
},
```

**After:**
```typescript
async signIn({ user }) {
  const email = user.email ?? '';
  if (!email) return false;

  // Primary path: DB-backed membership/staff lookup via getCurrentUserContext.
  const ctx = await getCurrentUserContext({ user: { email } });
  if (ctx !== null) {
    const allowed = ctx.isStaff || ctx.memberships.length > 0;
    if (allowed) return true;
    // Fall through to env-allowlist for unseeded members during v1.14 rollout.
  }

  // Fallback path: env-allowlist. Handles DB errors + unseeded admins.
  // Slated for removal in v1.15 once staff seeding is stable.
  return (
    email === process.env.ADMIN_EMAIL ||
    email.toLowerCase().endsWith('@triarchsecurity.com')
  );
},
```

Key changes:
- Added `import { getCurrentUserContext } from '@/lib/auth-context'` at top of file
- `endsWith('@triarchsecurity.com')` is no longer the primary gate — it survives only in the fallback block
- `email.toLowerCase()` added to fallback for explicit case-insensitive semantics
- `jwt` and `session` callbacks: UNCHANGED

## Plans 03 and 04 Integration Note

Plans 03 and 04 will import `getCurrentUserContext` from `src/lib/auth-context` for:
- **Plan 03 (manage-members page):** Guard the `/admin/platform/projects/{key}/members` page to staff-only via `ctx.isStaff`
- **Plan 04 (customer releases UI):** Filter project list to `ctx.memberships` for non-staff users

The helper is designed to accept any session-shaped object, so it works equally well with:
- `getServerSession(authOptions)` in Server Components and API routes
- Synthetic session objects in API key auth paths (`src/lib/api-key-auth.ts`)

## Env-Allowlist Fallback — Intentional v1.14 Design

The `email === process.env.ADMIN_EMAIL || email.toLowerCase().endsWith('@triarchsecurity.com')` fallback in the `signIn` callback is **intentional** for the v1.14 rollout window:

- While `db:push` hasn't run yet, all DB queries will fail — the fallback keeps existing staff logged in
- After `db:push` + backfill SQL, the wildcard staff row for `mike@triarchsecurity.com` will make the primary path succeed for Mike
- The fallback provides a safety net during the migration window and for any `@triarchsecurity.com` emails not yet seeded
- **Removal target:** v1.15 — once staff seeding is confirmed stable via the manage-members page

## Task Commits

1. **Task 1: Create auth-context.ts helper** - `da33ac9` (feat)
2. **Task 2: Refactor auth.ts signIn callback** - `30083ff` (feat)

## DB-Runtime Acceptance Criteria (human_needed)

The following checks require the running app with `db:push` applied:

| Criterion | Status | How to verify |
|-----------|--------|---------------|
| `mike@triarchsecurity.com` signs in via DB-backed staff check (wildcard row) | **human_needed** | Sign in after Mike applies `db:push` + backfill SQL |
| Per-project viewer email with a `project_members` row signs in successfully | **human_needed** | Add a row via SQL, sign in with that email |
| Stopping DB → `@triarchsecurity.com` email still gets through (fallback works) | **human_needed** | Kill DB connection, attempt sign-in |
| Random `@gmail.com` with no membership row is rejected | **human_needed** | Attempt sign-in with unknown email after DB is up |

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — this plan adds a DB helper and refactors auth. No UI, no data rendering.

## Self-Check: PASSED

- FOUND: src/lib/auth-context.ts
- FOUND: src/lib/auth.ts (modified)
- FOUND commit: da33ac9 (Task 1 — auth-context.ts)
- FOUND commit: 30083ff (Task 2 — auth.ts signIn refactor)
- TSC: clean (npx tsc --noEmit exits 0)
- endsWith('@triarchsecurity.com') appears exactly once in auth.ts (fallback only)
- getCurrentUserContext appears 4 times in auth.ts (import + comment + call + if-gate)
