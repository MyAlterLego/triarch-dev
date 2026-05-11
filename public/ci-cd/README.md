# Triarch SMB CI/CD Framework

**Audit-ready CI/CD for SMB engineering teams in days, not months.**

This package gives you a hardened, reviewer-gated, security-scanned GitHub pipeline that drops onto any new or existing repo. It assumes you have one cloud, one app, and a handful of engineers — not a security team, not a Kubernetes platform, not a six-month onboarding budget.

---

## What you'll have when you're done

- ✅ Every PR runs **Semgrep** (SAST) + **OSV-Scanner** (SCA) + **Gitleaks** (secrets) before merge
- ✅ `main` branch protected: PR-only, linear history, no force-push, no direct delete
- ✅ Three GitHub environments (`dev` / `staging` / `prod`) with branch policies
- ✅ Dependabot opens vulnerability + version-update PRs weekly
- ✅ CODEOWNERS file enforces review on sensitive paths (`.github/`, `iac/`, etc.)
- ✅ Threat model placeholder + drift-detection check
- ✅ Slack/email notification on every deploy
- ✅ Pattern matches the [target architecture](https://www.triarch.dev/ci-cd/cicd-overview.html) on day-1 SMB tier

---

## 5-minute quickstart

You'll need:
- `gh` CLI authenticated to your GitHub org (`gh auth login --scopes "repo,workflow,admin:org"`)
- A target org + repo to apply this to
- ~15 minutes for Claude Code to drive the work

```bash
# 1. Download the package
curl -sL https://www.triarch.dev/ci-cd/triarch-cicd-package.zip | tar -xz
cd triarch-cicd-package

# 2. Run discovery against your repo (read-only — captures NO secrets, just metadata)
./github-cicd-scaffold/discovery.sh YOUR_ORG YOUR_REPO

# 3. Hand the discovery output + gap-analysis.md to Claude Code:
#       "Run gap-analysis.md against discovery-<timestamp>.txt for YOUR_ORG/YOUR_REPO"
#    Claude produces a Triarch-branded HTML report scoring each item.

# 4. Hand deploy.md to Claude Code:
#       "Apply the gaps in gap-analysis-YOUR_ORG-YOUR_REPO-<date>.html using deploy.md"
#    Claude opens PRs to fix the gaps. You review and merge.

# 5. After PRs merge, push a small change to trigger CI on a new branch and verify
#    the security gates run + the deploy lands.
```

---

## Pick your variant: `ci-lite.yml` (default) vs `ci-full.yml` (opt-in)

| Variant | Use when | What it runs |
|---|---|---|
| **`ci-lite.yml`** ← **default** | Day-1 SMB. No IaC yet. No GitHub Advanced Security. | 4 unconditional jobs: lint-test, semgrep, osv-scanner, gitleaks |
| **`ci-full.yml`** ← opt-in | Repo has `iac/` (Terraform/OpenTofu) **and** `.threatmodel/` **and** GHAS | Adds: Checkov + tfsec (IaC scanning) + threat-model-drift + SARIF upload to Security tab |

The `deploy.md` runbook makes this decision for you based on `discovery.sh` output. **You almost certainly want lite first.** Switch to full when you grow into it.

---

## Plan-tier reality

This is a 3-tier framework. Be honest about which you're on:

| Tier | What works on PRIVATE repos | What you give up |
|---|---|---|
| **Org Free** | Files only (CODEOWNERS, Dependabot, threat-model placeholder, ci-lite.yml). No branch protection, no rulesets, no environments-with-reviewers. | Pipeline gates can't be enforced; security scans run but can't block merge. |
| **Org Team** ← framework's assumed baseline | Everything above + branch protection, rulesets (signed commits, linear history, required reviews, required status checks), basic environments. | Env-level reviewers + wait timers (those are Enterprise-only on private repos). |
| **GitHub Enterprise Cloud** | Everything above + env-level required reviewers + wait timers + GHAS (Code Security) for SARIF upload to Security tab. | Nothing — full architecture diagram realized. |

Public repos always get full features regardless of plan.

The `gap-analysis.md` rubric tags items as REQUIRED / RECOMMENDED / OPTIONAL — most "missing" items on org Free are RECOMMENDED, not REQUIRED. Don't panic.

---

## What's in this package

```
triarch-cicd-package/
├── README.md                          ← you are here
├── index.html                         ← landing page (the site root)
├── cicd-overview.html                 ← exec / sponsor view of the framework
├── cicd-walkthrough.html              ← hands-on step-by-step (interactive)
├── cicd-movie.html                    ← cinematic walkthrough (10 min watch)
├── SMB-CICD-Framework.md              ← the architecture deep-dive (200-page reference)
├── gap-analysis.md                    ← Claude Code prompt for the assessment
├── deploy.md                          ← Claude Code prompt for the remediation
└── github-cicd-scaffold/              ← drop into any GitHub repo
    ├── README.md                      ← scaffold setup guide
    ├── bootstrap.sh                   ← one-shot setup script (gh CLI)
    ├── discovery.sh                   ← read-only environment probe
    ├── Makefile                       ← day-2 ops (rotate secrets, audit log, etc.)
    ├── .github/
    │   ├── CODEOWNERS                 ← required-reviewer file
    │   ├── dependabot.yml             ← weekly version-update PRs
    │   ├── pull_request_template.md   ← security checklist on every PR
    │   ├── workflows/
    │   │   ├── ci-lite.yml            ← DEFAULT — 4 scanners on every PR
    │   │   ├── ci-full.yml            ← opt-in — adds IaC + threat-model checks
    │   │   ├── deploy-{dev,staging,prod}.yml ← per-env deploys (OIDC-backed)
    │   │   ├── build.yml              ← reusable build + cosign + SLSA provenance
    │   │   └── nightly.yml            ← CodeQL + license + DR drill
    │   └── rulesets/
    │       ├── main-protection-baseline.json ← phase-1: PR-required + linear history
    │       └── main-protection-lite.json     ← phase-2: + required scanner checks
    ├── .pre-commit-config.yaml        ← local hooks mirroring CI gates
    ├── .gitleaks.toml                 ← project secret-scanning config
    └── .semgrepignore                 ← Semgrep exclusion patterns
```

---

## Order of operations

1. **`discovery.sh`** — read-only inventory of your GitHub + cloud state.
2. **`gap-analysis.md`** → Claude Code → HTML report.
3. **`deploy.md`** → Claude Code → PRs that fix the gaps. **Phase 1**: ship `ci-lite.yml` + framework files + apply `main-protection-baseline.json`. **Phase 2** (after the workflow runs once on main): upgrade ruleset to `main-protection-lite.json` for full enforcement.
4. **Verify** — push a test PR, watch the security checks run, merge, watch the deploy land.

---

## Honest expectations

- **PRs can fail at first.** The scanners surface real findings on real codebases — that's the point. Fix them, allowlist them, or live with the warning.
- **Plan upgrade is the one truly-required investment.** Most of the framework doesn't enforce on org-Free private. If you can't upgrade, you get file-only value (still meaningful, but not architectural).
- **GHAS is separate from Team.** Code Security / SARIF upload to GitHub's Security tab is a paid add-on on top of any plan. The framework works without it (findings go to workflow logs); with it, they go to the Security tab too.
- **Two deploy patterns are valid.** Firebase App Hosting connected-repo auto-deploy (no `deploy:` job) and explicit `firebase deploy` in a workflow are both legitimate. Pick one per repo and stick with it.

---

## Where to go next

- Exec / sponsor view: [cicd-overview.html](cicd-overview.html)
- Hands-on walkthrough: [cicd-walkthrough.html](cicd-walkthrough.html)
- Interactive movie: [cicd-movie.html](cicd-movie.html)
- Architecture deep-dive: [SMB-CICD-Framework.md](SMB-CICD-Framework.md)
- Open an issue, ask a question: <https://www.triarch.dev/contact>

---

## License / attribution

MIT-ish (see SMB-CICD-Framework.md §License). Built by Triarch Security Advisors. Steal it, fork it, mash it up. We just ask: don't sell it as your own framework.
