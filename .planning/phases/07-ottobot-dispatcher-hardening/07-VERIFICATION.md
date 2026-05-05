---
phase: 07-ottobot-dispatcher-hardening
verified: 2026-05-05T13:45:00Z
status: human_needed
score: 5/5 automated truths verified
human_verification:
  - test: "Apply scripts/seed-slack-audit-nav.sql against prod CRDB"
    expected: "menu_pages row for /admin/platform/slack-audit with min_role='staff' is created; Slack Audit link visible in sidebar for staff, hidden for non-staff"
    why_human: "DATABASE_URL is a Firebase App Hosting secret not available in CI; psql command must be run manually per Phase 3 precedent"
  - test: "OttoBot Slack App scope upgrade in api.slack.com"
    expected: "scopes chat:write.public, app_mentions:read, commands added; /triarch slash command and Events API URL configured; workspace reinstalled; SLACK_BOT_TOKEN in triarch-vault verified/rotated if needed"
    why_human: "Slack App OAuth & Permissions changes require api.slack.com UI interaction — cannot be automated or scripted"
  - test: "End-to-end Slack smoke test after scope upgrade"
    expected: "/triarch (help), /triarch status admin (Block Kit), /triarch deploy admin v0.0.0-fake (staff ack / non-staff denied), @OttoBot status admin (threaded reply), /admin/platform/slack-audit shows audit rows"
    why_human: "Requires live Slack workspace with the new scopes active and admin deployed with Phase 7 code"
  - test: "Non-staff sidebar and page access check"
    expected: "Customer admin does NOT see Slack Audit in sidebar; direct URL to /admin/platform/slack-audit redirects to /admin?error=forbidden"
    why_human: "Requires browser session as a non-staff user to confirm DynamicSidebar role gate and page redirect work end-to-end"
---

# Phase 7: OttoBot Dispatcher Hardening — Verification Report

**Phase Goal:** Every Slack action is audited, OttoBot responds to slash commands and app mentions, and a staff-only viewer in admin shows the full audit trail.
**Verified:** 2026-05-05T13:45:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | Every button click through /api/slack/interact produces a slack_action_audit row with all required fields | VERIFIED | 15 `void recordSlackAudit(...)` call sites in route.ts; requestReceivedAt captured at line 27 before req.text(); sha256 hash in slack-audit.ts; try/catch swallow confirmed |
| 2 | /triarch deploy from staff triggers workflow dispatch and returns ephemeral ack; non-staff receives access-denied ephemeral | VERIFIED | commands/route.ts staff check via `endsWith('@triarchsecurity.com')`; fire-and-forget IIFE `void (async () => {...})()` around dispatchWorkflow; literal `:no_entry: This command requires Triarch staff access.` present |
| 3 | /triarch status returns current dev/prod release status, last 3 deploy timestamps, and any active RCs | VERIFIED | slack-status.ts exports fetchProjectStatus (5 Drizzle queries) + buildStatusBlocks (header/Dev/Prod/Active RCs cap 5/Last 3 Deploys); response_type:'ephemeral' confirmed |
| 4 | @OttoBot status in any channel returns the same response as /triarch status | VERIFIED | events/route.ts imports from '@/lib/slack-status' (no duplication); MENTION_PREFIX_RE = /^<@[A-Z0-9]+>\s*/i; url_verification handled BEFORE verifySlackSignature (line 105 vs line 120); DEDUP_MAX=1000 with FIFO eviction |
| 5 | /admin/platform/slack-audit shows paginated, filterable table accessible to staff; non-staff receive 403/redirect | VERIFIED | page.tsx: ctx?.isStaff check with redirect('/admin?error=forbidden'); api/admin/slack-audit/route.ts: ctx?.isStaff with 403; PAGE_SIZE=50 + 1 for hasMore; 4 filters; load-more via fetch('/api/admin/slack-audit') |

**Score:** 5/5 truths verified (automated code checks)

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/lib/slack-audit.ts` | recordSlackAudit + SlackAuditInput; try/catch swallow | VERIFIED | 55 lines; exports recordSlackAudit + SlackAuditInput; sha256 hash; `console.warn('[slack-audit] audit insert failed (best-effort):', err)` |
| `src/lib/slack-status.ts` | buildStatusBlocks + fetchProjectStatus + humanizeDate + listProjectKeys | VERIFIED | 172 lines; 4 exports + ProjectStatusData interface; Drizzle imports and, desc, eq, inArray, ne, sql; `'_no dev release_'` literal present |
| `src/app/api/slack/interact/route.ts` | recordSlackAudit wired at all return paths | VERIFIED | 15 `void recordSlackAudit(...)` call sites; requestReceivedAt captured before req.text() |
| `src/app/api/slack/commands/route.ts` | HMAC + URLSearchParams + deploy authz + status block kit + help | VERIFIED | 299 lines; verifySlackSignature before URLSearchParams; 12 audit call sites; HELP_TEXT includes @OttoBot mention |
| `src/app/api/slack/events/route.ts` | url_verification BEFORE HMAC; dedup; app_mention parse; resetDedupForTests | VERIFIED | 265 lines; url_verification at line 105 before verifySlackSignature at line 120; DEDUP_MAX=1000; MENTION_PREFIX_RE; resetDedupForTests exported |
| `src/app/admin/platform/slack-audit/page.tsx` | staff gate + filters + paginated query | VERIFIED | 85 lines; no 'use client'; ctx?.isStaff check; 4 filter conditions with Pitfall 7 ilike guard; PAGE_SIZE+1 fetch |
| `src/app/admin/platform/slack-audit/SlackAuditClient.tsx` | 4 filters + table + load-more + row expand | VERIFIED | 227 lines; 'use client'; 4 labeled filter inputs; table with 6 columns; statusBadgeClass green/amber/red/zinc; router.push URL mirroring; fetch('/api/admin/slack-audit') for load-more |
| `src/app/api/admin/slack-audit/route.ts` | load-more endpoint + staff gate + filters | VERIFIED | 67 lines; GET export; ctx?.isStaff → 403; 4 filters matching page.tsx; limit 51 with hasMore detection |
| `scripts/seed-slack-audit-nav.sql` | INSERT INTO menu_pages with min_role='staff' | VERIFIED | 59 lines; INSERT INTO menu_pages; ON CONFLICT (section_id, key) DO NOTHING; min_role='staff'; path='/admin/platform/slack-audit' |
| `docs/onboarding-projects.md` | Step 10 documents 3 scopes + Events URL + slash URL | VERIFIED | Step 10 "OttoBot Slack App scope upgrade + endpoint URL configuration"; all 3 scopes documented; both URLs present; token rotation note present |
| `.planning/phases/07-ottobot-dispatcher-hardening/07-HUMAN-UAT.md` | UAT checklist for OTTOBOT-02 + OTTOBOT-06 | VERIFIED (pending completion) | File exists; covers OTTOBOT-02 + OTTOBOT-06; 6 steps; Sign-off section; Failure Handling section; status: pending (not yet completed by Mike) |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| interact/route.ts | slack-audit.ts (recordSlackAudit) | `void recordSlackAudit(...)` | WIRED | 15 call sites confirmed |
| slack-audit.ts | slackActionAudit table | `db.insert(slackActionAudit).values(...)` | WIRED | Line 44; try/catch wraps insert |
| recordSlackAudit error path | console.warn | try/catch swallow per D-08 | WIRED | `console.warn('[slack-audit] audit insert failed (best-effort):', err)` |
| commands/route.ts | verifySlackSignature | HMAC before URLSearchParams | WIRED | verifySlackSignature at line 52; new URLSearchParams at line 66 |
| commands/route.ts (deploy) | dispatchWorkflow | fire-and-forget IIFE | WIRED | `void (async () => { await dispatchWorkflow({...}) })()` at line 235 |
| commands/route.ts (status) | slack-status.ts (fetchProjectStatus + buildStatusBlocks) | import from '@/lib/slack-status' | WIRED | Lines 29-32; fetchProjectStatus + buildStatusBlocks called in status branch |
| events/route.ts | url_verification before HMAC | JSON parse then type check | WIRED | url_verification check at line 105; verifySlackSignature at line 120 |
| events/route.ts | slack-status.ts | import from '@/lib/slack-status' | WIRED | Line 26; fetchProjectStatus, buildStatusBlocks, listProjectKeys used |
| events/route.ts | postSlackThreadedReply | thread_ts: threadTs | WIRED | Lines 167-173, 194-209, 233-240 |
| events/route.ts dedup | Map FIFO eviction | DEDUP_MAX=1000 | WIRED | Lines 30-43; isDuplicateEvent function |
| page.tsx | getCurrentUserContext + isStaff | session → ctx?.isStaff | WIRED | Lines 29-32 |
| SlackAuditClient.tsx | /api/admin/slack-audit | fetch on load-more | WIRED | Line 108 |
| SlackAuditClient.tsx | URL search params | router.push in useEffect | WIRED | Lines 82-92 |
| api/admin/slack-audit/route.ts | slackActionAudit table | db.select().from(slackActionAudit) | WIRED | Lines 46-52 |
| seed-slack-audit-nav.sql | menu_pages table | INSERT INTO menu_pages | WIRED (pending manual apply) | SQL correct; not yet applied to prod |
| onboarding-projects.md | Slack App settings UI | Documented procedure | WIRED (HUMAN action) | Step 10; all 3 scopes; both URLs |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| OTTOBOT-01 | 07-02 | Every /api/slack/interact action writes slack_action_audit row | SATISFIED | 15 audit call sites; all return paths covered including _sig_failed, _parse_failed, actionId paths |
| OTTOBOT-02 | 07-06 | OttoBot scope upgrade (chat:write.public, app_mentions:read, commands) | CODE COMPLETE — HUMAN action pending | Documented in docs/onboarding-projects.md Step 10 and 07-HUMAN-UAT.md; actual api.slack.com config pending Mike |
| OTTOBOT-03 | 07-03 | /triarch deploy — staff-only, dispatches promote-branch.yml, ephemeral ack | SATISFIED | staff check, dispatchWorkflow fire-and-forget IIFE, :no_entry: literal, :gear: ack |
| OTTOBOT-04 | 07-03 | /triarch status — dev/prod/RCs/last 3 deploys Block Kit response | SATISFIED | fetchProjectStatus + buildStatusBlocks in slack-status.ts; response_type:'ephemeral' |
| OTTOBOT-05 | 07-04 | @OttoBot status mirrors /triarch status via Events API | SATISFIED | events/route.ts imports slack-status.ts; dedup; MENTION_PREFIX_RE; postSlackThreadedReply |
| OTTOBOT-06 | 07-05, 07-06 | /admin/platform/slack-audit — staff-only, paginated, filterable | SATISFIED (nav seed pending) | page.tsx + SlackAuditClient.tsx + api/admin/slack-audit/route.ts; seed SQL committed but not yet applied |

---

### Anti-Patterns Found

No blockers or stubs detected. All checked files contain substantive implementations:

- `slack-audit.ts`: No return null, no TODOs; full try/catch with real insert
- `commands/route.ts`: No placeholder branches; all subcommands implemented
- `events/route.ts`: No stub handlers; dedup, mention parse, status reply all real
- `page.tsx`: Server component with real Drizzle query; no hardcoded empty arrays
- `SlackAuditClient.tsx`: Real fetch, real filter state, real load-more append
- `api/admin/slack-audit/route.ts`: Real Drizzle query with filters and pagination

One observation (not a blocker): `07-HUMAN-UAT.md` has `status: pending` — expected, as the manual steps haven't been completed yet. This is the expected state for a phase entering HUMAN verification.

---

### Human Verification Required

#### 1. Apply menu_pages seed (OTTOBOT-06 sidebar nav)

**Test:** Run `firebase apphosting:secrets:access DATABASE_URL --project triarch-dev > /tmp/.db_url && psql "$(cat /tmp/.db_url)" -f scripts/seed-slack-audit-nav.sql` then verify SELECT returns label='Slack Audit', min_role='staff'.
**Expected:** Seed applies successfully; Slack Audit link appears in admin sidebar for staff login; sidebar entry absent for non-staff (role='admin') login; direct URL access to /admin/platform/slack-audit redirects non-staff to /admin?error=forbidden.
**Why human:** DATABASE_URL is a Firebase App Hosting secret. The seed has never been applied to production CRDB. The DynamicSidebar role gate and page redirect require a live browser session to confirm.

#### 2. Slack App scope upgrade (OTTOBOT-02)

**Test:** Follow docs/onboarding-projects.md Step 10 exactly — add 3 scopes, register /triarch slash command at https://admin.triarch.dev/api/slack/commands, enable Events API at https://admin.triarch.dev/api/slack/events with app_mention subscription, reinstall workspace, verify/rotate SLACK_BOT_TOKEN.
**Expected:** Scope upgrade completes without error; workspace reinstall succeeds; Slack App shows the 3 new scopes active.
**Why human:** api.slack.com Slack App configuration is a UI-only action. Scope additions, URL configuration, and workspace reinstall require authenticated access to the Slack App management dashboard.

#### 3. End-to-end smoke test (OTTOBOT-02 through OTTOBOT-05 combined)

**Test:** In Slack, type `/triarch` (no args), `/triarch status admin`, `/triarch deploy admin v0.0.0-fake` as staff and as non-staff, `@OttoBot status admin` in a channel.
**Expected:** Each command produces the expected ephemeral or threaded response per 07-CONTEXT D-04 through D-18. Audit rows for slash_help, slash_status, slash_deploy, event_app_mention_status appear in /admin/platform/slack-audit.
**Why human:** Requires live Slack workspace with active OttoBot installation and admin deployed with Phase 7 code. Real-time Slack behavior (ephemeral delivery, threaded replies, 3-second response window) cannot be verified programmatically.

#### 4. Filter + pagination smoke test (OTTOBOT-06 viewer UX)

**Test:** On /admin/platform/slack-audit, type in Actor Email filter, set date range, click Load more if available, click a row to expand payload_hash.
**Expected:** URL updates to reflect filters, rows narrow correctly, pagination appends rows, expanded row shows payload_hash.
**Why human:** Interactive browser behavior (useEffect URL update, fetch on click, DOM expansion toggle) is covered by RTL unit tests but real browser rendering and UX behavior requires human confirmation.

---

### Gaps Summary

No code gaps. All 5 ROADMAP Success Criteria are satisfied by the committed code, verified across all three levels (exists, substantive, wired). The test suite passes 126/126 tests across 20 test files with 0 failures. TypeScript type check exits 0.

The `human_needed` status reflects two categories of pending HUMAN action:

1. **Infrastructure actions** (OTTOBOT-02, OTTOBOT-06 nav seed): Code deliverables are complete. Two one-time production steps are pending — applying the SQL seed and upgrading the Slack App scopes. These are documented in 07-HUMAN-UAT.md (status: pending).

2. **Real-Slack smoke tests** (OTTOBOT-02 through OTTOBOT-05 combined verification): The Slack integration cannot be verified without a live workspace with the upgraded scopes active.

Per the verification protocol, `human_needed` is appropriate: all automated checks pass, HUMAN-UAT items are pending.

---

*Verified: 2026-05-05T13:45:00Z*
*Verifier: Claude (gsd-verifier)*
