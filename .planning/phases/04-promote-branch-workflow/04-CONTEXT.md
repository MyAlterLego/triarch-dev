# Phase 4: promote-branch Workflow - Context

**Gathered:** 2026-05-05 (auto mode)
**Status:** Ready for planning

<domain>
## Phase Boundary

Create a new reusable `MyAlterLego/shared-workflows/.github/workflows/promote-branch.yml` that:
1. Accepts a `branch` input
2. Fetches origin and rebases the branch onto `origin/main`
3. Runs CI on the rebased branch
4. On green: merges to main (no-ff merge to preserve branch lineage)
5. On rebase conflict: aborts the rebase, captures the conflicting file list, exits non-zero
6. Posts the result (merged | conflict | ci_failed) back to admin via authenticated callback

Out of scope: Slack notification of conflicts (Phase 5 / WORKFLOW-09 if scoped), customer-page UI for promote result (Phase 5/6), auto-retry on CI flakes, conflict resolution assistance.

</domain>

<decisions>
## Implementation Decisions

### Workflow shape (WORKFLOW-04)

- **D-01:** Reusable via `workflow_call` (so admin's `/api/slack/interact` can dispatch it via the GitHub App) AND `workflow_dispatch` for manual operator runs.
- **D-02:** Inputs: `branch` (required, string — feature branch name), `target_branch` (default `main`), `admin_callback_url` (default `https://admin.triarch.dev`).
- **D-03:** Outputs: `result` (enum: `merged` | `conflict` | `ci_failed`), `merge_sha` (set when merged), `conflict_files` (newline-separated list when conflict), `ci_run_url` (set when ci_failed).
- **D-04:** Rebase strategy: `git rebase origin/main` straight onto the target branch. NO interactive (`-i`). On conflict, immediately `git rebase --abort` to leave the branch untouched, then capture conflict files via `git diff --name-only --diff-filter=U`.
- **D-05:** Merge strategy on green: `git merge --no-ff <branch> -m "Promote <branch>"` then `git push origin main`. The `--no-ff` preserves the branch's commit lineage in main's history (per CONTEXT.md from v2.0 milestone draft, parallel-RC pattern).
- **D-06:** CI step: re-uses existing `shared-workflows/quality-gate.yml@v2` (no new CI runner). Workflow_call passes through inputs verbatim and `secrets: inherit`.

### Authentication for callback (WORKFLOW-05)

- **D-07:** Callback uses **Bearer token** via `Authorization: Bearer ${{ secrets.ADMIN_API_TOKEN }}` — same per-project Actions secret pattern Phase 2 established. The "signed callback" wording in REQUIREMENTS.md WORKFLOW-05 is satisfied by HTTPS + per-project Bearer (admin's `requireApiKey` middleware verifies the token came from the project's row in the `projects` table).
- **D-08:** No HMAC body signature beyond Bearer auth. If a future ADR mandates payload-level signing, that's a separate phase (no current threat model requires it).
- **D-09:** Callback failure handling: `continue-on-error: true` on the callback step. The merge/push has already happened — admin notification is best-effort. Reconciliation handled by future cron (out of scope).

### Endpoint contract (admin side)

- **D-10:** New admin endpoint: `POST /api/platform/promote-callback` (NOT `/api/releases/promoted` — that's prod-deploy completion, semantically different).
- **D-11:** Auth: `requireApiKey` middleware (same as ingest endpoints).
- **D-12:** Payload (snake_case to match prod-deploy callback convention):
  ```json
  {
    "branch": "feat/change-font",
    "result": "merged" | "conflict" | "ci_failed",
    "merge_sha": "abc123",
    "conflict_files": ["src/foo.ts", "src/bar.ts"],
    "rebase_error": "CONFLICT (content): ...",
    "ci_run_url": "https://github.com/..."
  }
  ```
  - `merge_sha` set when `result=merged`, null otherwise
  - `conflict_files` set when `result=conflict`, [] otherwise
  - `rebase_error` set when `result=conflict`, null otherwise
  - `ci_run_url` set when `result=ci_failed`, null otherwise
- **D-13:** DB writes: insert a row in a NEW `promote_attempts` table (or extend `release_logs` with a new `result` column — Claude's discretion). Default to new `promote_attempts` table since promote attempts are semantically distinct from releases. Schema:
  ```sql
  CREATE TABLE promote_attempts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project varchar NOT NULL,
    branch varchar NOT NULL,
    result varchar NOT NULL CHECK (result IN ('merged', 'conflict', 'ci_failed')),
    merge_sha varchar,
    conflict_files jsonb,
    rebase_error text,
    ci_run_url text,
    created_at timestamptz DEFAULT now()
  );
  ```

### Workflow versioning

- **D-14:** Modifications land on `MyAlterLego/shared-workflows` `main` branch and get tagged `v3` (since v2 is in production from Phase 2). Existing `v1` and `v2` tags stay stable for current consumers.
- **D-15:** Phase 4 does NOT bump consumer refs to `v3`. The `promote-branch.yml` workflow is only called explicitly (it's not part of normal CI), so consumers can opt in by adding a `workflow_dispatch` invocation or admin can call it via the GitHub App API. Bumping admin/CRM's `ci-cd.yml` is unnecessary and reserved for Phase 5+ when other workflows might use the new tag.

### Triggering — how admin invokes promote-branch from a Slack approval

- **D-16:** Future admin-side dispatching (Phase 5 — Slack approval flow): `dispatchWorkflow` in `src/lib/github-app.ts` already exists. Slack approval handler calls `dispatchWorkflow({ workflowFile: 'promote-branch.yml', ref: 'main', inputs: { branch: '<feature-branch>' } })` against the consumer repo (NOT shared-workflows — promote-branch.yml is reusable, called via `workflow_call` from each repo's local stub).
- **D-17:** Phase 4 does NOT wire up the Slack approval path. Phase 5 (Customer Page RC UI) handles that. Phase 4 just creates the workflow + admin callback endpoint + DB schema.

### Claude's Discretion

- Exact bash for capturing conflict file list (single-line vs multi-line stringify)
- Format of workflow `outputs:` (newline vs JSON for `conflict_files`)
- DB index choices on `promote_attempts` table
- Whether to add a `merged_at` column or rely on `created_at`
- Whether `promote-branch.yml` writes a workflow summary table (recommend yes, mirror Phase 2 pattern)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 2 patterns (carry forward)
- `~/claude/MyAlterLego/shared-workflows/.github/workflows/deploy-firebase.yml` — v2 pattern for callback step (empty-token guard, continue-on-error, payload construction)
- `~/claude/MyAlterLego/shared-workflows/.github/workflows/deploy-prod.yml` — v2 snake_case payload pattern; reuse the structure
- `~/claude/MyAlterLego/shared-workflows/.github/workflows/quality-gate.yml` — CI workflow that promote-branch invokes
- `.planning/phases/02-shared-workflows-hardening/02-CONTEXT.md` — empty-token guard, continue-on-error decisions
- `.planning/phases/02-shared-workflows-hardening/02-RESEARCH.md` — wire contract details, FAH behavior

### Admin endpoint patterns
- `src/lib/api-key-auth.ts` — `requireApiKey` middleware (Bearer auth)
- `src/app/api/platform/ingest/release-logs/route.ts` — reference structure for new platform ingest endpoint
- `src/app/api/releases/promoted/route.ts` — snake_case payload pattern for promote callback

### Schema
- `src/db/schema.ts` — Drizzle schema; add `promote_attempts` table here
- `src/db/migrations/` — migration sequence; new migration appends here
- `.planning/phases/03-schema-github-app-permissions/` (when read) — for the merge permission grant pattern

### GitHub App
- `src/lib/github-app.ts` — `dispatchWorkflow()` already exists; Phase 5 will use it to dispatch promote-branch from Slack approvals
- `~/claude/MyAlterLego/shared-workflows/.github/workflows/notify.yml` — pattern for shared-workflow steps (carry over `secrets: inherit` style)

### Roadmap
- `.planning/ROADMAP.md` §"Phase 4: promote-branch Workflow" — three success criteria
- `.planning/REQUIREMENTS.md` — WORKFLOW-04, WORKFLOW-05

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **Phase 2 callback pattern** (`deploy-firebase.yml`/`deploy-prod.yml`): identical step shape — empty-token guard, payload construction, `continue-on-error: true`, GITHUB_STEP_SUMMARY annotation. Promote callback can copy this template wholesale.
- **`requireApiKey` middleware** verified working from Phase 1 (admin reads from vault, CRM reads from vault, ingest endpoints accept Bearer).
- **`@myalterlego/secrets@^0.1.0`** — installed in admin from Phase 1; promote-callback endpoint reuses for any secret it needs (likely none — Bearer-validated payload).
- **Drizzle ORM** with PostgreSQL/CockroachDB compatibility — schema file at `src/db/schema.ts`, migrations sequenced.

### Established Patterns

- **Per-project apiKey Bearer auth** (Phase 2 pattern, vault-independent — each consumer repo holds its own ADMIN_API_TOKEN Actions secret).
- **snake_case payloads** for admin callbacks (Phase 2 prod-deploy `/api/releases/promoted` is the precedent).
- **`continue-on-error: true`** on best-effort callback steps (deploy is source of truth, callback is signal).
- **`secrets: inherit`** in `workflow_call` (Phase 2 pattern; promote-branch reuses).

### Integration Points

- **shared-workflows clone path**: `~/claude/MyAlterLego/shared-workflows/` (Phase 2 set this up; reuse).
- **Admin app endpoint**: `src/app/api/platform/promote-callback/route.ts` — new file, mirrors `release-logs/route.ts` structure.
- **Schema**: `src/db/schema.ts` adds `promoteAttempts` table; one migration in `src/db/migrations/`.
- **No consumer ref bumps**: shared-workflows@v3 created but not pulled in by any consumer in this phase.

</code_context>

<specifics>
## Specific Ideas

- **Conflict capture command**: `git diff --name-only --diff-filter=U > /tmp/conflicts.txt` after rebase abort — produces a clean list of conflicting paths suitable for both workflow output and admin callback payload.
- **Merge strategy semantics**: `--no-ff` ensures the merge commit is visible in `git log --first-parent main`, which Phase 5 RC UI uses to show "promoted on date X".
- **Workflow summary table**: mimic Phase 2 pattern — table with `Branch | Result | Merge SHA / Conflict Count`. Useful for visual debug when manually triggered.

</specifics>

<deferred>
## Deferred Ideas

- **Slack approval → dispatch wiring** — Phase 5 (Customer Page RC UI) will wire admin's Slack approval handler to call `dispatchWorkflow('promote-branch.yml')` via the GitHub App
- **HMAC payload signing** beyond Bearer auth — out of scope; revisit only if a threat model requires it
- **Auto-retry on CI flakes** — out of scope; would mask real test failures
- **Conflict resolution assistance** (e.g., suggest a merge tool, link to GitHub conflict editor) — Phase 6+ if user needs it
- **Promote attempt history UI** in admin — Phase 5+ (RC page surfaces promote results)
- **Cross-project promote** (e.g., promoting a branch in `darksouls-rpg` from admin) — already handled by `dispatchWorkflow`'s `owner`/`repo` parameters; no new work needed for Phase 4

</deferred>

---

*Phase: 04-promote-branch-workflow*
*Context gathered: 2026-05-05 via auto mode*
