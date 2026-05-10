# Triarch SMB CI/CD Framework — Publish Package

Everything needed to publish the Triarch CI/CD content to **triarch.dev**.

## What's in this package

```
triarch-cicd-package/
├── index.html                    ← landing page (the site root)
├── cicd-movie.html               ← cinematic interactive presentation
├── cicd-overview.html            ← executive overview
├── cicd-walkthrough.html         ← hands-on engineer walkthrough
├── gap-analysis.md               ← Claude Code prompt for gap analysis
├── SMB-CICD-Framework.md         ← the framework reference markdown
├── README.md                     ← (this file)
└── github-cicd-scaffold/         ← drop-in GitHub repo scaffold
    ├── README.md                 ← setup guide
    ├── bootstrap.sh              ← gh-CLI bootstrap script
    ├── Makefile                  ← day-2 ops targets
    ├── bootstrap.config.env.example
    ├── .gitleaks.toml
    ├── .pre-commit-config.yaml
    ├── .semgrepignore
    ├── .gitignore
    ├── .github/
    │   ├── CODEOWNERS
    │   ├── dependabot.yml
    │   ├── pull_request_template.md
    │   ├── ISSUE_TEMPLATE/security-waiver.md
    │   ├── rulesets/main-protection.json
    │   └── workflows/
    │       ├── ci.yml
    │       ├── build.yml
    │       ├── deploy-dev.yml
    │       ├── deploy-staging.yml
    │       ├── deploy-prod.yml
    │       └── nightly.yml
    └── iac/
        └── github-oidc-aws/
            ├── main.tf
            ├── variables.tf
            ├── outputs.tf
            └── example.tfvars
```

## How to publish to triarch.dev

The four HTML files are **fully self-contained** — inline CSS, inline JS, no build step, no dependencies beyond:

- The Triarch logo at `https://www.triarch.dev/triarch-logo.png` (already on your domain)
- Standard browser features (CSS Grid, Flexbox, SVG `<animateMotion>`, `localStorage`)

### Option A: Static hosting (recommended)

Upload the contents of `triarch-cicd-package/` to your static host root. The structure becomes:

```
/                           → index.html (landing page)
/cicd-movie.html            → the movie
/cicd-overview.html         → the overview
/cicd-walkthrough.html      → the walkthrough
/gap-analysis.md            → downloadable
/SMB-CICD-Framework.md      → downloadable
/github-cicd-scaffold/      → directory listing or zip download
```

Cross-links between the three HTML pages use relative paths, so they all just work.

If your static host (e.g. Cloudflare Pages, Netlify, GitHub Pages, Vercel) doesn't show directory listings by default, you may want to either:

- Add a `_redirects` rule to serve `github-cicd-scaffold/` as a downloadable zip, OR
- Add `dirlist: on` (or equivalent) for that path, OR
- Pre-zip the scaffold (`github-cicd-scaffold.zip`) and link to that instead

### Option B: Pretty URLs with subfolders

If you prefer paths like `/movie/`, `/overview/`, `/walkthrough/`, rename:

- `cicd-movie.html`       → `movie/index.html`
- `cicd-overview.html`    → `overview/index.html`
- `cicd-walkthrough.html` → `walkthrough/index.html`

Then update the cross-link `<a href="...">` references in each file (search/replace `cicd-movie.html` → `../movie/`, etc.).

The `index.html` landing page links can be similarly updated.

## Browser support

Tested patterns work in Chrome, Edge, Safari, and Firefox (latest versions).

The movie uses SVG `<animateMotion>` (SMIL) for the architecture-line bubbles and CSS animations for scene transitions. SMIL is broadly supported but Chrome had threatened deprecation in the past — currently it's still supported with no replacement timeline.

`prefers-reduced-motion` is respected: animations and transitions are disabled for users who set that preference, and the architecture diagram displays statically with all elements visible.

## Cross-links between pages

All three HTML pages reference each other via relative paths. From any page:

- `<a href="cicd-movie.html">▶ Movie</a>`
- `<a href="cicd-overview.html">Overview</a>`
- `<a href="cicd-walkthrough.html">Walkthrough →</a>`

The landing `index.html` links to all three plus the supporting docs.

## Logo

Every page references the logo at `https://www.triarch.dev/triarch-logo.png`. Since you're publishing to `triarch.dev`, this resolves to the same domain — no CORS concerns, fast cached delivery.

If you ever want to inline the logo as base64 to make the pages truly offline-friendly, run something like:

```bash
base64 -i triarch-logo.png > logo.b64
# then in each HTML:
# replace https://www.triarch.dev/triarch-logo.png
# with    data:image/png;base64,<contents-of-logo.b64>
```

## What each piece is for

| Audience | File |
|---|---|
| Exec / sponsor / prospect (5 min, visual) | `cicd-movie.html` |
| Technical lead scoping the work | `cicd-overview.html` + `SMB-CICD-Framework.md` |
| Engineer doing the build | `cicd-walkthrough.html` + `github-cicd-scaffold/` |
| Auditing an existing customer setup | `gap-analysis.md` (handed to Claude Code) |

## Versioning

Current: **v1.0**.

Every page footer mentions the version. To bump, search-and-replace `v1.0` to `v1.1` (etc.) across the HTML files and update the framework markdown's status line.

## License / attribution

All content is original Triarch material. The framework is opinionated based on Triarch Security Advisors' work with SMB customers in 2026.

External tools and references mentioned (GitHub Actions, OIDC, Semgrep, OSV-Scanner, Gitleaks, cosign, SLSA, Sigstore, the `josemlopez/threat-modeling-toolkit` Claude Code plugin, etc.) are credited inline in the framework markdown and walkthrough.

## Updating the package

If you regenerate any HTML page, just drop the new file in over the old one. The structure is flat — no build step.

If you regenerate the scaffold, ensure the workflow and IaC files keep their relative paths intact (the scaffold's `bootstrap.sh` expects `.github/rulesets/main-protection.json` and `iac/github-oidc-aws/` to exist relative to the script).

## Questions

Pair this README with the [framework markdown](SMB-CICD-Framework.md) for the deeper "why" behind each design decision.

For Triarch directly: <https://www.triarch.dev> · <https://www.triarchsecurity.com>
