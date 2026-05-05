# Phase 2: shared-workflows Hardening - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves what was considered.

**Date:** 2026-05-05
**Phase:** 02-shared-workflows-hardening
**Mode:** auto (recommended defaults selected for all gray areas)
**Areas discussed:** Auth pattern, Callback failure handling, Branch URL semantics, Workflow versioning, Payload contracts, Schema interaction

---

## Auth pattern for shared-workflows → admin callbacks

| Option | Description | Selected |
|--------|-------------|----------|
| Bearer with per-project Actions secret (ADMIN_API_TOKEN) | Each consuming repo holds its own apiKey from CRDB as Actions secret. Admin verifies via existing requireApiKey. Same pattern as v1.14 onboarding. | ✓ |
| Vault-backed shared token | Have shared-workflows read a single ADMIN_API_TOKEN from triarch-vault | |
| Signed JWT from a service account | Token-less; admin verifies signature | |

**Selected:** Bearer with per-project Actions secret.
**Rationale (auto):** Existing admin endpoint already verifies via `requireApiKey`. ADMIN_API_TOKEN is per-project (each project's `projects.apiKey`), not a shared secret — vault is overkill here.

---

## Callback failure handling

| Option | Description | Selected |
|--------|-------------|----------|
| `continue-on-error: true` + workflow summary annotation | Deploy success isn't blocked by a missed callback; summary surfaces it | ✓ |
| Fail the workflow on callback failure | Strict consistency between deploy and admin record | |
| Retry 3x then fail | Defensive but adds workflow complexity | |

**Selected:** continue-on-error + summary annotation.
**Rationale (auto):** Deploy is the source of truth. Admin should reconcile via cron / `recover-deploy` (existing pattern). Don't fail a successful deploy because admin is briefly down.

---

## Branch deploy URL semantics (WORKFLOW-03)

| Option | Description | Selected |
|--------|-------------|----------|
| Use FAH auto URL `https://<branch>--<backend>.<region>.hosted.app`, capture as `previewUrl` field | FAH already provides this pattern; admin records it for Phase 7 RC tracking | ✓ |
| Custom subdomain via DNS | Adds operational overhead | |
| No URL capture in admin | Loses information for multi-branch RC | |

**Selected:** FAH auto URL captured as `previewUrl`.
**Rationale (auto):** Cheapest, follows Firebase App Hosting docs, and the Phase 7 multi-branch RC work needs this URL.

---

## Where to develop shared-workflows changes

| Option | Description | Selected |
|--------|-------------|----------|
| Modify `MyAlterLego/shared-workflows` main, tag `v2`, keep v1 stable | Standard versioning. Each consumer opts in by bumping ref. | ✓ |
| Force-update v1 tag in place | Risks breaking other consumers | |
| Fork to project-specific repo | Loses cross-project reuse benefit | |

**Selected:** Tag v2, keep v1 stable, consumers bump ref.
**Rationale (auto):** Standard semantic versioning for shared workflows. Ensures backward compat for opt-in consumers.

---

## Payload field choice for previewUrl

| Option | Description | Selected |
|--------|-------------|----------|
| Add as new top-level `previewUrl` column on release_logs | Explicit, queryable, indexable | ✓ (Claude's discretion at planning) |
| Stuff into existing `metadata` JSONB | Zero schema change, slower to query | |

**Selected:** Claude's discretion — planner picks based on query patterns expected in Phase 7. Defaulting to "add column" pending Phase 7 review.

---

## releaseType heuristic

| Option | Description | Selected |
|--------|-------------|----------|
| Always `"patch"`, manual edit if wrong | Simple, no version diff logic | ✓ (initial) |
| Heuristic from semver diff (compare prev release's version) | Auto-correct major/minor/patch | (deferred) |

**Selected (auto):** Always "patch" for now; semver-diff heuristic deferred as a backlog refinement.
**Rationale:** Don't add complexity to the workflow; release manager can correct via UI.

---

## Claude's Discretion

- Exact `firebase apphosting:rollouts:create` output parsing for previewUrl
- Whether `previewUrl` becomes a column or a `metadata` key
- Workflow step naming and bash extraction details
- Whether to extract a reusable composite action vs inline shell

## Deferred Ideas

- promote-branch.yml workflow (Phase 4 / WORKFLOW-04)
- Slack conflict notifications (Phase 5 / WORKFLOW-05)
- Semver diff heuristic for releaseType
- Reusable composite action extraction
- Bumping other Triarch repos (portal, darksouls, etc.) to v2
