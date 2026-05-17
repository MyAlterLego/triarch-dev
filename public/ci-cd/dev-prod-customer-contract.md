# Dev/Prod Distinction Contract — Customer-Facing

> **What this is.** The set of rules every Triarch-built system must follow so that a customer can always tell, at a glance and with certainty, whether they are looking at `dev` or `prod` — and so that prod can never silently drift from the dev version the customer last reviewed.
>
> **Audience.** Customers of any Triarch system. Triarch engineers wiring projects. Anyone reading admin.triarch.dev.
>
> **Status.** This is a contract, not a wishlist. Each clause has an explicit enforcement mechanism (today) and a compliance gate (server-side). A project that violates any clause is marked **non-compliant** on the admin compliance matrix and its prod deploys are blocked.

---

## The six clauses

| # | Clause | What customer sees | Enforcement |
|---|--------|--------------------|-------------|
| **CL-1** | Hostname tells the customer which env they're in. | `<name>-dev.<zone>` for dev, `<name>.<zone>` (or external brand `.com`) for prod. | Admin compliance check: project's `dev_url` MUST end with `-dev.` segment OR resolve via a documented exception (brand sub-zone). |
| **CL-2** | UI displays a persistent environment badge on dev. | Visible "DEV" pill in the page header on every dev URL. | Shared-ui `<EnvBadge env={...} />` component; admin compliance scan fetches dev URL and asserts presence. |
| **CL-3** | Dev and prod write to distinct database namespaces. | (Invisible to customer; data they see in dev is dev-only.) | CRDB database name MUST be `<project>_dev` for dev, `<project>` for prod. Admin compliance reads `apphosting.dev.yaml` and `apphosting.yaml` and asserts the `DATABASE_URL` paths differ. |
| **CL-4** | Prod can never run a version dev hasn't shipped. | The version a customer reviewed on dev is the exact version they see in prod when promoted. | `shared-workflows/gate-prod-version.yml@v8.1` runs as a `needs:` prerequisite of every prod deploy. Invariants INV-1..5 (see [deployment-gating.md](/ci-cd/deployment-gating.md) or admin's `/api/platform/version-snapshot`). |
| **CL-5** | Customer can read what changed between dev and prod. | `/projects/[slug]/releases` shows two clearly-separated lanes: "On dev (v…)" and "On prod (v…)" with the diff list. | Existing page (platform repo); admin compliance verifies route returns 200 for any project with `prod_visible_to_customer=true`. |
| **CL-6** | Adoption is not opt-out. | The compliance matrix at admin.triarch.dev/admin/modules/ci-cd shows every project's status against all 5 clauses; non-compliant projects can't promote to prod. | Server-side: the platform `/api/platform/ingest/release-logs` endpoint rejects any `env=prod` release row that does not have a paired `deploy_gate_check` audit row with `verdict=pass` and matching `target_version`, written within the prior 15 minutes by the same project. This means: even if a consumer repo strips its workflow gate, the admin refuses the prod release ingest, the release row never appears, and the prod deploy is functionally void. |

---

## CL-1 — Hostname pattern

**Rule.** Every project has two host shapes, both registered in DNS:

- **dev**: `<short>-dev.<zone>` (e.g., `admin-dev.triarch.dev`, `portal-dev.triarchsecurity.com`)
- **prod**: `<short>.<zone>` (e.g., `admin.triarch.dev`, `portal.triarchsecurity.com`) — OR an external customer brand `.com` (e.g., `truthandtreason.com`, `tmiengine.com`) for products with their own identity.

**Why.** A customer who copies a URL to email or chat must communicate which env they meant. The host carries that — no out-of-band labeling required.

**Exceptions.**
- External brand domains (CL-1.a): a product's prod can live on its brand `.com` provided the `.triarch.dev` sister still resolves to the same backend. Both are valid prod URLs; the brand `.com` is the customer-preferred one.
- Internal-only projects (CL-1.b): admin-only systems (e.g., `admin.triarchsecurity.com`) follow the same shape but customers do not access them; the contract still applies for staff disambiguation.

**Enforcement today.** DNS sweep is manual (per the 2026-05-14 walkthrough). Compliance audit MUST be automated as part of [admin compliance matrix](/admin/modules/ci-cd).

**Adoption state (2026-05-16):** 1 of 7 dev shortnames resolves in DNS (`darksouls-dev.triarch.dev`). Six are NXDOMAIN — see roadmap.

---

## CL-2 — Persistent environment badge

**Rule.** Every dev URL MUST render an environment badge — a visible pill in the page header (or equivalent persistent chrome) reading **`DEV`**. Prod renders nothing (or, optionally, a faint version pill for the customer's reference).

**Why.** A customer who has both dev and prod open in browser tabs must distinguish them by chrome, not by inspecting URL text. The badge is a single-glance indicator.

**Component.** `@triarch/shared-ui` exports `<EnvBadge env={process.env.NEXT_PUBLIC_ENV} />`. Apps MUST mount it in the root layout. The component reads `NEXT_PUBLIC_ENV` (set by FAH apphosting.dev.yaml / apphosting.yaml) and renders only when value is `dev` or `staging`.

**Enforcement.** Admin compliance fetches the project's `dev_url`, parses the response for the `data-env="dev"` attribute the badge emits, and asserts presence. Missing badge → CL-2 fail → red row on compliance matrix.

**Adoption state (2026-05-16):** Component not yet built in shared-ui. Tracked as roadmap item.

---

## CL-3 — Database namespace separation

**Rule.** A project's dev backend and prod backend MUST connect to distinct logical CRDB databases:

- prod: `<project_key>` (e.g., `triarchsecurity_admin`)
- dev: `<project_key>_dev` (e.g., `triarchsecurity_admin_dev`)

Sharing a CRDB cluster is permitted (operational simplification); sharing a database within that cluster is NOT.

**Why.** A customer who uploads test data to dev (a contract, a contact, a deal) must never see it accidentally appear in prod or color a real metric. Same database = same risk; namespace = the line.

**Enforcement.** apphosting.dev.yaml MUST set `DATABASE_URL` with `/dbname=${project_key}_dev`; apphosting.yaml MUST set `/dbname=${project_key}`. Admin compliance reads both files via the repo's raw GitHub content URL and asserts the path suffixes differ.

**Adoption state (2026-05-16):** Most projects currently share a cluster; database separation is partial (some projects have `_dev` databases, some use the same DB with a `dev_` table prefix). Audit + migration tracked as roadmap item.

---

## CL-4 — Version promotion gate

**Rule.** A version V can be deployed to prod only if:

- **INV-1** — A dev release for the project exists.
- **INV-2** — `V ≤ dev_version` (can't promote what dev hasn't seen).
- **INV-3** — `V > prod_version` (no rollback via prod deploy — use a hotfix branch with a higher version).
- **INV-4** — `V == dev_version` (the exact version that ran on dev is the version that ships).
- **INV-5** — `dev_age ≥ 300s` (dev gets a 5-minute bake window).

**Why.** A customer who approved a feature on dev v3.55.0 deserves to see exactly v3.55.0 in prod — not v3.55.1 with a "tiny tweak" snuck in, not v3.55.0 from yesterday's branch that drifted. The gate is the formal version of the customer's trust.

**Enforcement (workflow side).** `shared-workflows/gate-prod-version.yml@v8.1` is a `workflow_call` reusable. Every project's prod-deploy job MUST declare it as `needs:`. The gate fetches `/api/platform/version-snapshot` and exits non-zero if any invariant fails. Full spec: [deployment-gating.md](/ci-cd/deployment-gating.md).

**Enforcement (server side).** See CL-6.

**Adoption state (2026-05-16):** 0 of 7 consumer repos have wired the gate. Roadmap target: platform + dev-portal + darksouls + tmi + truthtreason in week-1; security-admin + security-portal in week-2.

---

## CL-5 — Customer-readable release page

**Rule.** Every customer-shareable project MUST surface a page at `/projects/<slug>/releases` (on admin.triarch.dev, with project-member auth) that shows two lanes:

- **On dev (v X.Y.Z)** — the version currently running on the dev backend + the changelog summary
- **On prod (v X.Y.Z)** — the version currently running on the prod backend + the changelog summary

When the two lanes differ, the page surfaces "Pending promotion (v X.Y.Z)" with a one-line summary of what changed since prod.

**Why.** Customer alignment requires a single page that answers: "what am I about to get?" The page replaces 1:1 emails about release timing.

**Enforcement.** Admin compliance HEAD-checks the URL for any project where `prod_visible_to_customer=true` in the projects table. 200 → pass; anything else → fail.

**Adoption state (2026-05-16):** Page exists on platform (`/projects/[slug]/releases`); customer-portal integration TBD per project.

---

## CL-6 — Adoption-is-not-opt-out (server-side enforcement)

**Rule.** The platform admin refuses to record any `env=prod` release ingest unless it can pair the ingest with a `deploy_gate_check` audit row meeting ALL of:

- same `project_key`
- same `target_version`
- `verdict=pass`
- written within the prior 15 minutes
- written by the same Bearer apiKey

**Why.** Without this, the only thing standing between "compliant project" and "non-compliant project" is the project's own YAML. A repo could strip the `needs: gate` line and the gate becomes opt-out. CL-6 closes that hole at the server: even if the workflow gate is missing, the prod release row never gets written. No release row → admin shows the project as "deploy did not complete" → the actual deploy still ran in Firebase (we can't stop that) but the prod release is unrecognized by the platform, the compliance matrix flags it, and the customer-facing release page shows the prior prod version.

**Implementation.** In `src/app/api/platform/ingest/release-logs/route.ts`, when `env=prod`, look up the most recent audit row for `(project_key, action=deploy_gate_check)` within 15 minutes. If absent or verdict != pass or target_version mismatch → return 409 with a structured error, do NOT insert. Audit-log the rejection separately.

**Enforcement of CL-6 itself.** This is the meta-clause: it's enforced by being in code, not in YAML. A consumer repo can't bypass it.

**Adoption state (2026-05-16):** NOT YET BUILT. This is the most important code change in the roadmap; without it, CL-4 is opt-out. Implementation tracked as a P0 in the GSD milestone.

---

## How to promote — by environment

The 6 clauses say WHAT must be true. This section says HOW you actually move code through them. Every project follows the same branch → environment → backend mapping; the only choice is which UI/CLI you use to fire the promotion.

### Branch → environment → backend mapping

| Branch | Triggers deploy to | FAH backend | Customer-visible host |
|--------|--------------------|--------------|------------------------|
| feature branch | (nothing — opens PR) | — | — |
| `dev` | dev backend (after PR merge) | `<app>-dev` | `<app>-dev.<zone>` (CL-1) |
| `staging` *(optional)* | staging backend | `<app>-staging` | `<app>-staging.<zone>` |
| `main` | prod backend (after PR merge + cl4-gate pass) | `<app>` | `<app>.<zone>` |

Every project ships with `dev` + `main`. Staging is an optional third environment — recommended when team headcount, compliance, or release-cadence-discipline warrants the extra slot. If you add staging, the rules below apply identically: stage promotion mirrors dev promotion mechanics, and the `staging → main` PR is gated by cl4-gate the same way `dev → main` is.

### Deploy to DEV

1. Cut a feature branch off `dev`: `git checkout -b feat/<name> dev`
2. Push commits
3. Open PR with **base=`dev`**
4. CI runs quality-gate; PR merges (squash or merge commit — your call for feature → dev)
5. Push to `dev` triggers `deploy-dev` job → deploys to `<app>-dev` FAH backend
6. Container starts → ingests `release_logs` with `env=dev` → admin's `version-snapshot` updates
7. Customers see new code at `<app>-dev.<zone>` with the DEV badge (CL-2)

**Failure cases:** CI fails (quality-gate) → PR can't merge. Deploy-dev fails (build error / secret missing) → dev backend keeps the previous version, admin doesn't update.

### Deploy to STAGING *(if staging exists)*

Same flow, just bump up one branch:

1. Branch off `staging`: `git checkout -b promote/<version> staging`
2. PR with **base=`staging`** from `dev` (or from a hotfix branch)
3. Merge → push to `staging` triggers deploy to `<app>-staging` backend
4. Customer-visible at `<app>-staging.<zone>` with STAGING badge (CL-2 renders for both dev and staging envs)

Staging is the customer-visible "preview release" lane. You can preview a release branch here with stakeholders before opening the prod PR.

### Deploy to PROD

This is the big one. **Three equivalent paths** — pick whichever your team prefers:

#### Tier 1 — Plain PR (zero new tooling)

The default for solo devs and small teams.

1. Open PR with **base=`main`** **head=`dev`** (or **`staging`** if you use it)
2. CI runs: quality-gate → version → cl4-gate → verify-dev-deployed (all must pass)
3. Merge with **"Create a merge commit"** (NOT squash — the merge commit makes dev's tip a parent of main HEAD; verify-dev-deployed requires that ancestry)
4. Push to `main` triggers `deploy-prod` → deploys to `<app>` backend
5. Customers see new code at `<app>.<zone>` (no badge — prod chrome)

#### Tier 2 — Slack (`/triarch deploy`)

For teams already in their Triarch-managed Slack.

```
/triarch deploy <project-key> <version>
```

OttoBot:
- Looks up the project in admin's CRDB → finds the GitHub repo
- Finds the release_logs row for `(project, version)` → extracts the branch (usually `dev`)
- Dispatches `promote-branch.yml` on the project's repo → rebases the branch onto `main` and merges
- Posts the resulting GitHub Actions run URL back to the channel

Customer setup cost: 0 (the slash command works if your project is in admin and you're staff).

#### Tier 3 — `gh workflow run` (CLI)

For teams that want to script promotions but don't have Slack integration.

```bash
gh workflow run promote-branch.yml --repo <owner>/<repo> --ref main \
  --field branch=dev --field target_branch=main
```

Requires the project's `promote-branch.yml` wrapper (a ~30-line workflow_dispatch file that references `shared-workflows/promote-branch.yml@v4`). Same end result as Tier 2.

#### Tier 4 — Per-project admin pipeline page

For teams running this Triarch platform — per-project staff UI at `admin.triarch.dev/admin/modules/pipeline/<slug>` includes a "Promote to production" button next to each approved RC. Two-step confirm modal, then same dispatch path as Tier 2/3.

### What blocks each promotion path

| Block | When it fires | What you do |
|-------|---------------|-------------|
| CI quality-gate | Every PR | Fix the code (lint/test/build error) |
| cl4-gate INV-1..5 | Every prod PR | Make sure dev has the exact version you're promoting (INV-4: target == dev_version). Wait 5 min if dev was just deployed (INV-5: dev age ≥ 300s). |
| verify-dev-deployed | Every prod push | Merge with "Create a merge commit", not squash. If you squashed, re-merge dev → main with `--no-ff` (creates a real merge commit on main with dev's tip as a parent — see firebase-2env-pattern.md §"Recovery if a dev → main PR was squash-merged by mistake"). |
| CL-6 server-side | Every prod ingest | If cl4-gate didn't run or didn't post a verdict, admin's ingest returns 409 + audit. Inspect the run logs. |

### Hotfix path

There is no hotfix bypass. Even hotfixes go through dev:

1. Branch off `main`: `git checkout -b hotfix/<bug> main`
2. Bump version (patch — e.g., `v3.59.1`)
3. PR with **base=`dev`** → merge → dev backend deploys the hotfix (verify there)
4. PR `dev → main` → merge with merge commit → prod deploys
5. Total wallclock: ~10 minutes including dev verification

The `[hotfix-bypass-dev]` token that previously skipped dev was removed 2026-05-14. Hotfixes follow the same gates as features.

---

## Compliance matrix

The matrix at [admin.triarch.dev/admin/modules/ci-cd](https://admin.triarch.dev/admin/modules/ci-cd) renders a row per project × column per clause:

```
                 CL-1   CL-2   CL-3   CL-4   CL-5   CL-6
platform          ✓     ✗     ✗     ✗     ✓     ✗     ← 6 clauses, 2 pass
dev-portal        ✓     ✗     ✗     ✗     ✓     ✗
darksouls         ✓     ✗     ✗     ✗     ✓     ✗
tmi               ✗     ✗     ✗     ✗     ✓     ✗
truthtreason      ✗     ✗     ✗     ✗     ✓     ✗
security-admin    ✗     ✗     ✗     ✗     —     ✗
security-portal   ✗     ✗     ✗     ✗     —     ✗
```

(— = clause N/A for staff-only/internal apps)

A project is **compliant** only when all applicable clauses pass. The roadmap reaches full compliance project-by-project, in the order on the matrix.

---

## Exceptions

- **External brand domains** for prod (CL-1.a): truthandtreason.com, tmiengine.com, future triarchrpg.com. The `.triarch.dev` sister continues to resolve as a dev/staging surface.
- **Internal-only projects** (CL-1.b, CL-5 N/A): admin.triarchsecurity.com, admin.triarch.dev — staff-only. CL-5 (customer release page) is N/A; remaining clauses still apply for staff distinguishability.
- **Personal projects** (mikegeehan-finances, feng-shui-rpg scaffold): explicitly out of scope. Marked `framework_scope=false` in projects table.

---

## Adoption tracking

- **Roadmap**: [Triarch Portfolio Alignment Deep Dive · 2026-05-16](../../../USER/BRIEFINGS/artifacts/2026-05-16-portfolio-alignment-deepdive.html) — section 5 (short-term) and 6 (longer-term) sequence the implementation per clause.
- **GSD milestone**: `M-cl-distinction` — drives the execution against this contract; see `.planning/MILESTONES.md` in this repo once registered.

---

## FAQ

**Q: Why six clauses instead of one big "make dev and prod different"?**
A: Each clause is independently verifiable and independently breakable. A project can pass CL-4 (version gate) but fail CL-3 (database namespace) and still be wrong. The matrix surfaces both. Compound rules hide failures.

**Q: Can a project be "mostly compliant"?**
A: For UI purposes, yes — the matrix shows partial scores. For PROMOTION purposes, no — CL-6's server check is binary: pass or block. A project must reach full clause-4 + clause-6 compliance before its prod deploys are accepted.

**Q: What if a customer asks for a dev URL without `-dev` in it for marketing reasons?**
A: They can't have it. The clause is the contract — a dev URL without the `-dev` shortname is a different product (a staging-promoted-as-prod surface), not a dev URL. If the customer wants a beta surface, give them a separate `beta.<brand>.com` that follows CL-4..6 as if it were prod.

**Q: This adds friction. What if we need to ship fast?**
A: Bump version on a `hotfix/*` branch → push to `dev` (auto-deploys, ~3 min) → wait 5-min bake → promote dev → main. ~10 minutes end-to-end. There is no shortcut by design — Mike asked for "no bypass regardless of how many corners anyone wants to cut."

---

*Authored 2026-05-16 · canonical home: `triarchsecurity/platform/public/ci-cd/dev-prod-customer-contract.md` (served at admin.triarch.dev/ci-cd/dev-prod-customer-contract.md once deployed). Workspace `~/claude/CLAUDE.md` references this doc; do not duplicate clauses there.*
