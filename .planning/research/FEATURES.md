# Feature Research

**Domain:** CI/CD Pipeline UI — Release gating and visibility surfaces for a dev→prod promotion console
**Researched:** 2026-05-07
**Confidence:** HIGH (established patterns from Vercel, GitHub Actions, Netlify, Heroku, Sentry, Linear all verified via official docs)

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features that a pipeline UI needs to not feel broken or incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Per-project prod version + dev version side-by-side | Every modern deploy dashboard (Vercel, Netlify, Heroku) shows env status at a glance; missing = must leave admin to know state | LOW | Read from `release_logs` WHERE env='prod'/'dev' ORDER BY deployed_at DESC LIMIT 1 per project; no new tables needed |
| Last-deploy timestamp per env | Operators need "how stale is dev vs prod"; Heroku tiles show "most recent deployment" | LOW | Same query as above; `deployed_at` already in `release_logs` |
| Pending-approval count badge | Vercel/Netlify both surface "needs action" indicators on project tiles; missing = operators miss backlog | LOW | COUNT from `release_approvals` WHERE status='pending'; existing table |
| Clickable tile → project releases page | Every dashboard tile is a navigation surface; non-clickable tiles feel like a dead end | LOW | Already noted as discoverability fix in PROJECT.md; pure routing change |
| Branch label on each RC row | Netlify deploy list shows branch per row; users need to know which branch is pending | LOW | Already in `release_logs.branch`; display change only |
| Deploy status pill (pending / approved / promoted / conflict) | GitHub Actions, Netlify both surface status per row via color-coded pills | LOW | Derived from existing `release_logs.status` + `release_approvals` |
| Promote button disabled state with reason | GitHub Actions shows "waiting for approval" with explanation; Vercel shows staged/promoted state; missing reason = confusion | LOW | Conditional rendering + tooltip; no backend change |
| "What's changed" section header on customer release page | Every release tool (Sentry, Linear, GitHub Releases) surfaces a diff or summary at top; users expect to see delta before approving | MEDIUM | Requires comparing dev release log entries to last prod deployed_at; cross-query but no new tables |

### Differentiators (Competitive Advantage)

Features that go beyond what Vercel/Netlify/Heroku offer — meaningful for this domain because the user is a customer gating releases, not an engineer deploying code.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Branch preview selector on customer release page | Vercel/Netlify give each PR its own URL (different model); this system has one shared dev backend per project, so the selector is the unique primitive. Lets customers validate any RC branch without needing admin involvement | MEDIUM | Requires: (1) Firebase App Hosting API call to swap deployed branch, (2) concurrency lock row in DB or `release_logs` metadata, (3) disabled state on competing RCs |
| Web-UI Promote to prod button (staff role) | Vercel has this but requires navigating to Deployments tab and using ellipsis menu; Linear does not offer it; Sentry does not offer it. Here it's on the same customer-visible release page the customer already approved — co-locating action with evidence reduces context switching for staff | MEDIUM | Calls existing `dispatchWorkflow` (same as Slack path); needs staff-role guard; confirm modal required |
| Bug/feature ID auto-detection from commit messages | Sentry does commit-level linking but requires SDK integration; Linear does it via CI integration. Here it's built directly into release ingestion for the specific `#BUG-123` / `FEAT-45` / `closes #99` patterns in use — no third-party dependency | MEDIUM | Regex parse on `release_logs.commit_sha` messages at ingest time OR on a separate commit-message field; requires join table `release_item_links(release_id, item_type, item_id)` — NEW table |
| "Released in vX.Y dev / vA.B prod" badge on bug/feature detail | Jira has Fix Version field (manual); Sentry has "first seen in release" (error-only); Linear shows release in sidebar (requires their CI integration). Ours is automatic from the linkage above, and spans both envs — customer-visible too | LOW | Once `release_item_links` table exists, this is a join query on the bug/feature detail page; display only |
| Filter by type on customer release page (bug fix / feature / other) | Linear allows filtering releases by issue type; Sentry does not; Netlify/Vercel show no such filter. For a customer release gating page this lets the approver focus on "what bugs got fixed" before approving | LOW | Once items have type classification (from `bug_reports` / `feature_requests` linkage), add filter chips above the RC list; no new tables |
| Branch swap lock with actor + timestamp | Azure DevOps has deployment slot locks; Heroku does not expose this in UI; Vercel/Netlify have per-PR URLs so no conflict. The shared-slot model requires knowing who locked it and when — unique to this architecture | LOW | Store `current_preview_branch`, `preview_locked_by`, `preview_locked_at` on `projects` table OR in `release_logs` metadata; display as banner "Previewing feat/payments (locked by alice@, 3 min ago)" |

### Anti-Features (Explicitly NOT Building)

These are things Vercel, Netlify, and Heroku do that would be wrong for this system.

| Feature | Why Requested | Why This System Should NOT Build It | What to Do Instead |
|---------|---------------|-------------------------------------|--------------------|
| Per-branch ephemeral backend URLs | Vercel/Netlify give each PR its own preview URL; feels like "best practice" | The architecture decision was already made: one shared dev backend per project, branch-swap selector model. Ephemeral URLs require Firebase App Hosting provisioning per branch (slow, costly, quota-limited) and the customer would need to manage N URLs per project | The "Preview this branch" selector on the customer page IS the equivalent — use it |
| Real-time deploy log streaming | Vercel/Netlify both stream build logs live; feels like completeness | Build logs live in GitHub Actions, not in this system. This admin is a monitoring surface, not a build runner. Streaming would require webhook ingest of every log line and a WebSocket connection — massive complexity for marginal value | Link directly to the GitHub Actions run URL (already available via `metadata.dispatch`) — one click gets you to the real log |
| Automatic per-commit deploys to dev | Netlify/Vercel auto-deploy every commit; feels like standard CI | This system triggers and monitors — it does not run pipelines. Auto-deploy is handled by shared-workflows. Adding a trigger button here creates a second path that can diverge | Leave trigger ownership in shared-workflows; the admin surfaces the result |
| Rollback button | Vercel Instant Rollback is a marquee feature; users ask for it | Firebase App Hosting does not support "deploy a past artifact" without a new workflow dispatch. A fake rollback button that just re-triggers the old branch would be confusing and potentially dangerous if the branch has moved | Surface the last-promoted SHA in the "what's changed" view and document the manual procedure in docs |
| Notification / alert configuration UI | Vercel has a Notifications settings panel; feels like admin polish | This system's notification path is Slack, and the Slack wiring is established (OttoBot). A second notification settings surface would duplicate and potentially conflict | Slack channel config stays in the project registry; no new UI needed |
| "type project name to confirm" delete-style modals | GitLab uses this for high-severity destructive actions; feels safe | Promote-to-prod is consequential but reversible (you can promote a different branch) and happens frequently. Typing friction on a routine action breaks flow and conditions users to type without reading | Use a two-step modal: (1) show what will be promoted (branch, version, domains affected), (2) single confirm button labeled "Promote [branch] to production" — matches the existing two-step Approve UX customers already know |

---

## Feature Dependencies

```
Pipeline Dashboard Tile
    └──reads──> release_logs (prod + dev latest) [EXISTS]
    └──reads──> release_approvals (pending count) [EXISTS]
    └──links──> /projects/[slug]/releases [EXISTS]

Branch Preview Selector
    └──requires──> Firebase App Hosting branch-swap API call [NEW integration]
    └──requires──> Branch lock state on projects table [NEW column(s)]
    └──reads──> release_logs.branch (which RCs exist) [EXISTS]

Web-UI Promote Button
    └──requires──> Staff role guard [EXISTS via project_members]
    └──calls──> dispatchWorkflow (same as Slack path) [EXISTS]
    └──requires──> Confirm modal with branch/version/domain context [NEW UI]
    └──posts──> Slack notification (existing notifyReleaseApproved path) [EXISTS]

Bug/Feature Linkage (release_item_links)
    └──requires──> NEW join table: release_item_links(release_id, item_type, item_id)
    └──populated by──> Commit message parser at ingest time [NEW logic in /api/platform/ingest]
    └──displayed on──> bug_reports detail page [NEW UI: "Released in"]
    └──displayed on──> feature_requests detail page [NEW UI: "Released in"]
    └──filters──> Customer release page RC entry list [NEW filter chips]

What's Changed View
    └──requires──> release_logs entries between last prod deploy and now [EXISTS, query only]
    └──compact form on──> Admin pipeline dashboard tile [NEW UI]
    └──expanded form on──> Per-project admin pipeline page [NEW page]
    └──summary section on──> Customer release page [NEW UI section]
    └──enhanced by──> Bug/Feature linkage (shows "3 bug fixes, 2 features") [DEPENDS ON release_item_links]
```

### Dependency Notes

- **Branch Preview Selector requires Firebase API integration**: Firebase App Hosting REST API or gcloud CLI wrapper must be callable from the Next.js server action. This is the highest-risk integration in the milestone — needs feasibility verification.
- **Bug/Feature Linkage requires new table first**: `release_item_links` must exist before any of the display surfaces (detail pages, customer filter) can be built. Phase ordering must put table creation before UI.
- **Web-UI Promote is additive**: It calls the same `dispatchWorkflow` and `notifyReleaseApproved` already wired for Slack. Zero new backend logic needed beyond the server action wrapper and role check.
- **What's Changed requires no schema changes**: It's a query against existing `release_logs` rows filtered by `project`, `env`, and `deployed_at`. Pure display work.

---

## MVP Definition

### v2.1 Launch With

These are the core features that make the pipeline legible and operable from the web, per the PROJECT.md goal statement.

- [ ] Pipeline dashboard tile: prod version, dev version, pending-approval count, last-deploy timestamp, link to releases page — *eliminates the "must check Slack" workflow*
- [ ] "What's changed" compact summary on admin dashboard tile — *answers "is dev ahead of prod" at a glance*
- [ ] Branch preview selector on customer release page with lock/disable state — *the primary customer-facing new capability*
- [ ] Web-UI Promote button (staff) with two-step modal — *closes the last manual Slack-only action loop*
- [ ] `release_item_links` table + commit message parser at ingest — *foundation for linkage features*
- [ ] "Released in vX.Y dev / vA.B prod" badge on bug and feature detail pages — *immediate payoff from linkage table*

### Add After Validation (v2.1.x)

- [ ] Customer release page filter by entry type (bug fix / feature / other) — *add once linkage table has real data to filter*
- [ ] Per-project admin pipeline page (full expanded what's-changed + deploy history) — *useful but not blocking day-1 workflows*
- [ ] Authoring UI for manual bug/feature ID add/remove on release entries — *helpful once auto-detection is live and staff want to correct it*

### Future Consideration (v2.2+)

- [ ] GitHub Actions run link surfaced from release row — *nice-to-have trace but not blocking operations*
- [ ] Branch swap history log (who previewed what, when) — *audit trail useful after adoption*

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Admin pipeline dashboard tile (prod/dev versions + badge) | HIGH | LOW | P1 |
| "What's changed" compact on dashboard | HIGH | LOW | P1 |
| Branch preview selector + lock | HIGH | MEDIUM | P1 |
| Web-UI Promote button + modal | HIGH | MEDIUM | P1 |
| `release_item_links` table + ingest parser | MEDIUM | MEDIUM | P1 (foundation) |
| "Released in" badge on bug/feature detail | MEDIUM | LOW | P1 (depends on above) |
| Customer page filter by type | MEDIUM | LOW | P2 |
| Per-project admin pipeline page (expanded view) | MEDIUM | MEDIUM | P2 |
| Manual bug/feature ID authoring UI | LOW | MEDIUM | P3 |

---

## Competitor Feature Analysis — Specific Questions

### 1. Pipeline-at-a-glance: What info density per project tile?

| Data Point | Vercel | Netlify | Heroku | Our Approach |
|------------|--------|---------|--------|--------------|
| Production screenshot/preview | YES (added 2026) | NO | NO | NO — too heavy for a dev ops tool |
| Production version/commit | Implied (production deployment link) | Deploy ID shown | "Most recent deployment" shown | Explicit semver (e.g., v1.4.2) from `release_logs` |
| Dev/staging version | Not on tile (click through) | Not on tile | Not on tile | YES — show side by side; this is the core differentiator |
| Last deploy timestamp | Not on tile | Not on tile | Yes (app tile) | YES — relative time ("3 hours ago") |
| Pending actions badge | Not on tile | NOT shown | NOT shown | YES — pending approval count is the key operational signal |
| Branch being deployed | Not on tile | Not on tile | Not on tile | Show dev branch name under dev version |
| Link to detail | YES (tile is link) | YES | YES | YES — full tile is clickable |

**Recommendation:** Show 6 data points per tile: project name, prod version + deployed_at, dev version + branch + deployed_at, pending approvals badge. Keep tile compact — one card row, not a status board. Progressive detail via click-through.

### 2. Branch Preview UX — Shared Slot, Selector Model

No reference platform does the shared-slot selector model because all major platforms (Vercel, Netlify) provision per-branch URLs. The closest analogy is **Azure App Service deployment slots** (fixed number of slots, swap operation) and **Heroku staging-to-prod promotion** (single staging app, manual swap).

From those patterns:
- Show currently-previewing branch prominently (banner: "Previewing feat/x since 14:22")
- Disable other RC rows with tooltip: "feat/payments-v2 currently previewing (locked by alice, 3 min ago)"
- While swap is in-flight: disable ALL RCs with "Branch swap in progress…" spinner state
- Swap should complete in ~30s (Firebase App Hosting deploy); optimistic UI with polling is appropriate
- Who can swap: match the existing approve permission (customer admin role for the project)

**Anti-pattern to avoid:** Do not show a modal asking "Are you sure you want to preview this branch?" — previewing is low-stakes (no prod impact) and adding friction kills the UX. Just swap immediately with a visible loading state.

### 3. Promote-from-Web Confirm UX

Vercel's flow: Deployments tab → ellipsis menu → "Promote to Production" → popup showing which domains will be affected → single "Promote to Production" button.

GitHub Actions: Job pauses, reviewer gets notification, navigates to run, sees pending job → optional comment field → "Approve and deploy" button.

GitLab pattern: Medium-severity action = additional step (dropdown requiring multiple clicks), NOT type-to-confirm.

**Our recommendation:** Two-step modal, matching the existing customer Approve UX:
1. Button label: "Promote to production" (on the RC row, staff-only)
2. Modal shows: branch name, version, what-changed summary (N entries), last approved by, "This will trigger the GitHub Actions promote-branch workflow and post to Slack."
3. Single confirm button labeled "Promote [branch] v[version] to production" — specific label forces reading
4. On click: dispatch workflow, immediately show "Promotion dispatched — check Slack for status" inline (no navigation away)

**Do not use:** Type-to-confirm (routine action, too much friction). Do not use: checkbox "I understand this will…" (patronizing for staff who do this regularly).

### 4. Tracker Linkage — "Released in" Notation

Jira: "Fix Version" field in issue sidebar, shows version label with released/unreleased badge.

Linear: Release shown in issue properties sidebar; release detail page shows associated issues grouped by release.

Sentry: Issue detail shows "first seen in release vX.Y.Z" and "resolved in release vA.B.C" — two distinct data points.

**Our recommendation:** On bug/feature detail pages, add a "Releases" section in the detail sidebar with:
- "Dev: v1.4.2 (feat/payments, 3 days ago)" if linked to a dev release
- "Prod: v1.3.0 (2 weeks ago)" if linked to a promoted release
- "Not yet released" if linked to no release

On customer release page, filter chips above the RC list: **All | Bug fixes | Features | Other** — chips show counts (e.g., "Bug fixes (3)"). Default to "All". This matches Linear's issue type filter pattern.

### 5. What's-Changed Display — Compact vs Expanded

Sentry: Release detail shows commit list with author + sha + message, grouped by type.
GitHub Releases: Markdown body (manual or auto-generated from PR titles), compact on the releases list, expanded on click.
Netlify: No native diff view — links to GitHub.
Vercel: No native diff view — links to GitHub.
Linear: Release notes auto-generated from associated issues, grouped by type.

**Our recommendation — two contexts:**

**Compact (admin dashboard tile, customer page header):** Single-line summary — "4 entries since last prod deploy: 2 bug fixes, 1 feature, 1 other." Link to expanded view. No timestamps. No authors. Fits in a tile without overflow.

**Expanded (per-project pipeline page, customer page "What's Changed" section):** Table with columns: Type (pill), Title/message, Branch, Author, Date. Grouped by bug fixes first, then features, then other. Entries link to their bug/feature detail page if linked; plain text if unlinked. No commit SHA shown (too technical for customer context).

---

## Sources

- [Vercel Promoting Deployments](https://vercel.com/docs/deployments/promoting-a-deployment) — HIGH confidence (official docs, updated 2026-02-27)
- [Vercel Managing Deployments](https://vercel.com/docs/deployments/managing-deployments) — HIGH confidence (official docs, updated 2026-02-27)
- [Vercel Projects Overview](https://vercel.com/docs/projects) — HIGH confidence (official docs, updated 2026-02-26)
- [GitHub Actions: Reviewing Deployments](https://docs.github.com/en/actions/managing-workflow-runs/reviewing-deployments) — HIGH confidence (official docs)
- [Heroku Review Apps](https://devcenter.heroku.com/articles/github-integration-review-apps) — HIGH confidence (official docs)
- [Sentry Releases](https://docs.sentry.io/product/releases/) — HIGH confidence (official docs)
- [Linear Releases](https://linear.app/docs/releases) — HIGH confidence (official docs)
- [GitLab Destructive Actions Pattern](https://design.gitlab.com/patterns/destructive-actions/) — HIGH confidence (official design system)
- [Netlify Deploy Overview](https://docs.netlify.com/deploy/manage-deploys/manage-deploys-overview/) — HIGH confidence (official docs)
- [NN/G Confirmation Dialogs](https://www.nngroup.com/articles/confirmation-dialog/) — HIGH confidence (authoritative UX research)

---

*Feature research for: Triarch Dev Admin v2.1 Pipeline UI*
*Researched: 2026-05-07*
