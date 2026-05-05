# Phase 4: promote-branch Workflow - Research

**Researched:** 2026-05-05
**Domain:** GitHub Actions reusable workflows, git rebase automation, CockroachDB/Drizzle schema, Next.js API routes
**Confidence:** HIGH (patterns verified from live codebase and official docs; two critical edge-case findings below)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Reusable via `workflow_call` AND `workflow_dispatch` for manual operator runs.
- **D-02:** Inputs: `branch` (required), `target_branch` (default `main`), `admin_callback_url` (default `https://admin.triarch.dev`).
- **D-03:** Outputs: `result` (merged | conflict | ci_failed), `merge_sha`, `conflict_files` (newline-separated), `ci_run_url`.
- **D-04:** Rebase strategy: `git rebase origin/main`. No interactive. On conflict: `git rebase --abort`, then capture conflict files via `git diff --name-only --diff-filter=U`. **SEE CRITICAL FINDING #1 BELOW — capture must happen BEFORE abort.**
- **D-05:** Merge strategy: `git merge --no-ff <branch> -m "Promote <branch>"` then `git push origin main`.
- **D-06:** CI step: re-uses `shared-workflows/quality-gate.yml@v2` via `workflow_call` with `secrets: inherit`. **SEE CRITICAL FINDING #2 BELOW — nested workflow_call has limitations.**
- **D-07:** Callback: Bearer token via `Authorization: Bearer ${{ secrets.ADMIN_API_TOKEN }}` — same per-project Actions secret pattern.
- **D-08:** No HMAC body signature beyond Bearer auth.
- **D-09:** Callback failure: `continue-on-error: true`. Merge/push is source of truth; callback is best-effort.
- **D-10:** New admin endpoint: `POST /api/platform/promote-callback` (NOT `/api/releases/promoted`).
- **D-11:** Auth: `requireApiKey` middleware (same as ingest endpoints).
- **D-12:** Payload (snake_case): `branch`, `result`, `merge_sha`, `conflict_files` (array), `rebase_error`, `ci_run_url`.
- **D-13:** DB: new `promote_attempts` table (semantically distinct from release_logs).
- **D-14:** Tag `v3` on shared-workflows after this phase. `v1`, `v2` stay stable.
- **D-15:** Phase 4 does NOT bump consumer refs to `v3`. No consumer ci-cd.yml changes.
- **D-16:** Phase 5 will call `dispatchWorkflow({ workflowFile: 'promote-branch.yml', ... })` — Phase 4 must not break that interface.
- **D-17:** Phase 4 does NOT wire up Slack approval path. Just workflow + endpoint + DB.

### Claude's Discretion

- Exact bash for capturing conflict file list (single-line vs multi-line stringify)
- Format of workflow `outputs:` (newline vs JSON for `conflict_files`)
- DB index choices on `promote_attempts` table
- Whether to add a `merged_at` column or rely on `created_at`
- Whether `promote-branch.yml` writes a workflow summary table (recommend yes, mirror Phase 2 pattern)

### Deferred Ideas (OUT OF SCOPE)

- Slack approval dispatch wiring (Phase 5)
- HMAC payload signing beyond Bearer auth
- Auto-retry on CI flakes
- Conflict resolution assistance
- Promote attempt history UI (Phase 5+)
- Cross-project promote dispatch details (Phase 5+)
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| WORKFLOW-04 | New `shared-workflows/promote-branch.yml` workflow — accepts `branch` input; rebase onto origin/main; run CI; on green merge --no-ff; on conflict return conflict file list and exit non-zero | Exact bash sequence documented; quality-gate.yml invocation pattern confirmed; concurrency and permissions model verified |
| WORKFLOW-05 | `promote-branch.yml` POSTs success or conflict result to admin via signed callback; conflict result includes file list and rebase error message | Callback pattern confirmed from deploy-firebase.yml and deploy-prod.yml; new endpoint structure documented; DB schema verified |
</phase_requirements>

---

## Summary

Phase 4 creates three artifacts: (1) `promote-branch.yml` in `MyAlterLego/shared-workflows`, (2) `POST /api/platform/promote-callback` endpoint in the admin app, and (3) the `promote_attempts` Drizzle table with migration `0012`.

The workflow and callback patterns are well-established from Phase 2 — `deploy-firebase.yml` and `deploy-prod.yml` provide near-complete templates for the empty-token guard, payload construction, `continue-on-error`, and step summary annotation. The admin endpoint mirrors the structure of `src/app/api/releases/promoted/route.ts` with a new snake_case payload shape.

Two critical edge-case findings alter the planned implementation:

**Critical Finding #1 — Conflict file capture must happen BEFORE `git rebase --abort`.** The D-04 spec says capture via `git diff --name-only --diff-filter=U` after abort — but `--abort` resets the working tree to pre-rebase state, clearing all conflict markers. The correct sequence is: detect non-zero rebase exit → capture files → abort. This means the rebase step cannot simply call `git rebase origin/main || git rebase --abort`; it needs to be split into a detect-and-capture step.

**Critical Finding #2 — `workflow_call` cannot call another `workflow_call` workflow.** GitHub Actions does not support nesting `workflow_call` triggers: a reusable workflow called via `workflow_call` cannot itself use another workflow via `workflow_call`. This means `promote-branch.yml` cannot call `quality-gate.yml` as a nested reusable workflow. Instead, the CI step must be implemented as a job within `promote-branch.yml` that duplicates or inlines the quality gate checks — OR the workflow is structured so the calling repo's stub (`workflow_dispatch`) calls both `promote-branch.yml` and `quality-gate.yml` as parallel sibling jobs. The locked D-06 decision (re-use `quality-gate.yml@v2` via `workflow_call`) requires an architectural adjustment: `promote-branch.yml` should be structured as a multi-job workflow dispatched via `workflow_dispatch`/`workflow_call` from a stub in the consumer repo, where one job calls quality-gate and a second job (needing-the-first) does the rebase/merge. Alternatively, the CI step in `promote-branch.yml` duplicates the `npm run build && npx vitest run` commands inline.

**Primary recommendation:** Use an inline CI job within `promote-branch.yml` (jobs: `rebase`, `ci`, `merge`, `callback`) where `ci` runs `npm ci && npm run build && npx vitest run` directly — mirroring what quality-gate.yml@v2 does. This avoids the nested `workflow_call` limitation while keeping the workflow self-contained as a single file that `dispatchWorkflow()` can target in Phase 5.

---

## Standard Stack

### Core

| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| GitHub Actions `workflow_call` + `workflow_dispatch` | N/A | Reusable workflow trigger | Established pattern across all shared-workflows |
| `actions/checkout@v4` | v4 | Clone repo with full history | Required for rebase (`fetch-depth: 0`) |
| `ubuntu-latest` runner | N/A | Bash, git, curl pre-installed | Standard runner for all shared-workflows |
| `curl` (bash inline) | OS-provided | POST admin callback | Zero-dep, established Phase 2 pattern |
| Drizzle ORM + `pgTable` | Existing in project | Schema definition for `promote_attempts` | Already in use for all tables in `src/db/schema.ts` |
| Vitest 4.x | Existing in project | Unit tests for admin callback endpoint | Already configured — `npx vitest run` |

### Supporting

| Tool | Version | Purpose | When to Use |
|------|---------|---------|-------------|
| `actionlint` | latest | YAML lint for workflow files | Before pushing shared-workflows changes |
| `yamllint` | latest | YAML syntax check | Local pre-push validation |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Inline CI steps in promote-branch.yml | Nested quality-gate.yml@v2 call | Nested `workflow_call` is NOT supported — inline is required |
| `git diff --name-only --diff-filter=U` (before abort) | Parse git rebase output for conflict list | `--diff-filter=U` is the canonical way; parsing stderr is fragile |
| `jsonb` for `conflict_files` in CRDB | `text` column with newline-delimited list | `jsonb` is correct for arrays; CockroachDB is PostgreSQL-compatible and supports jsonb natively |
| New `0012` migration file | `db:push` without migration artifact | Phase 3 confirmed `db:push` is the deploy mechanism; migration file still needed in `src/db/migrations/` as the Drizzle record |

---

## Architecture Patterns

### Recommended Workflow Structure

```
promote-branch.yml
├── on: workflow_call / workflow_dispatch
├── concurrency: group: "promote-main" (cancel-in-progress: false — serializes, never cancels)
├── permissions: contents: write (declared in workflow, not just caller)
└── jobs:
    ├── rebase        — checkout full history, fetch, rebase, capture conflicts
    ├── ci            — npm ci + build + vitest (depends on: rebase success)
    ├── merge         — checkout main, merge --no-ff, push (depends on: ci success)
    └── callback      — POST to admin (depends on: merge; runs: always() to catch ci_failed too)
```

### Admin Endpoint Structure

```
src/app/api/platform/promote-callback/
└── route.ts   — mirrors src/app/api/releases/promoted/route.ts structure
```

### Pattern 1: Conflict Capture Sequence (CRITICAL — order matters)

**What:** Detect rebase failure, capture conflicting files, THEN abort.

**When to use:** Any automated rebase step that needs to report which files conflicted.

```bash
# Source: git-scm.com/docs/git-rebase + verified behavior: --abort clears working tree
git fetch origin
git checkout "$BRANCH"
git rebase "origin/$TARGET_BRANCH" || REBASE_FAILED=1

if [ "$REBASE_FAILED" = "1" ]; then
  # CRITICAL: capture BEFORE abort — abort resets working tree and clears conflict markers
  CONFLICT_FILES=$(git diff --name-only --diff-filter=U 2>/dev/null | tr '\n' ',' | sed 's/,$//')
  REBASE_ERROR=$(git rebase --show-current-patch 2>&1 | head -5 || true)
  git rebase --abort
  echo "REBASE_FAILED=true" >> "$GITHUB_ENV"
  echo "CONFLICT_FILES=$CONFLICT_FILES" >> "$GITHUB_ENV"
  exit 1
fi
```

### Pattern 2: Multi-Job Workflow with Conditional Callback

**What:** Three primary jobs (rebase, ci, merge) plus a callback job that always runs, using job outputs to determine which result to POST.

**When to use:** When the callback must fire for ALL terminal states (merged, conflict, ci_failed).

```yaml
# callback job runs on all outcomes
callback:
  runs-on: ubuntu-latest
  needs: [rebase, ci, merge]
  if: always()
  steps:
    - name: Post promote callback
      continue-on-error: true
      env:
        ADMIN_API_TOKEN: ${{ secrets.ADMIN_API_TOKEN }}
        ADMIN_CALLBACK_URL: ${{ inputs.admin_callback_url }}
      run: |
        if [ -z "$ADMIN_API_TOKEN" ]; then
          echo "::warning::ADMIN_API_TOKEN not set — callback skipped"
          exit 0
        fi
        # Determine result from job outcomes
        if [ "${{ needs.merge.result }}" = "success" ]; then
          RESULT="merged"
          MERGE_SHA="${{ needs.merge.outputs.merge_sha }}"
        elif [ "${{ needs.rebase.result }}" = "failure" ]; then
          RESULT="conflict"
        else
          RESULT="ci_failed"
        fi
        # Build and POST payload (snake_case to match D-12)
        PAYLOAD=$(printf '{"branch":"%s","result":"%s","merge_sha":%s,"conflict_files":%s,"rebase_error":%s,"ci_run_url":%s}' \
          "${{ inputs.branch }}" \
          "$RESULT" \
          "${MERGE_SHA:+\"$MERGE_SHA\"}" \
          ...)
```

### Pattern 3: Admin Promote-Callback Route (from `/api/releases/promoted` template)

**What:** New route that reuses `requireApiKey`, parses snake_case body, inserts into `promote_attempts`.

**When to use:** Receiving the workflow callback from `promote-branch.yml`.

```typescript
// Source: mirrors src/app/api/releases/promoted/route.ts structure
export async function POST(req: NextRequest) {
  const { error, project } = await requireApiKey(req);
  if (error) return error;

  const body = await req.json();
  const { branch, result, merge_sha, conflict_files, rebase_error, ci_run_url } = body;

  // Validate required fields
  const missingFields: string[] = [];
  if (!branch || typeof branch !== 'string') missingFields.push('branch');
  if (!result || !['merged', 'conflict', 'ci_failed'].includes(result)) missingFields.push('result');
  if (missingFields.length > 0) {
    return NextResponse.json({ error: `Missing required field(s): ${missingFields.join(', ')}` }, { status: 400 });
  }

  // Insert into promote_attempts
  const [row] = await db.insert(promoteAttempts).values({
    project: project!.key,
    branch,
    result,
    mergeSha: merge_sha ?? null,
    conflictFiles: conflict_files ?? [],
    rebaseError: rebase_error ?? null,
    ciRunUrl: ci_run_url ?? null,
  }).returning();

  return NextResponse.json(row, { status: 201 });
}
```

### Pattern 4: Drizzle Schema for `promote_attempts`

**What:** New table following the established Drizzle pattern in `src/db/schema.ts`.

```typescript
// Source: mirrors slackActionAudit pattern in src/db/schema.ts (Phase 3)
export const promoteAttempts = pgTable('promote_attempts', {
  id: uuid('id').primaryKey().defaultRandom(),
  project: varchar('project', { length: 64 }).notNull(),
  branch: varchar('branch', { length: 256 }).notNull(),
  result: varchar('result', { length: 16 }).notNull(),   // 'merged' | 'conflict' | 'ci_failed'
  mergeSha: varchar('merge_sha', { length: 64 }),
  conflictFiles: jsonb('conflict_files').default([]),
  rebaseError: text('rebase_error'),
  ciRunUrl: text('ci_run_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('promote_attempts_project_branch_idx').on(table.project, table.branch),
  index('promote_attempts_created_at_idx').on(table.createdAt.desc()),
]);
```

### Pattern 5: No-FF Merge to Main

**What:** Checkout main from origin after rebase confirms clean, merge feature branch with preserved lineage.

```bash
# Source: verified git behavior — --no-ff ensures merge commit visible in first-parent history
git checkout main
git pull origin main  # ensure local main is up to date
git merge --no-ff "$BRANCH" -m "Promote $BRANCH"
MERGE_SHA=$(git rev-parse HEAD)
git push origin main
echo "merge_sha=$MERGE_SHA" >> "$GITHUB_OUTPUT"
```

### Anti-Patterns to Avoid

- **Calling `git rebase --abort` before capturing conflict files:** After abort, `git diff --name-only --diff-filter=U` returns empty. Always capture BEFORE abort.
- **Using `workflow_call` to call `quality-gate.yml` from within `promote-branch.yml`:** Nested `workflow_call` is not supported in GitHub Actions. The called workflow must inline its CI steps.
- **Using `GITHUB_TOKEN` for push to main if branch protection requires status checks:** `GITHUB_TOKEN` can push with `contents: write` only if the App installation token or a PAT is not required for bypass. For this project, the GitHub App (`Triarch Release Gate`) has `contents:write` — use `GITHUB_APP_TOKEN` if the workflow runs from the admin app context, or use a PAT stored as `GH_PAT` Actions secret if the workflow runs from the consumer repo context. See pitfall #4.
- **Declaring `concurrency` only on the calling workflow, not in `promote-branch.yml`:** Concurrency groups on calling workflows do not propagate into reusable workflows. Declare `concurrency` in `promote-branch.yml` itself, scoped to the target branch.
- **Relying on `github.event` context in a `workflow_call`-triggered workflow's concurrency group:** When triggered via `workflow_call`, `github.event` is the caller's event. Use `inputs.branch` or `inputs.target_branch` in the concurrency group name instead.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Bearer auth on callback endpoint | New auth mechanism | `requireApiKey` from `src/lib/api-key-auth.ts` | Already validates `Authorization: Bearer <token>` against `projects.apiKey` in CRDB |
| HTTP POST from workflow | Custom action | `curl` inline in `run:` step | Pre-installed on ubuntu-latest; established Phase 2 pattern |
| Conflict file detection | Parsing `git rebase` stderr | `git diff --name-only --diff-filter=U` (before abort) | Canonical git command for unmerged paths; stderr is not structured |
| CI in promote-branch | Separate quality-gate.yml call | Inline `npm ci && npm run build && npx vitest run` | Nested `workflow_call` not supported; inline is required |
| Payload validation | Zod schema | Manual field presence checks (matching `releases/promoted/route.ts` style) | No Zod in this codebase; the existing pattern is explicit `missingFields` array |
| Token caching for GitHub App | New cache | `getInstallationToken()` in `src/lib/github-app.ts` | Already implements 50-min cache with single-flight; Phase 5 dispatch uses this directly |

**Key insight:** The callback and auth patterns are identical to Phase 2. Zero new patterns needed on the admin side — it's a new table + new route file, both following existing conventions exactly.

---

## Critical Findings

### Finding 1: Conflict File Capture Must Precede `git rebase --abort`

**Confidence:** HIGH — verified from git-scm.com documentation and multiple secondary sources.

D-04 states: "capture conflict files via `git diff --name-only --diff-filter=U`" as if this can happen after `--abort`. It cannot. `git rebase --abort` resets the working tree to the pre-rebase state, clearing all conflict markers. The `--diff-filter=U` (Unmerged) filter returns empty output after abort.

**Correct sequence:**
1. `git rebase origin/main` — if exits non-zero, conflict exists
2. Immediately: `git diff --name-only --diff-filter=U` — capture while working tree is in conflicted state
3. `git rebase --abort` — clean up
4. Exit non-zero with captured file list

**CONTEXT.md specifics note** says `git diff --name-only --diff-filter=U > /tmp/conflicts.txt` after rebase abort — this is incorrect and will produce an empty file. The plan must implement capture-before-abort.

### Finding 2: Nested `workflow_call` is Not Supported

**Confidence:** HIGH — documented limitation in GitHub Actions official docs.

A workflow triggered via `workflow_call` cannot itself use another workflow via `workflow_call`. This means `promote-branch.yml` cannot call `quality-gate.yml@v2` as D-06 describes ("re-uses existing `quality-gate.yml@v2` via `workflow_call`").

**Options:**
- **Option A (Recommended):** Inline the CI steps in a `ci` job within `promote-branch.yml`. Replicate the build+test commands directly. Simple, self-contained, no new dependency.
- **Option B:** Create a consumer-repo stub workflow (e.g. `promote.yml` in each consumer repo) that calls both `promote-branch.yml` and `quality-gate.yml` as sibling jobs. More complex; requires changes in every consumer repo; breaks the "single `dispatchWorkflow()` call" pattern Phase 5 needs.
- **Option C:** Have `promote-branch.yml` run the build steps inline AND separately check status of a quality-gate run via the GitHub API (polling). Complex, brittle.

**Recommendation:** Option A. The inline CI steps are ~10 lines of bash. The quality gate (build + vitest) is already defined in the shared workflow and easy to replicate. This keeps `promote-branch.yml` self-contained so Phase 5's `dispatchWorkflow({ workflowFile: 'promote-branch.yml' })` works without consumer stubs.

### Finding 3: Secrets Transitivity Limitation

**Confidence:** HIGH — documented in GitHub Actions official docs.

Secrets passed via `secrets: inherit` are NOT automatically transitive. In chain A → B → C:
- A passes secrets to B via `secrets: inherit` ✓
- B must explicitly pass secrets to C (either via `secrets: inherit` or named secrets) ✓
- C does NOT automatically receive A's secrets unless B passes them

Since `promote-branch.yml` will be called from consumer repos (A → promote-branch.yml), and promote-branch.yml is a reusable workflow that cannot call another `workflow_call`, this is moot for CI. But for the callback step, `ADMIN_API_TOKEN` must be passed via `secrets: inherit` from the calling job — this works correctly for a single-level call (consumer repo → promote-branch.yml).

### Finding 4: `contents: write` Permissions and Branch Protection

**Confidence:** HIGH — GitHub docs verified.

The `promote-branch.yml` workflow pushes to `main`. Two scenarios:

1. **No branch protection on main:** `GITHUB_TOKEN` with `permissions: contents: write` is sufficient. This is the expected state for consumer repos (Truth+Treason, etc.).

2. **Branch protection with required status checks:** `GITHUB_TOKEN` cannot bypass branch protection rules. A PAT or GitHub App token with admin scope is required. The `Triarch Release Gate` GitHub App has `contents: write` (SCHEMA-03, Phase 3). However, `promote-branch.yml` runs as a GitHub Actions workflow authenticated with `GITHUB_TOKEN` — the GitHub App token from admin's `src/lib/github-app.ts` is not available inside the workflow runner.

**Resolution:** For Phase 4, declare `permissions: contents: write` in the workflow. Consumers are expected to NOT have restrictive branch protection on main that blocks the GitHub Actions bot. If they do, the push step will fail with a clear error. Document this pre-condition in the plan. Phase 5/6 can revisit if a PAT is needed.

---

## Common Pitfalls

### Pitfall 1: Empty Conflict File List (Capture After Abort)

**What goes wrong:** `promote-branch.yml` reports `result=conflict` but `conflict_files=[]` in the callback. Admin stores a conflict row with no file list. Phase 5 UI shows "Conflict" badge but no files to display.

**Why it happens:** `git diff --name-only --diff-filter=U` was called after `git rebase --abort`. After abort, the working tree is clean — no unmerged paths exist.

**How to avoid:** Capture conflict files immediately when the rebase exits non-zero, before calling `--abort`. The exact bash pattern is documented in Architecture Pattern 1 above.

**Warning signs:** Workflow log shows rebase failed but `CONFLICT_FILES` is empty or the `/tmp/conflicts.txt` file has zero bytes.

### Pitfall 2: Detached HEAD After Rebase / Wrong Ref Pushed

**What goes wrong:** After `git rebase origin/main` on the feature branch, the branch is now in a detached HEAD state OR the local branch ref hasn't updated. `git push origin main` pushes the wrong commit.

**Why it happens:** `actions/checkout@v4` with `fetch-depth: 0` checks out the branch ref correctly, but after rebase the local HEAD may be on the rebased commits while the remote branch ref hasn't been updated. The merge step then runs `git checkout main && git merge --no-ff $BRANCH` where `$BRANCH` resolves to the remote (pre-rebase) ref if not handled carefully.

**How to avoid:** After rebase, force-push the rebased branch ref: `git push --force-with-lease origin $BRANCH:$BRANCH`. Then the merge job checks out main fresh and merges the pushed (rebased) branch. Alternatively, pass the rebased `HEAD` SHA between jobs via `outputs` and use `git merge <sha>` in the merge job.

**Warning signs:** The merge commit in main doesn't contain the expected commits; `git log --first-parent main` shows a merge of the pre-rebase branch commits.

### Pitfall 3: Quality Gate `DATABASE_URL` in Inline CI

**What goes wrong:** The inline CI steps in `promote-branch.yml` run `npm run build` and `npx vitest run`, but vitest tests that require `DATABASE_URL` fail with connection errors because the secret isn't available.

**Why it happens:** `quality-gate.yml` receives `secrets: inherit` from the consumer repo and injects `DATABASE_URL` via its `env:` block. The inline CI steps in `promote-branch.yml` also need `secrets: inherit` from the caller to pick up `DATABASE_URL`.

**How to avoid:** Declare `secrets: inherit` in the workflow's `on.workflow_call.secrets:` block AND inject the env vars in the inline CI job's `env:` block, mirroring `quality-gate.yml`'s pattern (lines 53–68 of the verified `quality-gate.yml`).

**Warning signs:** Vitest exits 0 (test suite skips DB tests gracefully) but some tests that should run against a live schema don't. Or vitest exits non-zero with `ECONNREFUSED`.

### Pitfall 4: Race Condition — Two Simultaneous Promote Runs

**What goes wrong:** Two branches are promoted simultaneously. Both rebase onto the same `origin/main`. Both pass CI. Both try to push to main. The second push wins, but the first merge commit is now missing (overwritten) OR the second push fails with "tip of branch behind remote" if not force-pushed.

**Why it happens:** No concurrency lock on the `main` push step.

**How to avoid:** Declare `concurrency: group: "promote-${{ inputs.target_branch }}" cancel-in-progress: false` at the **workflow level** (not job level) in `promote-branch.yml`. Use `cancel-in-progress: false` — we want serialization, not cancellation. The second run waits for the first to complete. After the first merges, the second run's rebase job needs to re-fetch origin before merging. Structure the rebase job to always fetch at the start.

**Warning signs:** Two simultaneous promote runs; the second push fails with `rejected (non-fast-forward)`; or main only contains one of the two expected feature branches after both "succeed".

### Pitfall 5: `ADMIN_API_TOKEN` Not Set on Consumer Repo

**What goes wrong:** Callback step fires with empty `ADMIN_API_TOKEN`. Admin returns 401. `continue-on-error: true` masks it. No `promote_attempts` row created.

**Why it happens:** Consumer repo hasn't set the `ADMIN_API_TOKEN` Actions secret. GitHub Actions silently substitutes empty string for missing secrets.

**How to avoid:** Carry forward the Phase 2 empty-token guard verbatim:
```bash
if [ -z "$ADMIN_API_TOKEN" ]; then
  echo "::warning::ADMIN_API_TOKEN not set — promote callback skipped"
  exit 0
fi
```

**Warning signs:** Callback step "succeeds" (green, continue-on-error) but no `promote_attempts` row appears in admin.

### Pitfall 6: Migration Naming and DB Push Pattern

**What goes wrong:** Planner creates migration `0012_*.sql` but Drizzle ORM hasn't regenerated the migration file properly, so the actual table isn't created.

**Why it happens:** Phase 3 note in STATE.md: "drizzle-kit push hung on CockroachDB — direct SQL is reliable fallback." The standard `drizzle-kit generate` + `drizzle-kit push` may not work reliably.

**How to avoid:** Write the migration SQL file manually following the `0011_thick_wallow.sql` pattern. The SQL is straightforward (one `CREATE TABLE` + two `CREATE INDEX`). Also add the Drizzle TypeScript definition to `src/db/schema.ts`. Use `db:push` (direct push to production CockroachDB via the Firebase secrets `DATABASE_URL`) as established in Phase 3. Document as a human-action step.

---

## Verified Wire Contracts

### POST /api/platform/promote-callback (NEW)

**Auth:** `Authorization: Bearer <projects.apiKey>` — same `requireApiKey` middleware

**Required fields:** `branch` (string), `result` (string: merged | conflict | ci_failed)

**Optional fields:** `merge_sha` (string|null), `conflict_files` (array, default []), `rebase_error` (string|null), `ci_run_url` (string|null)

**Response:** `201` with inserted row JSON on success; `400` if branch or result missing/invalid; `401`/`403` on auth failure.

### Existing Endpoints (NOT modified in Phase 4)

- `POST /api/platform/ingest/release-logs` — unchanged
- `POST /api/releases/promoted` — unchanged
- `requireApiKey` middleware — unchanged

### `dispatchWorkflow()` Compatibility (from `src/lib/github-app.ts`)

Phase 5 will call:
```typescript
await dispatchWorkflow({
  owner: 'MyAlterLego',
  repo: 'some-consumer-repo',
  workflowFile: 'promote-branch.yml',
  ref: 'main',
  inputs: { branch: 'feat/change-font' }
})
```

Phase 4's `promote-branch.yml` must accept `branch` as a `workflow_dispatch` input (in addition to `workflow_call`). This is satisfied by D-01 (both triggers) and D-02 (inputs). No changes needed to `github-app.ts`.

---

## Code Examples

### Verified: quality-gate.yml Secrets Block (secrets it needs via inherit)

```yaml
# Source: ~/claude/MyAlterLego/shared-workflows/.github/workflows/quality-gate.yml (read directly)
# Lines 53-68 — env vars that promote-branch's inline CI job must also inject:
env:
  DATABASE_URL: ${{ secrets.DATABASE_URL }}
  NEXTAUTH_SECRET: ${{ secrets.NEXTAUTH_SECRET }}
  NEXTAUTH_URL: http://localhost:${{ inputs.server_port }}
  # ... plus GOOGLE_CLIENT_ID, GEMINI_API_KEY, GH_PAT, etc.
```

The inline CI job in `promote-branch.yml` needs to mirror this env block. Secrets available via `secrets: inherit` from the caller.

### Verified: Empty-Token Guard (Phase 2 established pattern)

```bash
# Source: deploy-firebase.yml (read directly) — lines 158-163
if [ -z "$ADMIN_API_TOKEN" ]; then
  echo "::warning::ADMIN_API_TOKEN not set on consumer repo — admin callback skipped."
  exit 0
fi
```

Carry forward verbatim into `promote-branch.yml`'s callback step.

### Verified: Drizzle Migration SQL Pattern

```sql
-- Source: 0011_thick_wallow.sql (read directly) — pattern for promote_attempts
CREATE TABLE "promote_attempts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project" varchar(64) NOT NULL,
  "branch" varchar(256) NOT NULL,
  "result" varchar(16) NOT NULL,
  "merge_sha" varchar(64),
  "conflict_files" jsonb DEFAULT '[]'::jsonb,
  "rebase_error" text,
  "ci_run_url" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "promote_attempts_project_branch_idx" ON "promote_attempts" ("project", "branch");
--> statement-breakpoint
CREATE INDEX "promote_attempts_created_at_idx" ON "promote_attempts" USING btree ("created_at" DESC NULLS LAST);
```

No `CHECK` constraint on `result` — CRDB supports CHECK but it adds friction if the enum evolves. Validation happens in the route handler.

### Verified: requireApiKey behavior

```typescript
// Source: src/lib/api-key-auth.ts (read directly)
// Returns { error: null, project } on success (project has .key, .name, etc.)
// Returns { error: NextResponse(401) } if no Authorization header
// Returns { error: NextResponse(403) } if token not in projects.apiKey
const { error, project } = await requireApiKey(req);
if (error) return error;
// project.key is the project identifier for DB writes
```

### Verified: git diff --name-only --diff-filter=U (BEFORE abort)

```bash
# Correct sequence — verified from git-scm.com/docs/git-rebase
git rebase "origin/$TARGET_BRANCH" || {
  # Working tree is in conflicted state — capture now
  CONFLICT_FILES=$(git diff --name-only --diff-filter=U 2>/dev/null)
  REBASE_ERROR=$(cat .git/rebase-merge/patch 2>/dev/null | head -3 || echo "rebase conflict")
  git rebase --abort
  # ... set outputs and exit 1
}
```

---

## Current State of shared-workflows Repo

**Tags confirmed (from Phase 2 research):** v1, v1.1, v1.2, v1.3, v1.4, v2

**Files that exist:** `deploy-firebase.yml`, `deploy-prod.yml`, `quality-gate.yml`, `notify.yml`

**File to create:** `.github/workflows/promote-branch.yml` (new)

**Tag to create:** `v3` after all Phase 4 success criteria pass

**Consumer refs confirmed:** Admin `ci-cd.yml` uses `deploy-firebase.yml@v2`, `quality-gate.yml@v1`, `notify.yml@v1`. No consumer uses `@v3` (correct per D-15 — no bumps in Phase 4).

**Next migration:** `0012_*` (after `0011_thick_wallow.sql` which created `slack_action_audit`)

---

## DB Schema State

**Current last migration:** `0011_thick_wallow.sql` — created `slack_action_audit` table.

**Phase 4 migration:** `0012_<name>.sql` — creates `promote_attempts` table.

**CockroachDB compatibility:** `jsonb` is fully supported in CockroachDB (PostgreSQL-compatible). `uuid`, `varchar`, `text`, `timestamptz`, `DEFAULT gen_random_uuid()` — all confirmed present in existing migrations.

**DB push mechanism:** Per STATE.md and CLAUDE.md, `DATABASE_URL` is a Firebase App Hosting secret. `db:push` against production CockroachDB is the deploy mechanism. Same pattern as Phase 3 (SCHEMA-01 migration was direct SQL). Document as human-action step in plan.

---

## Workflow Versioning Plan

| Step | Action |
|------|--------|
| 1 | Create `promote-branch.yml` on shared-workflows `main` branch |
| 2 | Validate with `actionlint` + `yamllint` locally |
| 3 | Test with `workflow_dispatch` manual run against a test branch |
| 4 | Verify all 3 success criteria from ROADMAP.md |
| 5 | Tag `v3` on the commit — `git tag v3 <sha> && git push origin v3` |
| 6 | Verify `v1` and `v2` tags are unchanged |
| 7 | No consumer ref bumps (D-15) |

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Nested reusable workflow calls | Inline CI steps (nested `workflow_call` not supported) | GitHub Actions architectural limitation | `promote-branch.yml` must inline CI; cannot delegate to `quality-gate.yml@v2` |
| Capture conflicts after `git rebase --abort` | Capture BEFORE abort | Always true — git behavior | D-04 spec comment is incorrect; implementation must reverse the order |
| Deploy-prod.yml direct push to main (v1.14) | promote-branch.yml rebase + CI + no-ff merge (v2.0) | Phase 4 | Promotes are now branch-aware with explicit merge history |

**Deprecated/outdated:**
- The v1.14 `deploy-prod.yml` direct Firebase push to main (now split: `deploy-prod.yml` handles FAH deploy, `promote-branch.yml` handles git promotion)

---

## Open Questions

1. **Should `promote-branch.yml` force-push the rebased branch before merging?**
   - What we know: After a clean rebase, the local feature branch ref is ahead of origin. The merge job needs the rebased ref to be accessible.
   - What's unclear: Should rebase job push rebased branch to origin (`--force-with-lease`) before the merge job? Or pass the rebased HEAD SHA via job outputs and use `git merge <sha>` directly?
   - Recommendation: Force-push the rebased branch (`git push --force-with-lease origin $BRANCH`) in the rebase job. This is the standard automation pattern and makes the branch visible in GitHub's UI as "rebased."

2. **Does quality-gate.yml's server startup (build + start + health check) make sense inside promote-branch.yml?**
   - What we know: `quality-gate.yml` starts a dev server, runs QA tests, runs pentest suite, runs master runner. This takes 5-20 minutes.
   - What's unclear: For promote-branch CI, do we want the full server-start test suite, or just `npm run build && npx vitest run` (unit tests only)?
   - Recommendation: For Phase 4, inline only `npm run build && npx vitest run`. The full server-start suite can be added later if needed. Keep the CI step fast to avoid long promote windows.

3. **What GitHub token does promote-branch.yml use for git push to main?**
   - What we know: `deploy-firebase.yml` uses `${{ secrets.GH_PAT || github.token }}` for tagging. `deploy-prod.yml` uses `${{ secrets.GITHUB_TOKEN }}`.
   - What's unclear: For push to `main`, does the consumer repo's branch protection block `github.token`?
   - Recommendation: Default to `github.token` with `permissions: contents: write`. Document as a pre-condition that consumer repos must not have branch protection rules that require PRs for `main`. Add a `GH_PAT` fallback (`${{ secrets.GH_PAT || github.token }}`) mirroring `deploy-firebase.yml`.

---

## Validation Architecture

**Note:** `nyquist_validation_enabled: false` in `.planning/config.json` — Validation Architecture section is included per the additional_context requirement, but the formal Nyquist machinery is disabled. This section informs the planner on how to validate each deliverable.

### Deliverable → Validation Map

| Deliverable | Validation Type | Command / Signal |
|-------------|-----------------|------------------|
| `promote-branch.yml` syntax | Lint | `actionlint .github/workflows/promote-branch.yml` |
| `promote-branch.yml` syntax | Lint | `yamllint -d "{rules: {line-length: disable}}" .github/workflows/promote-branch.yml` |
| Success path (clean merge) | Manual E2E | `gh workflow run promote-branch.yml -f branch=<test-clean-branch>` — verify merge commit in main |
| Conflict path (rebase fails) | Manual E2E | `gh workflow run promote-branch.yml -f branch=<test-conflict-branch>` — verify non-zero exit + conflict output |
| `POST /api/platform/promote-callback` | Unit (Vitest) | `npx vitest run src/app/api/platform/promote-callback/route.test.ts` |
| Auth: 401 on missing token | Unit (Vitest) | Test case: no Authorization header → 401 |
| Auth: 403 on bad token | Unit (Vitest) | Test case: invalid Bearer token → 403 |
| Payload validation: 400 on missing branch | Unit (Vitest) | Test case: body without `branch` → 400 |
| DB insert: promote_attempts row created | Unit (Vitest) | Test case: valid payload → 201, mocked db.insert called with correct args |
| Migration 0012 applied | Manual (human action) | `psql $DATABASE_URL -c "\d promote_attempts"` — confirms table exists |
| Callback fires from workflow | Manual E2E | After promote run: query `SELECT * FROM promote_attempts ORDER BY created_at DESC LIMIT 1` |
| `v3` tag on shared-workflows | Verification | `gh api repos/MyAlterLego/shared-workflows/tags --jq '.[].name' \| grep -x v3` |

### Success Criteria from ROADMAP.md

| # | Criterion | How to Validate |
|---|-----------|-----------------|
| 1 | Dispatching `promote-branch.yml` with `branch=feat/change-font` on a clean branch results in successful rebase, CI run, and merge to main | `gh workflow run` + verify merge commit in main `git log --first-parent main \| head -5` + verify `promote_attempts` row with `result=merged` |
| 2 | Dispatching on a branch with merge conflict exits non-zero and returns conflicting file list as workflow output | `gh workflow run` on intentionally conflicted branch + verify workflow conclusion = failure + verify `conflict_files` output non-empty + verify `promote_attempts` row with `result=conflict` and `conflict_files` array populated |
| 3 | Admin receives success or conflict result via signed callback within the workflow run window; payload includes branch, result, and (on conflict) file list | Query `promote_attempts` table after each E2E test run; verify fields match workflow inputs and outputs |

### Test Files Needed (Wave 0)

- `src/app/api/platform/promote-callback/route.test.ts` — unit tests for the new endpoint (auth, validation, DB insert)
- Migration `src/db/migrations/0012_*.sql` — created manually before endpoint is written

---

## Sources

### Primary (HIGH confidence)
- `src/lib/api-key-auth.ts` (read directly) — confirmed Bearer token pattern
- `src/app/api/releases/promoted/route.ts` (read directly) — confirmed snake_case payload, validation pattern, 201/200 idempotency
- `src/app/api/platform/ingest/release-logs/route.ts` (read directly) — confirmed camelCase pattern, optional fields
- `src/db/schema.ts` (read directly) — confirmed Drizzle table definitions, no `promote_attempts` table yet
- `src/db/migrations/0011_thick_wallow.sql` (read directly) — confirmed migration SQL pattern, next migration is 0012
- `src/lib/github-app.ts` (read directly) — confirmed `dispatchWorkflow()` interface; Phase 5 compatibility verified
- `~/claude/MyAlterLego/shared-workflows/.github/workflows/deploy-firebase.yml` (read directly) — confirmed callback step, empty-token guard, continue-on-error pattern
- `~/claude/MyAlterLego/shared-workflows/.github/workflows/deploy-prod.yml` (read directly) — confirmed snake_case payload, env: blocks pattern
- `~/claude/MyAlterLego/shared-workflows/.github/workflows/quality-gate.yml` (read directly) — confirmed secrets it needs; nested `workflow_call` limitation applies
- `.planning/config.json` (read directly) — confirmed `nyquist_validation_enabled: false`
- `.planning/phases/04-promote-branch-workflow/04-CONTEXT.md` (read directly) — all locked decisions

### Secondary (MEDIUM confidence)
- [GitHub Actions: Reuse workflows docs](https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows) — nested `workflow_call` limitation confirmed; secrets transitivity behavior confirmed
- [GitHub Changelog: secrets with reusable workflows](https://github.blog/changelog/2022-05-03-github-actions-simplify-using-secrets-with-reusable-workflows/) — `secrets: inherit` behavior
- [git-scm.com: git-rebase documentation](https://git-scm.com/docs/git-rebase) — `--abort` resets working tree; confirmed conflict capture must precede abort
- [GitHub Docs: Concurrency](https://docs.github.com/en/actions/concepts/workflows-and-actions/concurrency) — concurrency group behavior in reusable workflows

### Tertiary (LOW confidence)
- Community discussions about GitHub App bypass of branch protection — current state may vary by repo settings; treat as pre-condition to document rather than guaranteed behavior

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all tools verified from live workflow files and schema
- Architecture: HIGH — patterns derived from verified source code; critical findings verified from official docs
- Critical findings: HIGH — both verified from official documentation (git-scm, GitHub Actions docs)
- Pitfalls: HIGH — pitfalls 1-2 verified from technical behavior; 3-5 from established Phase 2 patterns

**Research date:** 2026-05-05
**Valid until:** 2026-06-05 (stable — GitHub Actions behavior and git semantics are not fast-moving)
