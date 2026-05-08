---
phase: 13-branch-preview-swap
plan: "01"
subsystem: fah-rollout-lib
tags: [fah, firebase-app-hosting, jose, jwt, oauth2, swr, tdd, rest-client]
dependency_graph:
  requires: []
  provides: [fah-rollout-lib]
  affects: [13-02-api-routes, 13-03-client-island]
tech_stack:
  added: [jose@^5, swr@^2.4.1]
  patterns: [JWT-SA-auth, module-level-token-cache, single-flight-latch, structured-error-returns, branch-regex-guard]
key_files:
  created:
    - src/lib/fah-rollout.ts
    - src/lib/fah-rollout.test.ts
  modified:
    - package.json
    - package-lock.json
decisions:
  - jose v5 as direct dep alongside next-auth's transitive jose v4: npm hoists both; admin's direct import gets v5, next-auth keeps v4
  - Branch regex /^[a-zA-Z0-9/_.\-]{1,256}$/ chosen to allow all valid git branch chars while blocking semicolons, spaces, and shell metacharacters
  - @vitest-environment node annotation added to test file — jose v5 uses TextEncoder/Web Crypto internally; jsdom environment does not provide TextEncoder, causing "payload must be an instance of Uint8Array" at JWT sign time
  - No dispatchRollout wrapper exported — surface intentionally minimal (3 funcs + reset)
metrics:
  duration_minutes: 2
  completed_date: "2026-05-08"
  tasks_completed: 1
  files_changed: 4
---

# Phase 13 Plan 01: FAH Rollout Lib (TDD) Summary

**One-liner:** FAH REST client with RS256 JWT SA auth via jose, 50-min module-level token cache + single-flight latch, branch regex security guard, and fully tested structured error returns.

## Exported Function Signatures (for 13-02 to import without re-reading the lib)

```typescript
import {
  mintFahAccessToken,
  createFahRollout,
  getFahRolloutState,
  resetTokenCacheForTests,
} from '@/lib/fah-rollout';

// Types:
type CreateFahRolloutInput = {
  projectId: string;   // e.g. 'triarch-dev-tmi'
  location: string;    // e.g. 'us-central1'
  backendId: string;   // e.g. 'tmi-dev'
  branch: string;      // git branch — validated against /^[a-zA-Z0-9/_.\-]{1,256}$/
};
type CreateFahRolloutResult =
  | { ok: true; rolloutName: string; state: string }
  | { ok: false; error: string; status?: number };

type FahRolloutState = 'PENDING' | 'BUILDING' | 'DEPLOYING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED' | string;
type GetFahRolloutStateResult =
  | { ok: true; state: FahRolloutState; buildState?: string; errorMessage?: string }
  | { ok: false; error: string; status?: number };

async function mintFahAccessToken(): Promise<string>
async function createFahRollout(input: CreateFahRolloutInput): Promise<CreateFahRolloutResult>
async function getFahRolloutState(rolloutResourcePath: string): Promise<GetFahRolloutStateResult>
function resetTokenCacheForTests(): void
```

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 (RED) | TDD — failing fah-rollout tests | 8dcfc7f | src/lib/fah-rollout.test.ts |
| 1 (GREEN) | Implement fah-rollout + deps | 2ad4441 | src/lib/fah-rollout.ts, package.json, package-lock.json, fah-rollout.test.ts (env annotation) |

## Test Coverage (17 tests, all passing)

**mintFahAccessToken:**
- Happy path: JWT minted and exchanged for access_token
- Cache hit: second call within 50 min returns cached, no re-fetch
- Cache expiry: call after 51 min re-mints fresh token
- Single-flight latch: two concurrent calls share exactly one fetch
- getSecret throws: descriptive `[fah-rollout] missing FAH_PROMOTER_SA_KEY` error
- Token endpoint non-2xx: throws with status + body, no JWT in error string
- PEM normalization: literal `\\n` sequences converted to real newlines

**createFahRollout:**
- Happy path: POST to correct FAH URL, Authorization header, request body shape verified
- 4xx error: returns `{ ok: false, error, status }` without throwing
- invalid_branch (semicolon/space): returns `{ ok: false, error: 'invalid_branch' }`, fetch NOT called
- Valid branch with slashes/dots/hyphens/underscores: passes regex

**getFahRolloutState:**
- PENDING state
- SUCCEEDED state with buildState
- FAILED state with buildState + errorMessage
- 4xx error: returns `{ ok: false, error, status }`
- Invalid path (not `projects/`): returns `{ ok: false, error: 'invalid_path' }`, fetch NOT called

## Key Decisions

### jose v5 vs v4 Coexistence

admin previously had jose only as a transitive dep of next-auth at v4.24.13. This plan adds `jose@^5` as a direct dep. npm installs both side-by-side under `node_modules`:

- `node_modules/jose` → v5.10.0 (used by fah-rollout.ts and any future direct imports)
- `node_modules/next-auth/node_modules/jose` → next-auth's own resolution of v4 (unchanged)

No API conflict — v5's `SignJWT`/`importPKCS8` use the same call signature documented in PLAN.md.

### Branch Regex Character Class

`/^[a-zA-Z0-9/_.\-]{1,256}$/` — allows:
- Alphanumerics (standard identifiers)
- `/` (git branch path separators, e.g. `feat/audio`)
- `_` (underscores, common in slugs)
- `.` (dots, e.g. version labels in branch names)
- `-` (hyphens, e.g. `feat/audio-v2`)
- Max 256 chars (matches FAH API limit)

Blocks: spaces, semicolons, backticks, `$`, `(`, `)`, `|`, `>`, `<`, `&`, `*`, `?`, `!`, `#`, `%`, `@`, `^`, `~`, `+`, `=`, brackets. Prevents shell injection when this value reaches FAH REST API.

### jsdom vs node Vitest Environment

jose v5 uses `TextEncoder` (Web Crypto API) internally for JWT payload encoding. jsdom does not provide `TextEncoder`. The fix is the `// @vitest-environment node` file-level comment on the test file. This is the correct approach for server-side lib tests — no need for jsdom DOM APIs here.

The global vitest config (`vitest.config.ts`) keeps `jsdom` as default for React component tests. Only fah-rollout.test.ts opts into `node` env.

## FAH REST Quirks for 13-02

1. **Endpoint path:** `https://firebaseapphosting.googleapis.com/v1beta/projects/{projectId}/locations/{location}/backends/{backendId}/rollouts` — must include `v1beta` path segment; the v1 stable endpoint does not exist yet.

2. **Rollout name is the full resource path:** `projects/{projectId}/locations/{location}/backends/{backendId}/rollouts/{rolloutId}` — this is what `rolloutName` in `CreateFahRolloutResult` contains. 13-02 must persist this path and pass it verbatim to `getFahRolloutState()`.

3. **GET state endpoint:** `GET ${FAH_API_BASE}/${rolloutResourcePath}` — the resource path already includes `projects/...` so it's appended directly after `v1beta/`.

4. **Initial state from create:** always `PENDING`. Poll with `getFahRolloutState` to track progress.

5. **build.errorMessage field:** present on FAILED rollouts in the build object. Absent on PENDING/BUILDING/SUCCEEDED — use optional chaining (`data.build?.errorMessage`).

## Token Cache Pattern (mirrors github-app.ts)

```
cached: { token: string; expiresAt: number } | null
inflight: Promise<string> | null

TTL: 50 minutes (TOKEN_TTL_MS = 50 * 60 * 1000)
Single-flight: if inflight, return it; otherwise set inflight, clear in finally
```

The latch is critical on Firebase App Hosting (Cloud Run): multiple container instances may start cold simultaneously, each calling `mintFahAccessToken()`. Without the latch, each would spawn a concurrent token exchange. With it, only one goes through per module instance.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added `@vitest-environment node` to test file**
- **Found during:** Task 1 GREEN phase — jose v5 `SignJWT.sign()` threw `TypeError: payload must be an instance of Uint8Array` in jsdom environment
- **Issue:** jsdom doesn't provide `TextEncoder`, which jose v5 uses for JWT payload encoding
- **Fix:** Added `// @vitest-environment node` file-level comment to fah-rollout.test.ts; this is the canonical vitest mechanism for per-file environment override
- **Files modified:** src/lib/fah-rollout.test.ts
- **Commit:** 2ad4441 (same GREEN commit — fix applied before committing)

## Self-Check: PASSED

- [x] src/lib/fah-rollout.ts exists and exports all 4 functions
- [x] src/lib/fah-rollout.test.ts exists with 17 test cases
- [x] Commit 8dcfc7f (RED): test file only
- [x] Commit 2ad4441 (GREEN): impl + package.json + package-lock.json + test env annotation
- [x] `npx vitest run src/lib/fah-rollout.test.ts` — 17/17 passed
- [x] `npx vitest run` — 259/259 passed, 0 regressions
- [x] package.json contains `"jose": "^5"` and `"swr": "^2.4.1"`
