---
phase: 37-claude-code-build-trigger
verified: 2026-05-18T15:35:00Z
status: human_needed
score: 5/5 must-haves verified (5 human UAT items pending)
re_verification:
  previous_status: none
  previous_score: n/a
  gaps_closed: []
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "TMI pilot — buildPrompt → /gsd:plan-phase round-trip"
    expected: "Pasting/opening the generated prompt in a fresh Claude Code session drives /gsd:plan-phase NEXT successfully for at least one approved TMI item"
    why_human: "Requires running an actual Claude Code session against the locked prompt template; can only be observed end-to-end interactively"
  - test: "Generate Build modal — Copy + Open + fallback toast (local_claude)"
    expected: "Modal opens within ~1s, prompt renders in readOnly textarea; Copy puts text on clipboard verified via paste; Open launches Claude Code (or amber fallback hint appears within 2s)"
    why_human: "Clipboard + URL-scheme launch + visual styling can only be confirmed in a real browser session"
  - test: "Generate Build modal — Copy-only path (manual mode)"
    expected: "After toggling a project to mode='manual' via BuildTriggerSection, the modal renders ONLY the Copy button; Open is hidden"
    why_human: "Requires switching modes via UI and re-opening the modal to visually confirm button visibility"
  - test: "BuildTriggerSection radio + path input (visual UAT)"
    expected: "Expanded project card on /admin/platform/projects shows the three radios with locked labels + helper text + Local Path input; Save persists across reload"
    why_human: "Visual layout + persistence round-trip requires real browser interaction"
  - test: "Approval Audit page row rendering"
    expected: "/admin/platform/approval-audit lists rows from approval_events with decision badge, surface chip, project chip, truncated comment + Show more toggle"
    why_human: "Visual styling, real-time row appearance after Generate Build click, and Show more interaction require browser session"
---

# Phase 37: Claude Code Build Trigger Verification Report

**Phase Goal:** Bridge "build plan approved" → "Claude Code executing the build" with one click. Generates structured GSD-compatible prompt from approved items, presents two trigger modes (clipboard + deep-link), stores per-project preference, audit-logs every trigger event.
**Verified:** 2026-05-18T15:35:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

Truths derived from ROADMAP Success Criteria (5 criteria) — these are the contract.

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `src/lib/build-prompt.ts` generator produces a prompt that drives Claude Code through `/gsd:plan-phase` for TMI pilot | ? UNCERTAIN (auto-verified shape; UAT pending) | Pure function shipped (128 lines); 18/18 Vitest GREEN covering YAML frontmatter shape + 4 sections + per-item rendering + determinism + CLAUDE.md reference (not inlined). Round-trip into a real Claude Code session is manual UAT — flagged as human_needed item 1. |
| 2 | "Generate build" button is DISABLED when 0 items approved, enabled otherwise | ✓ VERIFIED | `NextBuildPlanClient.tsx` line 152-159: `noItems = approvedCount === 0; generateDisabled = noItems || isManagedAgent` with `disabled={generateDisabled}` + locked tooltip `'Approve at least one item to generate a build'`. 5 Vitest cases in NextBuildPlanClient.test.tsx GREEN. |
| 3 | Both modes work: clipboard via toast; deep-link via `claude-code://` | ✓ VERIFIED (auto); visual UAT pending | `GenerateBuildModal.tsx` line 123-128 (clipboard.writeText + toast "Prompt copied"), line 49-56 (`buildDeepLink` pure helper produces `claude-code://open?prompt=…[&cwd=…]`), line 135 (window.location.href assignment), line 137 (2-sec fallback hint). 13/13 modal Vitest GREEN including special-char URL encoding + cwd omitted when localPath null + 2-second fallback. End-to-end launch is human_needed item 2. |
| 4 | `projects.build_trigger_mode` column with CHECK constraint; per-project preference editable | ✓ VERIFIED | Migration 0021 contains `CHECK (build_trigger_mode IN ('local_claude', 'managed_agent', 'manual'))`. Shared schema (line 52-53) exports `buildTriggerMode` varchar(32) NOT NULL DEFAULT 'local_claude' + `localPath` varchar(512) nullable. BuildTriggerSection.tsx renders 3 radios driven by `BUILD_TRIGGER_MODES` tuple, embedded in projects/page.tsx line 235. PUT /api/platform/projects/[id] validates via `isValidBuildTriggerMode` (line 17-18). 6 route Vitest + 7 component Vitest GREEN. Visual UAT is human_needed item 4. |
| 5 | Every trigger writes a row to `approval_events` with prompt excerpt; visible in audit page | ✓ VERIFIED | `generate-build/route.ts` line 110-119 inserts row with `subjectType: 'build_trigger'`, `comment: prompt.slice(0, 200)`, `metadata: { mode, item_count }`. GET /api/platform/approval-events returns rows; /admin/platform/approval-audit page renders them with truncation + Show more (60→200 chars). Read-write field shapes match end-to-end (subjectType, subjectId, decision, surface, actorEmail, comment, metadata, project, createdAt). 11 route + 10 client Vitest GREEN. Visual UAT is human_needed item 5. |

**Score:** 5/5 truths verified at code level; 4 of 5 carry human-UAT follow-ups for visual / real-session validation.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/triarch-shared/src/schema.ts` | projects.buildTriggerMode + localPath + new approvalEvents table | ✓ VERIFIED | Lines 52-53 (projects cols), 415-429 (approvalEvents pgTable with 9 cols + 2 indexes); shared package bumped 0.5.0 → 0.6.0 |
| `src/db/migrations/0021_build_trigger_and_approval_events.sql` | DDL + CHECK + 2 indexes | ✓ VERIFIED | Contains 2× ALTER projects, CREATE TABLE approval_events, 2× CREATE INDEX, 1× CHECK constraint with all 3 allowed values |
| `src/lib/build-trigger-mode.ts` | BUILD_TRIGGER_MODES + BuildTriggerMode + isValidBuildTriggerMode | ✓ VERIFIED | 19 lines; tuple exports `['local_claude','managed_agent','manual']`; predicate function with type guard |
| `src/lib/build-prompt.ts` | Pure generator + 3 exported types | ✓ VERIFIED | 128 lines; exports buildPrompt + BuildPromptInput + BuildPromptProject + BuildPromptItem; no Date.now/Math.random (deterministic); throws on empty items |
| `src/app/api/admin/projects/[slug]/generate-build/route.ts` | POST endpoint with audit insert | ✓ VERIFIED | 122 lines; requireStaff + await params (Pitfall 9) + project lookup + managed_agent gate + parallel bug/feature load + buildPrompt call + db.insert(approvalEvents) + JSON response |
| `src/app/api/platform/projects/[id]/route.ts` | PUT extended with buildTriggerMode + localPath validation | ✓ VERIFIED | isValidBuildTriggerMode import + 400 on invalid mode + 2 update guards for buildTriggerMode + localPath (null allowed) |
| `src/app/admin/platform/projects/BuildTriggerSection.tsx` | Radio + path input + Save | ✓ VERIFIED | 134 lines; renders 3 radios from BUILD_TRIGGER_MODES tuple with locked label text; PUT on save with empty-string-to-null coercion |
| `src/app/admin/platform/projects/page.tsx` | Embeds BuildTriggerSection in expanded card | ✓ VERIFIED | Import at line 9; `<BuildTriggerSection project={project} onSaved={fetchProjects} />` at line 235 |
| `src/app/admin/modules/next-build-plan/[slug]/page.tsx` | Loads project + approvedCount; passes to client | ✓ VERIFIED | SELECT now includes id + buildTriggerMode + localPath (line 41-50); passes all 5 props to client; awaits params (Pitfall 9 line 36) |
| `src/app/admin/modules/next-build-plan/[slug]/NextBuildPlanClient.tsx` | Generate Build button + modal state | ✓ VERIFIED | Button at line 254-262 with disabled + title attrs; modal mount at line 365-371 |
| `src/app/admin/modules/next-build-plan/[slug]/GenerateBuildModal.tsx` | Modal with Copy + Open + fallback hint | ✓ VERIFIED | 242 lines; role=dialog aria-modal; fetch-on-mount-once; buildDeepLink pure helper; 2-sec fallback timer; Escape/X/backdrop close |
| `src/app/admin/platform/approval-audit/page.tsx` | Staff-gate server wrapper | ✓ VERIFIED | 27 lines; getServerSession → isStaff guard → redirect on non-staff → render ApprovalAuditClient |
| `src/app/admin/platform/approval-audit/ApprovalAuditClient.tsx` | Filter UI + row list + Show more | ✓ VERIFIED | 233 lines; useProjectOptions reused; subject_type default 'build_trigger'; comment truncation at 60 chars with Show more/Show less toggle; URL search-param mirror |
| `src/app/api/platform/approval-events/route.ts` | GET with filters + limit cap + DESC ordering | ✓ VERIFIED | 72 lines; requireStaff; limit default 50 / cap 200; ORDER BY desc(createdAt); subject_type + project filters AND-combined; ISO-string createdAt serialization |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `GenerateBuildModal.tsx` | `POST /api/admin/projects/[slug]/generate-build` | fetch on mount | ✓ WIRED | line 99: `fetch(\`/api/admin/projects/\${slug}/generate-build\`, { method: 'POST' })` + response body destructured into phase state |
| `GenerateBuildModal.tsx` | `navigator.clipboard.writeText` | Copy button onClick | ✓ WIRED | line 124: `await navigator.clipboard.writeText(phase.prompt)` + success/failure toast |
| `GenerateBuildModal.tsx` | `claude-code://` deep-link | window.location.href via buildDeepLink | ✓ WIRED | line 49-56 pure helper produces `claude-code://open?prompt={enc}[&cwd={enc}]`; line 135 assigns window.location.href; cwd omitted when localPath null (test verified) |
| `generate-build/route.ts` | `approvalEvents` INSERT | db.insert | ✓ WIRED | line 110-119: single insert with all 9 columns populated; audit comment = prompt.slice(0,200) — single source matches response prompt |
| `generate-build/route.ts` | `buildPrompt` | ES import + call | ✓ WIRED | line 20 import + line 96 call; comment field uses returned prompt verbatim (no regeneration drift) |
| `generate-build/route.ts` | bugReports + featureRequests WHERE inclusionState='approved_for_build' | drizzle SELECT | ✓ WIRED | line 52-71: parallel Promise.all with `and(eq(project, slug), eq(inclusionState, 'approved_for_build'))` |
| `approval-events/route.ts` | `approvalEvents` SELECT | drizzle ORDER BY desc(createdAt) | ✓ WIRED | line 44-55: omits .where() when no filters; uses `and(...)` when filters present; matches index ordering from migration |
| `ApprovalAuditClient.tsx` | `GET /api/platform/approval-events` | fetch with URLSearchParams | ✓ WIRED | line 70: `fetch(\`/api/platform/approval-events?\${params}\`)` with subject_type + project + limit params |
| `BuildTriggerSection.tsx` | `PUT /api/platform/projects/{id}` | fetch on save | ✓ WIRED | line 48-52: PUT with body `{buildTriggerMode, localPath: path === '' ? null : path}`; success/failure toast |
| `projects/[id]/route.ts` | `isValidBuildTriggerMode` | ES import + boundary validation | ✓ WIRED | line 6 import + line 17-18 validation that returns 400 on invalid value |
| `NextBuildPlanClient.tsx` | `GenerateBuildModal` | import + conditional JSX render | ✓ WIRED | line 25 import + line 365-371 conditional render with onClose callback that resets modalOpen state |
| `next-build-plan/page.tsx` | `projects.buildTriggerMode + localPath` | drizzle SELECT projection | ✓ WIRED | line 41-50 explicitly selects new columns; passes through to client as typed BuildTriggerMode |
| Audit INSERT (37-03) ↔ Audit SELECT (37-06) field shapes | Round-trip consistency | Schema-driven (drizzle) | ✓ WIRED | Both use the same `approvalEvents` Drizzle table; write columns (subjectType, subjectId, decision, surface, actorEmail, comment, metadata, project) match read columns 1:1; createdAt is auto-set on write, ISO-serialized on read |
| `admin sidebar nav → /admin/platform/approval-audit` | Sidebar menu_sections row | DB-driven nav | ⚠️ DEFERRED | Sidebar nav entry was intentionally deferred per 37-06 SUMMARY (admin sidebar is DB-driven via DynamicSidebar; INSERT into menu_sections needed). Page is reachable via direct URL; this does not block goal achievement but is documented as Outstanding. |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| TRIG-01 | 37-02 | New `src/lib/build-prompt.ts` generator producing GSD-compatible prompt | ✓ SATISFIED | Pure function, 18/18 tests, deterministic, all 4 sections rendered, frontmatter parseable |
| TRIG-02 | 37-05 | "Generate build" button enabled only when approved_for_build count ≥ 1; opens modal | ✓ SATISFIED | NextBuildPlanClient.tsx line 152-262; 5 Vitest cases cover enable/disable + open |
| TRIG-03 | 37-05 | Mode A "Copy to clipboard" with toast | ✓ SATISFIED | GenerateBuildModal.tsx handleCopy (line 121-129); navigator.clipboard.writeText + Toast |
| TRIG-04 | 37-05 | Mode B `claude-code://open?prompt=…&cwd=…` deep-link with fallback hint | ✓ SATISFIED | buildDeepLink pure helper (line 49-56); handleOpen + 2-sec fallback timer; URL-encoding test for special chars |
| TRIG-05 | 37-01 + 37-04 | projects.build_trigger_mode column with CHECK; per-project editor; mode-driven UI | ✓ SATISFIED | Migration 0021 CHECK constraint; BuildTriggerSection radio group; modal hides Open button in manual mode; button disabled in managed_agent mode |
| TRIG-06 | 37-03 + 37-06 | Every click writes approval_events row with subject_type='build_trigger', subject_id=project.id, decision='triggered', surface='web', comment=first-200-chars | ✓ SATISFIED | generate-build/route.ts line 110-119 INSERT with exact contract; approval-events GET endpoint + audit page render the rows |

**No orphaned requirements** — REQUIREMENTS.md maps exactly TRIG-01..06 to Phase 37; all 6 are claimed and shipped.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `BuildTriggerSection.tsx` | 26 | helper string `'Disabled placeholder — Managed Agent variant ships in v2.5'` | ℹ️ Info | Intentional — locked CONTEXT.md copy; describes the deliberate UI placeholder for Phase 38 RFC; not a code stub |
| `BuildTriggerSection.tsx` | 114 | `placeholder="/Users/.../projects/this-project"` | ℹ️ Info | HTML input `placeholder` attribute providing UX hint; not a code stub |
| `generate-build/route.ts` | 43 | comment "// ── Block managed_agent placeholder (v2.5 — Phase 38 RFC) ──" | ℹ️ Info | Code comment documenting the intentional v2.5 gate; the route returns 400 with `managed_agent_not_available` — actual behavior, not a stub |
| Sidebar nav for `/admin/platform/approval-audit` | n/a | DB-driven menu_sections row not yet inserted | ⚠️ Warning | Page is reachable via direct URL; deferred per 37-06 SUMMARY pending one-shot seed script post-deploy. Does not block ROADMAP success criterion ("visible in existing Slack audit page — or equivalent"). |

No 🛑 blockers found. No TODO/FIXME/HACK/XXX strings in any Phase 37 source file. No empty implementations (`return null`, `return {}`, `() => {}`) in any shipped artifact. The three "placeholder" matches above are intentional UI copy / HTML attribute / code comment — not code stubs.

### Test Re-Run

`npx vitest run` against all 9 Phase 37 test files: **92/92 PASS** in 3.21s.

- `src/lib/build-prompt.test.ts` — 18/18
- `src/lib/build-trigger-mode.test.ts` — 10/10
- `src/app/api/admin/projects/[slug]/generate-build/route.test.ts` — 10/10
- `src/app/admin/modules/next-build-plan/[slug]/GenerateBuildModal.test.tsx` — 13/13
- `src/app/admin/modules/next-build-plan/[slug]/NextBuildPlanClient.test.tsx` — 13/13 (5 new Phase 37 cases + 8 carried from Phase 36-05a)
- `src/app/admin/platform/projects/BuildTriggerSection.test.tsx` — 7/7
- `src/app/admin/platform/projects/[id]/route.test.ts` — 6/6
- `src/app/admin/platform/approval-audit/ApprovalAuditClient.test.tsx` — 10/10
- `src/app/api/platform/approval-events/route.test.ts` — 11/11

### PR / CI State

- **Branch:** `feat/build-trigger` (worktree at `/Users/mikegeehan/claude/triarch/development/admin-phase37/`)
- **PR #112:** OPEN — "v2.15.0: Phase 37-01 — build_trigger_mode + approval_events schema"
- **CI checks:** All 15 checks SUCCESS or appropriately SKIPPED (check-version, quality-gate Build+Test+Audit, version-consistency, semgrep, osv-scanner, gitleaks, validate-apphosting, version all SUCCESS; deploy/notify/cl4-gate/gate-prod/env-select/verify-dev-deployed/flush-changelog SKIPPED — expected on feature branch)
- **Working tree clean:** no uncommitted Phase 37 changes (only unrelated diag scripts in admin sibling worktree; not in this worktree)
- **Admin version:** 2.15.0 (matches PR title; PKG-04 drift gate GREEN)
- **Shared package:** `@triarchsecurity/triarch-shared@^0.6.0` pinned in package.json; published from 0.5.0

### Pitfall 9 Compliance (Next.js 16 async params)

| File | `await params` Count | Status |
|------|----------------------|--------|
| `src/app/api/admin/projects/[slug]/generate-build/route.ts` | 1 (line 30) | ✓ |
| `src/app/admin/modules/next-build-plan/[slug]/page.tsx` | 1 (line 36) | ✓ |
| `src/app/api/platform/projects/[id]/route.ts` (pre-existing) | 2 | ✓ (no regression) |
| `src/app/admin/platform/approval-audit/page.tsx` | n/a — no async params consumed (uses useSearchParams in client component, recommended pattern) | ✓ |
| `src/app/api/platform/approval-events/route.ts` | n/a — no `[id]` segment | ✓ |

### Schema CHECK Constraint Live

Migration 0021 contains: `ALTER TABLE "projects" ADD CONSTRAINT "projects_build_trigger_mode_check" CHECK (build_trigger_mode IN ('local_claude', 'managed_agent', 'manual'));`

Per phase context: live in prod CRDB (triarchdev-24092 / triarch_dev) — `projects_build_trigger_mode_check` constraint present + approval_events table present + 2 indexes present. Phase context states schema was applied via db:push in 37-01 Task 4.

### Human Verification Required

5 items deferred to interactive UAT (see frontmatter `human_verification` block):

1. **TMI pilot — buildPrompt → /gsd:plan-phase round-trip**
   Run a real Claude Code session with the generated prompt as input; confirm `/gsd:plan-phase NEXT` produces a usable plan for an approved TMI item.

2. **Generate Build modal — full flow (local_claude mode)**
   Click Generate Build on a TMI project with ≥1 approved item, confirm modal opens, Copy puts text on clipboard (paste-verify in editor), Open launches Claude Code (or amber fallback hint appears within 2s if scheme not registered).

3. **Generate Build modal — manual mode**
   Toggle TMI to mode='manual' via BuildTriggerSection, re-open modal, confirm Copy-only (Open hidden).

4. **BuildTriggerSection layout (visual)**
   /admin/platform/projects → expand TMI card → confirm 3 radios with locked labels render; type a localPath; click Save; reload; confirm value persists.

5. **Approval Audit page row rendering (visual)**
   /admin/platform/approval-audit → confirm rows render after Generate Build trigger; truncated comment + Show more toggle works; URL deep-link with filters round-trips.

### Outstanding (non-blocking)

- **PR #112 awaiting review + merge to dev.** All CI green; ready for human approval.
- **Sidebar nav entry** for `/admin/platform/approval-audit` deferred per 37-06 SUMMARY (DB-driven menu_sections — needs one-shot INSERT post-deploy). Page reachable via direct URL meanwhile.
- **Phase 38 placeholder copy** (`'Managed Agent variant ships in v2.5'`) anchored in NextBuildPlanClient.tsx + BuildTriggerSection.tsx — intentional; will be removed when Phase 38 RFC implementation ships in v2.5.

### Gaps Summary

No code-level gaps. All 5 ROADMAP success criteria pass against shipped code at the artifact + wiring + test layer. All 6 TRIG-01..06 requirements have shipping code + test coverage + traceable evidence. The CHECK constraint is in migration 0021 + live in prod per phase context. The approval_events INSERT (37-03) and SELECT (37-06) field shapes are consistent (same Drizzle table schema, 1:1 column mapping). The deep-link URL format matches the spec `claude-code://open?prompt={enc}[&cwd={enc}]` with cwd omitted when localPath null. The managed_agent mode shows the v2.5 tooltip and disables the button at the parent (modal never reached). Pitfall 9 (Next.js 16 async params) is anchored in all new dynamic routes. The `comment` field is correctly capped at 200 chars per TRIG-06.

**Status is `human_needed` because 5 ROADMAP and Plan-declared UAT items require interactive browser / Claude Code session validation that cannot be performed programmatically.** All automated checks (92/92 tests, all greps, all wiring, CI all-green on PR #112) pass.

---

_Verified: 2026-05-18T15:35:00Z_
_Verifier: Claude (gsd-verifier)_
