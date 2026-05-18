---
phase: 37-claude-code-build-trigger
plan: 05
type: execute
wave: 3
depends_on: [37-01, 37-02, 37-03, 37-04]
files_modified:
  - src/app/admin/modules/next-build-plan/[slug]/NextBuildPlanClient.tsx
  - src/app/admin/modules/next-build-plan/[slug]/NextBuildPlanClient.test.tsx
  - src/app/admin/modules/next-build-plan/[slug]/GenerateBuildModal.tsx
  - src/app/admin/modules/next-build-plan/[slug]/GenerateBuildModal.test.tsx
  - src/app/admin/modules/next-build-plan/[slug]/page.tsx
autonomous: true
requirements: [TRIG-02, TRIG-03, TRIG-04]
must_haves:
  truths:
    - "NextBuildPlanClient renders a 'Generate build' button in the page header area; button is DISABLED when approved_for_build item count is 0 (rendered with tooltip 'Approve at least one item to generate a build')"
    - "Button is DISABLED when project.buildTriggerMode === 'managed_agent' (rendered with tooltip 'Managed Agent variant ships in v2.5')"
    - "Clicking the button opens GenerateBuildModal (role='dialog' aria-modal='true') which calls POST /api/admin/projects/{slug}/generate-build and shows a loading state, then renders the prompt preview in a textarea + action buttons"
    - "Action buttons depend on project.buildTriggerMode: 'local_claude' shows Copy + Open in Claude Code; 'manual' shows Copy only; 'managed_agent' would never reach this modal (button disabled at parent)"
    - "Copy button calls navigator.clipboard.writeText(prompt); on success shows toast 'Prompt copied'; on failure shows error toast"
    - "Open in Claude Code button constructs href='claude-code://open?prompt={url-encoded prompt}&cwd={url-encoded project.localPath}' (cwd param OMITTED when project.localPath is null); sets window.location.href to launch the deep-link; after 2 seconds shows fallback hint 'Did Claude Code open? If not, copy the prompt below.'"
    - "Modal can be closed via X button, Escape key, or backdrop click; closing resets state for next trigger"
    - "page.tsx server component is extended to load the project row (buildTriggerMode + localPath) and pass it + approvedCount as props to NextBuildPlanClient"
    - "Vitest coverage: >= 8 cases in NextBuildPlanClient.test.tsx and >= 8 cases in GenerateBuildModal.test.tsx covering all listed behaviours"
    - "Pitfall 9 (Next.js 16 async params) — page.tsx awaits params before destructuring slug"
  artifacts:
    - path: "src/app/admin/modules/next-build-plan/[slug]/GenerateBuildModal.tsx"
      provides: "Modal client component: loading -> preview -> Copy/Open actions; mode-driven button visibility; deep-link fallback hint"
      exports: ["default"]
    - path: "src/app/admin/modules/next-build-plan/[slug]/NextBuildPlanClient.tsx"
      provides: "Existing client component EXTENDED with Generate Build button + modal open/close state"
      contains: "GenerateBuildModal"
    - path: "src/app/admin/modules/next-build-plan/[slug]/page.tsx"
      provides: "Existing server component EXTENDED to query project row + pass project + approvedCount props"
      contains: "buildTriggerMode"
  key_links:
    - from: "src/app/admin/modules/next-build-plan/[slug]/GenerateBuildModal.tsx"
      to: "POST /api/admin/projects/{slug}/generate-build"
      via: "fetch on modal mount"
      pattern: "/api/admin/projects/.+/generate-build"
    - from: "src/app/admin/modules/next-build-plan/[slug]/GenerateBuildModal.tsx"
      to: "navigator.clipboard.writeText"
      via: "Copy button onClick"
      pattern: "navigator\\.clipboard\\.writeText"
    - from: "src/app/admin/modules/next-build-plan/[slug]/GenerateBuildModal.tsx"
      to: "claude-code:// deep-link scheme"
      via: "window.location.href assignment"
      pattern: "claude-code://open"
    - from: "src/app/admin/modules/next-build-plan/[slug]/page.tsx"
      to: "projects table buildTriggerMode + localPath columns (37-01)"
      via: "drizzle SELECT from projects WHERE key=slug"
      pattern: "buildTriggerMode"
---

<objective>
Ship the TRIG-02 + TRIG-03 + TRIG-04 UX: a "Generate build" button in the NextBuildPlanClient page header that opens a modal showing the generated prompt with mode-appropriate action buttons (Copy / Open in Claude Code). The deep-link uses the claude-code:// URL scheme with cwd from project.localPath when set. Disabled states handled inline (0 items tooltip + managed_agent v2.5 tooltip). Fallback behaviour for unregistered URL scheme: after 2 seconds show a hint with the prompt visible in a textarea so the user is never silently stranded.

Purpose: Bridge the approved items into a live Claude Code session with one click. This is the end-to-end UX that delivers Phase 37's user-visible value.
Output: New GenerateBuildModal component (TDD), extended NextBuildPlanClient (TDD), extended page.tsx server component (loads project + count). 16+ new Vitest cases.
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
@.planning/phases/37-claude-code-build-trigger/37-02-build-prompt-generator-PLAN.md
@.planning/phases/37-claude-code-build-trigger/37-03-generate-build-api-PLAN.md
@.planning/phases/36-inclusion-approval-state-machine/36-05a-admin-next-build-plan-page-PLAN.md

# Source-of-truth references
@src/app/admin/modules/next-build-plan/[slug]/page.tsx
@src/app/admin/modules/next-build-plan/[slug]/NextBuildPlanClient.tsx
@src/app/admin/modules/pipeline/[slug]/PromoteButton.tsx
@src/components/Toast.tsx
@src/lib/build-trigger-mode.ts

<interfaces>
<!-- Key types and contracts executors will use. -->

From src/app/admin/modules/next-build-plan/[slug]/page.tsx (Phase 36-05a — being extended):
The server component currently auth-gates, loads the slug project (probably) + approved items, renders NextBuildPlanClient. Phase 37 EXTENDS it to ALSO surface buildTriggerMode + localPath in the project prop and approvedCount = items.length.

From src/app/admin/modules/next-build-plan/[slug]/NextBuildPlanClient.tsx (Phase 36-05a — being extended):
Existing props from 36-05a are at minimum { items, slug }. Phase 37 EXTENDS props to add:
  project: { id, key, name, buildTriggerMode, localPath }
  approvedCount: number

From src/app/admin/modules/pipeline/[slug]/PromoteButton.tsx (golden client-component state machine pattern):
- Phase machine: { kind: 'idle' | 'loading' | 'success' | 'error' }
- Toast reuse via @/components/Toast (do NOT introduce a new toast lib)

From src/lib/build-trigger-mode.ts (37-01):
```typescript
export type BuildTriggerMode = 'local_claude' | 'managed_agent' | 'manual';
```

From src/app/api/admin/projects/[slug]/generate-build/route.ts (37-03):
POST returns 200 { prompt: string, mode: BuildTriggerMode, item_count: number }
       returns 404 { error: 'project_not_found' }
       returns 409 { error: 'no_approved_items' }
       returns 400 { error: 'managed_agent_not_available' }

Deep-link URL format (CONTEXT.md):
- With localPath: `claude-code://open?prompt={url-encoded prompt}&cwd={url-encoded localPath}`
- Without localPath: `claude-code://open?prompt={url-encoded prompt}` (Claude Code opens in last-used dir)

Locked tooltip + fallback strings (CONTEXT.md):
- 0-items disabled tooltip: "Approve at least one item to generate a build"
- managed_agent disabled tooltip: "Managed Agent variant ships in v2.5"
- 2-second fallback hint: "Did Claude Code open? If not, copy the prompt below."
- Copy success toast: "Prompt copied"
- Copy failure toast: "Couldn't copy — select the text manually below"
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Extend page.tsx server component to load project row and pass project + approvedCount to NextBuildPlanClient</name>
  <files>src/app/admin/modules/next-build-plan/[slug]/page.tsx</files>
  <read_first>
    - src/app/admin/modules/next-build-plan/[slug]/page.tsx (existing from Phase 36-05a — confirm what queries it currently runs)
    - src/app/admin/modules/pipeline/[slug]/page.tsx (reference for server-component pattern with project lookup + await params)
    - packages/triarch-shared/src/schema.ts (projects.buildTriggerMode + projects.localPath — new columns from 37-01)
  </read_first>
  <behavior>
    - Page still renders the existing table/filter UI from Phase 36-05a (no regression)
    - Page returns a project row including buildTriggerMode + localPath (these are columns on the projects table after 37-01 db:push)
    - Page passes a project prop to NextBuildPlanClient: { id, key, name, buildTriggerMode, localPath }
    - Page passes an approvedCount prop (number) equal to items.length
    - Pitfall 9: params is a Promise; await before destructuring slug
  </behavior>
  <action>
    1. Read `src/app/admin/modules/next-build-plan/[slug]/page.tsx` (shipped by Phase 36-05a). Confirm it already loads the project row; if not, add the query (mirroring `src/app/admin/modules/pipeline/[slug]/page.tsx`):
    ```typescript
    const [project] = await db.select().from(projects).where(eq(projects.key, slug)).limit(1);
    if (!project) notFound();
    ```
    Drizzle returns the new buildTriggerMode + localPath columns automatically since they are in the shared schema after 37-01.

    2. Update the NextBuildPlanClient render in the JSX to pass two new props alongside any existing ones:
    ```tsx
    <NextBuildPlanClient
      items={items}
      slug={slug}
      project={{
        id: project.id,
        key: project.key,
        name: project.name,
        buildTriggerMode: project.buildTriggerMode as BuildTriggerMode,
        localPath: project.localPath ?? null,
      }}
      approvedCount={items.length}
    />
    ```

    3. ADD imports at the top of the file as needed (only if not already present):
    - `import { projects } from '@/db/schema';`
    - `import type { BuildTriggerMode } from '@/lib/build-trigger-mode';`

    4. DO NOT change the existing auth gate, the filter param handling, or the items query logic.

    5. Verify `npx next build` exits 0.
  </action>
  <verify>
    <automated>npx next build &amp;&amp; grep -c "approvedCount=" "src/app/admin/modules/next-build-plan/[slug]/page.tsx" &amp;&amp; grep -c "buildTriggerMode" "src/app/admin/modules/next-build-plan/[slug]/page.tsx" &amp;&amp; grep -c "await params" "src/app/admin/modules/next-build-plan/[slug]/page.tsx"</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "approvedCount=" src/app/admin/modules/next-build-plan/[slug]/page.tsx` returns 1
    - `grep -c "buildTriggerMode" src/app/admin/modules/next-build-plan/[slug]/page.tsx` returns >= 1
    - `grep -c "localPath" src/app/admin/modules/next-build-plan/[slug]/page.tsx` returns >= 1
    - `grep -c "await params" src/app/admin/modules/next-build-plan/[slug]/page.tsx` returns 1 (Pitfall 9 anchored)
    - `npx next build` exits 0
    - No regression in any existing Phase 36-05a Vitest cases at this path (`npx vitest run src/app/admin/modules/next-build-plan/` — must still report 0 failures; if test counts dropped, restore them)
  </acceptance_criteria>
  <done>page.tsx loads project + items; passes project + approvedCount + items + slug as props; build clean.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Build GenerateBuildModal client component (loading -> preview -> Copy/Open actions; deep-link fallback) with Vitest coverage</name>
  <files>src/app/admin/modules/next-build-plan/[slug]/GenerateBuildModal.tsx, src/app/admin/modules/next-build-plan/[slug]/GenerateBuildModal.test.tsx</files>
  <read_first>
    - src/app/admin/modules/pipeline/[slug]/PromoteButton.tsx (golden client-component pattern with phase machine + Toast)
    - src/components/Toast.tsx (the Toast component this modal reuses)
    - .planning/phases/37-claude-code-build-trigger/37-CONTEXT.md (Trigger UX + Deep-Link Mechanics — locked strings for tooltips, fallback hint, deep-link URL format)
    - .planning/phases/37-claude-code-build-trigger/37-03-generate-build-api-PLAN.md (response shape contract this modal consumes)
    - src/app/admin/modules/pipeline/[slug]/PromoteButton.test.tsx (Vitest + React Testing Library pattern for client-component tests in this codebase)
  </read_first>
  <behavior>
    - On mount, modal calls fetch('/api/admin/projects/{slug}/generate-build', {method:'POST'}); during the in-flight period renders "Generating build prompt..." with a spinner
    - On 200, renders the prompt in a <textarea readOnly> (visible, selectable, monospace), plus a small header showing item_count
    - On 4xx/5xx, renders an error message with the server's error string and a Retry button
    - When project.buildTriggerMode === 'local_claude', renders TWO action buttons: "Copy to clipboard" and "Open in Claude Code"
    - When project.buildTriggerMode === 'manual', renders ONLY "Copy to clipboard" (Open hidden)
    - Copy button: calls navigator.clipboard.writeText(prompt); success shows Toast 'Prompt copied'; failure shows Toast 'Couldn't copy — select the text manually below'
    - Open button: sets window.location.href = `claude-code://open?prompt={encodeURIComponent(prompt)}&cwd={encodeURIComponent(project.localPath)}` when localPath is set; OMITS &cwd= when localPath is null
    - After Open click: 2 seconds later renders fallback hint "Did Claude Code open? If not, copy the prompt below." next to a secondary Copy button
    - Modal has role="dialog" and aria-modal="true"; close via X button OR Escape key OR backdrop click
    - Modal mount triggers fetch exactly ONCE (never refetches on re-render)
  </behavior>
  <action>
    1. WRITE TEST FIRST (RED). Create `src/app/admin/modules/next-build-plan/[slug]/GenerateBuildModal.test.tsx`. Follow the Vitest + React Testing Library pattern from `src/app/admin/modules/pipeline/[slug]/PromoteButton.test.tsx`. Mock navigator.clipboard, mock fetch globally, control timers with vi.useFakeTimers for the 2-second fallback assertion:
    ```typescript
    import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
    import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
    import GenerateBuildModal from './GenerateBuildModal';

    afterEach(cleanup);

    const project = { id: 'p1', key: 'tmi', name: 'TMI', buildTriggerMode: 'local_claude' as const, localPath: '/Users/m/tmi' };
    let fetchMock: ReturnType<typeof vi.fn>;
    let writeTextMock: ReturnType<typeof vi.fn>;
    let hrefAssignments: string[];

    beforeEach(() => {
      hrefAssignments = [];
      fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ prompt: 'FAKE PROMPT BODY', mode: 'local_claude', item_count: 3 }), { status: 200 }));
      globalThis.fetch = fetchMock;
      writeTextMock = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', { value: { writeText: writeTextMock }, configurable: true });
      // Stub window.location.href setter to record assignments rather than navigate.
      const original = window.location;
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: new Proxy({ ...original, href: '' } as Location, {
          set(_t, prop, val) {
            if (prop === 'href') hrefAssignments.push(String(val));
            return true;
          },
          get(_t, prop) {
            if (prop === 'href') return hrefAssignments.at(-1) ?? '';
            return (original as unknown as Record<string, unknown>)[prop as string];
          },
        }),
      });
    });

    describe('GenerateBuildModal', () => {
      it('renders dialog with aria-modal and fetches on mount exactly once', async () => {
        render(<GenerateBuildModal slug="tmi" project={project} onClose={() => {}} />);
        expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
        await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
        expect(fetchMock).toHaveBeenCalledWith('/api/admin/projects/tmi/generate-build', expect.objectContaining({ method: 'POST' }));
      });
      it('shows loading state then renders the prompt in a readOnly textarea', async () => {
        render(<GenerateBuildModal slug="tmi" project={project} onClose={() => {}} />);
        expect(screen.getByText(/Generating/i)).toBeInTheDocument();
        await waitFor(() => expect(screen.getByDisplayValue('FAKE PROMPT BODY')).toBeInTheDocument());
        const ta = screen.getByDisplayValue('FAKE PROMPT BODY') as HTMLTextAreaElement;
        expect(ta.readOnly).toBe(true);
      });
      it('renders Copy + Open buttons in local_claude mode', async () => {
        render(<GenerateBuildModal slug="tmi" project={project} onClose={() => {}} />);
        await waitFor(() => screen.getByDisplayValue('FAKE PROMPT BODY'));
        expect(screen.getByRole('button', { name: /Copy to clipboard/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Open in Claude Code/i })).toBeInTheDocument();
      });
      it('hides Open button in manual mode', async () => {
        const manualProject = { ...project, buildTriggerMode: 'manual' as const };
        render(<GenerateBuildModal slug="tmi" project={manualProject} onClose={() => {}} />);
        await waitFor(() => screen.getByDisplayValue('FAKE PROMPT BODY'));
        expect(screen.getByRole('button', { name: /Copy to clipboard/i })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Open in Claude Code/i })).toBeNull();
      });
      it('Copy click calls navigator.clipboard.writeText with the full prompt', async () => {
        render(<GenerateBuildModal slug="tmi" project={project} onClose={() => {}} />);
        await waitFor(() => screen.getByRole('button', { name: /Copy to clipboard/i }));
        fireEvent.click(screen.getByRole('button', { name: /Copy to clipboard/i }));
        await waitFor(() => expect(writeTextMock).toHaveBeenCalledWith('FAKE PROMPT BODY'));
      });
      it('Open click sets window.location.href to claude-code:// URL with encoded prompt and cwd', async () => {
        render(<GenerateBuildModal slug="tmi" project={project} onClose={() => {}} />);
        await waitFor(() => screen.getByRole('button', { name: /Open in Claude Code/i }));
        fireEvent.click(screen.getByRole('button', { name: /Open in Claude Code/i }));
        expect(hrefAssignments.at(-1)).toMatch(/^claude-code:\/\/open\?prompt=/);
        expect(hrefAssignments.at(-1)).toContain('cwd=');
        expect(hrefAssignments.at(-1)).toContain(encodeURIComponent('/Users/m/tmi'));
      });
      it('Open click without localPath omits cwd param', async () => {
        const noPathProject = { ...project, localPath: null };
        render(<GenerateBuildModal slug="tmi" project={noPathProject} onClose={() => {}} />);
        await waitFor(() => screen.getByRole('button', { name: /Open in Claude Code/i }));
        fireEvent.click(screen.getByRole('button', { name: /Open in Claude Code/i }));
        expect(hrefAssignments.at(-1)).toMatch(/^claude-code:\/\/open\?prompt=/);
        expect(hrefAssignments.at(-1)).not.toContain('cwd=');
      });
      it('after 2 seconds following Open click, renders fallback hint', async () => {
        vi.useFakeTimers();
        try {
          render(<GenerateBuildModal slug="tmi" project={project} onClose={() => {}} />);
          await vi.advanceTimersByTimeAsync(0);  // resolve fetch microtask
          fireEvent.click(screen.getByRole('button', { name: /Open in Claude Code/i }));
          await vi.advanceTimersByTimeAsync(2000);
          expect(screen.getByText(/Did Claude Code open\?/)).toBeInTheDocument();
        } finally {
          vi.useRealTimers();
        }
      });
      it('renders error message + Retry on 4xx', async () => {
        fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'no_approved_items' }), { status: 409 }));
        render(<GenerateBuildModal slug="tmi" project={project} onClose={() => {}} />);
        await waitFor(() => expect(screen.getByText(/no_approved_items/i)).toBeInTheDocument());
        expect(screen.getByRole('button', { name: /Retry/i })).toBeInTheDocument();
      });
      it('Escape key calls onClose', async () => {
        const onClose = vi.fn();
        render(<GenerateBuildModal slug="tmi" project={project} onClose={onClose} />);
        await waitFor(() => screen.getByDisplayValue('FAKE PROMPT BODY'));
        fireEvent.keyDown(window, { key: 'Escape' });
        expect(onClose).toHaveBeenCalled();
      });
    });
    ```

    2. Run `npx vitest run src/app/admin/modules/next-build-plan/[slug]/GenerateBuildModal.test.tsx` — MUST FAIL with "Cannot find module './GenerateBuildModal'" (RED phase).

    3. WRITE IMPLEMENTATION (GREEN). Create `src/app/admin/modules/next-build-plan/[slug]/GenerateBuildModal.tsx`:
    ```typescript
    'use client';

    import React, { useEffect, useRef, useState } from 'react';
    import Toast from '@/components/Toast';
    import type { BuildTriggerMode } from '@/lib/build-trigger-mode';
    import { X, Copy, ExternalLink, Loader2 } from 'lucide-react';

    interface ProjectLite {
      id: string;
      key: string;
      name: string;
      buildTriggerMode: BuildTriggerMode;
      localPath: string | null;
    }

    interface Props {
      slug: string;
      project: ProjectLite;
      onClose: () => void;
    }

    type Phase =
      | { kind: 'loading' }
      | { kind: 'ready'; prompt: string; itemCount: number }
      | { kind: 'error'; message: string };

    export default function GenerateBuildModal({ slug, project, onClose }: Props) {
      const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
      const [toast, setToast] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);
      const [showFallback, setShowFallback] = useState(false);
      const fallbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
      const fetchedRef = useRef(false);

      // Fetch on mount, exactly once.
      useEffect(() => {
        if (fetchedRef.current) return;
        fetchedRef.current = true;
        void runFetch();
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);

      // Escape key closes.
      useEffect(() => {
        function onKey(e: KeyboardEvent) {
          if (e.key === 'Escape') onClose();
        }
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
      }, [onClose]);

      // Clean up fallback timer.
      useEffect(() => {
        return () => {
          if (fallbackTimer.current) clearTimeout(fallbackTimer.current);
        };
      }, []);

      async function runFetch() {
        setPhase({ kind: 'loading' });
        let res: Response;
        try {
          res = await fetch(`/api/admin/projects/${slug}/generate-build`, { method: 'POST' });
        } catch (e) {
          setPhase({ kind: 'error', message: e instanceof Error ? e.message : 'network error' });
          return;
        }
        let body: { prompt?: string; mode?: string; item_count?: number; error?: string } = {};
        try {
          body = await res.json();
        } catch { /* ignore */ }
        if (!res.ok) {
          setPhase({ kind: 'error', message: body.error ?? `HTTP ${res.status}` });
          return;
        }
        if (typeof body.prompt !== 'string') {
          setPhase({ kind: 'error', message: 'missing prompt in response' });
          return;
        }
        setPhase({ kind: 'ready', prompt: body.prompt, itemCount: body.item_count ?? 0 });
      }

      async function handleCopy() {
        if (phase.kind !== 'ready') return;
        try {
          await navigator.clipboard.writeText(phase.prompt);
          setToast({ kind: 'success', message: 'Prompt copied' });
        } catch {
          setToast({ kind: 'error', message: "Couldn't copy — select the text manually below" });
        }
      }

      function handleOpen() {
        if (phase.kind !== 'ready') return;
        const encoded = encodeURIComponent(phase.prompt);
        let url = `claude-code://open?prompt=${encoded}`;
        if (project.localPath) {
          url += `&cwd=${encodeURIComponent(project.localPath)}`;
        }
        window.location.href = url;
        if (fallbackTimer.current) clearTimeout(fallbackTimer.current);
        fallbackTimer.current = setTimeout(() => setShowFallback(true), 2000);
      }

      const showOpenButton = project.buildTriggerMode === 'local_claude';

      return (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="generate-build-title"
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/60"
          onClick={(e) => {
            // Backdrop click closes (but not clicks on the inner card).
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg w-full max-w-3xl mx-4 max-h-[85vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
              <h2 id="generate-build-title" className="text-sm font-semibold text-zinc-200">
                Generate build for {project.name}
              </h2>
              <button onClick={onClose} aria-label="Close" className="text-zinc-500 hover:text-zinc-200">
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-auto p-4">
              {phase.kind === 'loading' && (
                <div className="flex items-center gap-2 text-zinc-400 text-sm">
                  <Loader2 size={14} className="animate-spin" />
                  Generating build prompt...
                </div>
              )}

              {phase.kind === 'error' && (
                <div className="space-y-3">
                  <div className="text-sm text-red-400">Error: {phase.message}</div>
                  <button
                    onClick={runFetch}
                    className="px-3 py-1 text-xs rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200"
                  >
                    Retry
                  </button>
                </div>
              )}

              {phase.kind === 'ready' && (
                <div className="space-y-3">
                  <div className="text-xs text-zinc-500">
                    {phase.itemCount} item{phase.itemCount !== 1 ? 's' : ''} approved · mode: {project.buildTriggerMode}
                  </div>
                  <textarea
                    readOnly
                    value={phase.prompt}
                    className="w-full h-80 px-3 py-2 text-xs font-mono bg-zinc-950 border border-zinc-800 rounded text-zinc-200"
                  />
                  {showFallback && (
                    <div className="text-xs text-amber-400">
                      Did Claude Code open? If not, copy the prompt below.
                    </div>
                  )}
                </div>
              )}
            </div>

            {phase.kind === 'ready' && (
              <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-zinc-800">
                <button
                  onClick={handleCopy}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200"
                >
                  <Copy size={12} />
                  Copy to clipboard
                </button>
                {showOpenButton && (
                  <button
                    onClick={handleOpen}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded bg-violet-600 hover:bg-violet-500 text-white"
                  >
                    <ExternalLink size={12} />
                    Open in Claude Code
                  </button>
                )}
              </div>
            )}
          </div>

          {toast && <Toast kind={toast.kind} message={toast.message} onDismiss={() => setToast(null)} />}
        </div>
      );
    }
    ```

    4. Run `npx vitest run src/app/admin/modules/next-build-plan/[slug]/GenerateBuildModal.test.tsx` — all 10 cases MUST PASS (GREEN).
  </action>
  <verify>
    <automated>npx vitest run "src/app/admin/modules/next-build-plan/[slug]/GenerateBuildModal.test.tsx"</automated>
  </verify>
  <acceptance_criteria>
    - File `src/app/admin/modules/next-build-plan/[slug]/GenerateBuildModal.tsx` exists and default-exports the component
    - File `src/app/admin/modules/next-build-plan/[slug]/GenerateBuildModal.test.tsx` exists with >= 8 test cases (10 ideal)
    - `npx vitest run "src/app/admin/modules/next-build-plan/[slug]/GenerateBuildModal.test.tsx"` reports 0 failures
    - `grep -c "claude-code://open" src/app/admin/modules/next-build-plan/[slug]/GenerateBuildModal.tsx` returns 1
    - `grep -c "navigator.clipboard.writeText" src/app/admin/modules/next-build-plan/[slug]/GenerateBuildModal.tsx` returns 1
    - `grep -c "aria-modal=\"true\"" src/app/admin/modules/next-build-plan/[slug]/GenerateBuildModal.tsx` returns 1
    - `grep -c "Did Claude Code open" src/app/admin/modules/next-build-plan/[slug]/GenerateBuildModal.tsx` returns 1 (locked fallback string)
    - `grep -c "Managed Agent" src/app/admin/modules/next-build-plan/[slug]/GenerateBuildModal.tsx` returns 0 (managed_agent never reaches this modal — disabled at parent in Task 3)
  </acceptance_criteria>
  <done>GenerateBuildModal renders loading -> preview -> Copy/Open with deep-link + 2-sec fallback + Escape close; 10 RTL tests green.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Extend NextBuildPlanClient with Generate Build header button (disabled states) + modal open/close state + Vitest coverage</name>
  <files>src/app/admin/modules/next-build-plan/[slug]/NextBuildPlanClient.tsx, src/app/admin/modules/next-build-plan/[slug]/NextBuildPlanClient.test.tsx</files>
  <read_first>
    - src/app/admin/modules/next-build-plan/[slug]/NextBuildPlanClient.tsx (existing from Phase 36-05a — find where the page header/title renders; the button goes there)
    - src/app/admin/modules/next-build-plan/[slug]/NextBuildPlanClient.test.tsx (existing Vitest from 36-05a — add new cases to the existing describe blocks; do NOT delete or rename existing cases)
    - src/app/admin/modules/next-build-plan/[slug]/GenerateBuildModal.tsx (built in Task 2 — props: slug, project, onClose)
    - .planning/phases/37-claude-code-build-trigger/37-CONTEXT.md (UX: button placement top-right of header, primary violet styling, disabled tooltips)
  </read_first>
  <behavior>
    - Header now contains an additional button labelled "Generate build" placed at the right of the header row
    - When approvedCount === 0 the button is disabled and has title="Approve at least one item to generate a build"
    - When project.buildTriggerMode === 'managed_agent' the button is disabled and has title="Managed Agent variant ships in v2.5"
    - When enabled, clicking the button mounts GenerateBuildModal with props { slug, project, onClose: closes modal }
    - Closing the modal unmounts it (state goes back to closed); the button remains where it is and is reusable
    - Existing 36-05a behaviours (table, filter chips, Remove from build) remain unchanged
  </behavior>
  <action>
    1. WRITE TESTS FIRST (RED): EXTEND `src/app/admin/modules/next-build-plan/[slug]/NextBuildPlanClient.test.tsx` with a new describe block (do NOT remove existing tests):
    ```typescript
    describe('Phase 37 — Generate build button + modal', () => {
      const project = { id: 'p1', key: 'tmi', name: 'TMI', buildTriggerMode: 'local_claude' as const, localPath: null };

      it('renders Generate build button enabled when approvedCount > 0', () => {
        render(<NextBuildPlanClient items={[/* some items */]} slug="tmi" project={project} approvedCount={3} />);
        const btn = screen.getByRole('button', { name: /Generate build/ });
        expect(btn).toBeInTheDocument();
        expect((btn as HTMLButtonElement).disabled).toBe(false);
      });

      it('disables Generate build button when approvedCount === 0 with tooltip', () => {
        render(<NextBuildPlanClient items={[]} slug="tmi" project={project} approvedCount={0} />);
        const btn = screen.getByRole('button', { name: /Generate build/ });
        expect((btn as HTMLButtonElement).disabled).toBe(true);
        expect(btn).toHaveAttribute('title', 'Approve at least one item to generate a build');
      });

      it('disables Generate build button when buildTriggerMode === managed_agent with v2.5 tooltip', () => {
        render(<NextBuildPlanClient items={[/* some items */]} slug="tmi" project={{ ...project, buildTriggerMode: 'managed_agent' }} approvedCount={2} />);
        const btn = screen.getByRole('button', { name: /Generate build/ });
        expect((btn as HTMLButtonElement).disabled).toBe(true);
        expect(btn).toHaveAttribute('title', 'Managed Agent variant ships in v2.5');
      });

      it('clicking Generate build opens the modal (role=dialog appears)', () => {
        render(<NextBuildPlanClient items={[/* some items */]} slug="tmi" project={project} approvedCount={2} />);
        expect(screen.queryByRole('dialog')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: /Generate build/ }));
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      it('closing the modal removes it from the DOM', () => {
        render(<NextBuildPlanClient items={[/* some items */]} slug="tmi" project={project} approvedCount={2} />);
        fireEvent.click(screen.getByRole('button', { name: /Generate build/ }));
        // Mock fetch so the modal doesn't error during its mount fetch
        // (existing mock pattern in 36-05a tests already stubs fetch globally; just rely on it).
        fireEvent.click(screen.getByLabelText(/Close/));
        expect(screen.queryByRole('dialog')).toBeNull();
      });
    });
    ```
    NOTE: The 36-05a test file already has a global fetch mock setup at the top of the file. Reuse it; if not present, add the same mock pattern from Phase 36-05a's NextBuildPlanClient.test.tsx (which stubs fetch for the PATCH calls).

    2. Run `npx vitest run "src/app/admin/modules/next-build-plan/[slug]/NextBuildPlanClient.test.tsx"` — the NEW 5 tests MUST FAIL (RED). Existing tests should still pass.

    3. EXTEND `src/app/admin/modules/next-build-plan/[slug]/NextBuildPlanClient.tsx`:

    a. ADD imports at top of file:
    ```typescript
    import { useState } from 'react';                  // if not already imported
    import GenerateBuildModal from './GenerateBuildModal';
    import type { BuildTriggerMode } from '@/lib/build-trigger-mode';
    ```

    b. UPDATE props interface to add project + approvedCount (preserve existing fields):
    ```typescript
    interface NextBuildPlanClientProps {
      items: /* existing type */;
      slug: string;
      project: { id: string; key: string; name: string; buildTriggerMode: BuildTriggerMode; localPath: string | null };
      approvedCount: number;
    }
    ```

    c. ADD modal open state and the button. Locate where the existing header/title for the page renders (likely a top-level `<div className="flex items-center justify-between ...">` or similar). Add the button as the right-side child:
    ```tsx
    const [modalOpen, setModalOpen] = useState(false);
    const noItems = approvedCount === 0;
    const isManagedAgent = project.buildTriggerMode === 'managed_agent';
    const disabled = noItems || isManagedAgent;
    const disabledTitle = noItems
      ? 'Approve at least one item to generate a build'
      : isManagedAgent
        ? 'Managed Agent variant ships in v2.5'
        : undefined;

    // ... in the header JSX ...
    <button
      type="button"
      onClick={() => setModalOpen(true)}
      disabled={disabled}
      title={disabledTitle}
      className="px-3 py-1.5 text-xs rounded bg-violet-600 hover:bg-violet-500 text-white disabled:bg-zinc-700 disabled:text-zinc-500 disabled:cursor-not-allowed"
    >
      Generate build
    </button>
    ```

    d. RENDER the modal conditionally at the bottom of the component return:
    ```tsx
    {modalOpen && (
      <GenerateBuildModal slug={slug} project={project} onClose={() => setModalOpen(false)} />
    )}
    ```

    e. DO NOT change the existing table rendering, filter chips, Remove from build action, or any other Phase 36-05a behaviour.

    4. Run `npx vitest run "src/app/admin/modules/next-build-plan/[slug]/NextBuildPlanClient.test.tsx"` — all tests (existing + new 5) MUST PASS (GREEN).

    5. Verify `npx next build` exits 0.
  </action>
  <verify>
    <automated>npx vitest run "src/app/admin/modules/next-build-plan/[slug]/NextBuildPlanClient.test.tsx"</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "Generate build" src/app/admin/modules/next-build-plan/[slug]/NextBuildPlanClient.tsx` returns >= 1
    - `grep -c "GenerateBuildModal" src/app/admin/modules/next-build-plan/[slug]/NextBuildPlanClient.tsx` returns >= 2 (import + render)
    - `grep -c "Approve at least one item to generate a build" src/app/admin/modules/next-build-plan/[slug]/NextBuildPlanClient.tsx` returns 1 (locked tooltip)
    - `grep -c "Managed Agent variant ships in v2.5" src/app/admin/modules/next-build-plan/[slug]/NextBuildPlanClient.tsx` returns 1 (locked tooltip)
    - `npx vitest run "src/app/admin/modules/next-build-plan/[slug]/NextBuildPlanClient.test.tsx"` reports 0 failures with >= 5 new cases on top of the existing 36-05a count
    - `npx next build` exits 0
    - No regression in any prior 36-05a test
  </acceptance_criteria>
  <done>Generate build button wired into header with disabled states for 0-items and managed_agent; modal opens on click; closing removes it; all tests green.</done>
</task>

</tasks>

<verification>
- Generate build button visible in /admin/modules/next-build-plan/{slug} page header (covered by Task 3 Test 1)
- Disabled tooltips render the locked strings (Tasks 3 Test 2 + 3)
- Clicking opens dialog (role='dialog'+aria-modal); fetch called once on mount (Task 2 Test 1 + Task 3 Test 4)
- Copy writes to clipboard with the full prompt (Task 2 Test 5)
- Open sets window.location.href to claude-code:// URL with proper encoding (Task 2 Test 6, 7)
- 2-second fallback hint appears post-Open (Task 2 Test 8)
- Escape closes (Task 2 Test 10)
- All Vitest cases green; `npx next build` clean
- Pitfall 9 (Next.js 16 async params) anchored in page.tsx via grep
</verification>

<success_criteria>
- Mike navigates to /admin/modules/next-build-plan/tmi after approving 1+ items: the Generate build button is enabled
- Clicking shows modal with prompt preview within ~1s (server-side generation + audit insert)
- Copy puts the prompt on the clipboard verifiable in any text editor
- Open launches Claude Code locally (or shows fallback hint after 2s on systems without the URL scheme registered)
- Every click of Generate build leaves an approval_events row visible on the Plan 37-06 audit page
- ROADMAP success criterion satisfied: "Both modes work: clipboard mode confirms via toast; deep-link mode opens Claude Code locally (manual UAT)"
</success_criteria>

<output>
After completion, create `.planning/phases/37-claude-code-build-trigger/37-05-generate-build-ui-SUMMARY.md` documenting:
- Final NextBuildPlanClient prop signature (additions vs Phase 36-05a baseline)
- Test count: new cases in NextBuildPlanClient.test.tsx (>= 5) + GenerateBuildModal.test.tsx (>= 8)
- Any deep-link scheme deviations discovered during manual UAT (e.g., if Claude Code uses a different scheme/path than claude-code://open — update CONTEXT.md amendments block accordingly and re-document here)
- Screenshot description of the modal in local_claude and manual modes (or note "deferred to phase-close UAT")
</output>
</content>
</invoke>