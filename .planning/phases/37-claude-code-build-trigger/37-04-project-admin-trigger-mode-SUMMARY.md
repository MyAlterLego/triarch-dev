---
phase: 37-claude-code-build-trigger
plan: 04
subsystem: admin/platform/projects
tags: [trig-05, build-trigger, client-component, api-validation, vitest]
requirements: [TRIG-05]
dependency_graph:
  requires:
    - "src/lib/build-trigger-mode.ts (37-01: BUILD_TRIGGER_MODES tuple + isValidBuildTriggerMode predicate)"
    - "projects.buildTriggerMode + projects.localPath columns (37-01 migration 0021 + shared schema 0.6.0)"
    - "src/components/Toast.tsx (existing toast component, role=status)"
  provides:
    - "PUT /api/platform/projects/[id] now accepts + validates {buildTriggerMode, localPath}"
    - "BuildTriggerSection client component (radio + path input + Save) for per-project trigger config"
    - "/admin/platform/projects expanded card now embeds Build Trigger section"
  affects:
    - "37-05 (Generate Build modal) — reads project.buildTriggerMode + project.localPath to drive Copy/Open buttons"
tech-stack:
  added: []
  patterns:
    - "Boundary validation: shared validator imported into API route (defense in depth alongside DB CHECK)"
    - "Client component dirty-state tracking: `dirty = mode !== initialMode || path !== initialPath` enables Save"
    - "Empty-string-to-null coercion in client: path === '' → localPath: null on PUT body"
key-files:
  created:
    - "src/app/api/platform/projects/[id]/route.test.ts (6 Vitest cases — new file, no prior coverage)"
    - "src/app/admin/platform/projects/BuildTriggerSection.tsx"
    - "src/app/admin/platform/projects/BuildTriggerSection.test.tsx (7 RTL cases)"
  modified:
    - "src/app/api/platform/projects/[id]/route.ts (added isValidBuildTriggerMode import + validation + 2 destructure fields + 2 update guards)"
    - "src/app/admin/platform/projects/page.tsx (import + Project interface extension + JSX embed)"
decisions:
  - "Empty Local Path string serialized as explicit null (allows clear via UI without separate 'Clear' button)"
  - "Toast reused as-is (no animation queue — rapid setToast calls replace state cleanly; user never loses the latest message)"
  - "Radio group driven by BUILD_TRIGGER_MODES tuple (single source of truth — adding a 4th mode in 37-01 surfaces automatically)"
metrics:
  duration: "4m"
  completed: "2026-05-18T20:13:25Z"
  tasks: 3
  files_created: 3
  files_modified: 2
  vitest_cases_added: 13
---

# Phase 37 Plan 04: Per-Project Build Trigger Mode Editor Summary

**One-liner:** PUT /api/platform/projects/[id] extended with isValidBuildTriggerMode boundary validation + nullable localPath, paired with a new BuildTriggerSection client component (3-radio + path + Save) embedded inside every /admin/platform/projects expanded card.

## What was built

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| 1 | Extend PUT route + 6 Vitest cases (RED→GREEN single commit) | `297fd0e`* | src/app/api/platform/projects/[id]/route.ts, route.test.ts |
| 2 | BuildTriggerSection client component + 7 RTL cases (RED then GREEN) | `d3a8797` | src/app/admin/platform/projects/BuildTriggerSection.{tsx,test.tsx} |
| 3 | Embed BuildTriggerSection in projects/page.tsx expanded card | `8ccc0f4` | src/app/admin/platform/projects/page.tsx |

*Task 1 note: A parallel-wave 37-02 commit (`297fd0e`) absorbed the staged Task 1 files (route.ts + route.test.ts) into its commit alongside build-prompt.ts. Content is identical to what was authored for Task 1; the commit message under-describes the actual scope. The 13-line `git show 297fd0e -- src/app/api/platform/projects/[id]/route.ts` diff shows the exact Task 1 additions (isValidBuildTriggerMode import + validation + 2 destructure fields + 2 update guards).

## Test coverage detail

**Pre-existing test files in src/app/api/platform/projects/[id]/:** none. route.test.ts is a new file with **6 cases** (target was ≥4 new — exceeded by 2):
- `accepts buildTriggerMode='manual' and persists it`
- `accepts buildTriggerMode='local_claude' and persists it`
- `returns 400 when buildTriggerMode is not in the 3-value allowlist`
- `accepts localPath as a string and persists it`
- `accepts localPath as null (explicit clear) and persists it`
- `existing field (name) update is unaffected by Phase 37 additions`

**BuildTriggerSection test count: 7** (target was ≥6 — exceeded by 1):
- `renders 3 radios with locked label text and selects the current mode`
- `renders local_path input prefilled with project.localPath`
- `Save button is disabled when no changes`
- `changing radio enables Save and PUTs correct body on click`
- `typing in local_path enables Save and PUTs path string`
- `400 response surfaces error message in a status region`
- `locked managed_agent helper text contains "ships in v2.5"`

**Total new Vitest cases: 13** (target was ≥10 — exceeded by 3).

## Verification

| Anchor | Required | Actual | Status |
|---|---|---|---|
| `grep -c "isValidBuildTriggerMode" route.ts` | 1 | 2 | PASS (import + call) |
| `grep -c "buildTriggerMode" route.ts` | ≥3 | 4 | PASS |
| `grep -c "localPath" route.ts` | ≥2 | 2 | PASS |
| `grep -c "invalid_build_trigger_mode" route.ts` | 1 | 1 | PASS |
| `grep -c "await params" route.ts` (Pitfall 9 anchor — does NOT regress) | ≥1 | 2 | PASS |
| `grep -c "BUILD_TRIGGER_MODES" BuildTriggerSection.tsx` | ≥1 | 2 | PASS (import + map) |
| `grep -c "Local Claude Code (default)" BuildTriggerSection.tsx` | 1 | 1 | PASS (locked label) |
| `grep -c "Managed Agent (v2.5)" BuildTriggerSection.tsx` | 1 | 1 | PASS (locked label) |
| `grep -c "Manual (copy only)" BuildTriggerSection.tsx` | 1 | 1 | PASS (locked label) |
| `grep -c "Managed Agent variant ships in v2.5" BuildTriggerSection.tsx` | ≥1 | 1 | PASS (v2.5 roadmap helper) |
| `grep -c "import BuildTriggerSection" page.tsx` | 1 | 1 | PASS |
| `grep -c "<BuildTriggerSection project={project} onSaved={fetchProjects}" page.tsx` | 1 | 1 | PASS |
| `grep -c "buildTriggerMode?:" page.tsx` | 1 | 1 | PASS |
| `grep -c "localPath?:" page.tsx` | 1 | 1 | PASS |
| `npx next build` | exit 0 | exit 0 | PASS |
| `npx vitest run src/app/api/platform/projects/[id]/route.test.ts` | 0 failures | 6/6 GREEN | PASS |
| `npx vitest run src/app/admin/platform/projects/` | 0 failures | 7/7 GREEN | PASS |

## I-4 (rapid-toast sanity)

Per Task 2 step 5: opened `src/components/Toast.tsx` — confirmed setToast→setToast simply replaces the state object (no animation queue, no message loss). User clicking Save twice in succession (e.g., first attempt 400 → fix → Save again) will see only the most recent toast, which is the correct UX.

## Screenshot / UAT note

Visual smoke check (TMI card expanded with new Build Trigger section above Infrastructure grid) is deferred to Phase 37 close UAT — Mike will lock TMI to `local_claude` + set `local_path=/Users/mikegeehan/claude/triarch/development/tmi` via this UI as part of the cross-plan E2E.

## Manual integration check

Confirmation that TMI's row CAN be PUT to `{buildTriggerMode: 'local_claude', localPath: '/Users/mikegeehan/claude/triarch/development/tmi'}` through this surface: validated at the unit level (route test "accepts buildTriggerMode='local_claude' and persists it" + "accepts localPath as a string and persists it"). End-to-end with real DB is the Phase 37 close UAT.

## Deviations from Plan

None — plan executed exactly as written. The Task 1 commit-message attribution to 37-02 is a parallel-wave race condition (other executor absorbed staged files), NOT a content deviation. All Task 1 file content matches the plan spec verbatim.

## Known Stubs

None. The `managed_agent` radio option is a UI placeholder by design (TRIG-05 requires it visible to surface the v2.5 roadmap — the Generate Build modal in 37-05 is what disables-with-tooltip the corresponding button). The helper text "Managed Agent variant ships in v2.5" makes the intent explicit at the radio level too.

## Self-Check: PASSED

Files exist:
- FOUND: src/app/api/platform/projects/[id]/route.test.ts
- FOUND: src/app/admin/platform/projects/BuildTriggerSection.tsx
- FOUND: src/app/admin/platform/projects/BuildTriggerSection.test.tsx
- FOUND: src/app/api/platform/projects/[id]/route.ts (modified — isValidBuildTriggerMode import + validation present)
- FOUND: src/app/admin/platform/projects/page.tsx (modified — BuildTriggerSection import + JSX render present)

Commits exist:
- FOUND: 297fd0e (Task 1 content — committed under 37-02 message due to parallel-wave race; diff verified to include all Task 1 additions)
- FOUND: d3a8797 (Task 2)
- FOUND: 8ccc0f4 (Task 3)
