# Phase 3: Slack Interactive Approval - Context

**Gathered:** 2026-05-03
**Status:** Ready for planning

<domain>
## Phase Boundary

After a customer admin approves a release on the customer page (Phase 2), a Slack message fires to the staff `#release-approvals` channel with interactive Approve/Reject buttons that staff click to **promote** (or reject) the release to production. This phase establishes the secure Slack callback pattern: signature-verified `POST /api/slack/interact`, signed payloads to defend against button-value tampering, and Slack-user → staff-email identity mapping. Existing `bug-action` and `feature-action` endpoints retain their current (unverified) behavior — retrofit is out of scope.

</domain>

<decisions>
## Implementation Decisions

### Slack Trigger, Channel, Failure Mode (Area 1)
- **Trigger**: After admin clicks Approve on the customer page and the DB transaction commits (Phase 2 approve endpoint). Fire-and-forget Slack post — does NOT block API response. Reject does NOT post to Slack (notification is for next-step promotion only).
- **Channel routing**: Single global channel via `SLACK_RELEASE_APPROVAL_CHANNEL` env var (default `#release-approvals`). Matches the existing `SLACK_BUG_CHANNEL`/`SLACK_FEATURE_CHANNEL` pattern in `src/lib/slack.ts:2-3`.
- **Slack post failure handling**: Log warning (`console.warn` matching existing pattern) and return success to user. The release IS approved per DB; Slack delivery is best-effort. No rollback, no retry queue.
- **Message format**: Rich blocks containing project name, version, approver email, current status, and feedback excerpt + interactive buttons (Approve & Promote / Reject). Mirrors the structure of `notifyBugReport` / `notifyFeatureRequest`.

### Signature Verification & Payload Signing (Area 2)
- **Slack signature header**: HMAC-SHA256 of `v0:{ts}:{raw body}` against `SLACK_SIGNING_SECRET`, hex-encoded, prefixed with `v0=`. 5-minute replay window per Slack docs and GATE-09. Reject with 401 if invalid or stale.
- **Embedded payload signature** (defense against button-value tampering per GATE-08): HMAC-SHA256 of `{releaseId}:{action}:{nonce}` using `SLACK_PAYLOAD_SECRET`, base64url-encoded. Packed into button `value` field as `{releaseId}.{nonce}.{sig}`. Verified inside `/api/slack/interact` before any DB action.
- **Secrets storage**: App Hosting secrets via `apphosting.yaml` secret references (ENV-S01). Three secrets: `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`, `SLACK_PAYLOAD_SECRET`.
- **Secret rotation**: Single-secret model with manual rotation. Documented inline in `apphosting.yaml`. No dual-secret grace window (over-engineered for v1.14).

### Identity Mapping & Existing Endpoints (Area 3)
- **Existing endpoints (bug-action / feature-action)**: Out of scope. Tech debt — retrofit in a backlog phase. Phase 3 ships only the secure pattern for release approvals.
- **Slack user → staff email mapping**: Hardcoded `SLACK_USER_MAP: Record<string, string>` constant exported from `src/lib/slack-identity.ts`. Keyed by Slack `user_id`, value is staff email (e.g. `mike@triarchsecurity.com`). MVP — easily swappable to a DB table later.
- **Unmapped Slack user**: Respond ephemerally with `"Your Slack user is not mapped to a staff account. Contact admin."` — no action taken on the release. Log warning server-side with the unmapped `user_id`.
- **Slack action handler implementation**: Direct DB operations via shared helpers (extracted from Phase 2's approve/reject route handlers into `src/lib/release-actions.ts` for reuse). Same `db.transaction` semantics. No HTTP roundtrip.

### Slack Message Lifecycle & UX (Area 4)
- **After button click**: `replace_original: true` — update the original message to show `":white_check_mark: Promoted to production by @{slack_username}"` or `":x: Rejected by @{slack_username}: {reason excerpt 80 chars}"`. Preserves audit trail visibility in the channel.
- **Stale-message click (already-promoted/rejected)**: Ephemeral message `"Already {status} by {email} on {date}"` + `replace_original` to reflect current state. No double-write — relies on Phase 2 idempotency (GATE-05).
- **Feedback excerpt content**: Most recent comment text, 200-char excerpt, with `"(N more comments)"` suffix if more exist. Matches the bug description 300-char pattern in `src/lib/slack.ts:64`.
- **Customer page UI**: Silent. Slack is a back-channel notification to staff; the existing customer approve toast is sufficient. Slack post failures log server-side only — never surface to the customer-facing UI.

### Claude's Discretion
- Exact `apphosting.yaml` secret reference syntax — match existing pattern in repo
- Exact format of ephemeral error messages within Slack's text constraints
- Whether to extract a shared `src/lib/slack-identity.ts` or inline the constant in `src/lib/slack.ts` (prefer extracted for testability)
- Exact reject-reason ellipsis position (80-char hard cut vs word-boundary)
- Whether to log the unmapped-user warning to a structured logger or `console.warn` (match existing pattern)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/slack.ts` — `postSlackMessage()` helper, env-driven channel constants, two existing notify functions (bug + feature) using rich blocks. Phase 3 adds `notifyReleaseApproved()` following the same shape.
- `src/app/api/platform/slack/bug-action/route.ts` and `feature-action/route.ts` — existing Slack interactive callback handlers that parse `payload` form field. Phase 3's `/api/slack/interact` improves on this pattern by adding signature verification (GATE-09) and payload signing (GATE-08); existing endpoints stay as-is.
- Phase 2's approve/reject endpoints (`src/app/api/projects/[slug]/releases/[releaseId]/approve/route.ts` etc.) — DB-write logic to extract into shared helpers.
- `src/lib/db.ts` + Drizzle schema — `release_logs`, `release_approvals` tables already populated by Phase 2; no schema changes needed.

### Established Patterns
- **Slack message structure**: Rich blocks with header section + content section + actions block (buttons). 300-char text excerpts with ellipsis. Action button `value` field carries entity ID.
- **Env-driven channel routing**: `SLACK_BUG_CHANNEL ?? '#triarch-bugs'` style with sensible defaults.
- **Auth gating**: jose JWT cookies for customer-facing routes; Slack callbacks bypass user auth and rely entirely on signature verification + identity mapping.
- **Atomicity**: `db.transaction()` for any operation that writes to multiple tables.

### Integration Points
- Phase 2 customer approve endpoint → calls `notifyReleaseApproved()` after successful DB commit (fire-and-forget, awaited but errors logged).
- New `/api/slack/interact` route → uses extracted approve/promote/reject helpers from `src/lib/release-actions.ts`.
- `apphosting.yaml` → adds three new secret references (`SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`, `SLACK_PAYLOAD_SECRET`).

</code_context>

<specifics>
## Specific Ideas

- The existing `notifyBugReport` block structure in `src/lib/slack.ts:36-95` is the template for `notifyReleaseApproved`. Same approach: header section, body section with formatted fields, optional context section (feedback excerpt), actions block with two buttons.
- Embedded payload format `{releaseId}.{nonce}.{sig}` chosen over JWT for compactness within Slack's 2000-char `value` field limit and for transparent debuggability.
- Identity mapping pattern (`Record<string, string>` constant) preferred over a DB table because the staff list is small (≤10 entries for v1.14) and changes infrequently. Migration to a DB table is a one-day refactor when needed.

</specifics>

<deferred>
## Deferred Ideas

- **Retrofit existing bug-action / feature-action endpoints with signature verification.** Tech debt — these endpoints are currently unverified. Move to backlog phase.
- **Per-project Slack channel routing** (e.g., `projects.slack_channel` column) — out of scope; one global channel for v1.14.
- **DB-backed Slack user mapping table** — `slack_user_mappings` table with admin UI. Refactor when staff list grows past ~10 or when self-service onboarding is needed.
- **Reject notification to Slack** — Phase 3 only fires on approve. Future: also notify on reject for visibility.
- **Slack actions for feedback** (post comment from Slack) — out of scope.
- **Dual-secret rotation with grace window** — simple manual rotation is fine for v1.14.
- **Dynamic Slack user resolution via `users.info` API** — extra round-trip; static map is sufficient.

</deferred>

---

*Phase: 03-slack-interactive-approval*
*Context gathered: 2026-05-03 via smart_discuss (16 grey-area decisions, all accepted as-recommended)*
