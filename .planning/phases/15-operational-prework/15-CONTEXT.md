# Phase 15: Operational Prework - Context

**Gathered:** 2026-05-08
**Status:** Ready for planning
**Type:** Infrastructure (auto-skip discuss per autonomous workflow heuristic)

<domain>
## Phase Boundary

Repository, DNS, OAuth, and Firebase App Hosting backend prerequisites exist so the deploy pipeline is provable on a skeleton before any portal app code lands. Five operational deliverables (OPS-01 through OPS-05) — all parallel-safe, all idempotent if repeated.

Delivers OPS-01..OPS-05 from REQUIREMENTS.md.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — pure infrastructure phase. The roadmap and PROJECT.md already encode every cross-cutting choice (same Firebase project, separate NEXTAUTH_SECRET, single Google OAuth client with two redirect URIs, GoDaddy DNS, shared-workflows@v4).

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `MyAlterLego/triarch-dev` (admin repo) — `.github/workflows/ci-cd.yml` is the template for the new portal repo's CI/CD config
- `apphosting.yaml` + `apphosting.dev.yaml` overlay pattern (admin) — template for portal's apphosting config
- `triarch-vault` GCP project — central secret store; portal secrets land here
- GoDaddy MCP tools (`mcp__godaddy__*`) — DNS automation
- `gcloud` CLI authed as `mike@triarchsecurity.com` — Owner on `triarch-dev-website` Firebase project + `triarch-vault`
- `gh` CLI authed as `MyAlterLego` — can create repos in the MyAlterLego org

### Established Patterns
- **GitHub repos in MyAlterLego org**: created via `gh repo create` with private visibility
- **Firebase App Hosting backends in same project**: created via `firebase apphosting:backends:create` (or Firebase Console)
- **Custom domains**: GoDaddy A/CNAME records pointing at FAH backend's hosted.app URL
- **GCP secrets**: created via `gcloud secrets create` in `triarch-vault`, accessor IAM bindings granted to runtime SAs
- **OAuth redirect URI updates**: editable via GCP Console (gcloud limited support); persistent OAuth client survives the edit

### Integration Points
- New repo `MyAlterLego/triarch-portal` consumed by Phases 16, 18, 19, 21–25
- New FAH backends `portal-prod`/`portal-dev` consumed by Phases 21–25 deploys
- DNS `portal.triarch.dev` consumed by Phase 25 (admin 301 redirect target)
- OAuth redirect URI consumed by Phase 18 (portal NextAuth config)
- `PORTAL_NEXTAUTH_SECRET` consumed by Phase 18 (portal NextAuth secret binding)

</code_context>

<specifics>
## Specific Ideas

- Portal repo `.gitignore` mirrors admin's (Next.js + Drizzle + Firebase patterns)
- Portal repo's first commit is a 200-OK landing page (`app/page.tsx` returns "Triarch Portal — Coming Soon") so the deploy pipeline has something verifiable
- Localhost callback URI `http://localhost:3002/api/auth/callback/google` baked in from Phase 15 (per Pitfall 13 — "OAuth localhost URIs from start")
- DNS records added BEFORE `portal-prod` backend's custom domain is wired (so FAH custom domain validation has DNS to verify)
- Portal deploy SA `portal-deployer@triarch-vault.iam.gserviceaccount.com` flagged for creation in Phase 24 (CI/CD Deploy Safety) — not Phase 15
- Order of ops within phase: repo + .npmrc → DNS → GCP secret → FAH backends → OAuth redirect URIs (DNS before FAH so backend's custom domain can validate; OAuth last so it's pointing at a working domain)

</specifics>

<deferred>
## Deferred Ideas

- Portal deploy SA + per-repo deploy isolation → Phase 24
- Portal `apphosting.yaml` env var bindings → Phase 18 (auth) and Phase 22 (write surface)
- Portal Firebase Auth authorized domains list → Phase 18

</deferred>
