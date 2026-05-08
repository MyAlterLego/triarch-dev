---
phase: 11-commit-parser-and-tracker-linkage-authoring
verified: 2026-05-08T05:07:48Z
status: gaps_found
score: 13/16 must-haves verified
re_verification: false
gaps:
  - truth: "Staff sees existing release_log_links chips on each entry in /admin/modules/release-logs"
    status: failed
    reason: "/api/platform/release-logs (the endpoint page.tsx fetches) does not join release_log_links. LinksClient has no useEffect to fetch from GET /api/admin/release-logs/[id]/links on mount. initialLinks is always [] on every page load."
    artifacts:
      - path: "src/app/api/platform/release-logs/route.ts"
        issue: "Not modified. Plan 11-04 listed it in files_modified but neither commit touched it. The GET handler returns release rows with no links field."
      - path: "src/app/admin/modules/release-logs/LinksClient.tsx"
        issue: "No useEffect to fetch from GET /api/admin/release-logs/[id]/links on mount. Component relies solely on initialLinks prop which is always passed as [] from page.tsx."
    missing:
      - "Either augment /api/platform/release-logs GET to left-join release_log_links and return links[] per release, OR add a useEffect in LinksClient to fetch GET /api/admin/release-logs/${releaseId}/links on mount and hydrate state."

  - truth: "Page reflects mutations without hard reload (revalidatePath + router.refresh or optimistic state)"
    status: partial
    reason: "Optimistic state works within session (add chip appears instantly, remove chip disappears instantly). However revalidatePath('/admin/modules/release-logs') is called server-side from POST/DELETE, but the client-component page never re-fetches, so added/removed links do not survive a hard reload. The gap is the same root cause as the chip-visibility gap above."
    artifacts:
      - path: "src/app/admin/modules/release-logs/page.tsx"
        issue: "Client component fetches from /api/platform/release-logs which does not return links. No router.refresh() call after LinksClient mutations. revalidatePath on server does not drive a client re-fetch in this architecture."
    missing:
      - "Once the list endpoint is augmented with links, the page will re-fetch on next fetchReleases() call. Alternatively, add router.refresh() callback from LinksClient to parent page so the page re-fetches after successful mutation."

human_verification:
  - test: "Trigger a Slack notification path containing a commit message with <!channel> and U+202E, then inspect the actual Slack message"
    expected: "The <!channel> does not ping the channel; the U+202E is absent from the rendered message"
    why_human: "Cannot verify Slack delivery behavior programmatically. Task 4 of Plan 11-04 was auto-approved by autonomous mode rather than verified by a human."
  - test: "Visit /admin/modules/release-logs as a staff user and expand a release that has auto-stamped links in release_log_links (source='commit'). Confirm chips render."
    expected: "Blue-gradient chips are visible showing bug/feature titles or external URLs"
    why_human: "Automated verification confirms the gap — the list endpoint does not return links — but only a human can confirm the net UX impact and whether the GET /api/admin/release-logs/[id]/links endpoint works correctly when called directly."
---

# Phase 11: Commit Parser and Tracker Linkage Authoring — Verification Report

**Phase Goal:** Every release ingest automatically stamps bug/feature links from commit messages, and staff can correct or supplement those links from the admin release-logs page
**Verified:** 2026-05-08T05:07:48Z
**Status:** gaps_found
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | parseCommitRefs extracts BUG/FEAT UUID refs and verb-prefixed forms | VERIFIED | commit-parser.ts lines 28–136; 27 test cases pass covering Pattern A/B/C |
| 2 | parseCommitRefs extracts bare `#N` refs as link_type='external' | VERIFIED | EXTERNAL_ISSUE regex at line 42; test `fixes #99 matches as external with ref='99'` |
| 3 | Parser is pure — zero DB/IO imports | VERIFIED | grep of `from '@/lib/db'\|from '@/db/\|from 'next/server'` in commit-parser.ts returns empty |
| 4 | Malformed UUIDs (wrong length, non-hex) are rejected | VERIFIED | Tests `malformed UUID with wrong length` and `malformed UUID with non-hex chars` confirmed |
| 5 | Common false positives (commit hashes, version tags, PR URLs) do NOT match | VERIFIED | Negative tests for `1234567`, `v1.2.3`, `/pull/42` all assert empty return |
| 6 | Same ID appearing twice is deduplicated | VERIFIED | Set-based dedup in commit-parser.ts lines 65–90; test `same BUG-uuid twice → returned once` |
| 7 | sanitizeForSlack strips Slack control sequences | VERIFIED | sanitize-commit.ts lines 50–58; 27 test cases cover all 5 pattern types |
| 8 | sanitizeForRender strips RTL override and zero-width chars | VERIFIED | sanitize-commit.ts lines 72–83; regex covers U+202E/D, U+200B/C/D, U+FEFF |
| 9 | stampLinksFromCommit validates IDs via inArray and writes only valid rows | VERIFIED | link-stamper.ts lines 57–76; 18 tests including valid/invalid mix and batch call count assertions |
| 10 | Invalid IDs silently dropped; phantom links impossible | VERIFIED | validBugIds/validFeatureIds Sets; only Set members produce INSERT rows |
| 11 | External #N refs use projects.github_repo; null repo → no row | VERIFIED | link-stamper.ts lines 81–88, 129; test `github_repo=null → 0 links` passes |
| 12 | Ingest route calls stampLinksFromCommit AFTER INSERT in try/catch | VERIFIED | release-logs/route.ts line 68–96; try/catch wraps await stampLinksFromCommit |
| 13 | Stamper failure never blocks release ingest | VERIFIED | Two-layer error isolation: stamper try/catch (line 46) + ingest route try/catch (line 68) |
| 14 | Staff sees existing release_log_links chips on each entry | FAILED | /api/platform/release-logs does not join release_log_links; LinksClient has no mount-time fetch; initialLinks is always [] |
| 15 | Staff can add/remove links; page reflects mutations without hard reload | PARTIAL | Optimistic state works within session. POST/DELETE routes functional. But links do not load on page reload (same root cause as #14) |
| 16 | POST /api/admin/release-logs/[id]/links is staff-only (requireStaff guard) | VERIFIED | requireStaff() is first call in both GET (line 33) and POST (line 94) handlers |
| 17 | DELETE /api/admin/release-logs/[id]/links/[linkId] is staff-only | VERIFIED | requireStaff() at line 18 in [linkId]/route.ts |
| 18 | Commit-message strings posted to Slack flow through sanitizeForSlack | VERIFIED | slack.ts: import at line 3; applied in postSlackThreadedReply (line 94), postSlackChannelMessage (lines 130–131), notifyReleaseApproved (lines 325–327); 7 call sites + sanitizeBlockKitBlocks helper |
| 19 | Commit-message strings rendered in admin UI flow through sanitizeForRender | PARTIAL | LinksClient.tsx chip text sanitized via chipText() (line 28). page.tsx entry.description rendered at line 326 without sanitizeForRender. This is a lesser concern (React HTML-escapes, and entry.description is from the ingest body, not the raw commit message), but the plan truth is not fully satisfied. |
| 20 | Auto-detected (source='commit') and manual (source='manual') chips show different visual treatment | VERIFIED | chipClasses() in LinksClient.tsx: commit=blue gradient outline (box-shadow), manual=teal gradient outline |

**Score:** 13/16 truths verified (3 PARTIAL/FAILED, 2 of which share the same root cause)

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/lib/commit-parser.ts` | parseCommitRefs + ParsedRef type | VERIFIED | 136 lines; exports both; zero I/O imports; all 3 regex patterns present |
| `src/lib/commit-parser.test.ts` | 27 Vitest cases, describe('parseCommitRefs') | VERIFIED | 27 it() blocks; imports from './commit-parser'; covers all specified patterns |
| `src/lib/sanitize-commit.ts` | sanitizeForSlack + sanitizeForRender | VERIFIED | 85 lines; exports both functions; pure with zero I/O |
| `src/lib/sanitize-commit.test.ts` | 27 Vitest cases, describe('sanitizeForSlack') | VERIFIED | 27 it() blocks; 3 describe blocks covering both helpers and chokepoint scenarios |
| `src/lib/link-stamper.ts` | stampLinksFromCommit | VERIFIED | 162 lines; exports stampLinksFromCommit; imports parseCommitRefs from '@/lib/commit-parser'; uses inArray; top-level try/catch; source='commit' hardcoded |
| `src/lib/link-stamper.test.ts` | 18 Vitest cases, describe('stampLinksFromCommit') | VERIFIED | 18 it() blocks; mocks @/lib/db; imports from './link-stamper'; tests batching call counts |
| `src/app/api/platform/ingest/release-logs/route.ts` | Modified — calls stampLinksFromCommit non-blockingly after INSERT | VERIFIED | try/catch wraps stampLinksFromCommit; messageText IIFE resolves body.commitMessage → summary → entries |
| `src/app/api/admin/release-logs/[id]/links/route.ts` | GET + POST, staff-only | VERIFIED | GET lists with title augmentation; POST creates source='manual'; requireStaff first; revalidatePath called |
| `src/app/api/admin/release-logs/[id]/links/[linkId]/route.ts` | DELETE, staff-only | VERIFIED | DELETE scoped to (id, linkId) pair; 404 on mismatch; requireStaff first; revalidatePath called |
| `src/app/admin/modules/release-logs/LinksClient.tsx` | Client island, 60+ lines | VERIFIED | 273 lines; 'use client'; optimistic add/remove; chipClasses distinguishes source; sanitizeForRender on chip text; fetch POST and DELETE to admin API |
| `src/app/admin/modules/release-logs/page.tsx` | Modified — embeds LinksClient | VERIFIED | import + type extension + `<LinksClient>` embed in expanded view (5 additive lines) |
| `src/lib/slack.ts` | Modified — sanitizeForSlack at all Slack post chokepoints | VERIFIED | import at line 3; sanitizeBlockKitBlocks helper added; 7 call sites for sanitizeForSlack |
| `src/app/api/platform/release-logs/route.ts` | Was listed in files_modified — should return links per release | MISSING/ORPHANED | File NOT modified. Neither Plan 11-04 commit (bf7019a or f414ef2) touched this file. Platform list endpoint still returns release rows with no links field. This is the root cause of the display gap. |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/lib/link-stamper.ts` | `src/lib/commit-parser.ts` | `import { parseCommitRefs }` | WIRED | Line 17: `import { parseCommitRefs } from '@/lib/commit-parser'`; called at line 39 |
| `src/app/api/platform/ingest/release-logs/route.ts` | `src/lib/link-stamper.ts` | try/catch wrapped call after INSERT | WIRED | Line 5 import; line 88 await stampLinksFromCommit(); try/catch at lines 68–96 |
| `src/lib/slack.ts` | `src/lib/sanitize-commit.ts` | `import { sanitizeForSlack }` | WIRED | Line 3 import; called at 7 sites including postSlackThreadedReply, postSlackChannelMessage, notifyReleaseApproved |
| `src/app/admin/modules/release-logs/LinksClient.tsx` | `/api/admin/release-logs/[id]/links` | fetch POST and DELETE | WIRED | Line 127: fetch POST; line 83: fetch DELETE with method:'DELETE' |
| `src/app/api/platform/release-logs/route.ts` | `release_log_links` table | links join for page display | NOT WIRED | Route not modified; no join to release_log_links; links[] never returned to page.tsx |
| `src/app/admin/modules/release-logs/page.tsx` → `LinksClient` | `GET /api/admin/release-logs/[id]/links` | useEffect or mount-fetch | NOT WIRED | LinksClient has no useEffect; relies entirely on initialLinks prop which is always [] |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| LINK-02 | 11-01, 11-03 | Release ingest auto-detects bug/feature IDs in commit messages via regex and writes to release_log_links | SATISFIED | parseCommitRefs (commit-parser.ts) + stampLinksFromCommit (link-stamper.ts) + ingest hook (ingest/release-logs/route.ts). Regex covers BUG-{uuid}, FEAT-{uuid}, closes/fixes/resolves + verb-prefixed forms |
| LINK-03 | 11-01, 11-03 | Auto-detected IDs validated against DB before stamping — no false positives surfaced | SATISFIED | inArray batch validation in link-stamper.ts; invalid IDs dropped silently; 18 Vitest tests confirm behavior |
| LINK-04 | 11-04 | Authoring UI in /admin/modules/release-logs lets staff manually add or remove links per release (override auto-detection) | PARTIALLY SATISFIED | Staff can add/remove links (POST/DELETE routes work, requireStaff guards present). However, existing links (including auto-detected ones) do not show on page load — the list endpoint is not augmented. The "sees existing chips" half of LINK-04 is not delivered. |
| LINK-07 | 11-02, 11-04 | Commit message content sanitized before render or Slack post | SATISFIED | sanitizeForSlack at all 3 Slack chokepoints; sanitizeForRender on LinksClient chip text. Gap: page.tsx entry.description (raw changelog entry) not sanitized, but this is a lesser surface (ingest body, not raw commit string; React HTML-escapes anyway) |

---

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| `src/app/admin/modules/release-logs/LinksClient.tsx` (picker, ~lines 153–197) | UUID-paste fallback instead of typeahead search | INFO | Documented stub per plan and prompt instructions. Manual UUID entry satisfies LINK-04. Not a blocker. |
| `src/app/api/platform/release-logs/route.ts` | Not augmented — links[] never returned | BLOCKER | Root cause of chip-visibility gap. Platform list endpoint returns release rows with no links field; LinksClient always starts empty. |
| `src/app/admin/modules/release-logs/page.tsx` line 326 | entry.description rendered without sanitizeForRender | WARNING | Changelog entry descriptions are not passed through sanitizeForRender. React auto-escapes HTML so XSS is not a risk, but Unicode RTL override / zero-width chars in entry.description could still visually deceive. Lower risk than commit message titles but misses the plan truth. |

---

### Human Verification Required

#### 1. Slack Sanitization End-to-End

**Test:** Insert a test release with summary containing `<!channel>` and a U+202E codepoint. Trigger the Slack notification path (e.g., approve via OttoBot). Inspect the Slack message.
**Expected:** No `@channel` mention fires; U+202E is absent from the rendered text (no text reversal).
**Why human:** Task 4 of Plan 11-04 was "auto-approved by autonomous mode" rather than executed by a human. Slack delivery behavior and notification triggering cannot be verified via grep or code inspection.

#### 2. LinksClient Chip Display (Once List Endpoint Is Fixed)

**Test:** After the list endpoint augmentation gap is closed, visit `/admin/modules/release-logs`, expand a release that has auto-stamped links in `release_log_links` (source='commit'). Confirm blue-gradient chips render with bug/feature titles.
**Expected:** Chips appear showing bug title (or external URL) with the correct visual treatment.
**Why human:** Database content and live rendering cannot be verified programmatically.

#### 3. Add/Remove Link Flow

**Test:** Click "+ Add link", paste a valid bug UUID, click Add. Confirm chip appears. Reload page. Confirm chip still appears (requires list endpoint fix).
**Expected:** Chip persists across reload; teal gradient manual styling applied.
**Why human:** Requires live deployment and session interaction to confirm optimistic→persistent transition.

---

### Gaps Summary

**Root cause of both display gaps:** `src/app/api/platform/release-logs/route.ts` was listed in plan 11-04's `files_modified` but was never modified by either commit (bf7019a or f414ef2). The plan's Task 2 note says "optional for backward compat with the list endpoint until Task 3 augments it" — but Task 3 augmented slack.ts (sanitization), not the list endpoint. The augmentation was neither implemented nor explicitly deferred in the summary.

As a result:
- `release.links` is always `undefined` in page.tsx
- `initialLinks` is always `[]` in LinksClient
- Existing `release_log_links` rows (from auto-stamp or prior manual adds) are invisible on page load
- After a user adds a link in the current session, it disappears on reload

**Fix scope:** Small — either (A) add a `LEFT JOIN` on `release_log_links` in the platform GET handler and return `links: row[]` per release, or (B) add a `useEffect` in LinksClient to call `GET /api/admin/release-logs/${releaseId}/links` on mount and set initial state. Option A is one data model change; Option B avoids touching the platform route but makes N API calls (one per release on expand).

**What works well:** The commit parsing pipeline (Plans 11-01, 11-02, 11-03) is fully functional and well-tested. Auto-stamping from ingest works end-to-end. Staff CRUD API routes are correctly guarded. Slack sanitization is wired at chokepoints. The only undelivered piece is surfacing existing links in the UI.

---

_Verified: 2026-05-08T05:07:48Z_
_Verifier: Claude (gsd-verifier)_
