# Phase 1: Central Secrets Vault - Context

**Gathered:** 2026-05-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Establish a single canonical credential store on GCP Secret Manager (new project `triarch-vault`) and a thin npm package (`@myalterlego/secrets`) that every Triarch consumer uses to fetch shared secrets. Migrate admin first, then CRM. Per-project Firebase secrets (DATABASE_URL, NEXTAUTH_SECRET) stay local; only shared cross-project credentials (Slack tokens, GitHub App creds, SLACK_USER_MAP) move to the vault. Onboarding docs updated; new-project wizard integration deferred to backlog.

</domain>

<decisions>
## Implementation Decisions

### Vault Project + IAM Model (Area 1)
- **Vault GCP project name:** `triarch-vault` — new dedicated GCP project, clean separation from any consumer's lifecycle
- **Billing:** Linked to the same billing account as existing Firebase projects (no new billing setup)
- **Secret Manager region:** Automatic (Google-managed multi-region) — Secret Manager's default replication policy
- **IAM grant scope:** Per-secret `roles/secretmanager.secretAccessor` — minimum privilege. Each consumer service account (e.g. `firebase-adminsdk-fbsvc@triarch-dev-website.iam.gserviceaccount.com`) gets explicit access only to the specific secrets it needs

### `@myalterlego/secrets` Package Design (Area 2)
- **Package name:** `@myalterlego/secrets` — matches `@myalterlego/shared-ui` convention
- **Publish target:** GitHub Packages (`npm.pkg.github.com`) — matches `@myalterlego/shared-ui` registry pattern; auth via `GH_PAT` / `NODE_AUTH_TOKEN` already configured in CI and local `.npmrc` files
- **API + caching:** `getSecret(name: string): Promise<string>` exported. Module-level `Map<string, { value: string; expiresAt: number }>` cache. TTL = 300 seconds (5 minutes) per secret. First call fetches from Secret Manager via `@google-cloud/secret-manager` client; subsequent calls within TTL return cached value. Cache miss → fresh fetch → re-cache.
- **Local dev fallback:** Vault first; on auth error / quota / network failure → fall back to `process.env[name]`. Production resilient + `.env.local` continues to work for local dev

### Migration Strategy (Area 3)
- **Migration order:** `triarch-dev` admin first → verify in production → then `triarchsecurity-admin` CRM. Admin is the v2.0 active consumer; CRM migration is follow-on cleanup
- **Transitional fallback:** Firebase per-project secrets stay configured during migration. Package's automatic `process.env` fallback handles vault unavailability. Once both apps verified reading from vault, the duplicate Firebase secrets are deleted in a closeout step
- **Verification:** New staff-only endpoint `GET /api/platform/health/secrets` — calls `getSecret()` for each of the seven migrated keys and reports per-secret success/failure status. Manually invoked post-deploy to confirm vault wiring
- **Rollback plan:** The package's automatic env fallback IS the rollback. For catastrophic vault outage during transition, Firebase secrets remain populated. After cleanup step (vault verified working), if vault becomes unavailable, the affected app degrades gracefully — secrets resolve to `undefined` → caller's existing null-check paths handle it (e.g., `slack.ts` already returns `{ ok: false, error: 'no_token' }` when SLACK_BOT_TOKEN is missing)

### Onboarding Docs + Discovery (Area 4)
- **Documentation update:** Extend `docs/onboarding-projects.md` with new "Step 7: Grant vault access" section AND create new `docs/secrets-vault.md` deep-dive (architecture, IAM grant commands, rotation runbook, troubleshooting)
- **New-project wizard integration:** OUT OF SCOPE for v2.0. Manual IAM grant per project for now. Backlog: bake into `/admin/modules/projects` provisioning wizard in a future phase
- **Backwards-compatible apphosting.yaml:** Secrets config in apphosting.yaml stays during transition. Once both apps migrated + verified, the closeout step removes duplicate entries
- **Missing secret behavior:** `getSecret` throws `SecretNotFoundError` (custom error class exported from package) with message `Secret '${name}' not found in vault and no fallback in process.env. Check vault setup at https://console.cloud.google.com/security/secret-manager?project=triarch-vault`

### Claude's Discretion
- Exact npm package version (start at `0.1.0` per shared-ui convention; bump per push)
- Custom error class structure (extends `Error` with `name = 'SecretNotFoundError'`)
- Internal client initialization (lazy vs eager — recommend lazy on first `getSecret` call)
- Test strategy (Vitest with mocked `@google-cloud/secret-manager` client)
- File location for the new shared package — recommend new repo `MyAlterLego/secrets` parallel to `MyAlterLego/shared-ui`, OR a packages/ subfolder in an existing monorepo. Implementer decides based on existing repo structure preferences

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `@myalterlego/shared-ui` package (existing) — establishes the GitHub Packages publish pattern with `.npmrc` registry config and `NODE_AUTH_TOKEN` CI env var
- Firebase secrets management already in use via `firebase apphosting:secrets:set` and `apphosting:secrets:access` — vault migration LEAVES these tools functional during transition
- Custom error pattern: project doesn't currently use a project-wide error-class hierarchy; package exports its own `SecretNotFoundError` standalone

### Established Patterns
- Per-project `.npmrc` with `@myalterlego:registry=https://npm.pkg.github.com` and `//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}`
- Module-level caches in TS libs (e.g. `src/lib/github-app.ts` token cache from v1.14 Phase 4 — same pattern applies here)
- `firebase-adminsdk-fbsvc@<project>.iam.gserviceaccount.com` is the canonical service account for App Hosting service-account-based access (verified during v1.14 IAM cascade work)

### Integration Points
- New GCP project `triarch-vault` — created via `gcloud projects create` (HUMAN action — Mike does this in cloud console or via gcloud CLI with billing link)
- Seven existing secrets sourced from current locations:
  - `SLACK_BOT_TOKEN` — currently in CRM `settings` table (encrypted) AND in `triarch-dev-website` Firebase secrets (added during v1.14 closeout)
  - `SLACK_SIGNING_SECRET` — same dual location
  - `SLACK_PAYLOAD_SECRET` — only in `triarch-dev-website` Firebase secrets (generated during v1.14 closeout)
  - `GITHUB_APP_ID` — only in `triarch-dev-website` Firebase secrets
  - `GITHUB_APP_PRIVATE_KEY` — only in `triarch-dev-website` Firebase secrets
  - `GITHUB_APP_INSTALLATION_ID` — only in `triarch-dev-website` Firebase secrets
  - `SLACK_USER_MAP` — currently in code (`src/lib/slack-identity.ts`); migrate to vault as JSON blob
- `triarch-dev` admin app — primary consumer for v2.0 (Phases 4, 6, 7 all use these creds); migration target #1
- `triarchsecurity-admin` CRM app — migration target #2 (follow-on cleanup)

</code_context>

<specifics>
## Specific Ideas

- The `@myalterlego/secrets` package should mirror `@myalterlego/shared-ui` exactly in publish setup — same `.npmrc` registry, same `NODE_AUTH_TOKEN` auth pattern, same versioning convention (semver, version bump on every push per workspace CLAUDE.md)
- Health check endpoint should be staff-only (`requireStaff` from v1.14 Phase 1.1) — surfaces per-secret status as JSON for Slack-driven verification or curl from `gcloud auth print-access-token` impersonation
- `SLACK_USER_MAP` migration: the JSON blob form means `getSecret('SLACK_USER_MAP')` returns a JSON string; consumer parses with `JSON.parse()`. The existing `src/lib/slack-identity.ts` file becomes a thin wrapper that calls `getSecret('SLACK_USER_MAP')` and parses
- The closeout step (delete duplicate Firebase secrets after migration) is best handled as a separate plan AFTER admin + CRM both verified — not bundled into the migration plan itself, since it requires confidence in vault path

</specifics>

<deferred>
## Deferred Ideas

- New-project wizard integration for vault IAM grants (backlog — bake into provisioning flow later)
- Per-environment vault projects (dev/staging/prod separation) — single `triarch-vault` for v2.0
- Secret rotation automation (manual rotation via `gcloud secrets versions add` for v2.0)
- Audit logging for vault reads (Cloud Audit Logs are auto-enabled; explicit per-read tracking deferred)
- Multi-org vault — currently MyAlterLego-only

</deferred>

---

*Phase: 01-central-secrets-vault*
*Context gathered: 2026-05-04 via smart_discuss (16 grey-area decisions, all accepted as-recommended)*
