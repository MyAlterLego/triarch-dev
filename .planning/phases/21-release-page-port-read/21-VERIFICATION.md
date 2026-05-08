---
phase: 21-release-page-port-read
verified: 2026-05-08T15:12:00Z
status: passed
score: 9/9 must-haves verified
re_verification: false
human_verification:
  - test: "View portal.triarch.dev/projects on desktop and mobile (375px)"
    expected: "Tile grid visible on desktop; stacks to single column on mobile. Clicking a tile navigates to /projects/<slug>/releases."
    why_human: "Live Firebase App Hosting deploy — requires portal deploy secrets held by Mike. Code is complete and build-verified."
  - test: "Sign in as non-member and visit /projects/<slug>/releases"
    expected: "HTTP 404 page is returned, not 403 or redirect to login"
    why_human: "Vitest test covers the notFound() call, but end-to-end HTTP response code requires a live browser session."
  - test: "Approve / Reject buttons at 375px viewport (Chrome DevTools device toolbar)"
    expected: "'View on desktop to approve / reject' hint visible; action buttons hidden"
    why_human: "Tailwind hidden sm:flex cannot be observed without rendering in a real or simulated browser"
---

# Phase 21: Release Page Port (Read) — Verification Report

**Phase Goal:** Customer release page is fully visible at portal.triarch.dev with project list, branch sections, lifecycle timeline, filter chips, and what's-coming card — read-only paths only; mutations stubbed for Phase 22.

**Verified:** 2026-05-08T15:12:00Z
**Status:** passed (human UI verification pending Mike's portal deploy)
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | 4 server helpers moved to shared@0.2.0; admin shims re-export them | VERIFIED | Files exist in `packages/triarch-shared/src/` (218/104/513/172 lines); `packages/triarch-shared/package.json` version 0.2.0; admin shims are 1-line `export * from '@myalterlego/triarch-shared/...'` |
| 2 | shared@0.2.0 subpath exports registered in package.json | VERIFIED | `exports` in shared `package.json` contains `./release-entry-summary`, `./release-history`, `./pipeline-summary`, `./group-sections` |
| 3 | 6 UI leaf components ported to portal with tests | VERIFIED | `FilterChips.tsx`, `WhatsComingCard.tsx`, `Timeline.tsx`, `PreviewLink.tsx`, `format.ts`, `types.ts` present; `FilterChips.test.tsx`, `WhatsComingCard.test.tsx`, `PreviewLink.test.tsx` all pass |
| 4 | ReleasesClient (read-only), BranchSection, BranchPreviewClient stub in portal | VERIFIED | All three files exist (793/330/67 lines); mutation handlers call `showToast('error', '... ships in Phase 22')`; BranchPreviewClient onClick is no-op with Phase 22 TODO |
| 5 | Portal /projects/[slug]/releases server component with notFound() 404 guard | VERIFIED | `page.tsx` line 38: `if (!project) notFound()`; line 45: `if (!isMember) notFound()` — uses `getCurrentUserContext` + membership check |
| 6 | Portal /projects page replaces 18-04 stub with pipeline-summary tile UI | VERIFIED | `page.tsx` (123 lines) imports `getProjectPipelineSummaries`, renders `<Link href="/projects/${key}/releases">` tile grid with prod/dev versions, pending pill, what-changed oneliner |
| 7 | Mobile-responsive sweep: ReleasesClient + BranchSection + CustomerHeader + /projects grid | VERIFIED | `ReleasesClient.tsx` line 381: `p-4 sm:p-8`; line 692: `hidden sm:flex` on action row; line 779: `sm:hidden` mobile hint; `BranchSection.tsx` line 203: `overflow-x-auto`; `CustomerHeader.tsx` line 10: `px-4 sm:px-8`; `projects/page.tsx` line 65: `grid gap-4 md:grid-cols-2` |
| 8 | PORTAL-03 Vitest test with 3 cases covering notFound() enforcement | VERIFIED | `page.test.tsx` (177 lines): 3 tests — non-member throws NEXT_NOT_FOUND + `notFound` called once; member does NOT call notFound; staff does NOT call notFound |
| 9 | Portal v0.3.0; portal vitest 54 pass; admin vitest 338 pass; next build clean | VERIFIED | `portal/package.json` version 0.3.0; vitest: 10 files / 54 passed / 1 skipped; admin: 37 files / 338 passed; `next build` exits 0 with `/projects` and `/projects/[slug]/releases` listed as dynamic routes |

**Score:** 9/9 truths verified

---

### Required Artifacts

| Artifact (portal) | Min Lines | Actual | Contains | Status |
|---|---|---|---|---|
| `src/app/projects/[slug]/releases/page.tsx` | — | present | `notFound`, `getCurrentUserContext`, `sm:` | VERIFIED |
| `src/app/projects/[slug]/releases/ReleasesClient.tsx` | — | 793 lines | `p-4 sm:p-8`, `hidden sm:flex`, `sm:hidden` | VERIFIED |
| `src/app/projects/[slug]/releases/BranchSection.tsx` | — | 330 lines | `overflow-x-auto` | VERIFIED |
| `src/app/projects/[slug]/releases/BranchPreviewClient.tsx` | — | 67 lines | `Phase 22` stub markers | VERIFIED |
| `src/app/projects/[slug]/releases/page.test.tsx` | 40 | 177 lines | `PORTAL-03`, `notFound`, `toHaveBeenCalledTimes(1)` | VERIFIED |
| `src/app/projects/page.tsx` | — | 123 lines | `md:grid-cols-2`, `getProjectPipelineSummaries` | VERIFIED |
| `src/app/projects/CustomerHeader.tsx` | — | present | `px-4 sm:px-8` | VERIFIED |
| `package.json` | — | present | `0.3.0` | VERIFIED |

| Artifact (shared package) | Min Lines | Actual | Status |
|---|---|---|---|
| `packages/triarch-shared/src/release-entry-summary.ts` | 200 | 218 | VERIFIED |
| `packages/triarch-shared/src/release-history.ts` | 100 | 104 | VERIFIED |
| `packages/triarch-shared/src/pipeline-summary.ts` | 500 | 513 | VERIFIED |
| `packages/triarch-shared/src/group-sections.ts` | 90 | 172 | VERIFIED |
| `packages/triarch-shared/src/index.ts` | — | contains `release-entry-summary` barrel exports | VERIFIED |
| `packages/triarch-shared/package.json` | — | version `0.2.0`, subpath exports registered | VERIFIED |

| Artifact (admin shims) | Expected | Status |
|---|---|---|
| `src/lib/release-entry-summary.ts` | 1-line re-export | VERIFIED |
| `src/lib/release-history.ts` | 1-line re-export | VERIFIED |
| `src/lib/pipeline-summary.ts` | 1-line re-export | VERIFIED |
| `src/app/projects/[slug]/releases/group-sections.ts` | 1-line re-export | VERIFIED |

---

### Key Link Verification

| From | To | Via | Status | Evidence |
|---|---|---|---|---|
| `page.test.tsx` mock | `next/navigation notFound` | `vi.mock('next/navigation')` + `expect(notFound).toHaveBeenCalledTimes(1)` | WIRED | Pattern confirmed at lines 6, 135 |
| `ReleasesClient.tsx` action button row | Tailwind `hidden sm:flex` | className edit on buttons container | WIRED | Line 692: `hidden sm:flex items-center gap-3 pt-2 border-t border-zinc-800` |
| `portal/projects/page.tsx` | `@myalterlego/triarch-shared/pipeline-summary` | `import { getProjectPipelineSummaries }` | WIRED | Line 5 import + line 49 await call + lines 74-116 render |
| `portal/projects/[slug]/releases/page.tsx` | notFound() membership guard | `getCurrentUserContext` + membership array check | WIRED | Lines 23, 38, 45 |
| Admin shims | `@myalterlego/triarch-shared` subpaths | `export * from '...'` | WIRED | All 4 shims confirmed as single-line re-exports |

---

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|---|---|---|---|---|
| PORTAL-01 | 21-01 | Shared server helpers in triarch-shared@0.2.0 | SATISFIED | 4 helpers in shared package; subpath exports; admin shims; shared@0.2.0 published |
| PORTAL-02 | 21-05 | Portal /projects tile grid with pipeline summary | SATISFIED | `portal/src/app/projects/page.tsx` uses `getProjectPipelineSummaries`, renders Link tiles |
| PORTAL-03 | 21-04, 21-06 | /projects/[slug]/releases with 404-not-403 enforcement | SATISFIED | `page.tsx` calls `notFound()` for non-members; `page.test.tsx` verifies with 3 Vitest cases |
| PORTAL-04 | 21-06 | Mobile-responsive layout on read paths | SATISFIED | `p-4 sm:p-8`, `hidden sm:flex`, `overflow-x-auto`, `md:grid-cols-2`, `px-4 sm:px-8` all applied |

---

### Anti-Patterns Found

| File | Pattern | Severity | Assessment |
|---|---|---|---|
| `BranchPreviewClient.tsx` | `onClick` is no-op; `TODO Phase 22` | Info | Intentional stub per CONTEXT scope — Phase 22 owns this |
| `ReleasesClient.tsx` | `handleApprove`/`handleReject`/`handleFeedback` call `showToast('error', 'ships in Phase 22')` | Info | Intentional stub per CONTEXT scope — UI shows button, click shows toast. Phase 22 wires API. |
| `ReleasesClient.tsx` | Load-more disabled: `// Portal read-only: load-more is disabled in Phase 21` | Info | Intentional deferral per CONTEXT |

No blockers. All stubs are Phase 22 deferred items explicitly noted in CONTEXT.md.

---

### Human Verification Required

The following items require a live portal session. Code is complete and build-verified; these are blocked only on portal-prod deploy (Mike's pending action on deploy secrets).

#### 1. Full UI visual verification (desktop)

**Test:** Sign in as a customer with at least one project membership. Visit `https://portal.triarch.dev/projects`.
**Expected:** Tile grid with one tile per membered project; prod/dev version badges, pending-approval pill if applicable, what-changed oneliner if dev-ahead. Click a tile → `/projects/<slug>/releases` loads with FilterChips, WhatsComingCard (if applicable), BranchSection accordions, Timeline on expand.
**Why human:** Live Firebase App Hosting deploy required; no local portal dev server with production DB accessible.

#### 2. 404-not-403 live HTTP verification

**Test:** In a private window, sign in as a user not in any project, then visit `https://portal.triarch.dev/projects/<any-slug>/releases`.
**Expected:** HTTP 404 page (Next.js built-in or custom `not-found.tsx`), not a 403 or login redirect.
**Why human:** End-to-end HTTP response code requires a live browser. Vitest test covers the `notFound()` call path; live verification confirms Next.js maps it to 404.

#### 3. Mobile viewport layout (375px)

**Test:** Chrome DevTools → Toggle Device Toolbar → iPhone SE (375px). Visit `/projects` then `/projects/<slug>/releases`.
**Expected:** `/projects` — tiles stack single column (not 2-up). `/projects/<slug>/releases` — FilterChips wrap without overflow, BranchSection table scrolls horizontally inside its container, "View on desktop to approve / reject" hint shows instead of action buttons.
**Why human:** Tailwind responsive classes require a real/simulated rendering environment.

---

### Additional Notes

- **`npm view @myalterlego/triarch-shared@0.2.0 version`** returned a network error in this verification run. The package is published to a private GitHub Packages registry and is unavailable from this shell context. Evidence of publication comes from: (a) `packages/triarch-shared/package.json` at version 0.2.0 with correct subpath exports, (b) the portal and admin builds both pass and resolve shared package imports cleanly, (c) `docs(21-01)` commit on admin main references the publish, (d) `git tag shared/v0.2.0` pattern from Phase 16 is the established publish trigger.

- **Stray SUMMARY.md in `portal/.planning/`:** Not present. The directory contains only a `phases/` subdirectory. No cleanup needed.

- **Pre-existing issue (out of scope):** `src/lib/auth.test.ts` has a pre-existing TypeScript error (`projectKey` vs `project_key` property name mismatch). Noted in 21-06-SUMMARY.md deferred items. Not caused by Phase 21 and not a blocker.

---

## Summary

Phase 21 goal is achieved. The customer release page is fully ported to portal:

- `@myalterlego/triarch-shared@0.2.0` ships 4 server helpers consumed by both admin (via shims) and portal (via direct imports)
- Portal `/projects` delivers a full pipeline-summary tile grid replacing the Phase 18 stub
- Portal `/projects/[slug]/releases` delivers the complete read-only customer release page: FilterChips, WhatsComingCard, BranchSection accordions with Timeline, lifecycle events
- 404-not-403 membership enforcement is code-complete and Vitest-verified (3 test cases)
- Mobile-responsive Tailwind classes applied across all read paths; desktop-only mutation controls gated behind `hidden sm:flex`
- Mutation handlers are properly stubbed (toast messages) per the Phase 21 scope boundary; Phase 22 owns the API wiring
- Portal v0.3.0 squash-merged to main; build is clean; 54 portal tests pass; 338 admin tests pass

Live UI verification at `portal.triarch.dev` is the only remaining item and is gated on Mike's portal deploy secrets.

---

_Verified: 2026-05-08T15:12:00Z_
_Verifier: Claude (gsd-verifier)_
