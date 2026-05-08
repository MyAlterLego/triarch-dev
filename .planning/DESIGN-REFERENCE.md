# v2.1 Design Reference

Visual style guide for v2.1 Pipeline UI surfaces. Subsequent phases (smart discuss + execution) MUST reference this file.

**Source:** Mike-provided dashboard screenshot (2026-05-08)

## Baseline (do not break)

The existing admin.triarch.dev color scheme stays intact:
- Background: zinc-950 / zinc-900 (cards)
- Borders: zinc-800 → zinc-700 (hover)
- Text: zinc-200 (primary), zinc-400 (secondary), zinc-500 (tertiary), zinc-600 (muted)
- Status tokens: teal (success/active), amber (warning/pending), red (error), blue (info), green (passing)
- Mono numerics: existing `font-mono` for versions, hashes, counts

## v2.1 additions — gradients

Apply purple→blue→teal gradient palette where it adds visual interest without breaking the baseline. Especially:

| Surface | Gradient treatment |
|---|---|
| Big KPI numbers (e.g., total counts on tiles) | `text-violet-400` or `bg-gradient-to-r from-violet-400 to-blue-400 bg-clip-text text-transparent` for the headline number |
| Donut/pie chart segments (entry-type breakdown, OS distribution) | Multi-stop gradient: `from-violet-500 via-blue-500 via-cyan-400 via-teal-400 via-emerald-400 via-amber-400 to-pink-400` — segments rendered as portions of the conic gradient |
| Horizontal bar charts (e.g., what-changed table type counts) | `bg-gradient-to-r from-blue-500 to-cyan-400` with rounded right edge `rounded-r-md` |
| Vertical bar charts (e.g., deploy frequency) | Per-category gradients: status-passing → green-400 to emerald-400; status-failing → red-400 to rose-400; neutral → zinc-500 to zinc-400; highlighted/today → violet-400 to blue-400 |
| Section headers | ALL CAPS, `text-xs font-semibold tracking-wider text-zinc-500`, drag-handle dots prefix `⋮⋮` (only if drag-rearrange ships, otherwise omit) |
| Card panels | `rounded-lg bg-zinc-900 border border-zinc-800 p-4` — preserves existing pattern |
| Active/in-flight elements (Promote button spinner, swap-in-flight badge) | Violet-400 spinner + `bg-violet-500/10 border-violet-500/30` halo |

## Anti-patterns

- Do NOT replace the existing teal/amber/red/blue status tokens with purple/blue equivalents — those tokens carry semantic meaning (teal=approved, amber=pending, red=conflict). Gradient additions are decorative, not semantic.
- Do NOT apply gradients to body text or interactive controls (buttons stay in flat zinc/teal/amber palette for affordance clarity).
- Do NOT introduce a sidebar redesign or new shell — admin layout stays as-is.
- Do NOT add gradient backgrounds to large surfaces (page bg, card bg) — keep dark/clean. Gradients are for accents only.

## Typography

- Existing: Inter for UI, JetBrains Mono / SF Mono for code/versions.
- Numerics: tabular (`tabular-nums`) on KPI counts and table cells.
- Section headers: ALL CAPS, `text-[10px]` to `text-xs`, `tracking-wider`.

## Phase 9 specific applications

- Pipeline page header: big violet-gradient prod/dev version display
- Branch RC list: status pills retain semantic color tokens
- "What's changed" table: type pills get gradient backgrounds (Bug fix → red-rose, Feature → teal-emerald, Other → zinc-mute)
- Promote button: default flat teal; in-flight gets violet-spinner halo

## Phase 14 specific applications

- "What's coming to prod" summary card on customer page: big violet-gradient count, gradient horizontal bars for type breakdown
- Filter chips: active chip gets gradient outline (violet-400 → blue-400)

## Reference (visual)

See screenshot in `.planning/design-reference-source.png` (if exported) — original from Mike's IMG_0660.PNG showing dark dashboard with violet headline numbers, multi-stop donut charts, blue-gradient horizontal bars, color-coded vertical bars on dark zinc-950 cards.
