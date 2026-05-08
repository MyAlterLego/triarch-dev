# Phase 13: Branch Preview Swap - Context

**Gathered:** 2026-05-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Customer admins can click "Preview this branch" on any RC on the customer release page, triggering a Firebase App Hosting rollout that swaps the dev backend's deployed branch. Concurrency lock prevents simultaneous swaps within the same project. SWR polling at 5s tracks rollout state until terminal (SUCCEEDED / FAILED) with 8-min timeout. Lock auto-clears on terminal state.

**Delivers:** PREV-02, PREV-03, PREV-04, PREV-05, PREV-06.
**Does NOT deliver:** customer page filter chips (Phase 14), the branch swap UI fully wired into release page header (deferred to Phase 14 integration).

</domain>

<decisions>
## Implementation Decisions

### Auth Architecture (from RESEARCH.md)

- Service account `release-promoter@triarch-vault.iam.gserviceaccount.com` (operational setup outside this phase — Mike provisions)
- IAM grants on each project's FAH backend: `firebaseapphosting.rollouts.create`, `.builds.get`, `.rollouts.get`
- SA key stored as Firebase secret `FAH_PROMOTER_SA_KEY` in `triarch-dev-website` project
- JWT auth library: `jose` (already in admin's deps)
- Access token cached for 50 min (mirrors existing GitHub App pattern)

### New Lib: src/lib/fah-rollout.ts

- Exports `createFahRollout({ projectId, location, backendId, branch }): Promise<{ rolloutId, state }>` — POSTs to FAH REST API
- Exports `getFahRolloutState(rolloutResourcePath): Promise<{ state, build_state, error_message? }>` — GETs rollout
- Exports `mintFahAccessToken(): Promise<string>` — JWT sign → exchange → cache
- All wrapped in `try/catch` with structured error returns (don't throw across module boundaries)

### New API Route: POST /api/projects/[slug]/branch/preview

- **Auth**: customer admin role on this project (existing `getCurrentUserContext` membership check); staff override always works
- **Request body**: `{ branch: string }`
- **Logic**:
  1. Acquire DB lock: atomic `UPDATE projects SET preview_branch_locked=$branch, preview_branch_locked_at=now() WHERE key=$slug AND preview_branch_locked IS NULL RETURNING ...`
  2. If lock not acquired (loser): return **409 Conflict** with current lock holder + acquired_at
  3. If lock acquired: call `createFahRollout()` with the project's `dev` FAH backend (e.g. `tmi-dev`, `darksouls-dev`); on FAH error, RELEASE the lock and return error
  4. Return 202 Accepted with `{ rolloutId, lockedAt, lockHolder }`
- **Permission**: customer admin on the project, OR staff
- **Idempotency**: same branch swap requested twice while lock held returns 409 (one swap per branch transition)

### New API Route: GET /api/projects/[slug]/branch/preview/status

- **Auth**: same as above (customer admin or staff)
- **Returns**: `{ branch, state, locked_at, locked_by, started_at, error_message?, terminal: bool }`
- **Behavior**:
  - Polls FAH for the most recent rollout for this project's dev backend
  - If state is SUCCEEDED / FAILED → terminal=true, AND auto-clears the DB lock (UPDATE projects SET preview_branch_locked=NULL ... WHERE preview_branch_locked=$branch_param)
  - If state still PENDING/BUILDING → terminal=false
  - **8-minute timeout**: if `now() - locked_at > 480s`, force-clear lock + return state='timeout'

### Customer Page Integration (PARTIAL — Phase 14 finishes)

- Client island `BranchPreviewClient.tsx` added to customer release page
- Uses SWR with `refreshInterval: terminal ? 0 : 5000` for polling — pause when terminal
- Concurrency banner: when locked, all RC rows show "Branch X currently previewing — set N min ago by user@email" + Preview buttons disabled with tooltip
- "Preview this branch" buttons on each RC row (only when not locked OR when locked by current branch)
- Phase 13 ships this as a working but Phase-14-pending integration; Phase 14 polishes layout + adds the swap button to branch section headers per the customer page integration spec

### SWR Library

- `swr@^2.4.1` (already approved in research) — install if not present
- Pattern: `useSWR('/api/projects/[slug]/branch/preview/status', fetcher, { refreshInterval, ... })`

### Error Handling

- FAH API errors: surfaced inline on the customer page with link to the FAH console for the project
- DB lock acquisition errors: return 409 with structured error body
- Network timeouts: client retries via SWR's built-in revalidate

### Claude's Discretion

- UI nuances of the lock banner (color, position, copy) — at Claude's discretion (zinc dark + amber warning per design ref)
- Exact polling cleanup logic on component unmount — at Claude's discretion (SWR handles most of this)
- Whether to track swap history per project — DEFER (PREV-related, but a v2.1.x feature)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/github-app.ts` — JWT-sign + token-exchange pattern; mirror this for FAH SA
- `jose` library — already imported in NextAuth config; reuse for JWT signing
- `src/db/schema.ts` — `projects.preview_branch_locked` + `preview_branch_locked_at` columns landed in Phase 10
- `src/lib/db.ts` — Drizzle client
- `src/app/projects/[slug]/releases/page.tsx` — customer page; already has branch sections
- `src/app/projects/[slug]/releases/ReleasesClient.tsx` — client island; new BranchPreviewClient nests inside

### Established Patterns
- Atomic UPDATE-with-WHERE-IS-NULL race guard (Phase 9 PROM-04 pattern); reuse exact pattern for lock acquisition
- API route + Drizzle transaction
- React server component + client island; SWR for polling

### Integration Points
- New: `src/lib/fah-rollout.ts` + `src/lib/fah-rollout.test.ts`
- New: `src/app/api/projects/[slug]/branch/preview/route.ts` (POST swap, GET status)
- New: `src/app/projects/[slug]/releases/BranchPreviewClient.tsx` (client island)
- Modified: `src/app/projects/[slug]/releases/ReleasesClient.tsx` (integrate BranchPreviewClient)
- npm install `swr@^2.4.1` (per research recommendation)

</code_context>

<specifics>
## Specific Ideas

- The `release-promoter` service account setup is operational (Mike does it once) — this phase only needs to write the runtime that USES the SA key. Setup steps documented in SUMMARY for the human runbook.
- For customer-owned projects (darksouls, tmi, truthtreason), the dev backends live in `triarch-dev-{customer}` projects (Mike's GCP); the SA needs IAM there, not in customer prod GCP.
- Backend name resolution: project slug → backend ID. Use the convention `<slug>-dev` (e.g. `tmi` → `tmi-dev`). Fall back to project key `<slug>-dev`. Store explicitly in `projects.dev_fah_backend_id` if conventions don't hold? Defer — try the convention first.

</specifics>

<deferred>
## Deferred Ideas

- Swap history audit log (a new `preview_swaps` table) — defer to v2.1.x
- Multiple simultaneous previews per project (multiple dev backends) — out of architecture; one preview slot per project
- Auto-revert preview to `dev` branch after N minutes of inactivity — defer
- Email/Slack notification when a customer-triggered swap completes — defer

</deferred>
