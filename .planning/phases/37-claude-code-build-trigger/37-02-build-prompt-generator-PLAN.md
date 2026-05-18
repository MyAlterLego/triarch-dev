---
phase: 37-claude-code-build-trigger
plan: 02
type: tdd
wave: 2
depends_on: [37-01]
files_modified:
  - src/lib/build-prompt.ts
  - src/lib/build-prompt.test.ts
autonomous: true
requirements: [TRIG-01]
must_haves:
  truths:
    - "Calling buildPrompt({project, items}) returns a non-empty string"
    - "Output is valid Markdown with a YAML frontmatter block containing project, version, items fields"
    - "Output contains one section per locked structure: Context, Approved Items, Approach, Guardrails"
    - "Each approved item appears with its REQ-ID (id), type (bug|feature), title, description, and acceptance_criteria block"
    - "When item.buildPlan is non-null jsonb, acceptance_criteria is derived from it; when null, derived from description (single-bullet fallback)"
    - "Project context block contains project.name, project.currentVersion, project.githubRepo, project.deployedUrl, and the literal '@./CLAUDE.md' reference (NOT inlined)"
    - "Guardrails block is fixed boilerplate containing the four required clauses (run /gsd:plan-phase, do not exceed scope, use existing patterns, bump version + open PR per CLAUDE.md)"
    - "buildPrompt is a PURE function — no fs, no fetch, no db — given equal inputs it returns equal output (deterministic)"
    - "When items array is empty, function THROWS Error('build-prompt: no approved items') — should never be called with 0 items (button is disabled)"
    - "Vitest coverage: >= 12 test cases covering shape, frontmatter parse, per-item rendering, buildPlan vs description fallback, empty/edge cases, determinism"
  artifacts:
    - path: "src/lib/build-prompt.ts"
      provides: "Pure-function generator: buildPrompt({project, items}) → string"
      exports: ["buildPrompt", "type BuildPromptInput", "type BuildPromptItem", "type BuildPromptProject"]
    - path: "src/lib/build-prompt.test.ts"
      provides: "Vitest coverage for buildPrompt (RED → GREEN cycle; >= 12 tests)"
      contains: "describe"
  key_links:
    - from: "src/lib/build-prompt.ts"
      to: "type BuildPromptInput"
      via: "exported input contract consumed by 37-03 generate-build API"
      pattern: "export (type|interface) BuildPromptInput"
    - from: "src/lib/build-prompt.test.ts"
      to: "src/lib/build-prompt.ts"
      via: "import { buildPrompt } from './build-prompt'"
      pattern: "from './build-prompt'"
---

<objective>
Ship the TRIG-01 build-prompt generator as a pure function with full TDD coverage. `src/lib/build-prompt.ts` accepts a project-context object + array of approved bug/feature items, returns a single Markdown string with YAML frontmatter that downstream `/gsd:plan-phase` can consume in a fresh Claude Code session. No I/O — given equal inputs, equal output (deterministic). This is the contract-defining plan in Wave 2: 37-03 (generate-build API) and 37-05 (Generate Build modal preview) both call `buildPrompt(...)` and rely on its exported types.

Purpose: Establish the prompt-generation primitive ahead of the API endpoint and UI plans. TDD chosen because buildPrompt is a textbook TDD candidate — explicit I/O contract, no side effects, behaviour is enumerable via test cases.
Output: src/lib/build-prompt.ts (pure function + 3 exported types) + src/lib/build-prompt.test.ts (>= 12 RED→GREEN cases). Importable from 37-03 and 37-05.
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
@src/lib/inclusion-state.test.ts
@src/lib/commit-parser.ts
@packages/triarch-shared/src/schema.ts

<interfaces>
<!-- Key types and contracts executors will use. Extracted from codebase. -->

From packages/triarch-shared/src/schema.ts — bugReports table (line ~305) and featureRequests table (line ~332):
```typescript
// bugReports key columns (subset relevant to build-prompt):
//   id: uuid
//   project: varchar(64)
//   title: varchar(512)
//   description: text
//   severity: varchar(16)
//   inclusionState: varchar(32)  // we filter to 'approved_for_build' upstream

// featureRequests key columns (subset relevant to build-prompt):
//   id: uuid
//   project: varchar(64)
//   title: varchar(512)
//   description: text
//   buildPlan: jsonb  // ← key field per CONTEXT.md "Per-item structure": derive acceptance_criteria from this when present
//   inclusionState: varchar(32)
```

From packages/triarch-shared/src/schema.ts — projects table fields the prompt embeds:
```typescript
// projects subset relevant to project-context block:
//   key: varchar(64)
//   name: varchar(256)
//   currentVersion: varchar(32)
//   githubRepo: varchar(256)
//   deployedUrl: varchar(512)
//   localPath: varchar(512)  // ← NEW from 37-01 (optional in this plan; consumed by 37-05 deep-link cwd, NOT by build-prompt body)
```

Locked output shape (from CONTEXT.md Decisions block "Build Prompt Generator (TRIG-01)"):
1. YAML frontmatter: `project`, `version`, `items` (array of {id, type})
2. Section: `## Context` — project.name, currentVersion, githubRepo, deployedUrl, plus literal `@./CLAUDE.md` reference (CONTEXT.md says: "reference to ./CLAUDE.md (do NOT inline content; Claude Code reads it fresh in the new session)")
3. Section: `## Approved Items` — per-item: id (REQ-ID + uuid), type (bug|feature), title, description (FULL), acceptance_criteria block (from buildPlan jsonb if present, else single-bullet from description)
4. Section: `## Approach` — fixed boilerplate: "Run `/gsd:plan-phase NEXT`"
5. Section: `## Guardrails` — fixed boilerplate, exactly these 4 bullets:
   - "Do NOT exceed scope of the listed items"
   - "Use existing patterns (read CLAUDE.md + existing files first)"
   - "Bump version + open PR per CLAUDE.md workflow"
   - "One change at a time when debugging — isolate, verify, proceed"

Input contract (locked):
```typescript
export interface BuildPromptProject {
  key: string;             // e.g. 'tmi'
  name: string;            // e.g. 'TMI Engine'
  currentVersion: string | null;
  githubRepo: string | null;     // e.g. 'triarchsecurity/tmi'
  deployedUrl: string | null;    // e.g. 'https://tmi.triarch.dev'
}
export interface BuildPromptItem {
  id: string;              // bug/feature row uuid
  type: 'bug' | 'feature';
  title: string;
  description: string;
  buildPlan: unknown | null;  // jsonb; if non-null and has shape {acceptance_criteria: string[]}, use it
  severity?: string | null;   // bugs only; rendered in description block when present
}
export interface BuildPromptInput {
  project: BuildPromptProject;
  items: BuildPromptItem[];   // must be length >= 1
}
export function buildPrompt(input: BuildPromptInput): string;
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: TDD src/lib/build-prompt.ts pure-function generator (RED → GREEN with >= 12 test cases)</name>
  <files>src/lib/build-prompt.ts, src/lib/build-prompt.test.ts</files>
  <read_first>
    - .planning/phases/37-claude-code-build-trigger/37-CONTEXT.md (Decisions: Build Prompt Generator — locked output shape, locked guardrails text)
    - src/lib/inclusion-state.test.ts (golden Vitest pattern for pure-function modules — describe/it/expect; no mocks)
    - src/lib/commit-parser.ts (any existing prompt-shaping pattern in the codebase; reference only — buildPrompt is novel)
    - packages/triarch-shared/src/schema.ts (bugReports + featureRequests + projects column types — see <interfaces> block above for the subset)
  </read_first>
  <behavior>
    - Test 1 (shape): buildPrompt returns a string starting with "---\n" (YAML frontmatter delimiter)
    - Test 2 (frontmatter parse): The frontmatter block (between the two "---\n" lines) parses as YAML containing keys: project, version, items
    - Test 3 (frontmatter project): frontmatter.project === input.project.key (e.g. 'tmi')
    - Test 4 (frontmatter version): frontmatter.version === input.project.currentVersion ?? 'unknown'
    - Test 5 (frontmatter items): frontmatter.items is an array with length === input.items.length; each entry has {id, type}
    - Test 6 (sections present): Output contains the four Markdown section headers in order: "## Context", "## Approved Items", "## Approach", "## Guardrails"
    - Test 7 (context block): "## Context" section contains project.name, project.currentVersion ?? 'unknown', project.githubRepo (when non-null), project.deployedUrl (when non-null), AND the literal string "@./CLAUDE.md" (CONTEXT.md decision: reference, do NOT inline)
    - Test 8 (per-item rendering, bug): A bug item with title="Login broken" + description="Users cannot log in" + severity="high" appears as a Markdown subsection with id, type=bug, title, full description, severity
    - Test 9 (per-item rendering, feature with buildPlan): A feature with buildPlan = {acceptance_criteria: ["A1", "A2"]} renders an acceptance_criteria block listing those two bullets
    - Test 10 (per-item rendering, feature without buildPlan): A feature with buildPlan=null renders a single-bullet acceptance_criteria derived from description (fallback)
    - Test 11 (per-item rendering, feature with buildPlan but no acceptance_criteria key): falls back to single-bullet from description (defensive — buildPlan jsonb shape is not enforced by schema)
    - Test 12 (guardrails): "## Guardrails" section contains all 4 exact bullet strings locked in CONTEXT.md (and listed in <interfaces> above)
    - Test 13 (approach): "## Approach" section contains the literal "/gsd:plan-phase" text
    - Test 14 (empty items throws): buildPrompt({project, items: []}) throws Error with message containing "no approved items"
    - Test 15 (determinism): Calling buildPrompt with the same input twice returns byte-identical strings (no Date.now(), Math.random(), iteration-order dependence, etc.)
  </behavior>
  <action>
    1. WRITE TEST FIRST (RED): create `src/lib/build-prompt.test.ts` matching the Vitest pattern in `src/lib/inclusion-state.test.ts` (describe/it; no mocks):
    ```typescript
    import { describe, it, expect } from 'vitest';
    import { parse as parseYaml } from 'yaml';
    import { buildPrompt, type BuildPromptInput, type BuildPromptProject, type BuildPromptItem } from './build-prompt';

    const project: BuildPromptProject = {
      key: 'tmi',
      name: 'TMI Engine',
      currentVersion: '4.46.1',
      githubRepo: 'triarchsecurity/tmi',
      deployedUrl: 'https://tmi.triarch.dev',
    };
    const bug: BuildPromptItem = {
      id: 'bug-uuid-1',
      type: 'bug',
      title: 'Login broken',
      description: 'Users cannot log in after Phase 32 deploy',
      buildPlan: null,
      severity: 'high',
    };
    const featureWithPlan: BuildPromptItem = {
      id: 'feat-uuid-1',
      type: 'feature',
      title: 'Dark mode',
      description: 'Add dark mode toggle to settings',
      buildPlan: { acceptance_criteria: ['Toggle visible in settings', 'Persists across reloads'] },
    };
    const featureNoPlan: BuildPromptItem = {
      id: 'feat-uuid-2',
      type: 'feature',
      title: 'Export CSV',
      description: 'Allow CSV export from reports page',
      buildPlan: null,
    };
    const featureBadPlan: BuildPromptItem = {
      id: 'feat-uuid-3',
      type: 'feature',
      title: 'Webhooks',
      description: 'Outbound webhooks for releases',
      buildPlan: { something_else: 'not the right shape' },
    };

    function frontmatterOf(output: string): Record<string, unknown> {
      const match = output.match(/^---\n([\s\S]*?)\n---/);
      if (!match) throw new Error('no frontmatter');
      return parseYaml(match[1]) as Record<string, unknown>;
    }

    describe('buildPrompt — shape', () => {
      it('returns a string starting with frontmatter delimiter', () => {
        const out = buildPrompt({ project, items: [bug] });
        expect(out.startsWith('---\n')).toBe(true);
      });
      it('frontmatter parses as YAML with project, version, items keys', () => {
        const fm = frontmatterOf(buildPrompt({ project, items: [bug, featureWithPlan] }));
        expect(fm.project).toBe('tmi');
        expect(fm.version).toBe('4.46.1');
        expect(Array.isArray(fm.items)).toBe(true);
        expect((fm.items as unknown[]).length).toBe(2);
      });
      it("frontmatter version is 'unknown' when project.currentVersion is null", () => {
        const fm = frontmatterOf(buildPrompt({ project: { ...project, currentVersion: null }, items: [bug] }));
        expect(fm.version).toBe('unknown');
      });
      it('frontmatter items each have {id, type}', () => {
        const fm = frontmatterOf(buildPrompt({ project, items: [bug, featureWithPlan] }));
        const items = fm.items as Array<{ id: string; type: string }>;
        expect(items[0]).toMatchObject({ id: 'bug-uuid-1', type: 'bug' });
        expect(items[1]).toMatchObject({ id: 'feat-uuid-1', type: 'feature' });
      });
    });

    describe('buildPrompt — sections', () => {
      it('contains all 4 section headers in order: Context, Approved Items, Approach, Guardrails', () => {
        const out = buildPrompt({ project, items: [bug] });
        const ctx = out.indexOf('## Context');
        const items = out.indexOf('## Approved Items');
        const appr = out.indexOf('## Approach');
        const guard = out.indexOf('## Guardrails');
        expect(ctx).toBeGreaterThan(-1);
        expect(items).toBeGreaterThan(ctx);
        expect(appr).toBeGreaterThan(items);
        expect(guard).toBeGreaterThan(appr);
      });
      it('Context block contains project.name, version, githubRepo, deployedUrl, and @./CLAUDE.md reference (not inlined)', () => {
        const out = buildPrompt({ project, items: [bug] });
        expect(out).toContain('TMI Engine');
        expect(out).toContain('4.46.1');
        expect(out).toContain('triarchsecurity/tmi');
        expect(out).toContain('https://tmi.triarch.dev');
        expect(out).toContain('@./CLAUDE.md');
        // ANTI-pattern guard: must NOT inline CLAUDE.md content
        expect(out).not.toContain('Workspace Rules');  // text from /Users/mikegeehan/claude/CLAUDE.md heading
      });
      it('Approach section contains /gsd:plan-phase literal', () => {
        const out = buildPrompt({ project, items: [bug] });
        const approachStart = out.indexOf('## Approach');
        const guardrailsStart = out.indexOf('## Guardrails');
        const approach = out.slice(approachStart, guardrailsStart);
        expect(approach).toContain('/gsd:plan-phase');
      });
      it('Guardrails section contains all 4 locked bullets', () => {
        const out = buildPrompt({ project, items: [bug] });
        expect(out).toContain('Do NOT exceed scope of the listed items');
        expect(out).toContain('Use existing patterns (read CLAUDE.md + existing files first)');
        expect(out).toContain('Bump version + open PR per CLAUDE.md workflow');
        expect(out).toContain('One change at a time when debugging — isolate, verify, proceed');
      });
    });

    describe('buildPrompt — per-item rendering', () => {
      it('renders bug with id, type, title, full description, severity', () => {
        const out = buildPrompt({ project, items: [bug] });
        expect(out).toContain('bug-uuid-1');
        expect(out).toContain('Login broken');
        expect(out).toContain('Users cannot log in after Phase 32 deploy');
        expect(out).toContain('high');
      });
      it('renders feature with buildPlan.acceptance_criteria as bullets', () => {
        const out = buildPrompt({ project, items: [featureWithPlan] });
        expect(out).toContain('Toggle visible in settings');
        expect(out).toContain('Persists across reloads');
      });
      it('renders feature without buildPlan with single-bullet acceptance derived from description', () => {
        const out = buildPrompt({ project, items: [featureNoPlan] });
        // Description content should appear as the fallback acceptance bullet
        expect(out).toContain('Allow CSV export from reports page');
      });
      it('renders feature with non-conforming buildPlan shape falls back to description', () => {
        const out = buildPrompt({ project, items: [featureBadPlan] });
        expect(out).toContain('Outbound webhooks for releases');
        // Must NOT serialize the random buildPlan keys as acceptance bullets
        expect(out).not.toContain('something_else');
      });
    });

    describe('buildPrompt — edge cases + determinism', () => {
      it('throws when items is empty', () => {
        expect(() => buildPrompt({ project, items: [] })).toThrow(/no approved items/);
      });
      it('is deterministic — same input twice = byte-identical output', () => {
        const a = buildPrompt({ project, items: [bug, featureWithPlan] });
        const b = buildPrompt({ project, items: [bug, featureWithPlan] });
        expect(a).toBe(b);
      });
    });
    ```

    2. Run `npx vitest run src/lib/build-prompt.test.ts` — MUST FAIL with "Cannot find module './build-prompt'" (RED phase).

    3. WRITE IMPLEMENTATION (GREEN): create `src/lib/build-prompt.ts`:
    ```typescript
    /**
     * build-prompt.ts
     *
     * Pure-function generator for TRIG-01 — given a project + approved items, produces a
     * GSD-compatible Claude Code prompt as a single Markdown string with YAML frontmatter.
     * No I/O; deterministic; throws on empty items (button should be disabled when 0 items).
     *
     * CONTEXT.md locked output shape:
     *   - YAML frontmatter: project, version, items[]
     *   - Sections in order: Context / Approved Items / Approach / Guardrails
     *   - Per-item: id + type + title + full description + acceptance_criteria (buildPlan or fallback)
     *   - Project context: NAMES the project, REFERENCES ./CLAUDE.md (does NOT inline content)
     *   - Guardrails: fixed boilerplate (4 bullets), never customized per-build
     */

    import { stringify as stringifyYaml } from 'yaml';

    export interface BuildPromptProject {
      key: string;
      name: string;
      currentVersion: string | null;
      githubRepo: string | null;
      deployedUrl: string | null;
    }

    export interface BuildPromptItem {
      id: string;
      type: 'bug' | 'feature';
      title: string;
      description: string;
      buildPlan: unknown | null;
      severity?: string | null;
    }

    export interface BuildPromptInput {
      project: BuildPromptProject;
      items: BuildPromptItem[];
    }

    function extractAcceptanceCriteria(item: BuildPromptItem): string[] {
      const bp = item.buildPlan;
      if (
        bp &&
        typeof bp === 'object' &&
        'acceptance_criteria' in bp &&
        Array.isArray((bp as { acceptance_criteria: unknown }).acceptance_criteria)
      ) {
        const list = (bp as { acceptance_criteria: unknown[] }).acceptance_criteria;
        const strings = list.filter((v): v is string => typeof v === 'string');
        if (strings.length > 0) return strings;
      }
      // Fallback: single bullet derived from description.
      return [item.description];
    }

    function renderItem(item: BuildPromptItem): string {
      const lines: string[] = [];
      lines.push(`### ${item.type.toUpperCase()}: ${item.title}`);
      lines.push('');
      lines.push(`- **id:** \`${item.id}\``);
      lines.push(`- **type:** ${item.type}`);
      if (item.severity) lines.push(`- **severity:** ${item.severity}`);
      lines.push('');
      lines.push(`**Description:**`);
      lines.push('');
      lines.push(item.description);
      lines.push('');
      lines.push(`**Acceptance criteria:**`);
      lines.push('');
      for (const c of extractAcceptanceCriteria(item)) {
        lines.push(`- ${c}`);
      }
      lines.push('');
      return lines.join('\n');
    }

    export function buildPrompt(input: BuildPromptInput): string {
      if (input.items.length === 0) {
        throw new Error('build-prompt: no approved items');
      }

      const frontmatter = stringifyYaml({
        project: input.project.key,
        version: input.project.currentVersion ?? 'unknown',
        items: input.items.map((i) => ({ id: i.id, type: i.type })),
      });

      const parts: string[] = [];
      parts.push('---');
      parts.push(frontmatter.trimEnd());
      parts.push('---');
      parts.push('');

      // ── Context ──
      parts.push('## Context');
      parts.push('');
      parts.push(`Project: **${input.project.name}** (\`${input.project.key}\`)`);
      parts.push(`Current version: \`${input.project.currentVersion ?? 'unknown'}\``);
      if (input.project.githubRepo) parts.push(`Repo: \`${input.project.githubRepo}\``);
      if (input.project.deployedUrl) parts.push(`Deployed: ${input.project.deployedUrl}`);
      parts.push('');
      parts.push('Read project conventions: @./CLAUDE.md');
      parts.push('');

      // ── Approved Items ──
      parts.push('## Approved Items');
      parts.push('');
      for (const item of input.items) {
        parts.push(renderItem(item));
      }

      // ── Approach ──
      parts.push('## Approach');
      parts.push('');
      parts.push('Run `/gsd:plan-phase NEXT` then `/gsd:execute-phase NEXT` once the plan is approved.');
      parts.push('');

      // ── Guardrails ──
      parts.push('## Guardrails');
      parts.push('');
      parts.push('- Do NOT exceed scope of the listed items');
      parts.push('- Use existing patterns (read CLAUDE.md + existing files first)');
      parts.push('- Bump version + open PR per CLAUDE.md workflow');
      parts.push('- One change at a time when debugging — isolate, verify, proceed');
      parts.push('');

      return parts.join('\n');
    }
    ```

    4. Verify `yaml` is already installed: `grep '"yaml"' package.json` — if missing, install via `npm install yaml` (yaml is a tiny, transitive of drizzle-kit and likely already present; only run npm install if grep returns nothing).

    5. Run `npx vitest run src/lib/build-prompt.test.ts` — MUST PASS (GREEN phase). All >= 12 tests green.

    6. (REFACTOR — only if needed) If any test fails, fix the implementation. Do NOT touch the tests to make them pass.
  </action>
  <verify>
    <automated>npx vitest run src/lib/build-prompt.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - File `src/lib/build-prompt.ts` exists and exports `buildPrompt`, `BuildPromptInput`, `BuildPromptProject`, `BuildPromptItem`
    - File `src/lib/build-prompt.test.ts` exists
    - `npx vitest run src/lib/build-prompt.test.ts` reports 0 failures, >= 12 passing tests
    - `grep -c "^export function buildPrompt" src/lib/build-prompt.ts` returns 1
    - `grep -c "export interface BuildPromptInput" src/lib/build-prompt.ts` returns 1
    - `grep -c "throw new Error('build-prompt: no approved items')" src/lib/build-prompt.ts` returns 1 (empty-items guard)
    - `grep -c "@./CLAUDE.md" src/lib/build-prompt.ts` returns >= 1 (reference, not inline)
    - No `Date.now()`, `Math.random()`, or `new Date()` in src/lib/build-prompt.ts (deterministic — verifiable: `grep -cE "Date\.now|Math\.random|new Date" src/lib/build-prompt.ts` returns 0)
  </acceptance_criteria>
  <done>Pure-function buildPrompt generator shipped with >= 12 RED→GREEN tests covering shape, frontmatter, sections, per-item rendering (with/without buildPlan), edge cases, determinism. Importable as `import { buildPrompt, type BuildPromptInput } from '@/lib/build-prompt'` by 37-03 and 37-05.</done>
</task>

</tasks>

<verification>
- `npx vitest run src/lib/build-prompt.test.ts` exits 0 with >= 12 passing tests
- `tsc --noEmit` clean across src/lib/build-prompt.ts (verifiable: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -c "build-prompt"` returns 0)
- The exported types form a stable contract for 37-03 (generate-build API) and 37-05 (modal preview)
- Output is deterministic (same input → byte-identical output; covered by Test 15)
- CLAUDE.md is REFERENCED via `@./CLAUDE.md` and never inlined (CONTEXT.md decision; covered by Test 7)
</verification>

<success_criteria>
- 37-03 can `import { buildPrompt, type BuildPromptInput, type BuildPromptProject, type BuildPromptItem } from '@/lib/build-prompt'` and call it from the POST endpoint
- 37-05 can `import { buildPrompt } from '@/lib/build-prompt'` to render the modal preview client-side (pure function, no SSR concern)
- When TMI pilot runs the full flow (manual UAT in Phase 37 close), the generated prompt successfully drives a Claude Code session through `/gsd:plan-phase` (success criterion from ROADMAP)
</success_criteria>

<output>
After completion, create `.planning/phases/37-claude-code-build-trigger/37-02-build-prompt-generator-SUMMARY.md` documenting:
- Final exported type signatures (any deviations from the locked interface in <interfaces>)
- Test count (target >= 12)
- Any non-trivial implementation decisions during GREEN (e.g., yaml library quirks, JSON shape edge cases in buildPlan)
- One sample output for a 1-bug + 1-feature input (paste full string) so downstream plans can eyeball-verify shape
</output>
</content>
</invoke>