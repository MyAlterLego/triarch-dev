# Pitfalls Research

**Domain:** Adding Pipeline UI + control loop to an existing Slack-driven release-gating admin app
**Researched:** 2026-05-07
**Confidence:** HIGH — derived from actual codebase inspection of v2.0 implementation + project-specific burned context

---

## Critical Pitfalls

### Pitfall 1: FAH Branch Swap with In-Flight CI Push

**What goes wrong:**
A customer clicks "Preview this branch" to swap the dev FAH backend to `feat/add-audio`. At the same moment, CI finishes a push for `feat/change-font` and triggers `firebase apphosting:rollouts:create --git-branch feat/change-font`. Both calls hit Firebase App Hosting concurrently. Firebase FAH has only one active rollout slot per backend. The winner of the race becomes the deployed state; the loser either errors or silently loses. The customer UI now shows "Previewing feat/add-audio" but the backend is actually running `feat/change-font`. No signal is surfaced.

**Why it happens:**
The swap API call and the CI ingest webhook are orthogonal flows. There is no distributed lock, no FAH rollout queue, and no in-flight state recorded in the DB. The branch swap button in the customer UI will be a `POST /api/projects/{slug}/dev-swap` that calls Firebase and optimistically returns 200 — but Firebase FAH rollout creation is async; the rollout enters a "PENDING" state before becoming "RUNNING". CI pushes during that window also trigger rollouts and can win.

**How to avoid:**
- Record a `dev_swap_in_progress` flag per project in the DB (or use `projects.metadata`) the moment the swap is initiated.
- Poll FAH rollout status until the rollout reaches `RUNNING` or `FAILED` before clearing the flag.
- Disable the swap button for ALL branches while the flag is set, not just the branch being swapped to.
- Surface an in-progress state banner: "Branch X currently deploying — swaps disabled."
- Ingest endpoint (`/api/platform/ingest/release-logs`) should check this flag; if a CI push arrives while a swap is in progress, log a warning and return 200 (don't block the ingest), but mark the release with a `swap_conflict` metadata field so the dashboard can surface the ambiguity.

**Warning signs:**
- Customer page shows one branch as previewing but the ingest log shows a different branch's release as the latest dev entry.
- Firebase console shows two recent rollouts for the dev backend close in time, both in terminal state.
- Release log's `branch` column doesn't match the `metadata.previewBranch` on the project row.

**Phase to address:**
Phase that implements branch selector UI and the `/api/projects/{slug}/dev-swap` endpoint. Must be the same phase — do not build the UI without the lock mechanism.

---

### Pitfall 2: FAH Rollout Left in PENDING/CREATING State After Failed Swap

**What goes wrong:**
The swap API calls `firebase apphosting:rollouts:create`, which returns immediately. If the rollout enters `FAILED` state (bad branch name, build error, misconfigured secret), the dev backend stays on whatever was previously running. The `dev_swap_in_progress` flag is never cleared (if you set one), or the UI reports the wrong branch as active. The customer sees a preview URL for `feat/add-audio` that still serves `feat/change-font` code.

**Why it happens:**
FAH rollout creation is a two-phase async process: `create` (sync) then `PENDING → RUNNING` or `FAILED` (async, typically 2–5 minutes). The swap UI has no callback from Firebase. v2.0's `apphosting.yaml` overlay split was necessary precisely because of this complexity — the same pattern applies to on-demand branch swaps.

**How to avoid:**
- Poll `firebase apphosting:rollouts:list --backend <backend>` (or the FAH REST API via MCP) until the most recent rollout reaches a terminal state (`RUNNING` or `FAILED`).
- On `FAILED`: clear the in-progress flag, surface an error banner to the customer UI ("Preview failed — branch may have a build error"), and revert the `metadata.previewBranch` field to the previously active branch.
- Set a polling timeout (e.g., 8 minutes) — if the rollout doesn't reach terminal state, treat as failure.
- Consider the Firebase MCP (`mcp__firebase__`) for rollout status checks rather than shelling out.

**Warning signs:**
- Swap button remains disabled indefinitely.
- Firebase console shows a rollout stuck in `CREATING` or `PENDING` for more than 5 minutes.
- Preview URL returns 503.

**Phase to address:**
Same phase as Pitfall 1. The swap polling/recovery logic must be part of the initial implementation, not a follow-up.

---

### Pitfall 3: Double-Promote Race Between Web UI and Slack

**What goes wrong:**
An admin approves a release via the new web UI "Promote to prod" button at the same time another staff member clicks the OttoBot Slack approve button. Both calls hit `POST /api/projects/{slug}/releases/{id}/approve` within milliseconds. `approveRelease()` in `release-actions.ts` uses an optimistic status check (reads `release.status`, branches on value) with a subsequent DB transaction. If two requests both read `status='dev'` before either commits, both transactions succeed. Two `promoteAndAudit()` dispatches fire, two `promote-branch.yml` workflows run, two Slack messages appear.

**Why it happens:**
`approveRelease()` does a SELECT then a transaction UPDATE — the read is outside the transaction boundary. The transaction protects the INSERT + UPDATE pair atomically, but it does not prevent two concurrent callers from both passing the `status !== 'dev'` guard before either commits. CockroachDB serializable isolation will serialize the transactions but both will succeed if both read the pre-commit `'dev'` value. The second caller won't see `'approved'` until the first transaction commits; if the two transactions interleave, both pass.

The existing concurrent-approval test suite (Phase 6, D-16) proves per-row UUID isolation but does NOT cover the specific case of two simultaneous promotions for the same release.

**How to avoid:**
- Add a unique constraint on `(release_id, decision)` in `release_approvals` so the second INSERT fails at the DB level: `uniqueIndex('release_approvals_one_approve_idx').on(table.releaseId, table.decision).where(sql\`${table.decision} = 'approved'\`)`.
- Alternatively, use a `SELECT FOR UPDATE` / advisory lock on the release row inside the transaction.
- The second caller's transaction then fails and can return `alreadyApproved: true` without dispatching a workflow.
- The web UI's Promote button must be hidden/disabled once `promotionDispatchedAt` is set on the release row — display that field rather than just `status`.

**Warning signs:**
- Two `promote-branch.yml` runs appear in GitHub Actions for the same branch within seconds.
- Two `:rocket: Workflow dispatched` Slack threads for the same release.
- `promote_attempts` table shows two entries for the same `(project, branch)` within 30 seconds.

**Phase to address:**
Phase that introduces the web Promote button. Must ship the unique constraint migration in the same phase.

---

### Pitfall 4: Web Promote Audit Trail Diverges from Slack Audit Trail

**What goes wrong:**
Slack promotions write to `slack_action_audit` via `recordSlackAudit()`. Web UI promotions go through the standard session auth path and write to `release_approvals` (via `approveRelease`) and `promote_attempts` (via callback). The two paths produce records in different tables with different actor fields (`actor_slack_id` vs `approverEmail`). Querying "who promoted X" requires knowing which path was used.

**Why it happens:**
The Slack path was purpose-built for OttoBot before the web path existed. Adding a web promote without unifying the audit model creates a permanent fork.

**How to avoid:**
- Do not write to `slack_action_audit` for web actions.
- Add an `actorSource` column (`'web' | 'slack'`) to `release_approvals` (nullable for legacy rows, default `'web'` for new rows).
- The admin pipeline page and per-project release page show `promotionDispatchedBy` (already on `release_logs`) for the audit line — this field is populated by both paths since both call `promoteAndAudit()`.
- The Slack audit page remains Slack-only; release approval audit comes from `release_approvals`.

**Warning signs:**
- Staff ask "who promoted X?" and need to check two different admin pages.
- `slack_action_audit` begins accumulating non-Slack events.

**Phase to address:**
Phase that adds the web Promote button. Schema migration for `actor_source` must be in the same phase diff.

---

### Pitfall 5: Auto-Stamp Commit Parsing False Positives and Injection

**What goes wrong:**
Two distinct problems:

(a) **False positive ID matching.** Commit messages like `fixes #1234567` or `BUG-0` or `closes FEAT-` match naive regexes. If the regex is `/#?(\d+)/g` it will also match commit hashes, PR numbers, and any 7-digit number. A bug-report ID is a UUID in this system (`bug_reports.id`), not a short integer — but the `bugReports.fixVersion` and `featureRequests.shippedVersion` columns use version strings, not IDs for cross-linking. Without a lookup table, every matched "ID" must be validated against actual DB rows, which is an extra round-trip per parsed ID per release.

(b) **Unicode/injection in commit messages.** Commit messages are developer-controlled strings. If they're rendered without sanitization in the admin UI or passed to Slack as-is, a commit message containing Slack mrkdwn syntax (e.g., `<!channel>`) triggers a channel mention. HTML entities in messages rendered via `dangerouslySetInnerHTML` cause XSS. URLs with RTL override characters (`‮`) produce misleading link text.

**Why it happens:**
Commit message parsing is a new surface (v2.1). The existing release log ingestion endpoint stores `entries` as raw jsonb and `summary` as raw text — no parsing of those fields is done today.

**How to avoid:**
- Define the ID format precisely before writing the parser: `BUG-{uuid}` and `FEAT-{uuid}` where uuid is a full CockroachDB UUID, not a short int. This eliminates most false positives since UUIDs are unambiguous.
- Alternatively use a shorter prefix: `BUG-{id_short}` where `id_short` is the first 8 chars of the UUID — then validate every match against the DB before surfacing a link.
- For the parser, use `\b(BUG|FEAT)-([0-9a-f-]{8,36})\b` — anchored at word boundaries, minimum 8 chars.
- Sanitize all commit message content before rendering: use a safe text renderer (not `dangerouslySetInnerHTML`), strip zero-width and directional override characters (`‬`, `‮`, `​`), and escape Slack mrkdwn characters before passing to `postSlackThreadedReply`.
- Rate-limit or batch DB lookups: validate all parsed IDs in a single `inArray()` query per ingestion event.

**Warning signs:**
- Bug detail page shows phantom "Released in..." labels from false-positive matches.
- Slack channel gets `<!channel>` mention from a rogue commit message.
- Commit message with a long string causes the UI card to overflow or misalign.

**Phase to address:**
Phase that adds commit ID parsing to the release ingestion endpoint and the authoring UI.

---

### Pitfall 6: N+1 Query on Bug/Feature Detail Release Lookup

**What goes wrong:**
The bug/feature detail page needs to show "Released in vX.Y dev / vA.B prod." The naive approach: for each bug/feature row, issue a separate query to `release_logs` to find releases containing that bug's ID. If the list page renders 50 bugs, that is 50 additional queries. At 6 projects × 50 items = 300 extra queries per admin page load.

**Why it happens:**
The linkage table doesn't exist yet. v2.1 needs to introduce either (a) a `release_items` join table (`release_id, entity_type, entity_id`) or (b) an array column on `release_logs` (bad — not queryable). Without a join table, lookups are forced to scan `release_logs.entries` jsonb for each entity, which is a `WHERE entries @> '[{"bugId": "..."}]'` query that requires a GIN index and is slower than a FK join.

**How to avoid:**
- Create a `release_items` join table: `(id, release_id FK, entity_type varchar(16), entity_id uuid)` with an index on `(entity_type, entity_id)`. This enables efficient reverse lookup: "all releases that include BUG-xxx" in one query.
- On the list page, fetch all entity IDs in the current page, then issue one `inArray(release_items.entityId, entityIds)` query to get all linkages, then join in memory. This is the exact pattern already used in `page.tsx` for `prodByVersion` (see the `inArray(releaseLogs.version, versions)` pattern in the releases page).
- Do not add the join table as an afterthought; build it in the same phase that introduces the linkage authoring UI.

**Warning signs:**
- Server log shows `SELECT * FROM release_logs WHERE...` repeating with a different entity_id per line.
- Admin bug list page takes >500ms at 50 rows.

**Phase to address:**
Phase that introduces bug/feature ↔ release linkage. Schema migration for `release_items` must come before the UI.

---

### Pitfall 7: Stale Release Data in Bug/Feature Detail After Linkage Update

**What goes wrong:**
A staff member links a bug to a release via the authoring UI. The bug detail page was server-rendered 2 minutes ago and is still showing "Not yet released." The customer opens the same page in a new tab and sees the link; the staff member's tab does not. There is no invalidation signal.

**Why it happens:**
Next.js App Router server components cache by default. The bug detail page fetches release linkage data at render time. After a `POST` to create a link, the page does not automatically revalidate unless `revalidatePath` or `revalidateTag` is called from the API route, and that only clears the Next.js router cache — not a full browser cache or another user's tab.

**How to avoid:**
- Call `revalidatePath('/admin/modules/bug-reports/[id]')` and `revalidatePath('/admin/modules/feature-requests/[id]')` from the link-creation API route.
- On the client side, after a successful link POST, navigate to `router.refresh()` (App Router) to trigger a fresh server render for the current tab.
- Do not show "stale data" warnings — just ensure the mutating endpoint always revalidates the affected paths. This is standard App Router practice.

**Warning signs:**
- Staff manually refreshing detail pages after linking.
- Data inconsistency between tabs for the same user.

**Phase to address:**
Same phase as the linkage authoring UI.

---

### Pitfall 8: Pipeline Dashboard "Latest per Env per Project" Query Correctness

**What goes wrong:**
The admin home "prod/dev side-by-side" view needs `MAX(deployed_at)` per `(project, env)`. The naive query `SELECT project, env, MAX(deployed_at) FROM release_logs GROUP BY project, env` returns the timestamp but not the version or status. A second query fetches the row matching those values — but two releases can have identical `deployed_at` (both null, or CI deploys within the same second). The wrong row is selected. Worse: for projects with no dev deploy yet (new project, or all dev releases backfilled to `env=NULL`), the `dev` row is absent, and the join returns null — the dashboard must not show "no data" when the project exists.

**Why it happens:**
The `deployed_at` column is nullable (legacy rows). `releasedAt` is the non-nullable fallback, but the existing coalesce pattern (`coalesce(deployed_at, released_at)`) is used in the releases page but not necessarily in a dashboard query that hasn't been written yet. The `env` column is also nullable for legacy rows (backfilled to `'dev'` but only for rows inserted after v1.14.0 migration).

**How to avoid:**
- Use a `DISTINCT ON (project, env)` query (CockroachDB/Postgres idiom) ordered by `coalesce(deployed_at, released_at) DESC nulls last` — this is a single-pass, correct query that handles nulls and ties without a subquery.
- Handle the "no dev row" case explicitly: return a sentinel object `{ version: null, deployedAt: null }` for projects with no dev releases, and display "--" in the UI rather than hiding the project.
- Filter legacy null-env rows out of the dashboard query: `WHERE env IN ('dev', 'prod')` — do not let a null-env legacy row appear as the "latest" for a project.
- Index: add a composite index on `(project, env, deployed_at DESC)` in the same migration phase. Without it, this query full-scans `release_logs` at every dashboard load.

**Warning signs:**
- Dashboard shows wrong version for a project after a fast redeploy.
- New project appears with a dev version of an older project that shares a name prefix.
- Dashboard query appears in slow query logs.

**Phase to address:**
Phase that adds the admin home pipeline widget. The index migration must ship before the query.

---

### Pitfall 9: URL State vs In-Memory State for Filter UI

**What goes wrong:**
The customer release page filter (by type: bug fix / feature / other) is implemented as in-memory React state. The customer filters to "Bug Fixes," shares the URL with a colleague, and the colleague lands on the default unfiltered view. Alternatively, the filter is in the URL (`?type=bug`) but the component re-fetches from the server on every filter change, causing a loading flash between filter clicks.

**Why it happens:**
Two common approaches conflict: (1) URL params = shareable/bookmarkable but require either server re-renders or client-side fetch on every param change. (2) In-memory state = instant but not shareable. Projects that start with approach 2 accumulate "why can't I link to this view?" requests.

The existing `slack-audit` page uses URL params (already a precedent in this codebase: `useSearchParams` reading `action_id`, `actor_email`, `date` from/to — see `SlackAuditClient.tsx`). Follow that pattern.

**How to avoid:**
- Use URL params for all filter dimensions (`?type=bug&status=dev`).
- Keep all release data client-side after initial server load (the page already fetches all releases for the project page-by-page); filter client-side using `useMemo` over the flat releases array — no server round-trip on filter change.
- Use `useRouter` + `router.replace` (shallow) to write filter state to the URL without causing a server render.
- Avoid `useEffect` watching filter state to trigger fetches — that creates a loading flash.

**Warning signs:**
- Filter state lost on browser back navigation.
- Filter changes cause visible loading spinners.
- User files a support request asking for a link to the filtered view.

**Phase to address:**
Phase that adds the customer page filter. Must decide URL-vs-memory at the start; retrofitting is expensive.

---

### Pitfall 10: Discoverability Clutter from Over-Linking

**What goes wrong:**
Every admin project tile links to the release page. Every bug report row has a "Released In" link. Every pipeline dashboard cell links to the per-project pipeline page. The admin sidebar gains new entries. Navigation paths multiply. Staff stop knowing the "canonical" way to reach a page. Customer page gains a branch selector, a type filter, a promote button, and a "what's changed" section — all competing for visual attention on a page that today has a clean linear flow.

**Why it happens:**
Each feature is added independently by its phase. No phase owns "nav holistic review." The DB-driven nav system (`menu_pages`) makes it easy to add entries but doesn't enforce total count limits or grouping discipline.

**How to avoid:**
- Reserve one phase (or a sub-task of the final phase) as a navigation/discoverability review.
- Admin project tile links: one link per tile to the per-project pipeline page (not to the releases page directly — the pipeline page contains the release section). Do not add multiple links from a single tile.
- Customer page additions (branch selector, filter, promote button, what's changed) must be progressive disclosure: default view = current clean list; new features revealed by explicit interaction or below a fold. Do not front-load all of them at once.
- Sidebar: no new top-level menu sections for v2.1. Any new admin pages go under the existing "Projects" or "Release Logs" sections via `menu_subpages`.
- Avoid adding nav entries via `seed-slack-audit-nav.sql`-style scripts unless the page is staff-only and truly administrative. Customer-facing nav is managed differently.

**Warning signs:**
- Admin sidebar has more than 3 entries per section.
- Customer release page has more than 4 interactive controls above the fold.
- Staff asks "where do I find the pipeline view?" — means the discovery path is broken.

**Phase to address:**
Final integration phase of v2.1. Not a first-phase concern, but must be planned for explicitly.

---

### Pitfall 11: Structural Mutations to /admin Tree, Auth, or Column Meaning

**What goes wrong:**
v2.1 adds new admin pages under `/admin/`. A developer renames or restructures existing routes (e.g., moves `/admin/modules/release-logs` to `/admin/platform/releases`) to create a "cleaner" URL structure. Existing bookmarks break. DB-nav rows point to dead paths. The DB-driven menu (`menu_pages.path`) shows 404s for every affected link until SQL seeds are manually re-run.

Separately: a developer changes the meaning of a column silently. For example, repurposing `release_logs.status` to add a new value `'swapping'` for branch-swap in-progress, without documenting the expanded enum or updating all consumers that switch on status.

**Why it happens:**
Large existing apps accumulate "just one more cleanup" temptations when adding features. The DB-driven nav and status enums make it especially dangerous: the schema doesn't enforce the enum values (the schema comment says "no CHECK constraint per RESEARCH.md"), so adding a new value silently works until a consumer breaks.

**How to avoid:**
- New routes go under new paths. Never move existing routes in v2.1.
- Do not add new status values to `release_logs.status`. If branch-swap state needs tracking, add a separate column (`metadata.swapState`) or a new table (`dev_swap_state`), not a new status enum value that existing status-badge rendering in `ReleasesClient.tsx` won't know about.
- Do not restructure `/admin` URL tree.
- Do not modify `authOptions` in `auth.ts` or the membership query in `auth-context.ts`.
- All new `menu_pages` rows get unique path strings that don't conflict with any existing row in the nav seed scripts.

**Warning signs:**
- A grep for the old path still shows references after renaming.
- `STATUS_BADGE_COLORS` in `ReleasesClient.tsx` shows `undefined` for a new status value (renders as no badge styling).
- A test that was passing starts failing after what looked like a minor route change.

**Phase to address:**
All phases. This is a standing constraint, not a single-phase concern.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Implement branch swap without DB lock flag | Faster to ship | Race condition between CI push and customer swap causes wrong branch in preview | Never |
| Render commit message content without sanitization | Less code | XSS or Slack injection via malicious commit messages | Never |
| Use `release_logs.status` for swap in-progress state | No new column | Breaks all consumers of the existing status enum; `STATUS_BADGE_COLORS` renders blank | Never |
| Filter releases in-memory with no URL state | No router complexity | Unshearable links; state lost on back navigation | Only if product decision is "no sharing" |
| Skip the `release_items` join table, use jsonb scan | No migration needed | N+1 queries or GIN index scans at page load | Only for a very small dataset (< 100 releases total) — not this app |
| Add web promote without unique constraint on approvals | Faster to ship | Double-promote race on simultaneous web + Slack click | Never |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Firebase App Hosting branch swap | Call `rollouts:create` and return 200 immediately | Poll rollout status until terminal state; record in-progress flag in DB |
| Firebase App Hosting (existing) | Use `--config apphosting.prod.yaml` flag on CLI | Per v2.0 Pitfall-1 burn: prod overlay uses `apphosting.yaml` base + `apphosting.prod.yaml` overlay; the `--config` flag does not exist on the CLI |
| FAH x-forwarded-host | Read `host` header for hostname routing | FAH fronts Cloud Run as proxy; `host` returns the internal Cloud Run hostname; use `x-forwarded-host` (burned in v2.0) |
| Next.js middleware (proxy.ts) | Use middleware manifest for hostname routing | Middleware manifest stays empty with custom filename `proxy.ts`; actual hostname routing requires server-component guards in page/layout (burned in v2.0) |
| Slack + web promote together | Fire both paths' Slack messages independently | The single `promoteAndAudit()` function already posts Slack; web promote must call the same function, not add a second Slack post |
| CockroachDB `DISTINCT ON` | Use `GROUP BY + subquery` pattern from SQL training data | CockroachDB supports `DISTINCT ON` (PostgreSQL syntax); it's the correct single-pass idiom for "latest per group" |
| Drizzle `jsonb_set` for metadata patches | Replace entire `metadata` column | Use `sql\`jsonb_set(COALESCE(${table.metadata}, '{}'), '{key}', ${val}::jsonb, true)\`` pattern — already established in `release-promotion.ts` |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Dashboard query without `(project, env, deployed_at DESC)` index | Slow admin home load at 10+ projects × 100+ releases | Add composite index in migration before shipping dashboard widget | > 1000 release_log rows |
| Bug/feature detail release lookup without join table | 50+ DB queries per admin bug list page load | Create `release_items` join table; batch lookups with `inArray` | > 10 bugs on a page |
| Commit message parsing on every ingest request | Slow release ingest webhook; CI appears to hang | Parse once on ingest; store parsed IDs in `release_items`; never re-parse on read | Every release ingest |
| `findMany` with nested `with` on large release sets | Drizzle relational query generates a correlated subquery per row for feedback + approvals | Already using `limit: PAGE_SIZE + 1` pattern — preserve it; never remove the limit | > 50 releases per page load |
| Polling FAH rollout status in a synchronous Next.js API route | Route times out (Vercel 10s / Cloud Run default 60s) | Use background job / server-sent events / client-side polling from the UI | Always — do not poll synchronously in a route handler |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Rendering commit message content via `dangerouslySetInnerHTML` | XSS via malicious commit messages | Use plain text rendering; sanitize before display |
| Passing raw commit message to Slack via `postSlackThreadedReply` | Slack channel mention injection (`<!channel>`), mrkdwn injection | Strip/escape Slack mrkdwn control characters before passing to Slack API |
| Branch name user-input passed unsanitized to Firebase CLI | Command injection if shell-executed; or corrupted FAH backend name | Validate branch name against `^[a-zA-Z0-9/_.-]{1,256}$`; use FAH REST API via MCP rather than CLI shell-out |
| Web promote endpoint without re-checking membership + role | A re-used session after membership revocation could still promote | Membership check is per-request in `approve/route.ts` already — preserve this; do not cache membership in client state for promote |
| Exposing dev backend hostname in customer page | Customer can directly hit the dev backend and bypass the gating UI | Dev backend URL is already surfaced as `metadata.previewUrl`; this is intentional by product decision. Document it; don't treat it as a bug |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Showing the branch swap button with no loading/locked state during an in-flight swap | Customer clicks twice; two swap requests race | Disable all swap buttons and show "Deploying branch X..." status badge while swap is in progress |
| Promote button visible to viewers | Viewer clicks, gets a 403, confusing error | Same role guard as approve button: `userRole === 'admin'` gate before rendering Promote |
| "What's changed" section always expanded on customer page | Overwhelms the page; primary action (approve) buried | Default collapsed; customer expands intentionally |
| Bidirectional bug/release linkage shows every release that touched a bug | A bug linked to 6 releases across branches is noisy | Group by `env`: show "dev: vX.Y (feat/audio)" and "prod: vA.B (main)"; only the two most recent per env |
| Filter state reset when customer paginates (load more) | Customer filters to "Bug Fixes," loads more, filter resets | Filter is applied client-side after load-more appends to flat list; filter state is not reset by pagination — must be preserved in URL params |

---

## "Looks Done But Isn't" Checklist

- [ ] **Branch swap:** Rollout status is polled to terminal state, not just fire-and-forget — verify by checking FAH console after a swap
- [ ] **Double-promote guard:** Unique constraint on `(release_id, decision='approved')` exists in migration AND is tested with a concurrent-approval test — verify with `\d release_approvals` in CRDB shell
- [ ] **Web + Slack promote both post Slack:** Verify by clicking web Promote on a test release and checking that exactly ONE Slack thread reply appears (not two)
- [ ] **Commit ID parser:** Every matched ID is validated against DB before being surfaced — verify by inserting a commit message with `BUG-00000000` and confirming no phantom link appears
- [ ] **N+1 query:** Bug list page with 50 rows shows < 10 DB queries in server logs — verify with `DEBUG=drizzle:*` or pg query logging
- [ ] **Discoverability review:** After all phases complete, open the admin in incognito, navigate only from the home page, and confirm every new v2.1 feature is reachable within 3 clicks

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| FAH swap race leaves wrong branch deployed | MEDIUM | Manually trigger swap to correct branch via Firebase MCP or console; update `metadata.previewBranch` in DB via admin script |
| Double-promote fires two GitHub Actions runs | MEDIUM | Cancel the second run via GitHub Actions UI; check promote_attempts for duplicate; add the unique constraint that was missing |
| False-positive commit ID links polluted release_items | LOW | Delete rows from `release_items` where `entity_id` not in `bug_reports` or `feature_requests`; rebuild parser with tighter regex |
| Route rename breaks DB-driven nav | LOW | Update `menu_pages.path` rows via SQL; no code change needed |
| Unguarded promote button visible to viewers | LOW | Add `userRole === 'admin'` gate in JSX; deploy patch |
| Status enum value added silently breaks badge rendering | HIGH | Revert the schema change; add the value to `STATUS_BADGE_COLORS` and all other consumers before re-shipping |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| FAH swap concurrency race | Branch swap UI phase | Integration test: CI push during in-progress swap doesn't change `metadata.previewBranch` |
| FAH rollout stuck in PENDING | Branch swap UI phase | Manual test: trigger swap to a branch with a build error; confirm error state surfaced and flag cleared |
| Double-promote web + Slack | Web Promote button phase | Concurrent-promotion test; check `promote_attempts` for duplicate entries |
| Audit trail split web/Slack | Web Promote button phase | Code review: only one source writes to each audit table |
| Commit parsing false positives | Release linkage phase | Unit test: commit messages with common text don't produce links; DB validates IDs |
| Commit message Slack injection | Release linkage phase | Test: commit message with `<!channel>` doesn't trigger Slack mention |
| N+1 release lookup | Release linkage phase | `release_items` join table present in schema before UI ships |
| Stale detail page data | Release linkage phase | `revalidatePath` called in link-creation API route |
| Dashboard query correctness | Pipeline dashboard phase | Query tested with: null-env legacy rows, projects with no dev deploy, tied deployed_at values |
| Filter URL state | Customer filter phase | Filter state survives browser back; URL params readable on direct link |
| Nav clutter | Final integration phase | Navigation audit: every new feature reachable in ≤ 3 clicks from home |
| Structural mutations | All phases | Standing code review constraint: no route moves, no status enum additions without full consumer audit |

---

## Sources

- Project burn log: `PROJECT.md` milestone context (FAH `--config` flag non-existence, x-forwarded-host, middleware-manifest empty state)
- Codebase inspection: `src/lib/release-actions.ts` (optimistic status check pattern)
- Codebase inspection: `src/lib/release-promotion.ts` (promoteAndAudit fire-and-forget pattern)
- Codebase inspection: `src/app/projects/[slug]/releases/page.tsx` (inArray batch pattern, prodByVersion join)
- Codebase inspection: `src/db/schema.ts` (status enum comment "no CHECK constraint", nullable env/deployed_at)
- Codebase inspection: `src/app/projects/[slug]/releases/ReleasesClient.tsx` (STATUS_BADGE_COLORS, swap in-progress state gap)
- Codebase inspection: `src/app/admin/platform/slack-audit/SlackAuditClient.tsx` (URL params filter precedent)
- Project constraints: v2.1 user decisions (branch preview = selector, promote = both web+Slack, tracker = bidirectional)

---
*Pitfalls research for: Adding Pipeline UI to Triarch Dev Admin (v2.1)*
*Researched: 2026-05-07*
