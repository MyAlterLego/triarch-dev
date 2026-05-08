# Phase 13 Research: FAH Programmatic Rollout API

**Researched:** 2026-05-08
**Status:** RESEARCH COMPLETE — ready for planning

## Question

How do we call `firebase apphosting:rollouts:create` programmatically from a Next.js route handler running on Cloud Run (without spawning a child process)?

## Three options evaluated

### Option A: `googleapis` Node SDK
- Status: REJECTED — package not installed in admin; would add ~70 deps for one endpoint
- The `googleapis` SDK auto-generates clients from Discovery; `firebaseapphosting.v1beta` IS in there
- But the SDK is large; we don't need its kitchen sink

### Option B: Firebase MCP rollout management
- Status: REJECTED — MCP servers are dev-time tools; not callable from production runtime in a Cloud Run container

### Option C: Direct REST + service account auth (CHOSEN)
- Status: ACCEPTED
- Use `fetch` directly against `https://firebaseapphosting.googleapis.com/v1beta/projects/{p}/locations/{l}/backends/{b}/rollouts` (the same URL the CLI uses internally)
- Auth: service-account JSON key → JWT → exchange for access token → Bearer header
- Pattern: mirrors existing `src/lib/github-app.ts` (which already does the same dance for GitHub App JWT auth)

## Verified

- **REST endpoint**: confirmed working in Phase 7.5 — manual `curl -X POST -H "Authorization: Bearer $(gcloud auth print-access-token)" .../rollouts -d '{"build":{...}}'` succeeded against admin-dev, tmi-dev, truthtreason-dev backends
- **Request body shape** for create rollout:
  ```json
  {
    "build": {
      "source": {
        "codebase": {
          "branch": "<branch-name>"
        }
      }
    }
  }
  ```
  Returns 200 with rollout resource including `name`, `state` (initial: PENDING)
- **Long Running Operation polling**: rollouts list endpoint returns rollouts with `state` field. SWR polling at 5-second interval until terminal state (SUCCEEDED / FAILED) — already designed in synthesis

## Auth design

**Service account**: `release-promoter@triarch-vault.iam.gserviceaccount.com` (NEW — to be created in Phase 13 setup)

**IAM grants needed** (per customer project's FAH backend):
- `firebaseapphosting.rollouts.create`
- `firebaseapphosting.builds.get` (for status polling)
- `firebaseapphosting.rollouts.get`

For triarch-owned projects (admin, portal, www): grant on the project's FAH backends
For customer-owned projects (darksouls, tmi, truthtreason): grant on `triarch-dev-{customer}` projects (the dev clones — prod stays untouched)

**Key storage**: SA JSON key as Firebase secret `FAH_PROMOTER_SA_KEY` in `triarch-dev-website` (admin's project); admin runtime reads via existing `@myalterlego/secrets` package OR direct `gcloud secrets access` if simpler

**Token mint**: use `jose` library (already in admin's deps for NextAuth JWT) — `jose.SignJWT` to mint a signed JWT, POST to `oauth2.googleapis.com/token` with grant_type=jwt-bearer, get access token, cache for 50 min

## Concurrency lock (already in Phase 10 schema)

`projects.preview_branch_locked` (text, nullable) + `preview_branch_locked_at` (timestamptz, nullable) — set by the swap route, cleared by the polling loop on terminal state.

## Pitfall reminders

1. **8-minute timeout** — if a rollout's been running >8min, force-clear the lock; the polling loop should handle this
2. **CI-push race** — if a CI push happens while customer-driven swap is in flight, the customer's swap may overwrite the CI push (or vice versa). Acceptable risk for v2.1; document in deferred ideas.
3. **Failed rollouts** — when state=FAILED, surface error inline with link to FAH console (no GHA run for FAH-internal failures)

## Conclusion

**Phase 13 is unblocked.** Implementation pattern: REST + JWT-signed access token, mirroring `src/lib/github-app.ts`. No new npm dependency required (`jose` already present). Service account + IAM grants are operational steps that can be set up by Mike once during deployment.
