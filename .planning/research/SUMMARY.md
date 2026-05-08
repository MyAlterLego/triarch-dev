# Project Research Summary

**Project:** Triarch Dev Admin — v2.1 Pipeline UI
**Domain:** Internal operations console — CI/CD pipeline visualization, release-gating control, bidirectional tracker linkage
**Researched:** 2026-05-07
**Confidence:** HIGH

## Executive Summary

v2.1 is a brownfield feature milestone on top of a fully operational v2.0 release-gating app. The infrastructure — CockroachDB schema, GitHub App promotion dispatch, Firebase App Hosting backends, Slack/OttoBot dispatcher, per-project membership and role auth — is all live. The research gap is not "how to build this domain" but "how to add pipeline visibility and control surfaces without breaking what already ships." Because the existing codebase is the authoritative source, research was conducted primarily via direct code inspection, not competitor documentation — and confidence is high as a result.

The recommended approach follows the existing codebase patterns exactly: server components fetch all data at render time; client islands handle only user-initiated interactions; business logic lives in `src/lib/` and is called from both web and Slack routes; DB-backed locks handle cross-serverless-instance state. Two new npm packages are justified (`swr@^2.4.1` for branch-swap polling, `compare-versions@^6.1.1` for semver comparisons). Everything else — filters, diffs, commit ID parsing — is implemented inline with existing Tailwind/React patterns and utility functions. The dependency graph is clean: Phases 1 and 2 ship with zero schema migrations, Phase 3 introduces the one schema gate, and Phases 4–7 build on stable ground.

The highest-risk item in the milestone is the Firebase App Hosting programmatic branch-swap API. The CLI command (`firebase apphosting:rollouts:create --git-branch`) is documented; the REST equivalent callable from a Next.js route handler without spawning a child process is not clearly documented. This must be spiked before building the branch swap UI. The second risk is the double-promote race between the new web Promote button and the existing Slack path — a unique DB constraint on `(release_id, decision='approved')` must ship in the same phase as the button. Both risks are well-understood and have clear prevention strategies.

---

## Key Findings

### Recommended Stack

The stack is locked at v2.0 values. v2.1 adds exactly two new runtime dependencies and zero new dev dependencies. `swr@^2.4.1` replaces manual `setInterval`/`useEffect` cleanup for branch-swap polling and is confirmed React 19 compatible. `compare-versions@^6.1.1` provides a 1 KB semver gt/lt/eq utility for the prod-vs-dev version diff display — the full `semver` npm package (78 KB, range-resolution focused) is explicitly rejected.

Firebase App Hosting's 5-minute request timeout rules out SSE and WebSockets for real-time status. SWR polling at 5-second intervals is the correct solution for branch swaps that complete in 30–120 seconds. The existing `useState`/`useEffect`/`fetch()` pattern (no SWR currently in the project) should NOT be extended to new polling use cases — SWR replaces it for those cases only.

**Core technologies (additions only):**
- `swr@^2.4.1`: polling branch-swap in-flight status — replaces manual setInterval, deduplicates concurrent calls, pauses on tab blur
- `compare-versions@^6.1.1`: semver gt/lt for prod-vs-dev version diff display — 1 KB, zero deps, handles pre-release tags

**Technologies explicitly rejected:**
- `conventional-commits-parser`: wrong format — targets `type(scope):` not `#BUG-123`; a 15-line regex utility replaces it
- `react-tailwindcss-select`: 3-year-old package, 6 dependents, Tailwind v4 compatibility unverified
- `react-diff-view` / `diff2html`: render git patch format; the "diff" here is JSONB entry array comparison
- Redux / Zustand / Jotai: no cross-page shared mutable state exists in this app
- SSE / WebSockets: Firebase App Hosting 5-min timeout makes both unreliable

### Expected Features

Research against Vercel, Netlify, Heroku, GitHub Actions, Sentry, and Linear establishes the feature landscape. The v2.1 scope is more ambitious than any single competitor because it combines pipeline visibility, customer-driven branch previews, web-initiated promotion, and bidirectional tracker linkage on a single gating surface.

**Must have (table stakes):**
- Per-project prod/dev versions side-by-side with last-deploy timestamp — every modern deploy dashboard shows this; absence forces Slack lookups
- Pending-approval count badge per project tile — Vercel/Netlify both surface "needs action" indicators; missing = operators miss backlog
- Deploy status pills (pending / approved / promoted / conflict) — established pattern from GitHub Actions and Netlify
- Promote button disabled state with reason tooltip — GitHub Actions shows "waiting for approval" with explanation
- Clickable project tiles to releases page — every dashboard tile is a navigation surface

**Should have (differentiators):**
- Branch preview selector (shared-slot model) — unique to this architecture; closest analog is Azure App Service deployment slots
- Web-UI Promote button (staff-only, two-step modal) — co-locates promotion action with customer-approved evidence
- Bug/feature ID auto-detection from commit messages — built into release ingestion for `#BUG-123`/`FEAT-45`/`closes #99` patterns
- "Released in vX.Y dev / vA.B prod" badge on bug/feature detail pages — automatic from linkage table; no third-party CI integration needed
- "What's changed" compact/expanded view across admin dashboard and customer page

**Confirmed anti-features (do not build):**
- Per-branch ephemeral backend URLs — wrong model for shared-slot architecture
- Real-time deploy log streaming — logs live in GitHub Actions; link to the run URL instead
- Rollback button — Firebase App Hosting does not support deploying a past artifact
- Notification/alert configuration UI — Slack channel config stays in project registry
- Type-to-confirm modal on Promote — two-step modal with specific button label is sufficient per NN/G and GitLab design guidance

**Defer to v2.1.x/v2.2+:**
- Customer release page filter by entry type (add after linkage table has real data)
- Per-project admin pipeline page expanded view
- Manual bug/feature ID authoring UI
- GitHub Actions run link surfaced from release row
- Branch swap history audit log

### Architecture Approach

The architecture follows the existing RSC-first, island-based pattern established across v1.14–v2.0: server components own all data fetching; `*Client.tsx` islands handle only user interactions; `src/lib/` functions are shared across Slack and web routes. New components slot into existing page trees rather than creating parallel structures.

The schema changes are minimal and isolated: one new join table (`release_log_links`), two new nullable columns on `projects` (branch preview lock state), and no changes to `release_logs`, `bug_reports`, or `feature_requests`. The `entries[]` JSONB array on `release_logs` is explicitly NOT extended — links go in the join table where they are indexable and queryable.

**Major components:**
1. **Admin home (`/admin`)** — MODIFIED: `getDashboardStats` extended with prod/dev version split, pending-approval count, last-deploy timestamp, tile link
2. **Per-project pipeline page (`/admin/modules/pipeline/[slug]`)** — NEW: staff-only consolidated env state, branch RC list, what-changed view, promote button
3. **`PromoteButton` client island** — NEW: staff-only; delegates to `promoteAndAudit()`; Slack notification included for free
4. **`BranchSwapClient` island** — NEW: customer branch selector with DB-backed concurrency lock display; polls via SWR
5. **`POST /api/projects/[slug]/branch/preview`** — NEW: calls Firebase App Hosting Rollouts API, sets DB lock
6. **`release_log_links` table** — NEW join table: links release entries to bug/feature IDs; indexed FKs
7. **`src/lib/commit-parser.ts`** — NEW: regex parser; called post-insert in ingest route
8. **`src/lib/release-delta.ts`** — NEW: `getUnreleasedDevChanges()` shared query helper
9. **Customer releases page (`/projects/[slug]/releases`)** — MODIFIED: branch swap UI, what-changed summary, entry type filter

**Build order (dependency graph):**
```
[1] Schema (release_log_links + projects lock columns)
[2] Admin home pipeline split + tile links  <- independent, no schema needed
[3] Per-project pipeline page               <- independent
[4] Web-UI Promote button                   <- independent, reuses promoteAndAudit
[5] What's-changed view                     <- independent, pure query
[6] commit-parser + ingest auto-stamp       <- blocked on [1]
[7] Tracker linkage authoring UI            <- blocked on [1] + [6]
[8] Bug/feature detail pages                <- blocked on [1] + [7]
[9] Branch preview swap                     <- blocked on [1] + Firebase research spike
[10] Customer page: filter + what-changed + branch swap UI  <- blocked on [5] + [9]
```

### Critical Pitfalls

Research identified 11 pitfalls from direct codebase inspection. Top 5 requiring phase-level planning attention:

1. **FAH branch swap race with concurrent CI push** — DB lock flag + FAH 409 guard + in-progress banner on all RC rows. Lock and UI must ship in the same phase — never separately.

2. **Double-promote between web and Slack paths** — unique constraint on `(release_id, decision='approved')` must ship in the same phase as the web Promote button. No exceptions.

3. **Firebase App Hosting programmatic rollout API uncertainty** — CLI documented; REST equivalent for a Next.js route handler without `child_process` is not confirmed. Research spike required before Phase 6 design.

4. **Commit message parsing false positives and injection** — validate every matched ID against DB before surfacing; sanitize all commit message content before rendering or passing to Slack (strip mrkdwn control characters, zero-width/directional override chars).

5. **Dashboard "latest per env per project" query correctness** — use `DISTINCT ON (project, env) ORDER BY COALESCE(deployed_at, released_at) DESC NULLS LAST`; add composite index `(project, env, deployed_at DESC)` before shipping the dashboard widget; filter `WHERE env IN ('dev', 'prod')` to exclude null-env legacy rows.

Standing constraints (all phases):
- Never extend `release_logs.status` enum without auditing all consumers; use separate metadata field for swap state
- Never use module-level Maps for cross-request state on Firebase App Hosting (serverless multi-instance); use DB locks
- URL params (not in-memory state) for all filter dimensions; follow `SlackAuditClient.tsx` precedent

---

## Implications for Roadmap

### Phase 1: Admin Home Pipeline Visibility
**Rationale:** Zero schema changes required; delivers immediate operational value; establishes the prod/dev split data pattern all later phases depend on.
**Delivers:** Per-project prod/dev versions, pending-approval count badge, last-deploy timestamp, clickable project tiles.
**Addresses:** Table stakes — prod/dev side-by-side, pending-approval count, deploy status, clickable tiles.
**Avoids:** Pitfall 8 (dashboard query correctness) — `DISTINCT ON` idiom + null handling + composite index in this phase.
**Research flag:** Standard patterns. Skip `/gsd:research-phase`.

### Phase 2: Per-Project Pipeline Page and Web-UI Promote Button
**Rationale:** Both features require zero schema changes and reuse existing lib functions; the pipeline page hosts the promote button.
**Delivers:** `/admin/modules/pipeline/[slug]`; `PromoteButton` island; `POST /api/admin/releases/[id]/promote` route; what-changed view.
**Addresses:** Web-UI Promote button, per-project admin pipeline page, what-changed views.
**Avoids:** Pitfall 3 (double-promote race) — unique constraint on `(release_id, decision='approved')` ships here; Pitfall 4 (audit trail split) — `actor_source` column added to `release_approvals`.
**Uses:** `compare-versions@^6.1.1` for version diff display.
**Research flag:** Standard patterns. Design decision needed on `promoteAndAudit` nullable Slack context before coding — not a research spike.

### Phase 3: Schema Gate
**Rationale:** One isolated migration phase eliminates migration risk for all downstream phases.
**Delivers:** `release_log_links` table (with FK indexes), `projects.preview_branch_locked` + `preview_branch_locked_at` columns, Drizzle schema + relations, migration verified on dev cluster.
**Addresses:** Foundation for tracker linkage (Phases 4–5) and branch swap (Phase 6).
**Avoids:** Pitfall 6 (N+1 query) — join table with indexes prevents JSONB scan; Pitfall 11 (structural mutations) — no `release_logs.status` enum changes.
**Research flag:** Standard Drizzle migration patterns. Skip `/gsd:research-phase`.

### Phase 4: Commit Parser and Tracker Linkage Authoring
**Rationale:** Auto-stamp is the data producer; without it the linkage UI has nothing to show; seeds `release_log_links` for Phases 5 and 7.
**Delivers:** `src/lib/commit-parser.ts`; ingest route modified to call parser post-insert; `getCommitMessage()` GitHub helper; manual add/remove link UI in `/admin/modules/release-logs`; `revalidatePath` on link mutations.
**Addresses:** Bug/feature ID auto-detection, manual override authoring UI.
**Avoids:** Pitfall 5 (false positives and injection) — ID validation against DB, Slack character sanitization, word-boundary-anchored regex; Pitfall 7 (stale detail page data) — `revalidatePath` from link-creation route.
**Research flag:** Standard patterns. GitHub authenticated fetch already established in `github-app.ts`.

### Phase 5: Bug and Feature Detail Pages with Release Linkage
**Rationale:** Closes the bidirectional linkage loop; once `release_log_links` has data, the "Released in" display is a single join query per page.
**Delivers:** `/admin/modules/bug-reports/[id]` and `/admin/modules/feature-requests/[id]` server components; "Released in vX.Y dev / vA.B prod" sidebar section; batch `inArray` lookup for list pages.
**Addresses:** "Released in" badge, bidirectional tracker linkage.
**Avoids:** Pitfall 6 (N+1 query) — `inArray` batch pattern per list page, not one query per row.
**Research flag:** Standard patterns. Skip `/gsd:research-phase`.

### Phase 6: Branch Preview Swap (Firebase Research Spike Required)
**Rationale:** Highest-risk integration in the milestone; isolated to contain spike risk; DB lock columns (Phase 3) are the only dependency.
**Delivers:** `POST /api/projects/[slug]/branch/preview` route; `BranchSwapClient` island; SWR polling at 5s; DB lock set/clear lifecycle; concurrency banner.
**Addresses:** Branch preview selector, branch swap concurrency, branch swap lock with actor + timestamp.
**Avoids:** Pitfall 1 (FAH race with CI push) — DB lock + FAH 409 guard + in-progress banner; Pitfall 2 (FAH rollout stuck in PENDING) — poll until terminal state, surface error on FAILED, 8-minute timeout.
**Uses:** `swr@^2.4.1` for in-flight polling.
**Research flag:** NEEDS `/gsd:research-phase` before planning. Key unknown: Firebase App Hosting programmatic rollout API callable from Next.js route handler without `child_process`. Must evaluate: (a) `googleapis` Node SDK `firebaseapphosting.v1beta.projects.locations.backends.rollouts.create`, (b) Firebase MCP (`mcp__firebase__`) rollout management, (c) GitHub Actions workflow dispatch as intermediary. Do not design the route handler until resolved.

### Phase 7: Customer Page Integration
**Rationale:** Integrates all preceding work onto the customer-facing surface; last deliberately because it has the most dependencies and requires a discoverability/nav holistic review.
**Delivers:** Entry type filter chips (URL params, client-side filter); "What's changed" summary card at page top; branch swap button per branch section header; navigation/discoverability audit.
**Addresses:** Customer page filter, what-changed summary on customer page, full branch swap customer UX.
**Avoids:** Pitfall 9 (URL state vs in-memory) — URL params via `router.replace` shallow, filter applied client-side with `useMemo`; Pitfall 10 (nav clutter) — progressive disclosure, default collapsed what's-changed, max 4 interactive controls above fold.
**Research flag:** Standard patterns. URL params filter precedent already established by `SlackAuditClient.tsx`. Skip `/gsd:research-phase`.

### Phase Ordering Rationale

- Phases 1 and 2 ship with zero schema migrations — delivers the highest-value admin visibility improvements before any DB migration risk.
- Phase 3 (schema gate) is positioned after the no-migration phases have shipped, so the team has working deployable software before taking migration risk.
- Phases 4–5 (linkage) precede Phase 7 (customer page) because the entry type filter requires linkage data to be meaningful.
- Phase 6 (branch swap) is isolated with a research spike gate because it is the only feature with an unresolved external API dependency.
- Phase 7 (customer integration) is last because it aggregates all other phases and includes the navigation/discoverability audit that can only be done when all features exist.

### Research Flags

Needs `/gsd:research-phase` before planning:
- **Phase 6:** Firebase App Hosting programmatic rollout API — determine callable mechanism from Next.js route handler without `child_process`; evaluate `googleapis` SDK, Firebase MCP, and GitHub Actions dispatch as options.

Standard patterns (skip `/gsd:research-phase`):
- **Phase 1:** App Router server component extending existing `getDashboardStats`; `DISTINCT ON` is a known CockroachDB idiom.
- **Phase 2:** `promoteAndAudit` reuse path; design decision on nullable Slack context, not research.
- **Phase 3:** Drizzle schema addition + migration; well-understood.
- **Phase 4:** Regex parsing utility + Drizzle upsert; GitHub authenticated fetch already established.
- **Phase 5:** Join query server component; `inArray` batch pattern already in codebase.
- **Phase 7:** URL params filter pattern already established by `SlackAuditClient.tsx`.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Existing stack confirmed from `package.json`; new additions verified via npm registry and official docs; rejected libraries documented with specific reasons |
| Features | HIGH | Competitor patterns verified via official docs (Vercel, Netlify, GitHub Actions, Heroku, Sentry, Linear, GitLab); scope confirmed against PROJECT.md user decisions |
| Architecture | HIGH | Derived from direct codebase inspection of 15+ source files; component boundaries, auth model, and data flow match established v2.0 patterns |
| Pitfalls | HIGH | Derived from direct codebase inspection + v2.0 burn log in PROJECT.md; all 11 pitfalls include specific prevention steps and verification criteria |

**Overall confidence:** HIGH

### Gaps to Address

- **Firebase App Hosting programmatic rollout API (Phase 6):** The REST endpoint for `rollouts.create` callable from a Node.js environment without spawning a child process is not confirmed. Resolution: research spike in Phase 6 planning before committing to route handler design.

- **`promoteAndAudit` signature for web context (Phase 2):** Function currently requires `channelId` and `messageTs` (Slack coordinates). The web promote path has no Slack message to thread onto. Two options: (a) make parameters nullable with fallback to new Slack message, (b) split into `dispatchPromotion` + `notifySlack` calls. Design decision during Phase 2 planning.

- **Entry type classification for customer page filter (Phase 7):** The `entries[]` JSONB written by CI has no `type` field. The filter must derive type from `release_log_links` (a release with a linked bug is "bug fix") rather than a CI-written field. This requires no CI changes but means Phase 7 filter is only meaningful after Phase 4 data is populated.

---

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection: `src/db/schema.ts`, `src/lib/github-app.ts`, `src/lib/release-promotion.ts`, `src/lib/release-actions.ts`, `src/lib/api-auth.ts`, `src/app/admin/page.tsx`, `src/app/projects/[slug]/releases/page.tsx`, `src/app/projects/[slug]/releases/ReleasesClient.tsx`, `src/app/admin/platform/slack-audit/SlackAuditClient.tsx`
- `.planning/PROJECT.md` — milestone context, v2.0 burn log, existing decisions
- npm registry — `swr@2.4.1` (React 19 compatible, 2002 dependents)
- npm registry — `compare-versions@6.1.1` (zero dependencies, MIT, TypeScript 5/Node 20 compatible)
- firebase.google.com/docs/app-hosting/product-comparison — App Hosting 5-minute request timeout confirmed
- Vercel docs (updated 2026-02-27) — promoting deployments, managing deployments, project overview
- GitHub docs — reviewing deployments, workflow dispatch
- Heroku devcenter — review apps, staging-to-prod promotion model
- Sentry docs — releases, commit tracking
- Linear docs — releases, issue type filtering
- GitLab design system — destructive actions pattern (two-step vs type-to-confirm)
- Netlify docs — deploy management overview
- NN/G — confirmation dialog UX research

### Secondary (MEDIUM confidence)
- Firebase App Hosting Rollouts CLI (`firebase apphosting:rollouts:create --git-branch`) — CLI documented; REST equivalent for programmatic invocation not confirmed; flagged as research gap for Phase 6

---
*Research completed: 2026-05-07*
*Ready for roadmap: yes*
