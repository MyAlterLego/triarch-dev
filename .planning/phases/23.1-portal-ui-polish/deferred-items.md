# Phase 23.1 — Deferred Items

Items observed during execution but OUT OF SCOPE per current plan. Not blocking; capture for future cleanup.

## Pre-existing TypeScript errors in portal (discovered during 23.1-01 Task 2)

`npx tsc --noEmit` in portal reports errors in 7 test files that pre-date this phase. These are baseline failures on `feat/23.1-01-sub-nav` (verified via blame on the touching commit `9dae716` "v0.4.3: fix: update source imports @myalterlego→@triarchsecurity").

Files with errors:

- `src/lib/portal-slack.test.ts` — 5 `TS2352` errors casting `[]` to `[string, RequestInit]`
- `src/app/api/projects/[slug]/branch/preview/route.test.ts` — `TS2345` membership-role type narrowing
- `src/app/api/projects/[slug]/branch/preview/status/route.test.ts` — same pattern
- `src/app/projects/[slug]/bugs/page.test.tsx` — same pattern
- `src/app/projects/[slug]/features/page.test.tsx` — same pattern
- `src/app/projects/[slug]/releases/BranchPreviewClient.test.tsx` — same pattern
- `src/lib/auth.test.ts` — same pattern

`npx vitest run` is GREEN across all of these (typecheck and runtime mocks differ).

**Why not fixed in 23.1-01:**
- Plan 23.1-01 scope is UX-01 sub-nav only.
- Workspace CLAUDE.md: "Do not refactor, clean up, or improve code beyond what was asked."
- All errors are in files this plan did not touch; fixing them would be out-of-scope drift.

**Recommended fix** (for a follow-up tidy plan or as a Phase 23.1-02 advisory):
The membership-role narrowing pattern needs the test's mock fixture to assert membership type compatibility. The `portal-slack.test.ts` `as [string, RequestInit]` casts need an `as unknown as` intermediate or proper tuple typing on the mock.

This file added during execution of plan 23.1-01.
