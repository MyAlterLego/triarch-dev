# Phase 27: CL-6 Server-Side Adoption Enforcement - Research

**Researched:** 2026-05-16
**Domain:** Drizzle ORM schema + migration, Next.js API routes, CockroachDB, Vitest mocking
**Confidence:** HIGH — all findings from direct source inspection of the live codebase

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- New table `deploy_gate_check` with columns: `id (uuid PK)`, `project_key (text)`, `target_version (text)`, `verdict (text: 'pass'|'fail'|'reject_no_pair')`, `dev_version (text)`, `api_key_hash (text)`, `reason (text nullable)`, `workflow_run_url (text nullable)`, `created_at (timestamptz default now())`
- Composite index `(project_key, created_at DESC)`
- NEW endpoint `POST /api/platform/cicd/gate-verdict` using `requireApiKey` Bearer auth
- Payload: `{ target_version, verdict: 'pass'|'fail', dev_version, reason?, workflow_run_url? }`
- MODIFY ingest/release-logs to check paired verdict on `env=prod` only
- 409 response shape: `{ error: 'gate_required', code: 'CL6-VIOLATION', reason, expected: {...}, remediation_url }`
- Rollout: env var `CL6_ENFORCEMENT_MODE=warn|enforce|off`, default `warn` at ship
- Rejection audit: write a `deploy_gate_check` row with `verdict='reject_no_pair'`
- `api_key_hash` is SHA-256 of the Bearer apiKey, never plaintext
- 15-minute lookback is fixed constant
- Compliance matrix UI changes are Phase 35's scope, NOT this phase

### Claude's Discretion
- Specific migration filename and SQL DDL details
- Vitest test layout (colocated `route.test.ts` per CLAUDE.md convention)
- Whether to emit a structured log event on warn-mode violations (recommended yes)
- TypeScript interface naming (`GateVerdict`, `DeployGateCheckRow`, etc.)

### Deferred Ideas (OUT OF SCOPE)
- Slack alert on `verdict='reject_no_pair'` writes
- Gate verdict admin UI
- Per-project enforcement override (single env var is sufficient)
- Cleanup cron job for 90-day retention
- shared-workflows v8.2 write-step (Phase 28)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CL6-01 | Endpoint reads the most-recent `deploy_gate_check` audit row for `(project_key)` written in prior 15 minutes | Schema pattern + Drizzle `gte` time-based WHERE; `orderBy(desc).limit(1)` chain |
| CL6-02 | Endpoint asserts `verdict=pass` AND `target_version == ingested_version` AND same bearer apiKey wrote both rows | `api_key_hash` comparison; SHA-256 of request Authorization header; in-JS assertion after DB read |
| CL6-03 | On mismatch/missing: return 409 with structured error, do NOT insert release row, write rejection to audit log | Branching before `db.insert(releaseLogs)`; insert `deploy_gate_check` with `verdict='reject_no_pair'` |
| CL6-04 | Contrived test — strip `needs: gate` line from workflow, deploy, confirm release row never appears in DB AND compliance matrix flags project red | Vitest: `insertMock` not called + 409 status; compliance matrix is Phase 35 (column will exist but be empty until Phase 35) |
</phase_requirements>

---

## Summary

Phase 27 requires three coordinated deliverables: (1) a new `deploy_gate_check` Drizzle table + SQL migration, (2) a new POST endpoint at `/api/platform/cicd/gate-verdict/route.ts`, and (3) a pre-check inserted into the existing `ingest/release-logs` route before its `db.insert(releaseLogs)` call. The enforcement is gated by `CL6_ENFORCEMENT_MODE` env var defaulting to `warn`.

The existing codebase provides clear, proven patterns for every building block: `requireApiKey` for Bearer auth, `db.select().from(T).where(and(eq(...), gte(...))).orderBy(desc).limit(1)` for time-bounded lookups, `db.insert(T).values({...}).returning()` for audit writes, and `vi.mock('@/lib/db', ...)` with a chainable builder mock for Vitest. No hand-rolling needed for any of these.

The most important implementation constraint: `requireApiKey` does NOT return the raw apiKey — it returns the `project` row. To hash the Bearer token, extract it from `req.headers.get('authorization')?.slice(7)` before calling `requireApiKey`, then hash with `crypto.createHash('sha256').update(rawKey).digest('hex')` (Node.js built-in; no extra dependency).

**Primary recommendation:** Implement in exactly this order — migration first, then `gate-verdict` endpoint, then modify `ingest/release-logs`, then write tests. Each step has a clear known pattern.

---

## Standard Stack

### Core (already in project)

| Library | Version | Purpose |
|---------|---------|---------|
| drizzle-orm | `^0.45` (package.json) | ORM — schema definition + query builder |
| drizzle-kit | existing | Migration generation via `drizzle-kit generate` |
| next/server | Next.js 16 | `NextRequest`, `NextResponse` |
| node:crypto | Node.js built-in | SHA-256 hashing for `api_key_hash` |
| vitest | 4.x | Test framework, `vi.mock`, `vi.fn()` |

### No New Dependencies

All required primitives are already present. SHA-256 hashing uses `node:crypto` (built-in), not a third-party library. The `gte` operator is exported from `drizzle-orm` and already used in the project.

**Installation:** Nothing to install.

---

## Architecture Patterns

### 1. Drizzle Schema — Enum Approach

**Finding (HIGH confidence — direct source inspection):** The codebase does NOT use `pgEnum`. All enum-like columns use `varchar` or `text` with an inline comment documenting the valid values. Validation happens in the route handler, not at the DB constraint level. This is the established pattern for `verdict`.

From `packages/triarch-shared/src/schema.ts`:
```typescript
// promoteAttempts table — same pattern to follow
result: varchar('result', { length: 16 }).notNull(), // 'merged' | 'conflict' | 'ci_failed' — validated in route handler, no CHECK constraint per RESEARCH.md
```

The `agentIdentities` table in `src/db/schema.ts` (local-only additions) uses the same style:
```typescript
import { pgTable, uuid, text, jsonb, timestamp } from 'drizzle-orm/pg-core';

export const agentIdentities = pgTable('agent_identities', {
  id:         uuid('id').defaultRandom().primaryKey(),
  apiKeyHash: text('api_key_hash').notNull().unique(),
  createdAt:  timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  // ...
});
```

**For `deployGateCheck`:** Use `text` for `verdict` (not `pgEnum`), validate `'pass'|'fail'` in the route handler. The `verdict='reject_no_pair'` is written server-side only, never from CI payload.

### 2. Drizzle Schema — Exact Column Pattern to Use

```typescript
// src/db/schema.ts — add after agentIdentities block
import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core';

export const deployGateCheck = pgTable('deploy_gate_check', {
  id:              uuid('id').defaultRandom().primaryKey(),
  projectKey:      text('project_key').notNull(),
  targetVersion:   text('target_version').notNull(),
  verdict:         text('verdict').notNull(),           // 'pass' | 'fail' | 'reject_no_pair'
  devVersion:      text('dev_version').notNull(),
  apiKeyHash:      text('api_key_hash').notNull(),      // SHA-256 hex of the Bearer token
  reason:          text('reason'),                      // nullable
  workflowRunUrl:  text('workflow_run_url'),             // nullable
  createdAt:       timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('deploy_gate_check_project_created_at_idx').on(
    table.projectKey,
    table.createdAt.desc(),
  ),
]);

export type DeployGateCheck = typeof deployGateCheck.$inferSelect;
export type NewDeployGateCheck = typeof deployGateCheck.$inferInsert;
```

Note: `deployGateCheck` goes in `src/db/schema.ts` (the local-only additions file), NOT in the shared package. The shared package is under `packages/triarch-shared/` and requires a publish step — this table is admin-internal only.

### 3. Migration File

**Migration filename pattern:** Sequential 4-digit prefix + drizzle-kit-generated name. Last migration is `0018_agent_identities.sql`. Next is `0019_deploy_gate_check.sql`.

**Migration SQL pattern** (from `0018_agent_identities.sql` and `0005_wandering_puppet_master.sql`):
```sql
-- deploy_gate_check table + covering index for CL-6 enforcement lookback
-- (project_key, created_at DESC) supports the 15-min lookback query at scale.

BEGIN;

CREATE TABLE IF NOT EXISTS deploy_gate_check (
  id                uuid                     PRIMARY KEY DEFAULT gen_random_uuid(),
  project_key       text                     NOT NULL,
  target_version    text                     NOT NULL,
  verdict           text                     NOT NULL,   -- 'pass' | 'fail' | 'reject_no_pair'
  dev_version       text                     NOT NULL,
  api_key_hash      text                     NOT NULL,   -- SHA-256 hex of Bearer token
  reason            text,
  workflow_run_url  text,
  created_at        timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS deploy_gate_check_project_created_at_idx
  ON deploy_gate_check (project_key, created_at DESC);

COMMIT;
```

**Key findings from migration inspection (HIGH confidence):**
- UUID generation: `gen_random_uuid()` server-side in SQL (NOT `crypto.randomUUID()` in app). The Drizzle `uuid('id').defaultRandom()` maps to this.
- Timestamps: always `timestamp with time zone` — every table uses this, never bare `timestamp`.
- Migrations DO NOT use `drizzle-kit generate` output format (the `-->statement-breakpoint` format seen in some migrations). The `0018` and `0009` migrations are hand-written SQL with `BEGIN/COMMIT`. The planner should write raw SQL, not rely on drizzle-kit to generate it.

### 4. Static-Path Routing (FAH Safety)

**Finding (HIGH confidence — version-snapshot route comment):** Dynamic `[key]` segments crash FAH at runtime in the `/api/platform/*` directory. The version-snapshot route contains this warning:

> "Previous attempt (/api/platform/projects/[key]/versions) crashed FAH at runtime; suspected route-conflict between the dynamic [key] segment and the existing static siblings. Static-path version avoids that entirely."

**Use:** `/api/platform/cicd/gate-verdict/route.ts` (static, no dynamic segment). This is consistent with how `version-snapshot/route.ts` was structured.

The `cicd/` subdirectory does not yet exist — it needs to be created.

### 5. `requireApiKey` Contract — Critical Detail

**Finding (HIGH confidence — direct source read of `src/lib/api-key-auth.ts`):**

```typescript
export async function requireApiKey(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const apiKey = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!apiKey) { return { error: ..., project: null }; }

  const [project] = await db.select().from(projects).where(eq(projects.apiKey, apiKey));
  if (!project) { return { error: ..., project: null }; }

  return { error: null, project };
}
```

**`requireApiKey` does NOT return the raw apiKey or its hash.** It returns the project row (which has `project.apiKey` = the plaintext key stored in DB, but the DB query selects the full row).

Actually, looking at the schema: `projects.apiKey` is stored as plaintext varchar — this is the raw key. So `project.apiKey` IS the raw Bearer token. You can hash it from there: `createHash('sha256').update(project!.apiKey!).digest('hex')`.

Alternatively, extract the raw key before calling `requireApiKey`:
```typescript
const rawApiKey = req.headers.get('authorization')?.startsWith('Bearer ')
  ? req.headers.get('authorization')!.slice(7)
  : null;
const apiKeyHash = rawApiKey ? createHash('sha256').update(rawApiKey).digest('hex') : null;
const { error, project } = await requireApiKey(req);
```

Either approach works. The second (extract before calling) avoids depending on `project.apiKey` being the plaintext token (which it happens to be but is an internal detail).

### 6. Time-Bounded Lookback Query

**Finding (MEDIUM confidence — `gte` is in drizzle-orm but no existing example uses it for time; the pattern is standard Drizzle):**

No existing route in the codebase performs a time-bounded WHERE query with `gte`. The pattern from the Drizzle ORM docs and consistent with `and()`, `eq()` usage throughout is:

```typescript
import { and, eq, gte, desc } from 'drizzle-orm';

const LOOKBACK_MS = 15 * 60 * 1000; // 15 minutes in ms
const cutoff = new Date(Date.now() - LOOKBACK_MS);

const [latestVerdict] = await db
  .select()
  .from(deployGateCheck)
  .where(
    and(
      eq(deployGateCheck.projectKey, project!.key),
      gte(deployGateCheck.createdAt, cutoff),
    )
  )
  .orderBy(desc(deployGateCheck.createdAt))
  .limit(1);
```

`gte` is exported from `drizzle-orm` — confirmed by the imports in other routes: `and`, `eq`, `desc`, `sql` are all used. `gte` follows the same pattern.

### 7. Warn-Mode Pattern (best-effort side-effect)

The `stampLinksFromCommit` pattern in `ingest/release-logs/route.ts` is the canonical "best-effort side effect" wrapper:

```typescript
try {
  // best-effort side effect — wrap in try/catch so failure never blocks main path
  await db.insert(deployGateCheck).values({ verdict: 'reject_no_pair', ... }).returning();
} catch (err) {
  console.error('[ingest/release-logs] CL6 audit write failed (non-blocking)', err);
}
```

In `warn` mode, the audit row write AND the `db.insert(releaseLogs)` both happen (the gate check is a warning log, not a blocker). In `enforce` mode, the 409 returns before `db.insert(releaseLogs)`.

### 8. Env Var Access Pattern

**Finding (HIGH confidence — multiple route files inspected):** All env vars use `process.env.VAR_NAME` directly in route handlers — no wrapper. Module-level is fine; call-time read is preferred for testability (mirrors `PORTAL_BASE_URL` pattern).

```typescript
// Read at call time — allows test override via process.env mutation
const enforcementMode = process.env.CL6_ENFORCEMENT_MODE ?? 'warn';
```

`CL6_ENFORCEMENT_MODE` must be declared in:
- `apphosting.yaml` — add as plain value `warn` under `env:`
- `apphosting.dev.yaml` — add as plain value `warn` (same default for dev; flip to `enforce` manually after Phase 28)
- `.env.example` — if one exists (check at execution time)

### 9. Project Structure for New Files

```
src/
├── app/
│   └── api/
│       └── platform/
│           ├── cicd/
│           │   └── gate-verdict/
│           │       ├── route.ts          # NEW — POST handler
│           │       └── route.test.ts     # NEW — colocated test
│           └── ingest/
│               └── release-logs/
│                   ├── route.ts          # MODIFY — insert pre-check
│                   └── route.test.ts     # NEW — colocated test
├── db/
│   ├── schema.ts                         # MODIFY — add deployGateCheck table
│   └── migrations/
│       └── 0019_deploy_gate_check.sql    # NEW — hand-written SQL
```

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| SHA-256 hashing | custom hash function | `import { createHash } from 'node:crypto'` — built-in |
| Bearer auth + project lookup | custom auth logic | `requireApiKey` from `@/lib/api-key-auth` — unchanged |
| Drizzle time-bounded query | raw SQL date math | `gte(table.createdAt, new Date(Date.now() - 900_000))` with Drizzle operators |
| Verdict enum validation | DB CHECK constraint | In-handler `if (!['pass','fail'].includes(verdict))` — matches established pattern |

---

## Common Pitfalls

### Pitfall 1: Adding `deployGateCheck` to the Shared Package Instead of Local Schema

**What goes wrong:** The shared package requires a `packages/triarch-shared/` publish step (tag + CI run). The table is admin-internal — only `ingest/release-logs` and the new `gate-verdict` route use it.

**How to avoid:** Add to `src/db/schema.ts` (local additions file), not `packages/triarch-shared/src/schema.ts`.

### Pitfall 2: `requireApiKey` Does Not Expose the Hash — Hashing Must Be Explicit

**What goes wrong:** Route author calls `requireApiKey` first, then tries to hash something from the returned `project` object. `project.apiKey` is the plaintext key (stored in DB plaintext), so it technically works, but relying on that internal detail is fragile.

**How to avoid:** Extract the raw Bearer token from the Authorization header before calling `requireApiKey`. Hash it immediately. Then verify project.

### Pitfall 3: Race Condition — Gate Verdict and Ingest Arrive Simultaneously

**What happens:** CI workflow posts `gate-verdict` (pass) and then immediately triggers the prod deploy ingest. The ingest hits the server within milliseconds. The 15-min lookback window handles this: the verdict row is committed before the ingest fires (sequential steps in CI workflow). The ingest reads the latest row with `ORDER BY created_at DESC LIMIT 1` — if the verdict committed even 50ms earlier, it's found.

**What to watch:** If the CI step ordering is inverted (ingest fires before gate-verdict write), the 409 fires. This is correct behavior — Phase 28 wires the workflow steps in the right order (gate first, ingest second).

### Pitfall 4: `target_version` String Mismatch (Case/Whitespace)

**What goes wrong:** Gate verdict written with `'v2.13.13'`, ingest arrives with `'V2.13.13'` or `'v2.13.13 '` (trailing space).

**How to avoid:** Normalize `target_version` to `.trim().toLowerCase()` on both write (gate-verdict endpoint) and read (ingest pre-check comparison). Apply the same normalization to the ingest's `version` field before comparison.

### Pitfall 5: Key Rotation — Different Bearer Token Hashes

**What happens:** Project rotates their `apiKey` between gate-verdict write and ingest. Gate verdict was written with old key hash; ingest arrives with new key hash. The assertion `api_key_hash = current_request_api_key_hash` fails → 409.

**This is correct behavior.** Mid-deploy key rotation is a user error; the 409 with `CL6-VIOLATION` is the appropriate signal. The `remediation_url` points them to `/admin/modules/ci-cd`. Document this in the 409 `reason` field: `"api_key_hash mismatch — key may have rotated between gate and deploy"`.

### Pitfall 6: `warn` Mode Must Still Write the Audit Row

**What goes wrong:** In warn mode, developer skips the `deploy_gate_check` insert and only logs to console. The audit trail then has no record of the violation, and Phase 35's compliance matrix has no data to display.

**How to avoid:** In warn mode: write `verdict='reject_no_pair'` audit row AND proceed with `releaseLogs` insert. Only difference from enforce mode is that the 409 is NOT returned.

### Pitfall 7: Mock Chain for `db.select().from().where().orderBy().limit()` in Tests

**What goes wrong:** The Drizzle select chain has five chained methods. The mock must return the right shape at each link or the chain breaks.

**How to avoid:** Follow the established pattern from `promote-callback/route.test.ts`:
```typescript
function buildSelectChain(result: unknown[]) {
  const chain = {
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: (_n: number) => Promise.resolve(result),
  };
  return chain;
}

vi.mock('@/lib/db', () => ({
  db: {
    insert: (...args: unknown[]) => insertMock(...args),
    select: () => buildSelectChain(selectMock()),
  },
}));
```

---

## Validation Architecture

Framework: Vitest 4.x with `@/` alias. Run: `npx vitest run`. Test files colocated with source.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.x |
| Config file | `vitest.config.ts` (existing) |
| Quick run command | `npx vitest run src/app/api/platform/cicd/gate-verdict/route.test.ts src/app/api/platform/ingest/release-logs/route.test.ts` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | File | Key Assertion |
|--------|----------|-----------|------|---------------|
| CL6-01 | `gate-verdict` POST inserts row with correct fields including `api_key_hash` | unit | `gate-verdict/route.test.ts` | `insertMock` called with `{ projectKey, targetVersion, verdict: 'pass', apiKeyHash: sha256(Bearer) }` |
| CL6-01 | `gate-verdict` POST returns 201 on valid payload | unit | `gate-verdict/route.test.ts` | `res.status === 201` |
| CL6-01 | `gate-verdict` POST returns 401 with no auth | unit | `gate-verdict/route.test.ts` | `res.status === 401` |
| CL6-01 | `gate-verdict` POST returns 400 on missing `target_version` | unit | `gate-verdict/route.test.ts` | `res.status === 400` |
| CL6-01 | `gate-verdict` POST returns 400 on invalid verdict enum | unit | `gate-verdict/route.test.ts` | `res.status === 400`, body mentions `verdict` |
| CL6-02 | ingest with `env=prod` + matching verdict → 201, release row inserted | unit | `release-logs/route.test.ts` | `insertMock` called twice (gate audit, then release), `res.status === 201` |
| CL6-02 | ingest with `env=prod` + verdict `target_version` mismatch → 409 | unit | `release-logs/route.test.ts` | `res.status === 409`, `body.code === 'CL6-VIOLATION'` |
| CL6-02 | ingest with `env=prod` + `api_key_hash` mismatch → 409 | unit | `release-logs/route.test.ts` | `res.status === 409`, release insert NOT called |
| CL6-03 | on rejection, `deploy_gate_check` row written with `verdict='reject_no_pair'` | unit | `release-logs/route.test.ts` | `insertMock` called with `{ verdict: 'reject_no_pair', projectKey, targetVersion }` |
| CL6-03 | on rejection in enforce mode, `releaseLogs` insert NOT called | unit | `release-logs/route.test.ts` | `insertMock` call count = 1 (only gate audit, not release) |
| CL6-03 | on missing verdict row → 409 structured body shape | unit | `release-logs/route.test.ts` | `body.error === 'gate_required'`, `body.expected.max_age_seconds === 900`, `body.remediation_url` present |
| CL6-03 | warn mode: on missing verdict, still inserts release row AND writes audit | unit | `release-logs/route.test.ts` | `res.status === 201`, `insertMock` called twice |
| CL6-03 | off mode: skips gate check entirely, inserts release row | unit | `release-logs/route.test.ts` | `res.status === 201`, selectMock never called |
| CL6-04 | `env=dev` ingest bypasses gate check entirely | unit | `release-logs/route.test.ts` | selectMock (gate lookup) never called, `res.status === 201` |

### Wave 0 Gaps

- [ ] `src/app/api/platform/cicd/gate-verdict/route.test.ts` — covers CL6-01 (does not exist; directory does not exist)
- [ ] `src/app/api/platform/ingest/release-logs/route.test.ts` — covers CL6-02, CL6-03, CL6-04 (route exists, test does not)

No new framework install needed — Vitest 4.x already configured.

### Test Scenarios by Requirement

**CL6-01 (`gate-verdict` endpoint) — `gate-verdict/route.test.ts`:**
1. 401: no Authorization header → `res.status === 401`
2. 403: invalid Bearer token → `res.status === 403`
3. 400: missing `target_version` → body mentions `target_version`
4. 400: missing `dev_version` → body mentions `dev_version`
5. 400: `verdict` not in `['pass','fail']` → body mentions `verdict`
6. 201 pass: correct payload → `insertMock` called with `{ verdict: 'pass', apiKeyHash: <sha256-of-token> }`, `res.status === 201`
7. 201 fail: `verdict='fail'` → `insertMock` called with `{ verdict: 'fail' }`

**CL6-02 + CL6-03 (`ingest/release-logs` modified) — `release-logs/route.test.ts`:**
1. `env=dev`: no gate check, release inserted → selectMock (gate) not called, 201
2. `env=prod`, CL6_ENFORCEMENT_MODE=off: no gate check, release inserted → 201
3. `env=prod`, enforce, no verdict row in 15 min → 409, `code: 'CL6-VIOLATION'`, gate audit inserted with `reject_no_pair`, release NOT inserted
4. `env=prod`, enforce, verdict row exists but `target_version` mismatch → 409, release NOT inserted
5. `env=prod`, enforce, verdict row exists but `api_key_hash` mismatch → 409, release NOT inserted
6. `env=prod`, enforce, verdict `='fail'` (not pass) → 409, release NOT inserted
7. `env=prod`, enforce, all match → 201, release inserted
8. `env=prod`, warn, no verdict row → 201 (warn logs but does not block), gate audit inserted with `reject_no_pair`, release IS inserted
9. 409 body shape: `{ error: 'gate_required', code: 'CL6-VIOLATION', expected: { project_key, target_version, max_age_seconds: 900 }, remediation_url: '/admin/modules/ci-cd' }`

**CL6-04 (contrived test of enforce enforcement):**
This requirement is partly operational (requires an actual CI workflow run). The Vitest-testable portion is scenario 3 above (enforce mode, no verdict → 409, no release row). The "compliance matrix flags project red" is Phase 35's scope — cannot be tested in this phase.

---

## Code Examples

### SHA-256 hashing of Bearer token

```typescript
// Source: node:crypto built-in
import { createHash } from 'node:crypto';

// Extract before calling requireApiKey (so it's available regardless of project lookup result)
const authHeader = req.headers.get('authorization') ?? '';
const rawKey = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
const apiKeyHash = rawKey ? createHash('sha256').update(rawKey).digest('hex') : '';
```

### Time-bounded lookback query

```typescript
// Source: drizzle-orm operators (gte, and, eq, desc — all established in project)
import { and, eq, gte, desc } from 'drizzle-orm';

const LOOKBACK_MS = 15 * 60 * 1000; // 15 minutes — fixed constant per phase spec
const cutoff = new Date(Date.now() - LOOKBACK_MS);

const [latestVerdict] = await db
  .select()
  .from(deployGateCheck)
  .where(
    and(
      eq(deployGateCheck.projectKey, project!.key),
      gte(deployGateCheck.createdAt, cutoff),
    )
  )
  .orderBy(desc(deployGateCheck.createdAt))
  .limit(1);
```

### 409 rejection shape

```typescript
return NextResponse.json(
  {
    error: 'gate_required',
    code: 'CL6-VIOLATION',
    reason: 'No passing gate verdict found in the prior 15 minutes',
    expected: {
      project_key: project!.key,
      target_version: version,
      max_age_seconds: 900,
    },
    remediation_url: '/admin/modules/ci-cd',
  },
  { status: 409 }
);
```

### Vitest mock for Drizzle select chain with 5 methods

```typescript
// Source: promote-callback/route.test.ts — established pattern, extended for 5-link chain
let selectResult: unknown[] = [];
const selectMock = vi.fn(() => selectResult);

function buildSelectChain() {
  const chain = {
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: (_n: number) => Promise.resolve(selectMock()),
  };
  return chain;
}

vi.mock('@/lib/db', () => ({
  db: {
    insert: (...args: unknown[]) => insertMock(...args),
    select: () => buildSelectChain(),
  },
}));
```

### Vitest mock — multiple distinct inserts (gate audit + release log)

The `ingest/release-logs` tests need to distinguish between the `db.insert(deployGateCheck)` call and the `db.insert(releaseLogs)` call. Use the `insertMock`'s call argument to distinguish:

```typescript
// In test:
const insertMock = vi.fn();
const insertValuesMock = vi.fn().mockReturnValue({
  returning: vi.fn().mockResolvedValue([FAKE_ROW]),
});
insertMock.mockReturnValue({ values: insertValuesMock });

// Assert gate insert called first:
expect(insertMock.mock.calls[0][0]).toBe(deployGateCheck); // table ref
// Assert release insert not called:
expect(insertMock).toHaveBeenCalledTimes(1); // only gate audit, not release
```

Note: This requires `deployGateCheck` table ref to be imported in the test via `vi.mock('@/db/schema', ...)` returning the actual schema objects.

---

## Open Questions

1. **`db.select().from().where().orderBy().limit()` — does Drizzle require `.limit()` before awaiting, or can it be awaited directly after `.orderBy()`?**
   - What we know: The `promote-callback/route.test.ts` mock chain shows `.limit(N)` as the terminal awaitable. The CRDB-optimized pattern is `.limit(1)`.
   - Recommendation: Always include `.limit(1)` — matches test mock and is best practice.

2. **Does the `ingest/release-logs` route test need to mock `@/lib/link-stamper` (stampLinksFromCommit)?**
   - What we know: The current route calls `stampLinksFromCommit` in a try/catch on success. Any test of the happy path will hit that code path.
   - Recommendation: Yes, mock it as `vi.mock('@/lib/link-stamper', () => ({ stampLinksFromCommit: vi.fn().mockResolvedValue(undefined) }))`. Follow the Slack mock pattern from `promote-callback`.

3. **Where exactly in the `ingest/release-logs` route should the gate pre-check live?**
   - Answer: After the `env` determination (line 33) and before `db.insert(releaseLogs)` (line 48). The branch check is: `if (env === 'prod' && enforcementMode !== 'off') { ... }`.

---

## Sources

### Primary (HIGH confidence — direct source inspection)
- `src/db/schema.ts` — local schema additions pattern (agentIdentities, uuid/text/timestamp types)
- `packages/triarch-shared/src/schema.ts` — shared schema, enum-via-varchar pattern, index patterns
- `src/app/api/platform/ingest/release-logs/route.ts` — target route, insert pattern, env var
- `src/app/api/platform/version-snapshot/route.ts` — static-path pattern, requireApiKey usage
- `src/lib/api-key-auth.ts` — requireApiKey return shape (returns project with plaintext apiKey)
- `src/app/api/platform/promote-callback/route.test.ts` — Vitest mock patterns for db, requireApiKey
- `src/app/api/releases/promoted/route.ts` — and/eq query pattern with Drizzle
- `src/db/migrations/0018_agent_identities.sql` — migration format (BEGIN/COMMIT, gen_random_uuid(), timestamp with time zone)
- `src/db/migrations/0005_wandering_puppet_master.sql` — CREATE TABLE + CREATE INDEX pattern
- `vitest.config.ts` — @/ alias, jsdom environment, packageTestRedirectPlugin
- `apphosting.yaml` + `apphosting.dev.yaml` — env var declaration format

### Secondary (MEDIUM confidence — drizzle-orm standard API)
- `gte` operator: exported from `drizzle-orm`, same API as `eq`/`and`/`desc` already used

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all from direct source inspection
- Architecture: HIGH — patterns read verbatim from existing routes and tests
- Pitfalls: HIGH (implementation) / MEDIUM (race condition timing — operational, not code)
- Validation Architecture: HIGH — follows exact pattern of existing colocated route tests

**Research date:** 2026-05-16
**Valid until:** 2026-06-16 (stable stack; no fast-moving dependencies)
