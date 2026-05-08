# Stack Research — v2.1 Pipeline UI (Additions Only)

**Domain:** Internal admin UI — CI/CD pipeline visualization, bidirectional linkage, branch-swap control
**Researched:** 2026-05-07
**Confidence:** HIGH (existing stack confirmed from package.json; new additions verified via npm registry and official docs)

---

## Existing Stack (Validated — Do Not Re-Research)

Next.js 16.2.2, React 19.2.4, Tailwind v4, Drizzle ORM 0.45.2, NextAuth v4.24.13, pg 8.20.0, CockroachDB (PostgreSQL-compatible), Firebase App Hosting, @myalterlego/shared-ui ^1.2.0, Vitest 4.x + RTL + jsdom, lucide-react ^1.7.0, @myalterlego/secrets ^0.1.0, jose.

Existing client data-fetching pattern: `useState` + `useEffect` + `fetch()`. No SWR or polling library currently in the project.

---

## v2.1 Stack Additions

### New Dependencies

| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| `swr` | ^2.4.1 | Polling for branch-swap "in flight" status on client components | Already-established Vercel library; `refreshInterval` option replaces manual `setInterval` + cleanup; deduplicates concurrent calls; pauses on tab blur by default; fits the 5–10 second polling cadence needed for deploy status without SSE complexity |
| `compare-versions` | ^6.1.1 | Semver comparison for prod-vs-dev version diff (highlight which is ahead) | Zero dependencies, 1 KB, handles pre-release tags; no need to pull full `semver` package for simple gt/lt checks |

### No New Dependencies Needed

| Capability | Decision | Rationale |
|-----------|----------|-----------|
| Changelog/diff rendering | Roll own from `release_logs.entries[]` JSONB | The "diff" between dev and prod is a **data diff** (which entries appear in dev but not prod), not a code diff. `react-diff-view`, `react-diff-viewer`, and `diff2html` are all code diff renderers (git patch format). The correct approach: query two release log rows, compute `devEntries.filter(e => !prodEntries.find(match))` in a utility function, render with existing Tailwind classes and lucide icons. Zero library needed. |
| Commit-message ID parsing | Regex in a utility module | `conventional-commits-parser` (v6.4.0, 9.3M weekly downloads) is built for Conventional Commits format (`feat:`, `fix:`) — it does not natively handle `#BUG-123`, `closes FEAT-45`, or `fixes #99` without custom configuration. These three patterns are simple enough for a single 3-branch regex: `/(?:closes?|fixes?)\s+(?:#|(?:BUG|FEAT)-)(\d+)|#(BUG|FEAT)-(\d+)/gi`. A 15-line utility function is more maintainable than a library dependency for this scope. |
| Multi-select filter UI | Tailwind + React state, no library | `react-tailwindcss-select` is last-published 3 years ago with only 6 registry dependents — effectively unmaintained. Headless UI's Combobox requires a separate package. The existing `SlackAuditClient.tsx` already implements a working URL-mirrored filter pattern with `useState` + `useEffect`. The entry-type filter (bug fixes / feature releases / other) is a 3-option checkbox group — trivially done in 20 lines of Tailwind. Use the same pattern already in the codebase. |
| SSE for branch-swap status | Not viable on Firebase App Hosting | Firebase App Hosting has a 5-minute request timeout (confirmed at firebase.google.com/docs/app-hosting/product-comparison). Long-lived SSE connections would terminate at 5 min and require client reconnect logic. For a branch swap that completes in 30–120 seconds, SWR polling at `refreshInterval: 5000` is simpler, more reliable on Firebase infrastructure, and requires zero server-side streaming code. |
| WebSockets | Do not add | Same Firebase constraint. Overkill for unidirectional server-to-client status updates. |
| Redux / Zustand / Jotai | Do not add | All pipeline state is request-scoped or per-component. React Server Components handle static data; SWR handles live data. No shared cross-page state store is needed. |

---

## Polling Architecture for Branch-Swap Status

SWR with `refreshInterval` is the correct choice for the "branch swap in progress" UI. The flow:

1. Client POSTs to `/api/platform/projects/[slug]/swap-branch`
2. Response sets a `swapping: true` flag in local state
3. SWR polls `/api/platform/projects/[slug]/pipeline-status` every 5 seconds
4. When `swapState.status` transitions from `in_progress` → `complete` | `failed`, SWR stops (via conditional `refreshInterval: swapping ? 5000 : 0`)
5. Other RCs rendered as disabled during swap via the `swapState` value

This requires **no new Route Handler changes** beyond the pipeline-status endpoint that v2.1 would add anyway. SWR deduplicates if multiple components mount the same key.

---

## Regex Utility for Commit ID Parsing

The three patterns the spec calls out map to one regex:

```typescript
// src/lib/parse-commit-refs.ts
const REF_PATTERN =
  /(?:closes?|fixes?|resolves?)\s+(?:#|(?:BUG|FEAT)-)(\d+)|#(BUG|FEAT)-(\d+)/gi;

export function parseCommitRefs(message: string): string[] {
  const refs: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = REF_PATTERN.exec(message)) !== null) {
    const id = m[1] ?? m[3];
    const prefix = m[2] ?? m[4] ?? 'ISSUE';
    refs.push(`${prefix}-${id}`);
  }
  return refs;
}
```

Pattern covers: `#BUG-123`, `closes FEAT-45`, `fixes #99` (treated as bare numeric ref), `FEAT-12`, `BUG-88`. The `conventional-commits-parser` library is **not appropriate** because it expects `type(scope): description` format, not free-form issue references in message bodies.

---

## Version Comparison for Prod-vs-Dev Dashboard

`compare-versions` handles `gt(devVersion, prodVersion)` cleanly including pre-release tags. The existing stack has no semver utility — this is the only addition worth pulling in:

```typescript
import { gt, lt } from 'compare-versions';

const devAhead = gt(devVersion, prodVersion);   // true if dev is newer
const prodAhead = gt(prodVersion, devVersion);  // true if rollback scenario
```

Full `semver` package (the npm one) is 78 KB and designed for range resolution — not needed here.

---

## Changelog (Entries Diff) Rendering Pattern

The "what's changed between dev and prod" view is a **data diff**, not a patch diff. The correct implementation reads two `release_logs` rows and computes:

```typescript
// entries that exist in dev releases but not in the latest prod release
const newInDev = devEntries.filter(
  (e) => !prodEntries.some((p) => p.id === e.id || p.message === e.message)
);
```

Rendered with the existing `entry_type` badge pattern already used on the releases page (zinc/teal/amber/red). No diff library. A `<ChangesSinceProd>` server component handles this with a DB query — no client state needed for the read path.

---

## Installation

```bash
# New runtime dependencies only
npm install swr@^2.4.1 compare-versions@^6.1.1
```

No dev dependency additions needed.

---

## Alternatives Considered

| Our Choice | Alternative | Why Not |
|-----------|-------------|---------|
| SWR polling | SSE with EventSource | Firebase App Hosting 5-min timeout makes persistent SSE connections unreliable; polling at 5s interval is simpler and sufficient for 30–120 second swap operations |
| SWR polling | Manual `setInterval` in `useEffect` | SWR provides dedup, pause-on-blur, error retry, and cache — all for free vs. manual cleanup |
| Custom regex | `conventional-commits-parser` ^6.4.0 | Library targets Conventional Commits format; does not parse `#BUG-123` or `closes FEAT-45` without non-trivial custom configuration that would be harder to maintain than the regex |
| Custom Tailwind filter | `react-tailwindcss-select` | 3-year-old package, 6 dependents, effectively abandoned; a 3-option checkbox group doesn't justify a dependency |
| Roll own entries diff | `react-diff-view`, `diff2html` | These render git patch format (unified diff); the entries[] field is structured JSON, not text — wrong tool entirely |
| `compare-versions` | `semver` (npm) | `semver` is 78 KB optimized for range resolution; `compare-versions` is ~1 KB and does exactly gt/lt/eq — no range resolution needed |

---

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `react-diff-view` / `react-diff-viewer` | Renders git patch format, not JSONB entry arrays | Custom `<ChangesSinceProd>` component over entries[] |
| `conventional-commits-parser` | Designed for `type(scope):` format, not `#BUG-123` / `closes FEAT-45` | `parse-commit-refs.ts` utility with single regex |
| WebSockets | Firebase App Hosting timeout constraint; bidirectional not needed | SWR polling |
| SSE / EventSource | 5-min Firebase App Hosting timeout; reconnect complexity | SWR polling at 5s |
| Redux / Zustand / Jotai | No cross-page shared mutable state needed | React Server Components for static, SWR for live |
| `react-tailwindcss-select` | Abandoned (3 yrs, 6 dependents), Tailwind v4 compatibility unverified | Inline checkbox filter with existing Tailwind pattern |
| `shadcn/ui` | Project uses `@myalterlego/shared-ui`; adding shadcn creates parallel UI systems | Extend shared-ui or write inline Tailwind |

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `swr@^2.4.1` | React 19.2.4, Next.js 16.2.2 | SWR 2.x supports React 18+; React 19 compatible confirmed via Vercel/SWR release notes |
| `compare-versions@^6.1.1` | TypeScript 5, Node 20 | Pure ESM/CJS; no peer dependencies |

---

## Sources

- npm registry — `swr@2.4.1` (2002 dependents, last published 2 months ago)
- npm registry — `compare-versions@6.1.1` (zero dependencies, MIT)
- npm registry — `conventional-commits-parser@6.4.0` (9.3M weekly downloads — popular but wrong tool for this use case)
- npm registry — `react-tailwindcss-select@1.8.5` (6 dependents, last published 3 years ago — rejected)
- firebase.google.com/docs/app-hosting/product-comparison — App Hosting request timeout: 5 minutes (confirmed; separate from Firebase Hosting's 1-minute limit)
- package.json audit — existing codebase uses `useState`/`useEffect`/`fetch()` only; no SWR currently
- schema.ts audit — `release_logs.entries` is JSONB array of structured objects, not text diff format

---
*Stack additions research for: v2.1 Pipeline UI (Triarch Dev Admin)*
*Researched: 2026-05-07*
