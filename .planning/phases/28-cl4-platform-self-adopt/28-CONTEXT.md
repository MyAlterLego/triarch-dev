# Phase 28: CL-4 Platform Self-Adopt - Context

**Gathered:** 2026-05-16
**Status:** Ready for planning
**Source:** Direct batch approval (skipped per-area discuss — decisions pre-resolved with user)

<domain>
## Phase Boundary

Platform's own `.github/workflows/ci-cd.yml` declares `gate-prod-version.yml@v8.2` as a `needs:` prerequisite of the prod deploy job, AND v8.2 of the shared workflow ships the POST step that writes the paired verdict row to `/api/platform/cicd/gate-verdict` (Phase 27's new endpoint).

This phase self-eats the dog food — platform's next prod deploy passes (or fails) through the CL-6 enforcement loop that Phase 27 built. The wire-up doubles as the golden template that Phase 32 copies into the four other consumer repos.

Scope spans TWO repos:
1. `triarchsecurity/shared-workflows` — update `gate-prod-version.yml` v8.1 → v8.2 (additive: new POST step); tag and release v8.2
2. `triarchsecurity/platform` (this repo) — add `gate` job in `ci-cd.yml`, wire as `needs:` for `deploy-prod`, bump platform package.json version

Out of scope: the contrived dry-run test (CL-4 success criteria #3) and the real prod-deploy verification (CL-4 success criteria #4) are HUMAN-UAT items — they require actual GitHub Actions runs and live admin connectivity. Captured in HUMAN-UAT.md.

Out of scope: cleaning up the existing broken `Audit log to admin` step in v8.2. That step POSTs to a non-existent `/api/platform/audit` endpoint with `continue-on-error: true`. It silently no-ops today. Leaving it in v8.2 unchanged — removal can be a future cleanup phase if desired.

</domain>

<decisions>
## Implementation Decisions

### shared-workflows v8.2 — Workflow Edit
- Add a NEW step in the `gate` job, AFTER `Compare versions + enforce invariants` step, BEFORE the existing `Audit log to admin` step
- Step name: `Record verdict to admin (CL-6)`
- Step config: `if: always()` (fires on both pass and fail so reject_no_pair audit has full context); `continue-on-error: true` (admin downtime never blocks prod deploys)
- Payload to POST: `{ target_version: "v$TARGET", verdict: "$VERDICT", dev_version: "v$DEV", workflow_run_url: "${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}" }`
- POST URL: `${ADMIN_CALLBACK_URL}/api/platform/cicd/gate-verdict`
- Auth: `Authorization: Bearer ${ADMIN_API_TOKEN}` (SAME secret as existing GET)
- Timeout: `--max-time 5` (same as existing audit step)
- Error handling: on non-2xx, log to GitHub Actions output but DO NOT fail the job (continue-on-error)
- Preserve the existing `Audit log to admin` step unchanged (still POSTs to non-existent /api/platform/audit — harmless, removal is future cleanup)
- Update workflow header comment from `v8 (2026-05-14)` to add `v8.2 (2026-05-16): adds POST /api/platform/cicd/gate-verdict for CL-6 paired-verdict enforcement.`

### shared-workflows v8.2 — Release
- Commit format on shared-workflows repo: `v8.2: gate-prod-version posts verdict to /api/platform/cicd/gate-verdict`
- Branch: feature branch in shared-workflows, PR vs main, user merges
- Tag: `v8.2` (annotated tag matching existing v8/v8.1 pattern) — created by user after merge, NOT by autonomous workflow
- DO NOT modify v8.1 in-place — additive new version pinned by consumers

### platform ci-cd.yml — Edit
- Add a new `gate` job after `version` and `quality-gate`
- `gate` uses `triarchsecurity/shared-workflows/.github/workflows/gate-prod-version.yml@v8.2`
- Inputs: `project_key: triarchsecurity-platform` (project key for THIS repo — verify by reading from .planning/PROJECT.md or admin CRDB), `target_version: ${{ needs.version.outputs.version }}`
- Secrets: `ADMIN_API_TOKEN: ${{ secrets.ADMIN_API_TOKEN }}`
- `gate` runs ONLY for prod deploys (push to main), NOT for dev (push to dev). Use the same `if:` guard as `deploy-prod`.
- Update `deploy-prod` job's `needs:` array to include `gate` (in addition to whatever it already needs)
- DO NOT modify `deploy-dev` — gate is prod-only

### platform package.json — Version Bump
- Bump from current v2.13.14 to v2.13.15 (patch — CI/CD safety wiring, no behavior change to running app)
- Commit format: `v2.13.15: feat(ci-cd): wire gate-prod-version@v8.2 as needs: of prod deploy (CL-4 platform self-adopt)`

### What This Phase Does NOT Do
- Does NOT apply migration 0019 to CRDB — that's still a human UAT item from Phase 27 (must happen before this work merges to main)
- Does NOT add ADMIN_API_TOKEN to GitHub Actions secrets — Mike must set this manually in GitHub repo settings (human UAT step); the workflow file just references it
- Does NOT run a real prod deploy — that's the verification by doing
- Does NOT flip CL6_ENFORCEMENT_MODE from warn to enforce — that's a follow-up operational step after Phase 28's contrived UAT passes

### Claude's Discretion
- Exact placement of the `gate` job declaration in ci-cd.yml (after `version`, alongside `quality-gate`, before any deploy job)
- Exact phrasing of console output / step summary additions in the new v8.2 POST step
- Exact text of the curl error message on POST failure
- Whether to add a `## v8.2` section to shared-workflows README/CHANGES.md (if such file exists)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 27 (CL-6 endpoint contract)
- `src/app/api/platform/cicd/gate-verdict/route.ts` — destination endpoint; payload shape MUST match
- `.planning/phases/27-cl6-server-side-adoption/27-CONTEXT.md` — payload contract decisions

### shared-workflows v8.1 (baseline)
- `/Users/mikegeehan/claude/triarch/shared/shared-workflows/.github/workflows/gate-prod-version.yml` — the v8.1 workflow to modify
- Existing `Audit log to admin` step (lines ~252-272) — leave unchanged; new step goes BEFORE it

### Platform ci-cd.yml (consumer)
- `.github/workflows/ci-cd.yml` — the workflow to wire the gate job into
- Existing references to `triarchsecurity/shared-workflows/*@v8` and `@v8.1` for pattern

### Project conventions
- `~/claude/CLAUDE.md` — workspace rules (version bump, commit format, PR flow)
- `./CLAUDE.md` — project rules (DATABASE_URL is FAH secret, etc.)

</canonical_refs>

<specifics>
## Specific Ideas

- The platform project key in admin's `projects` table is likely `triarchsecurity-platform` — but the planner MUST verify by reading `.planning/PROJECT.md` or by querying admin's existing data. The wrong project_key here means the gate's GET version-snapshot returns wrong data and the POST verdict writes against the wrong row.
- The shared-workflows repo lives at `/Users/mikegeehan/claude/triarch/shared/shared-workflows` (local checkout of `triarchsecurity/shared-workflows`). All edits MUST be made there, not in MyAlterLego/shared-workflows (which is a different org's repo).
- Per workspace CLAUDE.md, shared-workflows updates also need version bumps — its convention is git tags (v8, v8.1, v8.2) NOT semver-in-package.json. Confirm by `ls /Users/mikegeehan/claude/triarch/shared/shared-workflows/package.json` — if none, it's a tag-only repo.
- The new POST step's payload must include `dev_version` per Phase 27's contract — the gate workflow already has this as an output, so it's available as `${{ steps.fetch.outputs.dev_version }}`.
- The `workflow_run_url` field gives admin the GitHub Actions run URL for cross-reference — useful when investigating CL-6 violations in admin's audit table.

</specifics>

<deferred>
## Deferred Ideas

- Cleaning up the broken `Audit log to admin` step (POSTs to non-existent /api/platform/audit) — harmless `continue-on-error: true`. Future cleanup phase if desired.
- Adding a richer payload to the new POST (commit_sha, branch, actor) — Phase 27's endpoint accepts only the minimal shape; expanding requires endpoint + workflow co-change.
- Replacing curl with a more structured client (e.g., gh CLI's HTTP utilities) — defer, curl works fine.
- Adding metrics/alerting on POST failure rate — defer to operations later.
- Automating the GitHub Actions secret provision for ADMIN_API_TOKEN — requires admin terraform/IaC for GitHub which doesn't exist yet.

</deferred>
