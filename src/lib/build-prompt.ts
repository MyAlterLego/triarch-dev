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
