---
phase: 37-claude-code-build-trigger
plan: 02
subsystem: prompt-generation
tags: [tdd, pure-function, vitest, yaml-frontmatter, build-trigger, contract]

requires:
  - phase: 37
    plan: 01
    provides: "@triarchsecurity/triarch-shared@0.6.0 baseline (schema additions); contract reference only — buildPrompt is decoupled from schema, takes plain typed input"

provides:
  - "src/lib/build-prompt.ts pure-function generator: buildPrompt({project, items}) → string"
  - "Exported types: BuildPromptInput, BuildPromptProject, BuildPromptItem — contract consumed by 37-03 (generate-build API) and 37-05 (modal preview)"
  - "Locked output shape: YAML frontmatter (project/version/items) + 4 sections (Context, Approved Items, Approach, Guardrails) per CONTEXT.md decisions"
  - "Empty-items guard: throws Error('build-prompt: no approved items') — caller must disable button when 0 items"
  - "buildPlan.acceptance_criteria fallback chain: valid string[] → use as bullets; else (null/wrong-shape/empty) → single bullet from description"

affects:
  - 37-03 (generate-build POST endpoint imports buildPrompt + types; calls it server-side after loading approved items)
  - 37-05 (Generate Build modal imports buildPrompt to render client-side preview — pure function = no SSR concern)

tech-stack:
  added: []  # no new deps; yaml@^2.8.4 already a direct dep used elsewhere in admin
  patterns:
    - "Pure-function TDD module (mirrors src/lib/inclusion-state.ts and src/lib/build-trigger-mode.ts golden pattern: describe/it/expect, no mocks)"
    - "YAML frontmatter via yaml.stringify — handles escaping of titles/descriptions containing colons/quotes/dashes without leaking into frontmatter (covered by Test 18)"
    - "Defensive type-narrowing for unknown jsonb (buildPlan): runtime shape check before reading acceptance_criteria, falls back gracefully"

key-files:
  created:
    - src/lib/build-prompt.ts
    - src/lib/build-prompt.test.ts
  modified: []

key-decisions:
  - "Used yaml.stringify (already a direct dep of admin) for frontmatter generation instead of hand-rolling — guarantees correct escaping of titles/descriptions with YAML-special chars (covered by Test 18; no body content can corrupt frontmatter)."
  - "Approach section is intentionally a single sentence (Run /gsd:plan-phase NEXT then /gsd:execute-phase NEXT) — matches CONTEXT.md decision that Approach + Guardrails are fixed boilerplate, never customized per-build."
  - "Per-item heading uses ### TYPE: Title (uppercase TYPE) so Claude Code's planner can grep section headers; description is rendered full (not truncated) per CONTEXT.md 'description (full)' decision."
  - "Acceptance-criteria fallback returns [item.description] (single bullet) — keeps the section structurally identical for all items so downstream /gsd:plan-phase can rely on a stable bullet list, never an empty section."
  - "buildPrompt does NOT inline ./CLAUDE.md content — emits literal string 'Read project conventions: @./CLAUDE.md' instead (Test 7 verifies anti-pattern: output must NOT contain text from CLAUDE.md). Reduces prompt size + lets Claude Code read fresh file from cwd in the new session."

patterns-established:
  - "TDD pure-function generator template: write Vitest suite first (RED), commit as test(NN-MM): … (RED) — implement minimally (GREEN), commit as feat(NN-MM): … (GREEN). Two commits per task — atomic and bisectable."
  - "Sample output captured via a throwaway *.sample.test.ts that console.logs the generated text, then deleted before SUMMARY commit (avoids polluting the test suite with output-snapshot tests that can't fail)."

requirements-completed: [TRIG-01]

duration: ~3min
completed: 2026-05-18
---

# Phase 37-02: Build Prompt Generator Summary

**Pure-function `buildPrompt({project, items}) → string` shipped via RED→GREEN TDD: 18/18 Vitest cases cover shape, frontmatter parsing, all 4 sections, per-item rendering with buildPlan vs fallback, YAML-escape edge cases, and determinism. Establishes the locked output contract for 37-03 (generate-build API) and 37-05 (modal preview).**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-05-18T20:08:39Z
- **Completed:** 2026-05-18T20:11:57Z
- **Tasks:** 1/1
- **Tests:** 18/18 GREEN (exceeds plan target of ≥12)
- **Files created/modified:** 2 (both new)

## Accomplishments

- **`src/lib/build-prompt.ts`** — pure-function generator (128 lines). Exports `buildPrompt`, `BuildPromptInput`, `BuildPromptProject`, `BuildPromptItem`. Deterministic (no `Date.now()`/`Math.random()`/`new Date()`; verified by grep + Test 17).
- **`src/lib/build-prompt.test.ts`** — 18 Vitest cases organized into 4 describe blocks:
  - **shape** (4): frontmatter delimiter, YAML parse, version fallback, items[] preserves input order
  - **sections** (4): 4 headers in order, Context anti-inline guard, Approach contains /gsd:plan-phase, all 4 Guardrails bullets present
  - **per-item rendering** (6): bug w/ severity, feature w/ buildPlan acceptance_criteria, feature without buildPlan (description fallback), feature w/ wrong buildPlan shape (defensive fallback), severity omitted when absent, multiple-items ordering
  - **edge cases + determinism** (4): empty items throws, byte-identical determinism, null githubRepo/deployedUrl gracefully omitted, YAML-special chars in titles/descriptions don't corrupt frontmatter
- **TDD RED→GREEN cycle observed:** RED commit `cc58f74` (test file alone, module-not-found at import) → GREEN commit `297fd0e` (implementation + 18/18 passing).
- **All acceptance greps PASS:**
  - `^export function buildPrompt` → 1
  - `export interface BuildPromptInput` → 1
  - `throw new Error('build-prompt: no approved items')` → 1
  - `@./CLAUDE.md` → 1
  - `Date.now|Math.random|new Date` → 0 (deterministic confirmed)
  - `tsc --noEmit` errors on build-prompt.ts → 0 (clean)

## Sample Output (for downstream eyeball verification)

Input: TMI project (`4.46.1`) + 1 bug (Login broken / severity high / no buildPlan) + 1 feature (Dark mode / buildPlan.acceptance_criteria = ['Toggle visible in settings', 'Persists across reloads']):

```markdown
---
project: tmi
version: 4.46.1
items:
  - id: bug-uuid-1
    type: bug
  - id: feat-uuid-1
    type: feature
---

## Context

Project: **TMI Engine** (`tmi`)
Current version: `4.46.1`
Repo: `triarchsecurity/tmi`
Deployed: https://tmi.triarch.dev

Read project conventions: @./CLAUDE.md

## Approved Items

### BUG: Login broken

- **id:** `bug-uuid-1`
- **type:** bug
- **severity:** high

**Description:**

Users cannot log in after Phase 32 deploy

**Acceptance criteria:**

- Users cannot log in after Phase 32 deploy

### FEATURE: Dark mode

- **id:** `feat-uuid-1`
- **type:** feature

**Description:**

Add dark mode toggle to settings

**Acceptance criteria:**

- Toggle visible in settings
- Persists across reloads

## Approach

Run `/gsd:plan-phase NEXT` then `/gsd:execute-phase NEXT` once the plan is approved.

## Guardrails

- Do NOT exceed scope of the listed items
- Use existing patterns (read CLAUDE.md + existing files first)
- Bump version + open PR per CLAUDE.md workflow
- One change at a time when debugging — isolate, verify, proceed
```

## Task Commits

1. **Task 1 RED — failing test suite (18 cases):** `cc58f74` (test)
2. **Task 1 GREEN — buildPrompt implementation:** `297fd0e` (feat)

## Files Created/Modified

- `src/lib/build-prompt.ts` — pure-function generator (NEW)
- `src/lib/build-prompt.test.ts` — 18-test Vitest suite (NEW)

## Deviations & Recoveries

**1. [Rule 0 — Index hygiene, not auto-fix] Pre-existing staged changes from a parallel session bundled into GREEN commit `297fd0e`**
- **Found during:** Task 1 GREEN commit step
- **Symptom:** `git commit` after `git add src/lib/build-prompt.ts` produced a 3-file commit instead of 1-file — included `src/app/api/platform/projects/[id]/route.ts` (+8/-2) and `src/app/api/platform/projects/[id]/route.test.ts` (+102) from a parallel 37-04 session that had pre-staged those changes in the worktree index before this executor started.
- **Root cause:** `git commit` commits the entire index, not just files passed to the immediately-preceding `git add`. Per phase context, multiple sessions are operating on this worktree in parallel (--no-verify is the documented mitigation, but doesn't prevent index-state crossover).
- **Decision:** Left as-is rather than rewriting history. The bundled changes (a) belong to 37-04, (b) are correct functional code (validates `buildTriggerMode` at PUT endpoint boundary via `isValidBuildTriggerMode` from 37-01), (c) compile + their test file is GREEN (verified: 6/6 tests in `route.test.ts` pass), (d) reverting would clobber another session's work. The 37-04 SUMMARY (when it lands) should reference commit `297fd0e` as the source for that endpoint hook.
- **Files inadvertently committed:** `src/app/api/platform/projects/[id]/route.ts`, `src/app/api/platform/projects/[id]/route.test.ts`
- **Commit:** `297fd0e`
- **Mitigation for future executors:** When parallel sessions touch the same worktree, run `git status --short` after each `git add` to verify only intended files are staged before commit. (Not invoking this as a `Rule 1-3` auto-fix because it's neither a bug, missing critical functionality, nor blocking — it's an index-hygiene observation worth documenting for the verifier and the 37-04 author.)

**2. [Out-of-scope — left alone per SCOPE BOUNDARY] Untracked artifacts from other parallel sessions**
- `src/app/admin/platform/projects/BuildTriggerSection.test.tsx` (37-04 work in progress)
- `src/app/api/admin/projects/[slug]/generate-build/route.ts` (37-03 work in progress)
- Not modified, not committed by this executor.

## Authentication Gates / Pending Human Actions

None. Plan 37-02 is fully autonomous (no checkpoints).

## What this enables

- **37-03 (generate-build API)** can `import { buildPrompt, type BuildPromptInput, type BuildPromptProject, type BuildPromptItem } from '@/lib/build-prompt'` and call it server-side after loading approved bug/feature rows + project context from CRDB. The empty-items throw doubles as a server-side guard (button is disabled client-side, but a malformed POST is still rejected with a clear error message).
- **37-05 (Generate Build modal)** can `import { buildPrompt } from '@/lib/build-prompt'` and render the preview client-side — `buildPrompt` is pure, no SSR concern, modal can re-render preview live as items toggle.
- **TMI pilot UAT** (Phase 37 close) can run a full flow: click Generate Build → modal shows real prompt preview → Copy or Open in Claude Code → new session uses the prompt to drive `/gsd:plan-phase NEXT`.

## Outstanding from this plan

None — Task 1 was the only task; both RED and GREEN are committed; SUMMARY committed alongside the metadata in the next step.

## Self-Check: PASSED

Verified all claims (via `[ -f ... ]` + `git log` greps + acceptance greps + vitest re-run):

- `src/lib/build-prompt.ts` — FOUND (128 lines; all 4 exports present)
- `src/lib/build-prompt.test.ts` — FOUND (18 tests; 18/18 GREEN at re-run)
- `.planning/phases/37-claude-code-build-trigger/37-02-build-prompt-generator-SUMMARY.md` — FOUND
- Commit `cc58f74` (RED) — FOUND in `git log --all --oneline`
- Commit `297fd0e` (GREEN) — FOUND in `git log --all --oneline` (build-prompt.ts + 2 bundled 37-04 files per Deviation 1; 18/18 + 6/6 tests pass)
- All 5 acceptance greps PASS (`^export function buildPrompt` = 1, `export interface BuildPromptInput` = 1, empty-items throw = 1, `@./CLAUDE.md` = 1, `Date.now|Math.random|new Date` = 0)
- `npx tsc --noEmit -p tsconfig.json` reports 0 errors on `src/lib/build-prompt.ts`
- Sample output above generated from running `buildPrompt` against the documented input — byte-for-byte from Vitest stdout capture, not hand-typed
