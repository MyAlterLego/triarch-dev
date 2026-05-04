---
phase: 01-schema-membership-migration
verified: 2026-05-03T00:00:00Z
status: human_needed
score: 5/7 must-haves verified (2 deferred to human — DB not yet applied)
re_verification: false
human_verification:
  - test: "Apply db:push and run v1.14.0-backfill.sql, then query live DB"
    expected: "releaseLogs rows have env='dev', status='dev', deployed_at backfilled; project_members has one admin row per project plus the wildcard staff row for mike@triarchsecurity.com"
    why_human: "DB migrations have NOT been applied (per CONTEXT.md: db:push runs manually after PR review). Cannot query live DB from verifier."
  - test: "Sign in as a non-@triarchsecurity.com email that has a project_members row"
    expected: "User is allowed to sign in and sees only their scoped projects"
    why_human: "Real OAuth sign-in flow requires browser + live DB. Verifier can confirm the code path exists, but not that it works end-to-end."
  - test: "Sign in as mike@triarchsecurity.com and visit /admin/platform/projects/{key}/members"
    expected: "Page loads with a members table, add-member form, and remove buttons (staff rows show no remove button)"
    why_human: "UI rendering and interactive behavior requires a running app with applied DB schema."
---

# Phase 1: Schema + Membership Migration — Verification Report

**Phase Goal:** Database is ready to express the gating lifecycle (dev/prod env, full status enum, audit-trail tables) and access control moves from a hardcoded email check to a DB-backed role + per-project membership model.

**Verified:** 2026-05-03
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `releaseLogs` has env, status, commit_sha, deployed_at columns declared | VERIFIED | `src/db/schema.ts` lines 146–149: all four columns present with correct types |
| 2 | `project_members` table exists with correct columns and unique(project_key, lower(email)) | VERIFIED | `src/db/schema.ts` lines 156–164: uuid PK, projectKey, email, role, createdAt; uniqueIndex uses `sql\`lower(\${table.email})\`` |
| 3 | `release_feedback` and `release_approvals` tables exist with FK to `releaseLogs.id` | VERIFIED | `src/db/schema.ts` lines 166–183: both tables, both use `.references(() => releaseLogs.id, { onDelete: 'cascade' })` |
| 4 | `auth.ts` no longer hardcodes domain check as the primary gate; DB lookup goes first with env-allowlist fallback | VERIFIED | `src/lib/auth.ts` lines 25–44: `getCurrentUserContext()` called first, env-allowlist is explicit fallback with removal comment for v1.15 |
| 5 | Backfill SQL exists and is idempotent for all three concerns | VERIFIED | `src/db/migrations/v1.14.0-backfill.sql`: all three statements present with NOT EXISTS guards; statement 1 uses OR-combined NULL checks |
| 6 | Live DB rows backfilled (env/status on releaseLogs, project_members rows seeded) | HUMAN NEEDED | db:push has not been applied; schema code is correct but runtime state cannot be verified |
| 7 | `/admin/platform/projects/{key}/members` page works end-to-end in a running app | HUMAN NEEDED | Build compiles the route; code is substantive; live behavior requires a running app with applied schema |

**Score:** 5/7 truths verified automatically; 2 deferred to human (both are runtime-state checks blocked by pre-merge DB policy)

---

### Required Artifacts

| Artifact | Purpose | Status | Details |
|----------|---------|--------|---------|
| `src/db/schema.ts` | Drizzle declarations for all new tables + columns | VERIFIED | projectMembers, releaseFeedback, releaseApprovals, plus env/status/commitSha/deployedAt on releaseLogs — all present, substantive, correct types |
| `src/db/migrations/v1.14.0-backfill.sql` | Idempotent backfill for env/status, per-project admin, staff wildcard | VERIFIED | 3 statements; NOT EXISTS guards on all INSERTs; UPDATE filtered by NULL columns |
| `src/lib/auth-context.ts` | `getCurrentUserContext()` helper returning {email, isStaff, memberships} | VERIFIED | 48-line file; queries projectMembers via lower(email); correctly identifies staff wildcard row; returns null on DB error |
| `src/lib/auth.ts` | signIn callback using DB lookup with env-allowlist fallback | VERIFIED | Imports auth-context; calls getCurrentUserContext first; fallback is ADMIN_EMAIL or endsWith('@triarchsecurity.com'); comment marks fallback for v1.15 removal |
| `src/app/admin/platform/projects/[key]/members/page.tsx` | Staff-only server component for manage-members | VERIFIED | Redirects non-staff; loads project + members from DB; passes serialised data to MembersClient |
| `src/app/admin/platform/projects/[key]/members/MembersClient.tsx` | Client component — add/remove member UI | VERIFIED | 232 lines; full add/remove/error/success banner; real fetch calls to API routes; staff rows protected from removal |
| `src/app/api/platform/projects/[key]/members/route.ts` | GET + POST members for a project | VERIFIED | GET returns members list; POST validates email format, role, duplicate check, project existence; requireStaff guard |
| `src/app/api/platform/projects/[key]/members/[email]/route.ts` | DELETE a member | VERIFIED | Decodes email from URL; blocks deletion of staff role rows; hard-deletes by ID |
| `src/app/api/platform/projects/route.ts` | GET projects filtered by membership | VERIFIED | Staff → full list; non-staff → inArray filter on project_keys from ctx.memberships |
| `src/app/api/platform/ingest/release-logs/route.ts` | Accept env param with 'dev' default | VERIFIED | VALID_ENVS guard; defaults to 'dev' if envInput not in list; sets status='dev' for new rows; persists commitSha, deployedAt |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `auth.ts` signIn | `auth-context.ts` getCurrentUserContext | import + await call | WIRED | Line 4 import; line 28 call; return value controls allow/deny |
| `members/page.tsx` | `auth-context.ts` getCurrentUserContext | import + await call | WIRED | Line 4 import; line 14 call; !isStaff triggers redirect |
| `members/page.tsx` | `MembersClient.tsx` | JSX render | WIRED | Imported line 8; rendered at line 42 with projectKey, projectName, initialMembers props |
| `MembersClient.tsx` | `/api/platform/projects/${key}/members` POST | fetch in handleAdd | WIRED | Line 52; response handled; member added to state on 201 |
| `MembersClient.tsx` | `/api/platform/projects/${key}/members/${email}` DELETE | fetch in handleRemove | WIRED | Line 79; response handled; member removed from state on ok |
| `GET /api/platform/projects` | `auth-context.ts` getCurrentUserContext | import + await call | WIRED | Line 3 import; line 13 call; result controls query scope |
| `GET /api/platform/projects` | `projectMembers` (Drizzle) | membership filter | WIRED | inArray on projectKeys derived from ctx.memberships |
| `ingest/release-logs` | `releaseLogs` (Drizzle) | db.insert with env | WIRED | env field set on line 51; status hardcoded 'dev' line 52 |

---

### Requirements Coverage

| Requirement | Description | Status | Evidence |
|-------------|-------------|--------|----------|
| REL-A1 | `releaseLogs.env` column added; backfilled to 'dev' | SATISFIED (schema) / HUMAN NEEDED (runtime) | Schema line 146; backfill statement 1 |
| REL-A2 | `releaseLogs.status` column added; backfilled to 'dev' | SATISFIED (schema) / HUMAN NEEDED (runtime) | Schema line 147; backfill statement 1 |
| REL-A3 | `releaseLogs.commit_sha` column added; populated for new CI rows | SATISFIED | Schema line 148; ingest route line 53 |
| REL-A4 | `releaseLogs.deployed_at` column added; populated for new rows | SATISFIED | Schema line 149; ingest route lines 33–38 + 54 |
| REL-A5 | Ingest endpoint accepts `env`, defaults to 'dev' | SATISFIED | ingest route lines 6–7, 31; comment cites REL-A5 |
| MEMBER-01 | `project_members` table with correct schema | SATISFIED | Schema lines 156–164; uniqueIndex with lower(email) |
| MEMBER-02 | Per-project access enforced in page and API | SATISFIED | GET /api/platform/projects filters by membership; members page requires isStaff |
| MEMBER-03 | `staff` role replaces hardcoded domain check | SATISFIED | auth.ts: DB lookup is primary gate; domain check is documented fallback |
| MEMBER-04 | Backfill: every project gets admin membership row | SATISFIED (code) / HUMAN NEEDED (runtime) | backfill statement 2 with NOT EXISTS guard |
| FEEDBACK-01 | `release_feedback` table with FK to releaseLogs.id | SATISFIED | Schema lines 166–172; FK with onDelete cascade |
| APPROVAL-01 | `release_approvals` table with FK to releaseLogs.id | SATISFIED | Schema lines 174–183; FK with onDelete cascade; also includes `decision` column (value-add beyond spec) |
| ADMIN-01 | `/admin/platform/projects/{key}/members` staff-only page | SATISFIED | page.tsx + MembersClient.tsx at correct path; staff guard; add/remove wired to API |

---

### Anti-Patterns Found

| File | Pattern | Severity | Assessment |
|------|---------|----------|------------|
| `v1.14.0-backfill.sql` statement 1 | `WHERE env IS NULL OR status IS NULL OR deployed_at IS NULL` (broader than CONTEXT.md spec `WHERE env IS NULL`) | Info | CONTEXT.md spec used only `WHERE env IS NULL`. Implemented guard also catches rows where status or deployed_at is null. This means a CI row that already has env set but has a null deployedAt (legitimate for old CI) would be re-touched. Minor deviation from spec but functionally safe — the UPDATE is additive and idempotent on re-run. |
| `v1.14.0-backfill.sql` statement 2 | NOT EXISTS guard includes `AND lower(pm.email) = 'mike@triarchsecurity.com'` (stricter than CONTEXT.md spec which only checks pm.role = 'admin') | Info | CONTEXT.md spec: "if no admin exists for this project." Implemented: "if Mike is not already admin for this project." Net effect: if a project already has a different admin, Mike gets ALSO inserted as admin. This is low-risk (two admins is fine), but diverges from the stated intent. Not a blocker. |
| `MembersClient.tsx` line 130 | `placeholder="customer@example.com"` | Info | HTML input placeholder attribute — not a code stub. |

No blockers or warnings found. Both anti-pattern notes are informational deviations in the backfill SQL that do not prevent the goal from being achieved.

---

### Human Verification Required

#### 1. Live DB state after migration

**Test:** On the `feat/v1.14-phase-1-schema-membership` branch, after PR merge:
1. Run `npm run db:push` against `triarch_dev`
2. Run `psql $DATABASE_URL -f src/db/migrations/v1.14.0-backfill.sql`
3. Query: `SELECT COUNT(*) FROM release_logs WHERE env IS NULL;` — expect 0
4. Query: `SELECT COUNT(*) FROM project_members WHERE project_key = '*' AND role = 'staff';` — expect 1 (mike@triarchsecurity.com)
5. Query: `SELECT project_key, email, role FROM project_members ORDER BY project_key;` — every project key should have at least one 'admin' row

**Expected:** All pre-existing release_logs rows have env='dev' and status='dev'; project_members has one staff wildcard row and one admin row per existing project.

**Why human:** db:push is blocked from autonomous execution per CONTEXT.md — Mike applies it manually after PR review. Verifier cannot query the live DB.

---

#### 2. End-to-end sign-in with DB-backed membership

**Test:** With schema applied, sign in as a Google account that has a `project_members` row but does NOT end in `@triarchsecurity.com`.

**Expected:** Sign-in succeeds; user lands on admin; GET /api/platform/projects returns only the projects they are a member of.

**Why human:** OAuth flow requires browser + live DB with applied schema.

---

#### 3. Manage-members page — add and remove flow

**Test:** As `mike@triarchsecurity.com` (staff), navigate to `/admin/platform/projects/{key}/members`. Add a new email as 'viewer'. Confirm it appears in the table. Click remove; confirm it disappears.

**Expected:** Add inserts a row; remove hard-deletes it. Staff rows (role='staff') show no remove button.

**Why human:** UI behavior requires a running app with applied schema. Build passes but cannot be verified statically.

---

### Gaps Summary

No gaps. All automated checks pass:
- Drizzle schema declares all required tables and columns with correct types, constraints, and FKs.
- Backfill SQL is present, structured in three statements, and uses idempotency guards on all INSERTs (two minor deviations from spec noted above, both safe).
- `auth.ts` uses DB-backed lookup as primary gate with documented env-allowlist fallback. Hardcoded domain check is no longer the sole gate.
- `getCurrentUserContext()` is substantive, wired into auth.ts, the members page, and all membership-adjacent API routes.
- Members page and API routes are fully implemented, not stubs.
- Ingest endpoint accepts `env` with 'dev' default.
- `npx next build` compiles successfully with zero errors.

The two `human_needed` items are runtime-state checks that are **by design** out of scope for autonomous verification — they require Mike to apply db:push and confirm live DB state, per the locked CONTEXT.md decision.

---

_Verified: 2026-05-03_
_Verifier: Claude (gsd-verifier)_
