# Phase 4: GitHub App Promotion - Context

**Gathered:** 2026-05-04
**Status:** Ready for planning

<domain>
## Phase Boundary

After a Slack-button approval succeeds (Phase 3), dispatch the project's `deploy-prod.yml` GitHub Actions workflow via a GitHub App installation token (not a PAT). This phase introduces the App auth chain (App JWT → installation token → workflow_dispatch) and wires it into the existing `/api/slack/interact` handler's promotion path. Existing PAT-based platform endpoints (scaffold-repo, sync-state, destroy, backfills) are NOT migrated — Phase 4 establishes the App pattern only.

</domain>

<decisions>
## Implementation Decisions

### GitHub App JWT + Installation Token Strategy (Area 1)
- **JWT signing**: Node built-in `crypto.createSign('RSA-SHA256')` — no new dependency. Matches the raw-fetch pattern in `src/lib/github-push.ts`. JWT payload: `{ iat, exp (10 min max per GitHub docs), iss: GITHUB_APP_ID }`. Header `{ alg: 'RS256', typ: 'JWT' }`.
- **Installation token caching**: Module-level in-memory cache (50-min TTL — fresh tokens last 60 min, leave 10 min margin). Cache shape: `{ token: string, expiresAt: number }`.
- **Cache miss / regeneration**: Lazy. First request after expiry triggers fresh JWT signing + `POST /app/installations/{id}/access_tokens` exchange.
- **Multi-installation**: Single installation. `GITHUB_APP_INSTALLATION_ID` env var. Single cached token. Multi-tenant deferred.

### Slack Approve → Workflow Dispatch Mechanics (Area 2)
- **Trigger point**: Inside `/api/slack/interact`, immediately after `promoteRelease` returns success. Fire-and-forget Promise (no `await` blocking the Slack response). The Slack handler returns 200 within 3 seconds; the dispatch happens in the background.
- **Slack 3-second rule honored**: Response is sent before any GitHub API calls. Background dispatch results are logged AND posted as threaded reply to the original message (success: `:rocket: Workflow dispatched: deploy-prod.yml run #{run_id}`; failure: `:warning: Promotion dispatch failed: {reason}`).
- **Repo identification**: Look up `projects.githubRepo` (varchar, format `owner/repo`) via `releaseLogs.projectId`. Split on `/` to get `owner` and `repo` for the `workflow_dispatch` call.
- **Workflow filename**: Hardcoded `deploy-prod.yml` per success criterion #5. Branch ref: `main`.

### Failure Modes & Error Handling (Area 3)
- **Dispatch fails (GitHub API error)**: Log error with structured context. Post threaded Slack reply with the failure reason. Release stays in `approved` status in the DB — no auto-retry, no rollback. User can manually re-trigger from GitHub Actions UI.
- **Installation token fetch fails**: Same as dispatch fail — log + threaded Slack message. The release approval is preserved.
- **Workflow dispatched but never completes**: Out of scope. Phase 5's round-trip ingest endpoint catches successful prod deploys; Phase 4 doesn't track post-dispatch state.
- **Failure status on original Slack message**: Use `chat.update` to amend the original `:white_check_mark: Approved` to `:warning: Approved (promotion failed — see logs)` so the channel reflects the true state.

### Inputs, Audit Trail, Logging, Existing PAT (Area 4)
- **`workflow_dispatch` inputs**: Single `{ tag: release.version }` input on `ref: 'main'`.
- **Audit trail**: Add two columns to `release_logs` via Drizzle migration: `promotion_dispatched_at timestamp` (nullable), `promotion_dispatched_by text` (nullable, holds the mapped staff email of the Slack user who clicked Promote). Updated atomically alongside the dispatch attempt.
- **Logging**: Format `[github-app] dispatched deploy-prod.yml for {owner}/{repo} tag={version}` on success; structured error on failure (`[github-app] dispatch failed: {error.message}` with the response body if non-2xx).
- **Existing `GITHUB_TOKEN` PAT**: Stays. `src/lib/github-push.ts`, `decommission.ts`, `release-sync.ts`, `webhook-backfill.ts`, `sync-project-state.ts`, and the platform/projects/* endpoints continue using the PAT. Phase 4's new helper (`src/lib/github-app.ts`) is used ONLY by the promotion dispatch path. Tech debt — full migration deferred to a future phase.

### Claude's Discretion
- File location for the new helper (default: `src/lib/github-app.ts`)
- Cache shape and concurrency control (single-flight to prevent thundering-herd token refresh)
- Exact JWT iat/exp window (recommend iat=now-60s, exp=now+9min to account for clock skew)
- Whether to expose a public `getInstallationToken()` helper or only an opinionated `dispatchWorkflow()` wrapper (default: both, with the wrapper being the primary entry point)
- Error retry semantics within a single request — recommend single attempt, no retry loop
- Test mocking strategy for the new Vitest suite

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/github-push.ts` — raw-fetch pattern for GitHub API calls (Bearer auth, `Accept: application/vnd.github+json`). Phase 4's `github-app.ts` mirrors this style with App-token-based Authorization.
- `src/app/api/slack/interact/route.ts` (Phase 3) — already does `promoteRelease` dispatch. Phase 4 hooks into this exact spot.
- `src/lib/release-actions.ts` (Phase 3) — `promoteRelease` helper. Phase 4 wraps the call with the dispatch trigger.
- `src/lib/slack.ts` (Phase 3) — `postSlackMessage` helper supports threaded replies via `thread_ts` field.

### Established Patterns
- Raw `fetch` to api.github.com with Bearer auth and `Accept: application/vnd.github+json`
- Module-level env var reads at import time with graceful no-op when missing (e.g. `slack.ts` returns early on missing token)
- Vitest tests with `@/` alias (`vitest.config.ts` from Phase 3)
- Async errors logged with `console.warn` / `console.error` and prefixed with module tag (e.g. `[slack]`, `[github-app]`)

### Integration Points
- `release_logs` table — Phase 4 adds 2 columns via migration (likely `0009_*.sql`)
- `apphosting.yaml` — adds 3 new secret references: `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_APP_INSTALLATION_ID`
- `/api/slack/interact` route handler — Phase 4 adds dispatch call after `promoteRelease` succeeds

</code_context>

<specifics>
## Specific Ideas

- The pattern from Phase 3 (HUMAN-UAT runbook for the Slack App creation) repeats here: Phase 4 ships a `04-HUMAN-UAT.md` covering GitHub App creation in the `MyAlterLego` org, App installation, private key generation, and pushing the 3 secrets via `firebase apphosting:secrets:set`.
- Single-flight token refresh prevents two concurrent requests from both triggering JWT-sign + token-exchange. Use a Promise-based latch.
- JWT iat with 60-second past-skew handles minor clock drift between App Hosting and GitHub.
- The branch ref for `workflow_dispatch` is `main` — the deploy-prod.yml MUST exist on main in the target repo.

</specifics>

<deferred>
## Deferred Ideas

- **Migrate existing PAT-based platform/projects/* endpoints to GitHub App** — significant tech debt, separate phase
- **Multi-tenant App installation lookup** — find correct installation per repo when admin manages repos across multiple orgs
- **Per-project workflow filename override** — for projects with non-standard CI naming
- **Auto-retry on dispatch failure** — retry budget, exponential backoff
- **Workflow run tracking from dispatch to completion** — Phase 5 round-trip handles the completion side, but mid-flight monitoring is deferred
- **Cross-instance token cache (DB or Redis)** — needed if App Hosting horizontal scaling becomes a concern
- **Multi-input `workflow_dispatch`** — adding env, project_key, etc. to the dispatch contract

</deferred>

---

*Phase: 04-github-app-promotion*
*Context gathered: 2026-05-04 via smart_discuss (16 grey-area decisions, all accepted as-recommended)*
