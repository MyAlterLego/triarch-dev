---
phase: "07"
plan: "03"
subsystem: "ottobot-dispatcher-hardening"
tags: [slack, commands, deploy, status, block-kit, ottobot]
dependency_graph:
  requires:
    - "07-01: Wave 0 fixture factory + RED test stubs"
    - "07-02: slack-audit.ts (recordSlackAudit helper)"
  provides:
    - "src/lib/slack-status.ts — shared Block Kit builder + Drizzle status fetcher (consumed by 07-04 events route)"
    - "src/app/api/slack/commands/route.ts — POST /api/slack/commands handler"
  affects:
    - "plan 07-04 — imports fetchProjectStatus + buildStatusBlocks from slack-status.ts"
tech_stack:
  added: []
  patterns:
    - "req.text() once before all parsing (RESEARCH Pitfall 1 guard)"
    - "void (async () => {...})() IIFE for fire-and-forget dispatchWorkflow (Pitfall 4 guard)"
    - "void recordSlackAudit on every response path (12 call sites)"
    - "Block Kit header/section/divider structure for status response"
key_files:
  created:
    - "src/lib/slack-status.ts"
    - "src/app/api/slack/commands/route.ts"
  modified: []
decisions:
  - "status subcommand treated as open-to-anyone (ephemeral, bounded leak risk) rather than project-member gating per D-06 deviation — avoids extra DB roundtrip per command"
  - "listProjectKeys falls back to empty array on DB failure — project list hint in unknown-project error is best-effort"
  - "deploy branch resolution: branchOverride ?? release?.branch ?? 'main' — release lookup is extra DB call after fetchProjectStatus to extract branch from release_logs"
metrics:
  duration: "3 minutes"
  completed: "2026-05-05"
  tasks_completed: 2
  files_created: 2
  files_modified: 0
---

# Phase 07 Plan 03: /api/slack/commands + slack-status.ts Summary

OTTOBOT-03 (/triarch deploy) + OTTOBOT-04 (/triarch status) closed. Shared slack-status.ts available for plan 07-04 /api/slack/events.

## Tasks Completed

| # | Name | Commit | Files |
|---|------|--------|-------|
| 1 | Implement src/lib/slack-status.ts shared Block Kit + Drizzle fetchers | `0caa59d` | `src/lib/slack-status.ts` (171 lines) |
| 2 | Implement POST /api/slack/commands — deploy + status + help | `411a512` | `src/app/api/slack/commands/route.ts` (298 lines) |

## Files Created

### src/lib/slack-status.ts (171 lines)

5 exports providing shared status infrastructure:

| Export | Type | Purpose |
|--------|------|---------|
| `ProjectStatusData` | interface | Typed container for 5-query fetch result |
| `fetchProjectStatus(projectKey)` | async fn | 5 Drizzle queries: project, dev, prod, activeRCs (limit 6 for overflow), lastDeploys |
| `listProjectKeys(limit)` | async fn | Returns up to N project key strings; never throws |
| `humanizeDate(d)` | fn | Relative time: Xm/Xh/Xd ago; 'unknown' for null |
| `buildStatusBlocks(...)` | fn | Block Kit array: header → section/fields → divider → Active RCs → divider → Last 3 Deploys |

Key implementation details:
- `inArray(releaseLogs.status, ['dev', 'pending_approval', 'approved'])` — exact RC status filter per CONTEXT D-15
- `ne(releaseLogs.branch, 'main')` — RC branch filter
- `activeRCs` fetches 6, shows 5, appends `_+ N more_` on overflow
- `humanizeDate`: uncapped days (e.g. '120d ago') per RESEARCH §6

### src/app/api/slack/commands/route.ts (298 lines)

`POST /api/slack/commands` — single handler with internal subcommand switch.

**Response paths table:**

| Subcommand | Scenario | Status | Audit actionId |
|------------|----------|--------|----------------|
| (any) | HMAC verify fails | 401 | `_sig_failed` |
| (empty) | No text args | 200 ephemeral help | `slash_help` |
| `status` | No project arg | 200 ephemeral usage | `slash_status` |
| `status` | Unknown project | 200 ephemeral not found + key list | `slash_status` |
| `status` | Project found | 200 ephemeral Block Kit | `slash_status` |
| `deploy` | Non-staff | 200 ephemeral :no_entry: | `slash_deploy` |
| `deploy` | Staff, missing args | 200 ephemeral usage | `slash_deploy` |
| `deploy` | Project not found | 200 ephemeral not found | `slash_deploy` |
| `deploy` | No GitHub repo | 200 ephemeral warning | `slash_deploy` |
| `deploy` | Staff, valid args | 200 ephemeral :gear: ack | `slash_deploy` |
| (unknown) | Unrecognized subcommand | 200 ephemeral + help | `slash_unknown` |

**Critical design confirmations:**
- `req.text()` called once at line 47 — before HMAC verify + URLSearchParams parse
- `verifySlackSignature` at line 52 < `new URLSearchParams` at line 66
- `void (async () => { await dispatchWorkflow(...) ... })()` IIFE at line 235 — fire-and-forget confirmed
- `await dispatchWorkflow` is INSIDE the IIFE, NOT awaited at handler level — no blocking dispatch
- 12 `void recordSlackAudit(...)` call sites — every response path covered
- `:no_entry: This command requires Triarch staff access.` literal per CONTEXT D-05

## Test Counts

| File | Tests | Status |
|------|-------|--------|
| `src/app/api/slack/commands/route.test.ts` | 6 | GREEN |
| `src/lib/__tests__/slack-audit.test.ts` (from 07-02) | 3 | GREEN (no regression) |
| All other prior-phase tests | 106 | GREEN (no regression) |

Remaining RED (Wave 0 stubs pending other plans):
- `events/route.test.ts` — plan 07-04
- `page.test.tsx` + `SlackAuditClient.test.tsx` — plan 07-05

## TypeScript

`npx tsc --noEmit` — zero errors in plan scope. Only errors are the pre-existing "Cannot find module" for plans 07-04 and 07-05 RED stubs (pending those plans).

## Deviations from Plan

**1. [Rule 2 - Discretion] status subcommand open to all callers**
- **Found during:** Task 2 implementation
- **Issue:** CONTEXT D-06 specifies project-member gating for status, but PLAN.md action note says "Per CONTEXT D-06 deviation: status is treated as open-to-anyone (ephemeral, low leak risk) rather than gating on project_members."
- **Fix:** Implemented as open (no membership check) — response is always ephemeral so leak risk is bounded, avoids extra DB roundtrip
- **Files modified:** `src/app/api/slack/commands/route.ts`

## Handoff Note

OTTOBOT-03 + OTTOBOT-04 closed. `src/lib/slack-status.ts` is the single source of truth for status Block Kit — plan 07-04 should import `fetchProjectStatus` and `buildStatusBlocks` from `@/lib/slack-status` for `@OttoBot status` app mention handling.

## Self-Check: PASSED
