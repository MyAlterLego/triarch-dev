# SMB-CICD-Framework — Findings & Design Rethink (2026-05-10)

**Author:** Claude (with Mike) · **Status:** triage → redesign
**Audience:** Triarch framework authors (you)
**Trigger:** End-to-end dogfood run against `triarchsecurity/truthtreason` (private, org Free) and `triarchsecurity/tmi` (private, org Free) surfaced 4 critical issues with the current framework.

---

## TL;DR

The current `github-cicd-scaffold/.github/workflows/ci.yml` **fails at workflow scheduling on every Free org private repo it's been applied to** — 32/32 runs failed across truthtreason today, all with `jobs: []`, no log, "workflow file issue."

Three "fix" PRs (#19 trigger, #20 GHAS permissions, #5 baseline application) were merged but **none of them fixed the actual bug**. The real root cause was isolated tonight via 11 minimal-reproducible-workflow variants on `triarchsecurity/tmi#diagnostic/ci-yml-min`.

**Root cause:** the framework's ci.yml has 3 jobs (`checkov`, `tfsec`, `threat-model-drift`) gated by `if: hashFiles('<path>') != ''`. The `ci-passed` summary job has those 3 in its `needs:` array. When the matched paths don't exist in the repo (i.e. no `iac/**/*.tf`, no `.threatmodel/**`, no `Dockerfile`) — **the typical SMB starter state** — GitHub Actions rejects the workflow at scheduling.

This is **NOT GHAS-related, NOT plan-related, NOT permissions-related.** It happens on every plan tier, public or private, the moment a repo lacks the optional artifacts the conditional jobs scan.

The fix requires **a structural redesign of the framework's ci.yml**, not a config tweak.

---

## Section 1 — Confirmed evidence

### The bug

```yaml
# In github-cicd-scaffold/.github/workflows/ci.yml
jobs:
  checkov:
    if: ${{ hashFiles('iac/**/*.tf', 'iac/**/*.tofu') != '' || hashFiles('**/Dockerfile') != '' }}
    # ...
  tfsec:
    if: ${{ hashFiles('iac/**/*.tf', 'iac/**/*.tofu') != '' }}
    # ...
  threat-model-drift:
    if: ${{ hashFiles('.threatmodel/**') != '' }}
    # ...
  ci-passed:
    needs: [lint-test, semgrep, osv-scanner, gitleaks, checkov, tfsec, threat-model-drift]
    if: always()
    # ...
```

When `hashFiles(...)` returns `''` (the path matches nothing), the conditional job is skipped at scheduling. GitHub then attempts to wire `ci-passed.needs` to all 7 jobs but cannot satisfy the dependency chain on the skipped ones in a way the scheduler accepts. The workflow is rejected: `conclusion: failure`, `status: completed`, `jobs: 0`, no log endpoint, "This run likely failed because of a workflow file issue."

### Reproduction (variants 1–11 on `triarchsecurity/tmi#diagnostic/ci-yml-min`)

| Variant | Construct | Result |
|---|---|---|
| 1 (`ci-debug.yml`) | hello-world only | ✓ 1 job, success |
| 2 (`ci-debug2.yml`) | + `permissions: {}` + per-job `pull-requests: write` | ✓ 1 job, success → permissions theory wrong |
| 3 (`ci-debug3.yml`) | full `ci.yml` content copied verbatim | ❌ 0 jobs, fail (reproduces the bug in isolation) |
| 4 (`ci-debug4.yml`) | full minus `semgrep` + needs cleaned | ❌ 0 jobs → not the container image |
| 5 (`ci-debug5.yml`) | only `lint-test` | ✓ 1 job → top-level structure is fine |
| 6 (`ci-debug6.yml`) | + `ci-passed.needs` references nonexistent jobs | ❌ 0 jobs → `needs:` of undefined jobs is rejected (separate issue, not our case) |
| 7 (`ci-debug7.yml`) | + 3 unconditional scanner jobs + `ci-passed` | ✓ 4 jobs |
| **8 (`ci-debug8.yml`)** | + 1 conditional job (`if: hashFiles(...)`) needed by `ci-passed` | ❌ **0 jobs — the failure mode** |
| 9 (`ci-debug9.yml`) | same as 8 but no `if:` on the conditional | ✓ 3 jobs |
| 10 (`ci-debug10.yml`) | same as 8 but `if:` without `${{ }}` wrap | ❌ 0 jobs (so wrap is not the issue) |
| **11 (`ci-debug11.yml`)** | same shape as 8 but `if: false` (constant) instead of `hashFiles(...)` | ✓ 3 jobs (so `hashFiles(...)` specifically is the trigger) |

Variants 8 + 11 isolate the bug to the **interaction of `if: hashFiles(...) != ''` (returning empty at startup) AND `ci-passed.needs` referencing the gated job**. `if: false` doesn't reproduce. `hashFiles(...)` does. The skip-at-startup combined with the needs-graph is the failure.

(Variant runs visible in the GitHub UI under `triarchsecurity/tmi/actions?branch=diagnostic/ci-yml-min`. Cleanup PR pending.)

---

## Section 2 — Other gotchas surfaced today (secondary)

These remain real but are dwarfed by the structural issue above. They should still be fixed.

### 2.1 — `org Free` ≠ `personal Free` for branch features
The 2020 "branch protection became free for private repos" change applied to **personal** Free accounts, NOT **org** Free. Org Free locks `branches/<X>/protection`, `repos/.../rulesets`, AND environments-with-reviewers on private repos. (Public repos under org Free have full features.) Both `gap-analysis.md §8` and `deploy.md §8` were updated tonight to reflect this — were previously implying broader Free support.

### 2.2 — `gen.ts` R-3 detector too narrow
`tmi`'s `ci-cd.yml` deploys via a reusable workflow call (`uses: triarchsecurity/shared-workflows/...`) — no inline `environment:` block, no `deploy*.yml` filename. R-3 scored fail. Fix: also detect `uses:` of any reusable workflow as evidence of "deploys somewhere."

### 2.3 — `discovery.sh` CODEOWNERS check returns 404, not `[]`
The comment in discovery.sh ("empty array = clean") is wrong when no CODEOWNERS file exists at all. Output looks like an error to the customer when it's actually "no file." Wrap with: `gh api ... 2>/dev/null || echo "(no CODEOWNERS file)"`.

### 2.4 — sed-based scaffold customization creates duplicate refs
Replacing `@acme-corp/*` with a single user via sed produces lines like `@MyAlterLego @MyAlterLego` when the original had two team refs on the same line. Cosmetic, but reveals scaffold customization needs structured replacement, not regex. Consider a `bootstrap.sh` flag like `--owner @user-or-team` that produces a clean output.

### 2.5 — GHAS auto-rejection (the original misdiagnosis)
`security-events: write` requires GHAS on private repos. The framework's ci.yml has it on 4 jobs by default. **This DID need fixing** (and was, in tonight's edit to ci.yml + adding `continue-on-error: true` to upload-sarif steps). But this fix was **necessary AND insufficient** — even after fixing it, the workflow still failed at scheduling because of the deeper hashFiles+needs issue. I incorrectly attributed the persisting failures to GHAS for hours.

### 2.6 — Confirmation bias on "fix" PRs
I declared each fix-PR successful based on the PR's own merge clean — without verifying that the workflow itself succeeded after merge. **All 32 ci.yml runs failed**, three "fixes" later. The lesson for the framework is to ship a `verify-deployment.sh` or a deploy.md §10 step that runs `gh run list --workflow ci.yml --json conclusion --jq '[.[] | select(.conclusion=="success")] | length'` and reports back to the user — closes the loop.

---

## Section 3 — Proposed design rethink

Three options, increasing in scope.

### Option A — Surgical fix to current ci.yml (minimal change)

Keep the framework as-is but fix the broken pattern. Replace `if: hashFiles(...)` at the job level with a "detect-changes" gate job whose outputs drive the conditional scanners.

```yaml
jobs:
  detect:
    runs-on: ubuntu-latest
    outputs:
      has_iac: ${{ steps.detect.outputs.has_iac }}
      has_dockerfile: ${{ steps.detect.outputs.has_dockerfile }}
      has_threatmodel: ${{ steps.detect.outputs.has_threatmodel }}
    steps:
      - uses: actions/checkout@v4
      - id: detect
        run: |
          [[ -n "$(find iac -name '*.tf' -o -name '*.tofu' 2>/dev/null)" ]] && echo "has_iac=true" >> "$GITHUB_OUTPUT" || echo "has_iac=false" >> "$GITHUB_OUTPUT"
          [[ -n "$(find . -name 'Dockerfile' -not -path './node_modules/*')" ]] && echo "has_dockerfile=true" >> "$GITHUB_OUTPUT" || echo "has_dockerfile=false" >> "$GITHUB_OUTPUT"
          [[ -d ".threatmodel" ]] && echo "has_threatmodel=true" >> "$GITHUB_OUTPUT" || echo "has_threatmodel=false" >> "$GITHUB_OUTPUT"

  checkov:
    needs: detect
    if: needs.detect.outputs.has_iac == 'true' || needs.detect.outputs.has_dockerfile == 'true'
    # ...

  ci-passed:
    needs: [lint-test, semgrep, osv-scanner, gitleaks, detect, checkov, tfsec, threat-model-drift]
    if: always()
    # ...
```

**Pros:** preserves the conditional scanning behavior, single workflow, drop-in replacement.
**Cons:** still 7+ jobs, still complex, still requires GHAS-aware variant for SARIF upload, adds the `detect` job (small but extra cost).

### Option B — Ship a "lite" variant alongside (RECOMMENDED for the SMB-CICD-Framework name)

Two ci.yml flavors, customer picks at deploy time:

- **`ci-lite.yml` (default)** — 4 unconditional jobs: `lint-test`, `semgrep`, `osv-scanner`, `gitleaks`. No SARIF upload (works on Free private without GHAS). No conditional `hashFiles()` jobs. ~60 lines instead of 250. Closes C-6 fully.
- **`ci-full.yml` (opt-in)** — current shape but with the Option-A `detect` job fix and GHAS-aware permission opt-in. ~280 lines. Requires repo to have `iac/` and/or `.threatmodel/` and/or GHAS.

`deploy.md §5/R-2` decision tree:

```
GHAS available? (gh api .../code-scanning/default-setup → 200)
  └─ NO  → ship ci-lite.yml (no SARIF attempts)
  └─ YES → does repo have iac/, .threatmodel/, or Dockerfile?
            └─ NO  → ship ci-lite.yml (avoids the hashFiles+needs trap entirely)
            └─ YES → ship ci-full.yml (keeps IaC scans, with detect-job pattern)
```

**Pros:** matches the framework's own SMB positioning, deterministic deploy, minimum viable security gate works for everyone day 1, scales up later.
**Cons:** two files to maintain, deploy.md needs the decision logic.

### Option C — Single `ci.yml` that adapts via inputs (most ambitious)

`ci.yml` defaults to lite-shape; opt into full-shape via repo variable:

```yaml
# In ci.yml
jobs:
  checkov:
    needs: detect
    if: vars.TRIARCH_CICD_VARIANT == 'full' && needs.detect.outputs.has_iac == 'true'
```

Customer sets `gh variable set TRIARCH_CICD_VARIANT --body 'full' --repo $ORG/$REPO` to opt in.

**Pros:** one file, version-controlled variant, framework stays a single source of truth.
**Cons:** more cognitive load on the customer; the variant gate adds noise to every job's `if:`.

---

## Section 4 — Recommendation

**Option B**, for these reasons:

1. The framework's brand is "**SMB** CI/CD." The lite variant matches that audience: org Free, no GHAS, no IaC yet, single small repo. Today's failure shows the current `ci.yml` is anti-fit for that target.
2. Two-file model is simpler than Option C's variable gating — no runtime conditional, no surprise behavior from a forgotten `gh variable set`.
3. The "graduate to full" path is a discrete future decision (when the customer adds IaC or buys GHAS), not a setting buried in ci.yml.
4. `deploy.md §5/R-2` already has decision points; adding "GHAS yes/no + IaC yes/no → which file" is consistent with how the rest of the runbook works.

---

## Section 5 — Concrete files to create / modify

If Option B is chosen, ship:

### New files (in `github-cicd-scaffold/.github/workflows/`)

- **`ci-lite.yml`** — 4 jobs (`lint-test`, `semgrep`, `osv-scanner`, `gitleaks`). No `hashFiles()` conditionals, no `upload-sarif` steps, no `security-events: write`. ~60 LOC. Targets Free private + Team without GHAS + any plan that doesn't yet have IaC.
- **`ci-full.yml`** — current `ci.yml` reshaped with the `detect` job pattern + GHAS opt-in (security-events:write commented out by default; readme explains the un-comment). ~280 LOC. Targets repos with IaC + GHAS.

### Files to modify

- **`ci.yml`** — keep as-is (the canonical "full" template, now Option B's `ci-full.yml`); OR delete and force a choice between lite/full at deploy time. Recommend the latter.
- **`deploy.md §5/R-2`** — add the GHAS + IaC decision tree above. Keep the "Don't deviate" note in §9 but allow lite/full as the two valid shapes.
- **`deploy.md §8` edge cases** — add: "Customer's repo has none of `iac/`, `.threatmodel/`, `Dockerfile` AND no GHAS → ship ci-lite.yml unconditionally. The conditional jobs in ci-full.yml will reject the workflow at scheduling."
- **`gap-analysis.md §3` validation matrix** — C-6 row: pass criterion is "any one of {Semgrep, OSV, Gitleaks, Checkov, tfsec} AND the workflow actually starts successfully." Currently scores pass purely on workflow content; should also probe `gh run list --workflow X --limit 5 --json conclusion` and report "scanners present but workflow never starts" as a partial.
- **`discovery.sh`** — add a probe section: `gh run list --workflow ci.yml --limit 10 --json conclusion --jq '[.[] | select(.conclusion=="success")] | length'` — surfaces "ci.yml present but never succeeded" up front.
- **`README.md`** — table of "which variant to ship per customer profile."

### Cleanup

- **`triarchsecurity/tmi`** — close PR #151, delete branches `chore/triarch-cicd-baseline` and `diagnostic/ci-yml-min`. Re-apply with `ci-lite.yml` once the framework ships it.
- **`triarchsecurity/truthtreason`** — the merged ci.yml still fails on every push. Either revert it (PR), or replace with ci-lite.yml in a fast-follow PR. The framework files (CODEOWNERS, dependabot, threat model, pre-commit) are fine and provide value as-is.
- **Other 2 public repos that got branch protection** (`shared-workflows`, `platform`, `shared-utils`) — those are unaffected; protection works.

---

## Section 6 — Open question for the framework authors

What's the **support matrix** for the framework?

- (a) "Free org private + no GHAS + no IaC + no .threatmodel" — i.e. day-1 SMB. **MUST work.** Lite variant addresses this.
- (b) "Free org private + GHAS + IaC + .threatmodel" — exists in theory but unusual (paying for GHAS while staying on org Free is strange).
- (c) "Team + GHAS + IaC + .threatmodel" — the framework's "happy path" today. Should keep working — full variant.
- (d) Public repo on any plan — full features by default, both variants work.

If (a) is in scope (and the framework's name says it is), Option B is the minimum required redesign.

---

## Section 7 — Process lessons (for next time)

1. **Verify the workflow ran, not just that the PR merged.** Add `gh run list --workflow X --json conclusion` to every deploy summary.
2. **Don't trust "GitHub rejected the workflow" messages** — use the variant-isolation method (binary-search by stripping jobs) to find the actual cause. Took 11 minimal-reproducible variants tonight; could have taken 3 if I'd started with this method instead of guessing.
3. **`org Free` is more restricted than personal Free.** Carry this in framework docs explicitly — every new contributor will trip on it.
4. **Frameworks need a `make test` that exercises the framework against a throwaway test org/repo.** Today's pipeline had no integration test; bugs only surface at customer deploy time. Recommend setting up a `triarchsecurity/cicd-framework-test` repo with a CI matrix that applies the framework + checks the resulting workflows actually start.

---

**End of original findings.** Ready to implement Option B if approved. Branch this doc into a tracking issue or hand it to your future self for the redesign sprint.

---

## Addendum (later same day) — additional gotchas surfaced during Option B test-deploy

After implementing Option B and deploying `ci-lite.yml` to `triarchsecurity/tmi` for end-to-end validation (PR #162), three more action-level bugs in the scaffold surfaced. All fixed in this commit set.

### A1 — `gitleaks-action` requires a paid license for ORG accounts
The scaffold's `ci.yml` used `gitleaks/gitleaks-action@v2.3.7`. On any **org** repo (personal accounts excluded), this Action errors out: `[<org>] is an organization. License key is required. ... store it as a GitHub Secret named GITLEAKS_LICENSE.` See https://github.com/gitleaks/gitleaks-action#-announcement.

**Fix:** replaced the Action with direct binary install (`curl` the gitleaks tarball + run from `$PATH`). Equivalent functionality, no license requirement, no commercial dependency. Lite + full both updated.

### A2 — `google/osv-scanner-action@v1.7.0` doesn't exist; v2 is a monorepo
The scaffold pinned `google/osv-scanner-action/osv-scanner-action@v1.7.0`. The repo has **no v1.x tags at all** — only v2.1.0 through v2.3.5. So the v1.7.0 ref always failed with `unable to find version v1.7.0`. Bumping to bare `google/osv-scanner-action@v2.3.5` then fails with `Top level 'runs:' section is required` because the v2 repo is a **monorepo** — actual sub-actions live in subdirectories.

**Fix:** correct ref is `google/osv-scanner-action/osv-scanner-action@v2.3.5` (sub-action path syntax). Lite + full both updated.

### A3 — `osv-scanner` v2 dropped CLI flags
v2 removed `--skip-git` (now default behavior) and renamed output args (now `--format=<sarif|json> --output=<path>` instead of legacy `--sarif=<path>`). Scaffold args still used the v1 syntax → `Incorrect Usage: flag provided but not defined: -skip-git`.

**Fix:** drop `--skip-git`, use `--format=<x> --output=<path>`. Both variants updated. Also added `continue-on-error: true` on osv-scanner — known vulnerabilities should surface but not block PRs (Dependabot opens fix PRs; that's the remediation channel).

### A4 — `lint-test` enforcement is hostile on SMB onboarding
Real codebases (incl. tmi: 42 ESLint errors) have lint debt. Failing the workflow on first deploy is anti-onboarding.

**Fix (lite only):** added `continue-on-error: true` to the `npm run lint` step. Lint runs and reports, but doesn't block. Customers can flip this to required once their lint debt is cleared. Full variant keeps lint required (full users opted in to stricter standards).

### A5 — `push: branches-ignore: [main]` causes Dependabot startup failures on private repos
Was the original "fix" attempted in PR #19 on truthtreason. Restated for completeness in both variants now: use `push: branches: [main]` (post-merge sweep only). Dependabot push events have a read-only `GITHUB_TOKEN` that can't grant `pull-requests: write` per-job permissions — surfaces as `jobs: []`. The `pull_request` trigger covers Dependabot PRs cleanly.

### Validation evidence

After A1–A5 fixes, on `triarchsecurity/tmi` PR #162:

```
=== final per-job status ===
{"conclusion":"success","name":"lint-test","status":"completed"}
{"conclusion":"success","name":"gitleaks","status":"completed"}
{"conclusion":"success","name":"semgrep","status":"completed"}
{"conclusion":"success","name":"osv-scanner","status":"completed"}
```

**4/4 jobs success.** First confirmed end-to-end run of the framework on a Free org private repo. Run URL: https://github.com/triarchsecurity/tmi/actions/runs/25642630891.

### Iteration count to reach success

The path from "framework breaks on tmi" to "4/4 success" took **5 deploy iterations** of ci-lite.yml on PR #162:

| Iteration | Change | Result |
|---|---|---|
| 1 | initial copy (broken `ci.yml` from PR #151 replaced with `ci-lite.yml`) | 1/4 (semgrep ✓; lint+gitleaks+osv ✗) — proves structural fix worked, surfaces 3 action-level bugs |
| 2 | + gitleaks binary, + osv@v2.3.5, + lint advisory | 3/4 (osv ✗ "Top level 'runs:' required") |
| 3 | + osv sub-action path | 3/4 (osv ✗ "flag not defined: -skip-git") |
| 4 | + osv v2 args (no --skip-git) + continue-on-error | **4/4 ✓** |
| 5 | (none — confirmation) | **4/4 ✓** |

Lesson: the framework's CI configuration needs **integration testing against a real throwaway repo** in the framework's own CI. None of these bugs would have made it past a `make test-framework` step that applies the scaffold to a fixture repo and verifies all jobs pass.

This is captured in §7 process lesson #4 (above) and should be the first redesign-sprint task.

