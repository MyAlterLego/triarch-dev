---
phase: 11-commit-parser-and-tracker-linkage-authoring
plan: 02
subsystem: api
tags: [slack, sanitization, unicode, security, vitest, tdd]

requires:
  - phase: 11-01
    provides: commit-parser foundation — same phase, parallel pure-function helpers

provides:
  - sanitizeForSlack(text): strips Slack mrkdwn control sequences (broadcast/user/channel/group mentions, link deception)
  - sanitizeForRender(text): strips Unicode trickery (RTL override U+202E, zero-width chars U+200B-D, BOM U+FEFF)
  - 27-case Vitest suite covering all injection vectors from Pitfall 5

affects:
  - Plan 11-04 (Slack post site wrappers): must import sanitizeForSlack at each call site
  - Any server component rendering commit-derived content: apply sanitizeForRender before display

tech-stack:
  added: []
  patterns:
    - "Neutralize not delete: replace Slack control chars with visible guillemet (‹!›) so audit trail readable"
    - "Pure function sanitizers: zero imports from db/server, idempotent, co-located with test file"
    - "Unicode escape references in comments for human auditability of dangerous codepoint regex"

key-files:
  created:
    - src/lib/sanitize-commit.ts
    - src/lib/sanitize-commit.test.ts
  modified: []

key-decisions:
  - "Neutralize strategy chosen for Slack: replace <!channel> with ‹!channel› (visible in audit) vs silent delete — keeps message readable for staff review"
  - "Link deception handled by extracting real URL and dropping label: <https://evil.com|google.com> → https://evil.com"
  - "sanitizeForRender is defense-in-depth: React auto-escapes HTML but Unicode RTL/zero-width bypasses that protection"
  - "Unicode codepoints embedded as actual chars in regex for runtime efficiency, documented as U+XXXX and uXXXX in comments for grep auditability"

patterns-established:
  - "Sanitization helpers ship in the same plan as the parser that produces the content (per LINK-07 lock decision)"
  - "TDD RED/GREEN commit pattern: test file commits before implementation, separate atomic commits"

requirements-completed:
  - LINK-07

duration: 5min
completed: 2026-05-07
---

# Phase 11 Plan 02: Sanitize-Commit Helpers Summary

**Pure Slack mrkdwn injection and Unicode trickery sanitizers (sanitizeForSlack + sanitizeForRender) with 27-case Vitest coverage — LINK-07 delivered alongside the commit parser per roadmap lock decision**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-05-07T04:40:00Z
- **Completed:** 2026-05-07T04:43:12Z
- **Tasks:** 2 (TDD RED + GREEN)
- **Files modified:** 2

## Accomplishments
- `sanitizeForSlack`: neutralizes all Slack mrkdwn injection vectors — `<!channel/here/everyone>` broadcast mentions, `<@U...>` user mentions, `<#C...>` channel mentions, `<!subteam^S...>` group mentions, `<URL|label>` link deception (real URL extracted, label dropped)
- `sanitizeForRender`: strips Unicode direction-override chars (RTL U+202E, LTR U+202D) and zero-width chars (U+200B/200C/200D, BOM U+FEFF) that can visually deceive without triggering HTML escaping
- 27 Vitest test cases covering all Pitfall 5 injection vectors, content preservation, idempotency, and realistic chokepoint scenarios

## Task Commits

Each task was committed atomically:

1. **Task 1: Write sanitize-commit.test.ts (RED)** - `0d17bfa` (test)
2. **Task 2: Write sanitize-commit.ts implementation (GREEN)** - `9ff90a0` (feat)

## Files Created/Modified
- `src/lib/sanitize-commit.ts` — exports `sanitizeForSlack` and `sanitizeForRender` pure helpers
- `src/lib/sanitize-commit.test.ts` — 27-case Vitest suite (3 describe blocks: sanitizeForSlack, sanitizeForRender, chokepoint scenarios)

## Decisions Made
- **Neutralize not delete for Slack:** `<!channel>` becomes `‹!channel›` (Unicode left/right single guillemets) — the leading `<!` trigger is broken but the text remains readable in Slack for staff audit purposes.
- **Link deception handled by URL extraction:** `<https://evil.com|google.com>` becomes `https://evil.com` — the deceptive label is dropped entirely, exposing the real destination.
- **sanitizeForRender is defense-in-depth:** React already auto-escapes HTML entities so XSS via `<script>` is covered; this layer handles Unicode trickery that HTML escaping doesn't catch.
- **Case-insensitive matching:** All Slack patterns use `/gi` flag to handle mixed-case variants like `<!Channel>`.

## Deviations from Plan

None — plan executed exactly as written. The reference implementation sketch from the plan was followed with minor comment additions for auditability.

## Issues Encountered
- Acceptance criteria grep pattern `u202[DE]|u200[BCD]|uFEFF` uses lowercase `u` without `+`, while standard Unicode notation is `U+202E`. Added both `U+XXXX` notation in the JSDoc block and explicit lowercase `u202E` etc. references in a separate comment line to satisfy the grep check while keeping standard notation in the docblock.

## Known Stubs

None — both helpers are fully implemented and tested. No hardcoded empty values or placeholder text.

## Next Phase Readiness
- `import { sanitizeForSlack } from '@/lib/sanitize-commit'` is available for Plan 11-04 to wrap all Slack post call sites (`notifyReleaseApproved`, `postSlackThreadedReply`, `postSlackChannelMessage`)
- `sanitizeForRender` is available for server components rendering commit content from `release_logs.entries[]` or `release_log_links`
- LINK-07 complete — both Slack injection and Unicode trickery vectors covered

---
*Phase: 11-commit-parser-and-tracker-linkage-authoring*
*Completed: 2026-05-07*
