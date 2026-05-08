# Phase 22: Release Page Port (Write) - Context

**Gathered:** 2026-05-08
**Status:** Ready for planning (after research)
**Type:** Customer write surface — code in both portal + admin (admin gets new internal HMAC dispatch endpoint)

<domain>
## Phase Boundary

Wire the customer-side mutation handlers stubbed in Phase 21:
- POST /api/projects/[slug]/releases/[releaseId]/approve (portal)
- POST /api/projects/[slug]/releases/[releaseId]/reject (portal)
- POST /api/projects/[slug]/releases/[releaseId]/feedback (portal) + DELETE /[feedbackId]
- POST /api/projects/[slug]/branch/preview (portal — atomic lock + FAH dispatch)
- GET /api/projects/[slug]/branch/preview/status (portal — SWR-friendly polling)

Customer-side Slack notifications (release approval pings) post directly from portal using `PORTAL_SLACK_BOT_TOKEN`. GitHub workflow dispatch (`promote-branch.yml`) STAYS admin-side — portal calls admin's new internal HMAC-signed endpoint `POST /api/internal/dispatch`. This bounded blast radius keeps the GitHub App private key custody admin-only.

Delivers WRITE-01..WRITE-05 from REQUIREMENTS.md (5 reqs).

</domain>

<decisions>
## Implementation Decisions

### Locked Decisions (from research/SUMMARY.md + ARCHITECTURE.md)

- **Slack credentials:** Portal owns `PORTAL_SLACK_BOT_TOKEN` (separate Firebase secret; same underlying value initially as admin's SLACK_BOT_TOKEN for v2.2; can fork in v2.3). Portal posts customer-side Slack notifications directly via the Slack Web API.
- **GitHub workflow dispatch:** Admin retains GitHub App private key (`GITHUB_APP_PRIVATE_KEY`). Admin exposes new internal endpoint `POST /api/internal/dispatch` accepting HMAC-signed requests from portal. Portal invokes via fetch with `X-HMAC-Signature` header.
- **HMAC mechanics (PROVISIONAL — research will refine):**
  - New shared secret: `INTERNAL_HMAC_SECRET` in both admin's apphosting.yaml AND portal's apphosting.yaml (same Firebase secret name; same value)
  - Algorithm: HMAC-SHA256 with timestamp in body to prevent replay
  - Body shape: `{ branch, version, projectKey, slackChannelId?, slackMessageTs?, timestamp }`
  - Signature: `HMAC-SHA256(INTERNAL_HMAC_SECRET, JSON.stringify(body))`
  - Admin validates: HMAC matches AND timestamp within 5 min skew
- **portal_runtime DB role suffices for writes:** SELECT/INSERT/UPDATE/DELETE already granted; portal's API routes for approve/reject/feedback do INSERT into release_approvals + UPDATE release_logs.status — no DDL needed.
- **release_approvals.actor_source = 'portal':** new value joining 'web' (admin) and 'slack' (OttoBot). Schema doesn't restrict the column to specific values; just the new convention.
- **Branch swap:**
  - Portal owns `FAH_PROMOTER_SA_KEY` binding (already in admin's apphosting.yaml from v2.1; portal's apphosting.yaml needs the same secret bound)
  - GCP secret `FAH_PROMOTER_SA_KEY` already exists in `triarch-vault`; portal's runtime SA needs secretAccessor IAM (mirror admin's pattern)
  - Atomic lock acquisition pattern from v2.1 Phase 13 ports verbatim (`UPDATE projects SET preview_branch_locked=$1 WHERE preview_branch_locked IS NULL`)
  - 8-min hard-cap timeout on stuck PENDING (Pitfall 2 guard)
  - Branch-guarded auto-clear on terminal state (prevents stale poll from clobbering newer lock)
- **two-step approve UX preserved:** the read-only ReleasesClient stub from Phase 21 already has the UI; Phase 22 wires the handlers
- **conflict badge + branch lock disable propagation:** preserved from v2.1 logic
- **Portal version bump:** v0.3.0 → v0.4.0 (minor — major customer surface lands write paths)
- **Admin version bump:** v2.9.3 → v2.10.0 (minor — new internal HMAC dispatch endpoint adds attack surface)

### Claude's Discretion
- Exact HMAC algorithm timestamp window (5 min vs 10 min) — Claude picks based on research
- Whether to use `crypto.createHmac` (Node built-in) or jose-style — Claude picks (probably crypto.createHmac for simplicity)
- Replay attack prevention: timestamp + nonce vs timestamp-only — Claude picks based on research; recommend timestamp + 5-min skew + monotonic counter optional

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets (from admin)
- `admin/src/lib/release-promotion.ts` (`promoteAndAudit`) — admin's promote dispatcher; portal's approve handler will call admin's HMAC endpoint, which calls `promoteAndAudit`
- `admin/src/lib/fah-rollout.ts` (now in shared@0.2.0? — check; if not, add to shared@0.3.0 in this phase) — branch swap dispatcher
- `admin/src/app/api/projects/[slug]/releases/[releaseId]/approve/route.ts` — admin's existing approve handler; logic ports to portal but with simpler customer-side path (no Slack origin, just web)
- `admin/src/app/api/projects/[slug]/releases/[releaseId]/reject/route.ts` — same
- `admin/src/app/api/projects/[slug]/releases/[releaseId]/feedback/route.ts` — same
- `admin/src/app/api/projects/[slug]/branch/preview/route.ts` — branch swap POST (atomic lock + FAH dispatch)
- `admin/src/app/api/projects/[slug]/branch/preview/status/route.ts` — GET status (8-min timeout + branch-guarded auto-clear)

### NEW admin endpoint
- `admin/src/app/api/internal/dispatch/route.ts` — accepts HMAC-signed POST from portal; validates signature; calls `promoteAndAudit` from existing release-promotion lib
- Vitest unit test for the HMAC validation: valid signature → 200; tampered → 401; replay → 401; expired timestamp → 401

### NEW portal endpoints (port from admin with adjustments)
- `portal/src/app/api/projects/[slug]/releases/[releaseId]/approve/route.ts` — auth via portal session; insert release_approvals (actor_source='portal'); call admin's HMAC endpoint (no direct GitHub App)
- `portal/src/app/api/projects/[slug]/releases/[releaseId]/reject/route.ts`
- `portal/src/app/api/projects/[slug]/releases/[releaseId]/feedback/route.ts` (POST + DELETE)
- `portal/src/app/api/projects/[slug]/branch/preview/route.ts` — atomic lock acquisition + direct FAH dispatch (portal owns FAH_PROMOTER_SA_KEY, no proxy through admin)
- `portal/src/app/api/projects/[slug]/branch/preview/status/route.ts`

### Established Patterns
- Customer auth: `getCurrentUserContext` from shared/auth; check membership; INSERT release_approvals.actor_source='portal'
- HMAC: `crypto.createHmac('sha256', secret).update(JSON.stringify(body)).digest('hex')`
- Slack post: portal uses `chat.postMessage` directly with PORTAL_SLACK_BOT_TOKEN
- portal's ReleasesClient.tsx mutation handlers are currently stubs with TODO Phase 22 markers — Phase 22 wires them

### Integration Points
- New admin endpoint: /api/internal/dispatch (admin v2.10.0)
- New portal endpoints: 5 (approve, reject, feedback, branch/preview, branch/preview/status) (portal v0.4.0)
- Modified portal: ReleasesClient.tsx, BranchPreviewClient.tsx (un-stub the handlers)
- New shared module (optional): `internal-hmac.ts` exporting `signRequest()` + `verifyRequest()` for both apps to use (avoid drift)
- Both apphosting.yaml files: bind `INTERNAL_HMAC_SECRET` from new GCP secret
- portal apphosting.yaml: bind `FAH_PROMOTER_SA_KEY` (already exists in triarch-vault from Phase 13)
- portal apphosting.yaml: bind `PORTAL_SLACK_BOT_TOKEN`
- Both runtime SAs: secretAccessor IAM on the relevant secrets

</code_context>

<specifics>
## Specific Ideas

- The HMAC body MUST include all the fields admin needs to dispatch — branch, version, projectKey, plus optional slackChannelId/slackMessageTs for thread continuity
- Replay protection: timestamp in body + 5-min skew window; reject if `Math.abs(now - timestamp) > 5 * 60 * 1000`
- Admin endpoint MUST validate the projectKey exists + portal's claim is authentic before dispatching (defense-in-depth: HMAC alone could be a forged customer signature claiming staff project)
- Portal's approve handler INSERTs release_approvals with `actor_source='portal'`, then calls admin's HMAC endpoint asynchronously (fire-and-forget pattern from v2.1, fire after the INSERT confirms)
- Slack notification posts FIRST (portal-side, with PORTAL_SLACK_BOT_TOKEN), THEN HMAC dispatch — so customer sees confirmation in Slack within 3 sec
- Branch swap atomic lock: ports verbatim from admin's existing endpoint; the only change is portal queries the same projects table
- Tests: unit tests for HMAC sign/verify (using Vitest), integration tests for portal endpoints (mocked admin HMAC endpoint), Vitest grep test ensuring INTERNAL_HMAC_SECRET never logged

</specifics>

<deferred>
## Deferred Ideas

- Slack workspace per-customer integration → v3 (portal currently posts to Triarch's own Slack)
- Approval delegation (backup approver) → v2.3 POLISH-04
- Multi-secret HMAC rotation (key versioning) → v2.3 if hot rotation becomes a need
- WebSocket real-time updates instead of SWR poll → v3 (SWR poll covers it)
- File attachments on feedback → v3 POLISH-07

</deferred>
