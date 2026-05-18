import { describe, it, expect } from 'vitest';
import { parse as parseYaml } from 'yaml';
import {
  buildPrompt,
  type BuildPromptInput,
  type BuildPromptProject,
  type BuildPromptItem,
} from './build-prompt';

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
    const fm = frontmatterOf(
      buildPrompt({ project: { ...project, currentVersion: null }, items: [bug] }),
    );
    expect(fm.version).toBe('unknown');
  });

  it('frontmatter items each have {id, type} preserving input order', () => {
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
    expect(out).not.toContain('Workspace Rules');
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
    expect(out).toContain('Allow CSV export from reports page');
  });

  it('renders feature with non-conforming buildPlan shape falls back to description', () => {
    const out = buildPrompt({ project, items: [featureBadPlan] });
    expect(out).toContain('Outbound webhooks for releases');
    // Must NOT serialize the random buildPlan keys as acceptance bullets
    expect(out).not.toContain('something_else');
  });

  it('omits severity field when not present (feature items)', () => {
    const out = buildPrompt({ project, items: [featureNoPlan] });
    // No bare "severity:" label rendered for items without severity
    expect(out).not.toMatch(/\*\*severity:\*\*/);
  });

  it('renders multiple items in order (bug then feature)', () => {
    const out = buildPrompt({ project, items: [bug, featureWithPlan] });
    const bugIdx = out.indexOf('bug-uuid-1');
    const featIdx = out.indexOf('feat-uuid-1');
    expect(bugIdx).toBeGreaterThan(-1);
    expect(featIdx).toBeGreaterThan(bugIdx);
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

  it('handles project with null githubRepo and deployedUrl gracefully', () => {
    const out = buildPrompt({
      project: { ...project, githubRepo: null, deployedUrl: null },
      items: [bug],
    });
    expect(out).toContain('TMI Engine');
    // Optional fields are simply omitted, not rendered as 'null'
    expect(out).not.toContain('null');
  });

  it('handles titles/descriptions containing YAML-special characters without breaking frontmatter', () => {
    const tricky: BuildPromptItem = {
      id: 'bug-uuid-2',
      type: 'bug',
      title: 'Quotes: "broken" & yaml: chars',
      description: 'Has colons: and #hash and - dashes',
      buildPlan: null,
      severity: 'low',
    };
    const out = buildPrompt({ project, items: [tricky] });
    // Frontmatter must still parse — body content does not leak into frontmatter
    const fm = frontmatterOf(out);
    expect(fm.project).toBe('tmi');
    expect((fm.items as Array<{ id: string }>)[0].id).toBe('bug-uuid-2');
    // Body still contains the tricky strings
    expect(out).toContain('Has colons: and #hash and - dashes');
  });
});
