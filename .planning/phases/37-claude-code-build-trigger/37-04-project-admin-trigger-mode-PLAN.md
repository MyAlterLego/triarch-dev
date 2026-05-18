---
phase: 37-claude-code-build-trigger
plan: 04
type: execute
wave: 2
depends_on: [37-01]
files_modified:
  - src/app/api/platform/projects/[id]/route.ts
  - src/app/api/platform/projects/[id]/route.test.ts
  - src/app/admin/platform/projects/page.tsx
  - src/app/admin/platform/projects/BuildTriggerSection.tsx
  - src/app/admin/platform/projects/BuildTriggerSection.test.tsx
autonomous: true
requirements: [TRIG-05]
must_haves:
  truths:
    - "PUT /api/platform/projects/[id] accepts {buildTriggerMode, localPath} in body and persists them when valid"
    - "PUT endpoint validates buildTriggerMode via isValidBuildTriggerMode — returns 400 when value is not in BUILD_TRIGGER_MODES"
    - "PUT endpoint accepts localPath = null (explicit clear) and localPath = string (set)"
    - "/admin/platform/projects page renders a new 'Build Trigger' section inside each expanded project card showing current mode + localPath with edit form"
    - "Edit form renders a 3-option radio group ('Local Claude Code (default)', 'Managed Agent (v2.5 — placeholder)', 'Manual (copy only)') and a text input for local_path"
    - "Saving calls PUT /api/platform/projects/{project.id} with {buildTriggerMode, localPath}; refreshes the project list on success"
    - "Vitest coverage (BuildTriggerSection): >= 6 cases — renders current mode, radio group changes selection, localPath input persists keystrokes, Save triggers fetch with correct body, Save success refreshes, Save 400 surfaces error toast/banner"
    - "Vitest coverage (route): >= 4 added cases — buildTriggerMode valid value persists, buildTriggerMode invalid value returns 400, localPath null clears, localPath string sets"
  artifacts:
    - path: "src/app/api/platform/projects/[id]/route.ts"
      provides: "PUT endpoint EXTENDED to accept buildTriggerMode + localPath (existing fields preserved)"
      contains: "buildTriggerMode"
    - path: "src/app/admin/platform/projects/BuildTriggerSection.tsx"
      provides: "Client component: radio + text input + Save button; embedded in /admin/platform/projects expanded card"
      exports: ["default"]
    - path: "src/app/admin/platform/projects/page.tsx"
      provides: "Existing list page EXTENDED — embeds BuildTriggerSection inside the expanded panel of each project card"
      contains: "BuildTriggerSection"
  key_links:
    - from: "src/app/admin/platform/projects/BuildTriggerSection.tsx"
      to: "PUT /api/platform/projects/{project.id}"
      via: "fetch with body {buildTriggerMode, localPath}"
      pattern: "buildTriggerMode"
    - from: "src/app/api/platform/projects/[id]/route.ts"
      to: "isValidBuildTriggerMode validator"
      via: "ES module import from @/lib/build-trigger-mode"
      pattern: "isValidBuildTriggerMode"
    - from: "src/app/admin/platform/projects/page.tsx"
      to: "BuildTriggerSection component"
      via: "JSX render inside expanded panel"
      pattern: "<BuildTriggerSection"
---

<objective>
Ship the TRIG-05 per-project preference editor. Two surfaces: (a) extend the existing PUT `/api/platform/projects/[id]` endpoint to accept and validate the new `buildTriggerMode` + `localPath` columns from Phase 37-01; (b) extend the existing `/admin/platform/projects` list page with a new `BuildTriggerSection` client component embedded inside each expanded project card, exposing the radio group + text input. Saving PUTs to the API and re-fetches the project list. Validation is double-layered: shared `isValidBuildTriggerMode` validator (server-side authoritative) + radio UI (client-side limited to 3 options).

Purpose: Make the trigger mode + local path editable per project so staff (Mike) can lock TMI to `local_claude` + set its `local_path` to `/Users/mikegeehan/claude/triarch/development/tmi` for the deep-link `cwd`. The Generate Build modal (37-05) reads project.buildTriggerMode to decide which buttons to show.
Output: Extended PUT endpoint + new BuildTriggerSection client component + extended project list page + 10+ new Vitest cases across both test files.
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/execute-plan.md
@~/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/37-claude-code-build-trigger/37-CONTEXT.md
@.planning/phases/37-claude-code-build-trigger/37-01-shared-schema-additions-PLAN.md

# Source-of-truth references
@src/app/api/platform/projects/[id]/route.ts
@src/app/admin/platform/projects/page.tsx
@src/lib/build-trigger-mode.ts
@src/components/Toast.tsx

<interfaces>
<!-- Key types and contracts executors will use. Extracted from codebase + 37-01 outputs. -->

From src/app/api/platform/projects/[id]/route.ts (existing PUT — being extended):
```typescript
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireStaff();
  if (error) return error;
  const { id } = await params;
  const body = await req.json();
  const { name, description, status, firebaseProjectId, crdbCluster, crdbDatabase, crdbUser,
          subdomain, customDomain, deployedUrl, githubRepo, techStack, currentVersion, ecosystem } = body;
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  // ... if (field !== undefined) updates.field = field; ...
  const [updated] = await db.update(projects).set(updates).where(eq(projects.id, id)).returning();
  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(updated);
}
```
The pattern: each editable field gets a conditional `if (field !== undefined) updates.field = field;` line.
We add TWO: `buildTriggerMode` (with isValidBuildTriggerMode validation) and `localPath` (any string or null).

From src/lib/build-trigger-mode.ts (37-01 output):
```typescript
export const BUILD_TRIGGER_MODES: readonly ['local_claude', 'managed_agent', 'manual'];
export type BuildTriggerMode = 'local_claude' | 'managed_agent' | 'manual';
export function isValidBuildTriggerMode(value: unknown): value is BuildTriggerMode;
```

From src/app/admin/platform/projects/page.tsx (the existing list page — being extended):
```typescript
interface Project {
  id: string;
  key: string;
  name: string;
  // ... existing fields plus, after 37-01 ships, also:
  buildTriggerMode?: string;  // 'local_claude' | 'managed_agent' | 'manual'
  localPath?: string | null;
}
// The expanded panel renders inside <div className="border-t border-zinc-800 p-4 space-y-3">
// just before the "Provisioning actions" block. We add <BuildTriggerSection project={project} onSaved={fetchProjects} />.
```

From src/components/Toast.tsx (existing toast component — reuse, do NOT introduce new dep):
```typescript
export default function Toast({ kind, message, onDismiss }: { kind: 'success' | 'error', message: string, onDismiss: () => void }): JSX.Element;
```

Radio group label text (locked per CONTEXT.md — staff sees the v2.5 roadmap):
- 'local_claude' → "Local Claude Code (default)" — helper: "Generate Build shows Copy + Open in Claude Code"
- 'managed_agent' → "Managed Agent (v2.5)" — helper: "Disabled placeholder — Managed Agent variant ships in v2.5"
- 'manual' → "Manual (copy only)" — helper: "Generate Build shows Copy only — paste anywhere"
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Extend PUT /api/platform/projects/[id] route to accept + validate buildTriggerMode + localPath, with Vitest coverage</name>
  <files>src/app/api/platform/projects/[id]/route.ts, src/app/api/platform/projects/[id]/route.test.ts</files>
  <read_first>
    - src/app/api/platform/projects/[id]/route.ts (existing PUT — 4 lines need to be added in the destructure + 2 if-blocks; do not refactor)
    - src/lib/build-trigger-mode.ts (isValidBuildTriggerMode predicate — server-side authoritative validation)
    - src/app/api/platform/bug-reports/[id]/route.test.ts (Vitest pattern for route tests with mocked db + auth — clone this shape for the test file if it does not exist yet)
    - .planning/phases/37-claude-code-build-trigger/37-CONTEXT.md (TRIG-05: 3-value mode CHECK + nullable local_path)
  </read_first>
  <behavior>
    - PUT with {buildTriggerMode: 'manual'} → 200; row updated; returned row has buildTriggerMode='manual'
    - PUT with {buildTriggerMode: 'evil_mode'} → 400 {error: 'invalid_build_trigger_mode'}; row NOT updated
    - PUT with {localPath: '/Users/mike/projects/tmi'} → 200; row updated with that path
    - PUT with {localPath: null} → 200; row updated with localPath=null (explicit clear)
    - PUT with {name: 'New Name'} (existing field unaffected) → 200; row updated; build_trigger_mode + local_path unchanged
    - PUT with no recognized fields → 200; only updatedAt changes (existing behaviour preserved)
  </behavior>
  <action>
    1. Edit `src/app/api/platform/projects/[id]/route.ts` PUT handler:

    a. ADD import at top of file (after the existing `import { eq } from 'drizzle-orm';` line):
    ```typescript
    import { isValidBuildTriggerMode } from '@/lib/build-trigger-mode';
    ```

    b. In the body destructure (currently `const { name, description, status, ... ecosystem } = body;`), ADD `buildTriggerMode, localPath` to the destructure list (after `ecosystem`):
    ```typescript
    const { name, description, status, firebaseProjectId, crdbCluster, crdbDatabase, crdbUser, subdomain, customDomain, deployedUrl, githubRepo, techStack, currentVersion, ecosystem, buildTriggerMode, localPath } = body;
    ```

    c. IMMEDIATELY AFTER the body destructure and BEFORE the `const updates = ...` initializer, insert the buildTriggerMode validation block:
    ```typescript
    // Phase 37 TRIG-05: validate buildTriggerMode at the boundary (DB has CHECK too; defense in depth).
    if (buildTriggerMode !== undefined && !isValidBuildTriggerMode(buildTriggerMode)) {
      return NextResponse.json({ error: 'invalid_build_trigger_mode' }, { status: 400 });
    }
    ```

    d. In the conditional-update block (currently a series of `if (field !== undefined) updates.field = field;` lines), ADD two new lines AFTER `if (ecosystem !== undefined) updates.ecosystem = ecosystem;`:
    ```typescript
    if (buildTriggerMode !== undefined) updates.buildTriggerMode = buildTriggerMode;
    if (localPath !== undefined) updates.localPath = localPath;  // allows explicit null to clear
    ```

    e. DO NOT touch the DELETE handler.

    f. **Pitfall 9 defensive verification BEFORE editing:** Before making any change, run `grep -c "await params" src/app/api/platform/projects/[id]/route.ts`. Expected: >= 1 (existing route already migrated to Next.js 16 async params per the 2026-05 audit). If the count is 0, STOP and migrate the existing handler signature to `{ params: Promise<{ id: string }> }` + `const { id } = await params;` FIRST as a defensive step (no behaviour change), commit that as a separate prep commit, then proceed with the field-validation additions in steps a-e above.

    2. Create or extend `src/app/api/platform/projects/[id]/route.test.ts` (if the test file does not yet exist, create it; if it does, ADD the 4 new test cases to the existing describe block). Use the Vitest mock pattern in `src/app/api/platform/bug-reports/[id]/route.test.ts` as the model. Add tests for the 4 new behaviours:
    ```typescript
    describe('PUT — buildTriggerMode + localPath (Phase 37 TRIG-05)', () => {
      it("accepts buildTriggerMode='manual' and persists it", async () => { /* ... */ });
      it("returns 400 when buildTriggerMode is not in the 3-value allowlist", async () => { /* ... */ });
      it('accepts localPath as a string and persists it', async () => { /* ... */ });
      it('accepts localPath as null (explicit clear) and persists it', async () => { /* ... */ });
    });
    ```
    Use the existing tests in the file (if any) as the model for mock setup. If the test file does not exist, follow the bug-reports/[id]/route.test.ts shape exactly (vi.mock for @/lib/api-auth, @/lib/db; import { PUT } from './route' AFTER mocks declared; beforeEach resets).

    3. Run `npx vitest run src/app/api/platform/projects/[id]/route.test.ts` until all new cases pass (and any existing ones still pass).
  </action>
  <verify>
    <automated>npx vitest run src/app/api/platform/projects/[id]/route.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "isValidBuildTriggerMode" src/app/api/platform/projects/[id]/route.ts` returns 1 (validator imported + called)
    - `grep -c "buildTriggerMode" src/app/api/platform/projects/[id]/route.ts` returns >= 3 (destructure + validation + update set)
    - `grep -c "localPath" src/app/api/platform/projects/[id]/route.ts` returns >= 2 (destructure + update set)
    - `grep -c "invalid_build_trigger_mode" src/app/api/platform/projects/[id]/route.ts` returns 1
    - `npx vitest run src/app/api/platform/projects/[id]/route.test.ts` reports 0 failures with >= 4 new cases passing
    - No existing test in the file regresses (count delta is +4 minimum)
    - **Pitfall 9 anchor (does NOT regress):** `grep -c "await params" src/app/api/platform/projects/[id]/route.ts` returns >= 1 (existing PUT route already uses async params per Next.js 16; this plan must not regress that)
    - `npx next build` exits 0
  </acceptance_criteria>
  <done>PUT endpoint validates + persists both new columns; 4 new Vitest cases green; UI plan 37-04 Task 2 can call this endpoint.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Build BuildTriggerSection client component with radio + text input + Save action + Vitest coverage</name>
  <files>src/app/admin/platform/projects/BuildTriggerSection.tsx, src/app/admin/platform/projects/BuildTriggerSection.test.tsx</files>
  <read_first>
    - src/app/admin/platform/projects/page.tsx (existing list page — see the expanded panel layout starting at "{expanded && (" around line 230; new section embeds at the top of that block before "Infrastructure grid")
    - src/lib/build-trigger-mode.ts (BUILD_TRIGGER_MODES tuple — drives the radio group; isValidBuildTriggerMode for any client-side defensive check)
    - src/components/Toast.tsx (Toast component to surface 4xx errors; reuse existing pattern)
    - src/app/admin/modules/pipeline/[slug]/PromoteButton.tsx (golden client-component pattern with state machine + Toast — clone the toast wiring + phase pattern)
    - .planning/phases/37-claude-code-build-trigger/37-CONTEXT.md (TRIG-05 UI: radio-group with 3 options + helper text per mode; locked label text in <interfaces>)
  </read_first>
  <behavior>
    - Renders given project={id, key, buildTriggerMode='local_claude', localPath=null}
    - Renders a fieldset with legend "Build Trigger"
    - Renders 3 radio inputs (name='build_trigger_mode', values 'local_claude', 'managed_agent', 'manual'); selected radio is the one matching project.buildTriggerMode
    - Each radio label shows the locked text (e.g. "Local Claude Code (default)") + helper text underneath
    - Renders one text input with label "Local Path" (id='local_path') initialized to project.localPath ?? ''
    - Renders a Save button — disabled when there are no pending changes (current radio === project.buildTriggerMode AND current text === (project.localPath ?? ''))
    - Clicking a different radio enables Save
    - Typing in the local_path input enables Save
    - Clicking Save calls fetch('/api/platform/projects/{project.id}', {method:'PUT', body: JSON.stringify({buildTriggerMode: selectedMode, localPath: typedPath || null})}); on 200 calls props.onSaved() and shows success toast; on 4xx shows error toast with the server's error string
    - Locked radio label strings (verify in tests via byText): "Local Claude Code (default)", "Managed Agent (v2.5)", "Manual (copy only)"
  </behavior>
  <action>
    1. WRITE TEST FIRST (RED). Create `src/app/admin/platform/projects/BuildTriggerSection.test.tsx`. Use the React Testing Library pattern from `src/app/admin/modules/pipeline/[slug]/PromoteButton.test.tsx` (existing precedent for client-component tests in this codebase):
    ```typescript
    import { describe, it, expect, vi, beforeEach } from 'vitest';
    import { render, screen, fireEvent, cleanup } from '@testing-library/react';
    import { afterEach } from 'vitest';
    import BuildTriggerSection from './BuildTriggerSection';

    afterEach(cleanup);

    function makeProject(overrides: Partial<{ id: string; key: string; buildTriggerMode: string; localPath: string | null }> = {}) {
      return { id: 'proj-1', key: 'tmi', buildTriggerMode: 'local_claude', localPath: null, ...overrides };
    }

    describe('BuildTriggerSection', () => {
      let fetchMock: ReturnType<typeof vi.fn>;
      beforeEach(() => {
        fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'proj-1' }), { status: 200 }));
        globalThis.fetch = fetchMock;
      });

      it('renders 3 radios with locked label text and selects the current mode', () => {
        render(<BuildTriggerSection project={makeProject({ buildTriggerMode: 'manual' })} onSaved={() => {}} />);
        expect(screen.getByLabelText(/Local Claude Code \(default\)/)).toBeInTheDocument();
        expect(screen.getByLabelText(/Managed Agent \(v2\.5\)/)).toBeInTheDocument();
        expect(screen.getByLabelText(/Manual \(copy only\)/)).toBeInTheDocument();
        expect((screen.getByLabelText(/Manual \(copy only\)/) as HTMLInputElement).checked).toBe(true);
      });
      it('renders local_path input prefilled with project.localPath', () => {
        render(<BuildTriggerSection project={makeProject({ localPath: '/Users/mike/projects/tmi' })} onSaved={() => {}} />);
        expect((screen.getByLabelText(/Local Path/) as HTMLInputElement).value).toBe('/Users/mike/projects/tmi');
      });
      it('Save button is disabled when no changes', () => {
        render(<BuildTriggerSection project={makeProject()} onSaved={() => {}} />);
        expect((screen.getByRole('button', { name: /Save/ }) as HTMLButtonElement).disabled).toBe(true);
      });
      it('changing radio enables Save and PUTs correct body on click', async () => {
        const onSaved = vi.fn();
        render(<BuildTriggerSection project={makeProject()} onSaved={onSaved} />);
        fireEvent.click(screen.getByLabelText(/Manual \(copy only\)/));
        const save = screen.getByRole('button', { name: /Save/ }) as HTMLButtonElement;
        expect(save.disabled).toBe(false);
        fireEvent.click(save);
        await Promise.resolve();
        expect(fetchMock).toHaveBeenCalledWith(
          '/api/platform/projects/proj-1',
          expect.objectContaining({
            method: 'PUT',
            body: JSON.stringify({ buildTriggerMode: 'manual', localPath: null }),
          }),
        );
        await Promise.resolve();
        expect(onSaved).toHaveBeenCalled();
      });
      it('typing in local_path enables Save and PUTs path string', async () => {
        render(<BuildTriggerSection project={makeProject()} onSaved={() => {}} />);
        fireEvent.change(screen.getByLabelText(/Local Path/), { target: { value: '/tmp/x' } });
        const save = screen.getByRole('button', { name: /Save/ }) as HTMLButtonElement;
        expect(save.disabled).toBe(false);
        fireEvent.click(save);
        await Promise.resolve();
        expect(fetchMock).toHaveBeenCalledWith(
          '/api/platform/projects/proj-1',
          expect.objectContaining({
            body: JSON.stringify({ buildTriggerMode: 'local_claude', localPath: '/tmp/x' }),
          }),
        );
      });
      it('400 response surfaces error message in a status region', async () => {
        fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'invalid_build_trigger_mode' }), { status: 400 }));
        render(<BuildTriggerSection project={makeProject()} onSaved={() => {}} />);
        fireEvent.click(screen.getByLabelText(/Manual \(copy only\)/));
        fireEvent.click(screen.getByRole('button', { name: /Save/ }));
        await Promise.resolve(); await Promise.resolve();
        expect(screen.getByRole('status')).toHaveTextContent(/invalid_build_trigger_mode/i);
      });
    });
    ```

    2. Run `npx vitest run src/app/admin/platform/projects/BuildTriggerSection.test.tsx` — MUST FAIL with "Cannot find module './BuildTriggerSection'" (RED phase).

    3. WRITE IMPLEMENTATION (GREEN). Create `src/app/admin/platform/projects/BuildTriggerSection.tsx`:
    ```typescript
    'use client';

    import React, { useState } from 'react';
    import Toast from '@/components/Toast';
    import { BUILD_TRIGGER_MODES, type BuildTriggerMode } from '@/lib/build-trigger-mode';

    interface ProjectLite {
      id: string;
      key: string;
      buildTriggerMode?: string;
      localPath?: string | null;
    }

    interface Props {
      project: ProjectLite;
      onSaved: () => void;
    }

    const MODE_LABELS: Record<BuildTriggerMode, { label: string; helper: string }> = {
      local_claude: {
        label: 'Local Claude Code (default)',
        helper: 'Generate Build shows Copy + Open in Claude Code',
      },
      managed_agent: {
        label: 'Managed Agent (v2.5)',
        helper: 'Disabled placeholder — Managed Agent variant ships in v2.5',
      },
      manual: {
        label: 'Manual (copy only)',
        helper: 'Generate Build shows Copy only — paste anywhere',
      },
    };

    export default function BuildTriggerSection({ project, onSaved }: Props) {
      const initialMode = (project.buildTriggerMode ?? 'local_claude') as BuildTriggerMode;
      const initialPath = project.localPath ?? '';
      const [mode, setMode] = useState<BuildTriggerMode>(initialMode);
      const [path, setPath] = useState<string>(initialPath);
      const [saving, setSaving] = useState(false);
      const [toast, setToast] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);

      const dirty = mode !== initialMode || path !== initialPath;

      async function save() {
        if (!dirty || saving) return;
        setSaving(true);
        try {
          const res = await fetch(`/api/platform/projects/${project.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ buildTriggerMode: mode, localPath: path === '' ? null : path }),
          });
          if (!res.ok) {
            let err = `HTTP ${res.status}`;
            try {
              const body = await res.json();
              if (typeof body?.error === 'string') err = body.error;
            } catch { /* ignore */ }
            setToast({ kind: 'error', message: err });
            return;
          }
          setToast({ kind: 'success', message: 'Build trigger saved' });
          onSaved();
        } catch (e) {
          setToast({ kind: 'error', message: e instanceof Error ? e.message : 'network error' });
        } finally {
          setSaving(false);
        }
      }

      return (
        <fieldset className="pt-2 border-t border-zinc-800">
          <legend className="text-xs text-zinc-500 px-1">Build Trigger</legend>
          <div className="mt-2 space-y-2">
            {BUILD_TRIGGER_MODES.map((m) => {
              const { label, helper } = MODE_LABELS[m];
              const inputId = `${project.id}-mode-${m}`;
              return (
                <label key={m} htmlFor={inputId} className="flex items-start gap-2 cursor-pointer">
                  <input
                    id={inputId}
                    type="radio"
                    name={`${project.id}-build-trigger-mode`}
                    value={m}
                    checked={mode === m}
                    onChange={() => setMode(m)}
                    className="mt-1"
                  />
                  <span className="text-xs">
                    <span className="text-zinc-200 block">{label}</span>
                    <span className="text-zinc-500 block">{helper}</span>
                  </span>
                </label>
              );
            })}
          </div>
          <div className="mt-3">
            <label htmlFor={`${project.id}-local-path`} className="text-xs text-zinc-500 block mb-1">
              Local Path
              <span className="text-zinc-600 ml-1">(used as cwd for "Open in Claude Code" deep-link)</span>
            </label>
            <input
              id={`${project.id}-local-path`}
              type="text"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder="/Users/.../projects/this-project"
              className="w-full px-2 py-1 text-xs bg-zinc-900 border border-zinc-700 rounded-md text-zinc-200 focus:outline-none focus:border-teal-500"
            />
          </div>
          <div className="mt-3">
            <button
              type="button"
              onClick={save}
              disabled={!dirty || saving}
              className="px-3 py-1 text-xs rounded bg-teal-700 hover:bg-teal-600 text-white disabled:bg-zinc-700 disabled:text-zinc-500 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
          {toast && (
            <Toast kind={toast.kind} message={toast.message} onDismiss={() => setToast(null)} />
          )}
        </fieldset>
      );
    }
    ```

    4. Run `npx vitest run src/app/admin/platform/projects/BuildTriggerSection.test.tsx` — all 6 cases MUST PASS (GREEN).

    5. (I-4 sanity) The existing `Toast` component is reused as-is. Verify it tolerates rapid-succession setToast calls (e.g., user clicks Save → 400 → changes radio → Save again before first toast dismissed) — open `src/components/Toast.tsx`, confirm setToast→setToast simply replaces state (no animation queue that loses messages). One-line confirmation in SUMMARY.
  </action>
  <verify>
    <automated>npx vitest run src/app/admin/platform/projects/BuildTriggerSection.test.tsx</automated>
  </verify>
  <acceptance_criteria>
    - File `src/app/admin/platform/projects/BuildTriggerSection.tsx` exists and default-exports the component
    - File `src/app/admin/platform/projects/BuildTriggerSection.test.tsx` exists with >= 6 test cases
    - `npx vitest run src/app/admin/platform/projects/BuildTriggerSection.test.tsx` reports 0 failures
    - `grep -c "BUILD_TRIGGER_MODES" src/app/admin/platform/projects/BuildTriggerSection.tsx` returns >= 1 (radios driven by the tuple — never hard-coded)
    - `grep -c "Local Claude Code (default)" src/app/admin/platform/projects/BuildTriggerSection.tsx` returns 1 (locked label text)
    - `grep -c "Managed Agent (v2.5)" src/app/admin/platform/projects/BuildTriggerSection.tsx` returns 1
    - `grep -c "Manual (copy only)" src/app/admin/platform/projects/BuildTriggerSection.tsx` returns 1
  </acceptance_criteria>
  <done>BuildTriggerSection renders 3 radios + path input + Save; all 6 RTL tests green; ready to embed in projects/page.tsx in Task 3.</done>
</task>

<task type="auto">
  <name>Task 3: Embed BuildTriggerSection in /admin/platform/projects expanded card panel</name>
  <files>src/app/admin/platform/projects/page.tsx</files>
  <read_first>
    - src/app/admin/platform/projects/page.tsx (existing — locate the `{expanded && (` block around line 230; the new section goes INSIDE that block, AFTER `<div className="border-t border-zinc-800 p-4 space-y-3">`, BEFORE the existing "Infrastructure grid" `<div className="grid grid-cols-2 gap-3 text-xs">`)
    - src/app/admin/platform/projects/BuildTriggerSection.tsx (component built in Task 2 — props: project + onSaved)
  </read_first>
  <behavior>
    - The /admin/platform/projects list page still renders identically when no card is expanded
    - When a card is expanded, the new "Build Trigger" section appears ABOVE the existing Infrastructure grid
    - The Project interface in the page module gets two new optional fields: buildTriggerMode?: string and localPath?: string | null
    - onSaved hook re-fetches the project list (calls existing fetchProjects)
  </behavior>
  <action>
    1. Edit `src/app/admin/platform/projects/page.tsx`:

    a. ADD import at top (after existing component imports, after the `import { useRouter }` line):
    ```typescript
    import BuildTriggerSection from './BuildTriggerSection';
    ```

    b. EXTEND the `interface Project { ... }` (around line 10-28) with two new optional fields immediately AFTER `apiKey: string | null;`:
    ```typescript
      buildTriggerMode?: string;
      localPath?: string | null;
    ```
    (optional + string because old API responses may omit them; 37-01's schema ensures they exist server-side going forward)

    c. INSERT the BuildTriggerSection render inside the expanded-panel `<div className="border-t border-zinc-800 p-4 space-y-3">` block (currently around line 231), as the FIRST child of that div (before the "Infrastructure grid" `<div className="grid grid-cols-2 gap-3 text-xs">`):
    ```tsx
    <BuildTriggerSection project={project} onSaved={fetchProjects} />
    ```

    d. DO NOT modify any other behaviour in this page; do not refactor; do not touch unrelated styling.

    2. Verify the page still compiles: `npx next build` exits 0.

    3. (Optional but recommended) Spot-verify in dev: `npm run dev`, navigate to /admin/platform/projects, expand a card, confirm the new "Build Trigger" section is visible above the Infrastructure grid. This is covered in the Phase 37 close human-UAT — not a per-task checkpoint, just a smoke check.
  </action>
  <verify>
    <automated>npx next build &amp;&amp; grep -c "BuildTriggerSection" src/app/admin/platform/projects/page.tsx &amp;&amp; grep -c "buildTriggerMode" src/app/admin/platform/projects/page.tsx &amp;&amp; grep -c "localPath" src/app/admin/platform/projects/page.tsx</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "import BuildTriggerSection" src/app/admin/platform/projects/page.tsx` returns 1
    - `grep -c "<BuildTriggerSection project={project} onSaved={fetchProjects}" src/app/admin/platform/projects/page.tsx` returns 1
    - `grep -c "buildTriggerMode?:" src/app/admin/platform/projects/page.tsx` returns 1 (Project interface extended)
    - `grep -c "localPath?:" src/app/admin/platform/projects/page.tsx` returns 1
    - `npx next build` exits 0
    - No existing test in the page module regresses (run `npx vitest run src/app/admin/platform/projects/` and confirm 0 failures; if no test exists at that path, this is vacuously green)
  </acceptance_criteria>
  <done>Project list page now embeds BuildTriggerSection in every expanded card panel; build passes; ready for Mike to lock TMI's trigger mode + local path before running the Phase 37 close UAT.</done>
</task>

</tasks>

<verification>
- PUT endpoint validates buildTriggerMode at the boundary AND DB CHECK enforces same (defense in depth; verifiable: grep + 4 tests)
- localPath accepts string or null (explicit clear) — verifiable: 2 tests
- BuildTriggerSection renders 3 radios driven by BUILD_TRIGGER_MODES tuple (verifiable: grep + 6 tests)
- Save calls PUT with correct body shape (verifiable: Test 4 + Test 5 in BuildTriggerSection.test.tsx)
- Projects list page renders BuildTriggerSection inside expanded panels (verifiable: grep + `npx next build`)
- `npx next build` exits 0 across all changes
- All Vitest cases (>= 10 new across both files) pass
</verification>

<success_criteria>
- Mike can navigate to /admin/platform/projects, expand TMI, see Build Trigger section, select 'Local Claude Code (default)', set local_path to `/Users/mikegeehan/claude/triarch/development/tmi`, click Save → success toast + the value persists across reload
- Plan 37-05 (Generate Build modal) reads project.buildTriggerMode + project.localPath to drive its UI: shows Copy+Open for local_claude, Copy-only for manual, disabled-with-tooltip for managed_agent
- Phase 37 close UAT: Mike successfully drives a build trigger end-to-end with TMI configured via this surface
</success_criteria>

<output>
After completion, create `.planning/phases/37-claude-code-build-trigger/37-04-project-admin-trigger-mode-SUMMARY.md` documenting:
- Which existing test file in src/app/api/platform/projects/[id]/ already exists (if any) and how many tests were added vs total
- BuildTriggerSection test count (target >= 6)
- One screenshot description of the expanded TMI card showing the Build Trigger section (or note "deferred to UAT")
- Confirmation that TMI's row in projects table can be PUT to {buildTriggerMode:'local_claude', localPath:'/Users/...'} via this UI (manual integration check at SUMMARY time)
</output>
</content>
</invoke>