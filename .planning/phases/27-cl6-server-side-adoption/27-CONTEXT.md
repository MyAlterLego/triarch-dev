# Phase 27: CL-6 Server-Side Adoption Enforcement - Context

**Gathered:** 2026-05-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Make CL-4 (workflow gate adoption) non-bypassable at the platform layer. The admin
`/api/platform/ingest/release-logs` endpoint MUST reject `env=prod` ingests when no
paired pass-verdict `deploy_gate_check` audit row exists for the same project_key,
target_version, and Bearer apiKey within the prior 15 minutes.

Phase 27 ships:
1. A new `deploy_gate_check` table (Drizzle migration)
2. A new `POST /api/platform/cicd/gate-verdict` endpoint for shared-workflows to write
   gate verdicts BEFORE prod deploy
3. A modification to existing `POST /api/platform/ingest/release-logs` that asserts
   paired verdict row exists on `env=prod` ingests
4. Env-flag-gated rollout (`CL6_ENFORCEMENT_MODE=warn|enforce|off`) so the change
   ships dark and is enabled after Phase 28 self-adopts

Phase 27 does NOT ship: the shared-workflows v8.2 write-step (that is Phase 28's
golden template), nor the compliance matrix UI cell (Phase 35).

Out of scope: dev-env ingests (only `env=prod` gated per phase spec); 12-factor
secret rotation; gate verdict admin UI.

</domain>

<decisions>
## Implementation Decisions

### Verdict Storage
- New dedicated table `deploy_gate_check` (clean queryability, no consumer drift on `release_logs`)
- Columns: `id (uuid PK), project_key (text), target_version (text), verdict (enum: 'pass' | 'fail' | 'reject_no_pair'), dev_version (text), api_key_hash (text), reason (text nullable), workflow_run_url (text nullable), created_at (timestamptz default now())`
- 90-day TTL via scheduled cleanup migration (standard audit retention)
- Composite covering index `(project_key, created_at DESC)` to support the 15-min lookback query at scale

### Endpoint Contract
- NEW endpoint `POST /api/platform/cicd/gate-verdict` (sibling to existing `/api/platform/*` routes)
- Auth: same `requireApiKey` Bearer pattern as `version-snapshot`; project-scoped
- Request payload: `{ target_version: string, verdict: 'pass' | 'fail', dev_version: string, reason?: string, workflow_run_url?: string }`
- Idempotency: last-write-wins within 15-min window; ingest reads most-recent row (workflow retries are safe)
- Response: 201 on insert; 401 on missing apiKey; 400 on payload validation failure

### Rejection Behavior (modified `/api/platform/ingest/release-logs`)
- Trigger: only when `env='prod'` (dev ingests unchanged)
- On missing or non-pass verdict row in prior 15 min: return HTTP 409 with body `{ error: 'gate_required', code: 'CL6-VIOLATION', reason: string, expected: { project_key, target_version, max_age_seconds: 900 }, remediation_url: '/admin/modules/ci-cd' }`
- Match assertion: `verdict='pass' AND target_version=ingested_version AND api_key_hash=current_request_api_key_hash`
- On rejection: write a `deploy_gate_check` row with `verdict='reject_no_pair'` (full audit trail of all rejected attempts); do NOT insert `release_logs` row
- Dev env (`env='dev'`): bypass enforcement entirely

### Cross-Repo Coordination & Rollout
- Env-flag gated rollout: `CL6_ENFORCEMENT_MODE` env var with three values
  - `off` — endpoint installed, no checks (rollback escape hatch)
  - `warn` — log violations to `deploy_gate_check` with `verdict='reject_no_pair'` BUT still accept the release_logs insert (safe ship default)
  - `enforce` — full 409 rejection
- Phase 27 ships with default `warn` mode
- Phase 28 (platform self-adopt) is the FIRST consumer to test the round-trip
- Flip to `enforce` happens AFTER Phase 28 verifies the contract on platform itself
- 7-day grace window after Phase 28 ships before global `enforce` flip
- Per-consumer enforcement adoption is Phase 32's work (per-project rollout)
- Compliance matrix UI integration is Phase 35; Phase 27 only writes verdict rows

### Claude's Discretion
- Specific migration filename and SQL DDL details
- Vitest test layout (colocated `route.test.ts` per CLAUDE.md convention)
- Whether to emit a structured log event on warn-mode violations (recommended yes)
- TypeScript interface naming (`GateVerdict`, `DeployGateCheckRow`, etc.)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `requireApiKey` in `src/lib/api-key-auth.ts` — Bearer auth used by sibling endpoints
- `db` from `src/lib/db.ts` — Drizzle CockroachDB connection
- `releaseLogs` schema in `src/db/schema.ts` — existing target table; will require ingest endpoint modification only, no schema change
- `stampLinksFromCommit` pattern — try/catch wrapping for non-blocking side effects (reference for warn-mode log writes)
- Existing `apiKey` column on `projects` table — Bearer token identifies project for both write and read

### Established Patterns
- Static-path API routes preferred (per `version-snapshot` route notes: dynamic `[key]` segments crashed FAH at runtime). Use `/api/platform/cicd/gate-verdict`, not `/api/platform/cicd/[key]/gate-verdict`
- All `/api/platform/*` endpoints use `requireApiKey` for Bearer auth
- Drizzle migrations live under `src/db/migrations/`; schema definitions in `src/db/schema.ts`
- Vitest 4.x with `@/` alias; test files colocated with source (`route.test.ts` next to `route.ts`)
- ENV vars surfaced via Firebase App Hosting secrets; default behavior in code must be safe (warn-mode default is consistent with this)

### Integration Points
- `src/db/schema.ts` — add `deployGateCheck` table definition + enum
- `src/db/migrations/` — new migration file (next sequential number after existing migrations) for `deploy_gate_check` table + index
- `src/app/api/platform/cicd/gate-verdict/route.ts` — NEW file (POST handler)
- `src/app/api/platform/ingest/release-logs/route.ts` — MODIFY: insert pre-check before `db.insert(releaseLogs)` when `env=prod`
- `src/lib/api-key-auth.ts` — REUSE: no change needed; `requireApiKey` returns project with apiKey hash
- New env var `CL6_ENFORCEMENT_MODE` — declared in `apphosting.yaml`/`apphosting.dev.yaml` after this phase merges

</code_context>

<specifics>
## Specific Ideas

- Default `CL6_ENFORCEMENT_MODE` MUST be `warn` for the initial ship — Phase 28 needs the receiving infrastructure live before it wires the write step, otherwise platform's own prod deploy could fail
- The `api_key_hash` field in `deploy_gate_check` is the SHA-256 of the Bearer apiKey (not the plaintext) — defense in depth so audit rows don't leak credentials even if dumped
- `verdict='reject_no_pair'` is a synthetic verdict written by the ingest endpoint itself, not by the gate workflow — distinguishes "consumer's gate workflow failed and reported fail" from "consumer skipped the gate entirely"
- 15-minute lookback is a fixed constant in Phase 27; making it configurable is a future enhancement, not P0
- The `remediation_url` in the 409 body points to `/admin/modules/ci-cd` which Phase 35 will extend; for now that route renders the CL-4 readiness view (sufficient signpost)

</specifics>

<deferred>
## Deferred Ideas

- Slack alert on `verdict='reject_no_pair'` write — useful but adds Slack-side coupling; defer until enforcement has been live for 2+ weeks
- Gate verdict admin UI (list view, search, filter) — Phase 35 covers compliance summary; full audit explorer is post-v2.3
- Per-project enforcement override (some projects in `enforce`, others in `warn`) — current single env var is coarse but sufficient; defer if Phase 32 reveals a real need
- Cleanup job for `deploy_gate_check` 90-day retention — initial ship uses `pg_dump` retention or manual cleanup; cron job can land as a separate maintenance phase
- shared-workflows v8.2 write-step itself — explicitly Phase 28's deliverable

</deferred>
