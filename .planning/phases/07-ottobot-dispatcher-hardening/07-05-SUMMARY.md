---
phase: 07-ottobot-dispatcher-hardening
plan: "05"
subsystem: admin-ui
tags: [slack-audit, admin-platform, pagination, filters, ottobot]
dependency_graph:
  requires: [07-01]
  provides: [OTTOBOT-06-page]
  affects: [07-06]
tech_stack:
  added: []
  patterns:
    - "RSC + client component split: server fetches first page, client handles filters + load-more"
    - "URL search param mirroring via router.push in useEffect"
    - "PAGE_SIZE+1 hasMore detection (Phase 5 pattern)"
    - "Drizzle ilike guard: only applied when emailFilter.trim() is non-empty (Pitfall 7)"
key_files:
  created:
    - src/app/admin/platform/slack-audit/page.tsx
    - src/app/admin/platform/slack-audit/SlackAuditClient.tsx
    - src/app/api/admin/slack-audit/route.ts
  modified: []
decisions:
  - "Pitfall 7 mitigation applied: ilike only when emailFilter.trim() non-empty — avoids excluding null-email rows on empty filter"
  - "router.push (not router.replace) used for URL mirroring — matches test mock expectation (pushMock)"
  - "SlackAuditClient uses implicit label association (input nested in label) — getByLabelText('Actor Email') resolves correctly"
metrics:
  duration: "~10 minutes"
  completed: "2026-05-05T18:34:31Z"
  tasks_completed: 2
  files_created: 3
  tests_added: 0
  tests_turned_green: 6
---

# Phase 07 Plan 05: Slack Audit Page Summary

One-liner: Staff-only `/admin/platform/slack-audit` page with Drizzle-backed paginated table, 4 URL-mirrored filter inputs, color-coded status badges, and row-expand payload_hash viewer.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Implement SlackAuditPage RSC + load-more API endpoint | 455c8ae | page.tsx, route.ts |
| 2 | Implement SlackAuditClient (filters + table + load-more + row expand) | a35e573 | SlackAuditClient.tsx |

## Files Created

| File | Lines | Role |
|------|-------|------|
| src/app/admin/platform/slack-audit/page.tsx | 85 | Server component: staff gate + first-page Drizzle fetch + SlackAuditClient render |
| src/app/admin/platform/slack-audit/SlackAuditClient.tsx | 227 | Client component: 4 filter inputs, URL-mirrored state, table + expand, load-more |
| src/app/api/admin/slack-audit/route.ts | 67 | GET endpoint: staff-only (403 non-staff), same filter/pagination logic as page.tsx |

## Auth Gate Confirmation

Both page.tsx and route.ts enforce staff access:

- `page.tsx`: `getServerSession(authOptions)` → `getCurrentUserContext(session)` → `if (!ctx?.isStaff) redirect('/admin?error=forbidden')`
- `route.ts`: same pattern → returns `{ error: 'forbidden' }, { status: 403 }` for non-staff

## Filter Behavior

4 inputs at top of SlackAuditClient:

| Input | Type | Behavior |
|-------|------|----------|
| Action ID | text | Exact match via `eq(slackActionAudit.actionId, ...)` |
| Actor Email | text | ILIKE substring via `ilike(..., '%value%')` — guard: only when `.trim()` non-empty |
| From | date | `gte(createdAt, fromDate)` |
| To | date | `lte(createdAt, toDate)` |

URL mirroring: `useEffect` on all 4 filter state values calls `router.push(?key=value&...)` — shareable filtered views.

## Test Counts

| Suite | Count | Status |
|-------|-------|--------|
| page.test.tsx (from 07-01 Wave 0) | 2 | GREEN |
| SlackAuditClient.test.tsx (from 07-01 Wave 0) | 4 | GREEN |
| Prior plan suites (lib/__tests__, api/slack/) | 60 | GREEN (no regression) |

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. All data flows from real Drizzle queries to rendered table rows.

## Handoff Note

OTTOBOT-06 page exists but has no sidebar nav entry yet. Plan 07-06 seeds menu_pages row + writes onboarding doc + emits HUMAN-UAT for OTTOBOT-02 scope upgrade.

## Self-Check: PASSED

Files exist:
- FOUND: src/app/admin/platform/slack-audit/page.tsx
- FOUND: src/app/admin/platform/slack-audit/SlackAuditClient.tsx
- FOUND: src/app/api/admin/slack-audit/route.ts

Commits verified:
- FOUND: 455c8ae (feat(07-05): implement SlackAuditPage RSC + load-more API endpoint)
- FOUND: a35e573 (feat(07-05): implement SlackAuditClient with filters, table, load-more, row expand)
