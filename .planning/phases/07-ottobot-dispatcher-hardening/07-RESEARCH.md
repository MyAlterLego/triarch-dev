# Phase 7: OttoBot Dispatcher Hardening - Research

**Researched:** 2026-05-05
**Domain:** Slack API (interact / commands / events), Drizzle audit inserts, Next.js App Router, React server component admin pages
**Confidence:** HIGH (all findings grounded in existing codebase or official Slack docs)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Slash command endpoint design (OTTOBOT-03, OTTOBOT-04)**
- D-01: New endpoint `POST /api/slack/commands` — single route handler branching on `command` + first arg (deploy/status)
- D-02: HMAC verification reuses `verifySlackSignature` from `src/lib/slack-crypto.ts`
- D-03: Return 200 + ephemeral ack within 3s; workflow dispatch runs before returning IF it fits; otherwise immediate ack + follow-up via `chat.postMessage`
- D-04: Empty `/triarch` returns help text with deploy + status subcommand descriptions

**Slash command authorization (OTTOBOT-03)**
- D-05: deploy = staff-only; resolve via `slackUserToEmail`; staff bypass = `@triarchsecurity.com` OR project_members wildcard row
- D-06: status = project-member-only; non-members get ephemeral `:no_entry:` error

**Audit row write strategy (OTTOBOT-01)**
- D-07: New helper `recordSlackAudit(input)` in `src/lib/slack-audit.ts`; called at end of every Slack route handler
- D-08: Failure handling — `console.warn`, continue, NEVER block Slack response
- D-09: `payload_hash` = `sha256(rawBody).hex`
- D-10: `actor_email` via `slackUserToEmail`; nullable
- D-11: `actor_slack_id` always present; from `payload.user_id` (commands) / `payload.user.id` (interact) / `event.user` (events)
- D-12: `response_status` = actual HTTP status captured just before `NextResponse.json`
- D-13: `latency_ms` = `Date.now() - requestReceivedAt` at top of handler

**Status command response format (OTTOBOT-04, OTTOBOT-05)**
- D-14: Simple Block Kit; no images, no buttons
- D-15: Sections in order: Dev, Prod, Active RCs (cap 5 + "N more"), Last 3 deploys
- D-16: Unknown project → ephemeral error + comma-separated list of up to 5 project keys
- D-17: Always ephemeral (`response_type: 'ephemeral'`)

**App mention handler (OTTOBOT-05)**
- D-18: New endpoint `POST /api/slack/events`; `app_mention` → parse after bot mention; unsupported text → help text in-thread; `status <project>` → same response but public threaded reply
- D-19: `url_verification` challenge handler
- D-20: Event dedup via in-memory Set capped at 1000, FIFO eviction

**Slack App scope upgrade (OTTOBOT-02)**
- D-21: Required scopes: `chat:write.public`, `app_mentions:read`, `commands`
- D-22: HUMAN action only; plan emits HUMAN-UAT step

**Audit log viewer UX (OTTOBOT-06)**
- D-23: New page `/admin/platform/slack-audit/page.tsx`; server component fetches first page; client handles filters + load-more
- D-24: `getCurrentUserContext` + `ctx.isStaff` check; non-staff → 403
- D-25: Filters: `action_id` (exact), `actor_email` (ILIKE), date range (from/to); defaults: last 7 days / today
- D-26: Load-more, 50 rows/page, fetch +1 for `hasMore`
- D-27: Row layout: created_at, action_id, actor_email (or —), actor_slack_id, response_status (color-coded), latency_ms; click → expand to show payload_hash
- D-28: Default sort `created_at DESC`; no client flip

### Claude's Discretion
- Exact layout/wording of help text (preserve listed subcommands)
- Block Kit block composition for status response
- Single-file vs split per-subcommand for slash command dispatch
- In-memory event-dedup TTL (5–10 min)
- Whether to add a "Refresh" link on the audit page
- Color tokens for status badges (match `STATUS_BADGE_COLORS` from `ReleasesClient.tsx`)
- Exact error formatting on Slack (single line vs block)

### Deferred Ideas (OUT OF SCOPE)
- Per-project Slack channel routing (NOTIF-V3-01)
- Email notifications on lifecycle events (NOTIF-V3-02)
- Slack notification on prod deploy completion (NOTIF-V3-03)
- Multi-org Slack workspaces
- Bulk approve via Slack
- `/triarch logs <project>`
- AI-summarized status reports
- Audit log export (CSV/JSON)
- Slack interactive button on status response
- Per-action_id quotas / rate limits
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| OTTOBOT-01 | Every `/api/slack/interact` action_id click writes a `slack_action_audit` row | `recordSlackAudit` helper design; insertion point in route.ts; rawBody sha256 pattern |
| OTTOBOT-02 | OttoBot Slack App scope upgraded to `chat:write.public`, `app_mentions:read`, `commands` | HUMAN action; documented as runbook step only |
| OTTOBOT-03 | `/triarch deploy <project> <version>` slash command — staff-only; triggers workflow_dispatch; ephemeral run URL | `application/x-www-form-urlencoded` parse; `dispatchWorkflow` call shape; `response_url` follow-up pattern |
| OTTOBOT-04 | `/triarch status <project>` slash command — returns dev/prod/RC/deploy status as Block Kit | DB query shapes for 4 sections; concrete Block Kit JSON |
| OTTOBOT-05 | `@OttoBot status <project>` app mention — same response; `url_verification` handshake | Events API payload shape; mention text stripping regex; dedup helper |
| OTTOBOT-06 | `/admin/platform/slack-audit` staff-only paginated viewer with filters | Admin page pattern from `projects/page.tsx`; `slackActionAudit` Drizzle query; sidebar nav pattern |
</phase_requirements>

---

## Domain Investigation

### 1. Current /api/slack/interact Route Shape

**File:** `src/app/api/slack/interact/route.ts` (251 lines)

**Execution flow (with line references):**
1. **Line 27** — `const rawBody = await req.text()` — raw body read ONCE before any parsing. Comment explicitly documents "Must happen before any parsing." This is the exact pattern to replicate in `/commands` and `/events`.
2. **Lines 30–31** — Read `x-slack-request-timestamp` + `x-slack-signature` headers.
3. **Lines 36–39** — `verifySlackSignature({ rawBody, timestamp, signature })` → 401 on failure.
4. **Lines 42–44** — `new URLSearchParams(rawBody)` → extract `payload` form field.
5. **Lines 50–54** — `JSON.parse(payloadStr)` → 400 on failure.
6. **Lines 57–59** — Validate `payload.type === 'block_actions'`.
7. **Lines 61–69** — Extract `action`, `actionId`, `packedValue`, `slackUserId`, `ipAddress`, `userAgent`.
8. **Lines 76–96** — Dispatch to `getActionHandler(actionId)` for non-`slack_*` actions.
9. **Lines 99–104** — `verifyPayload` for embedded button signature.
10. **Lines 108–116** — `resolveSlackUserEmail(slackUserId)` → 200 ephemeral if unmapped.
11. **Lines 119–129** — DB release lookup.
12. **Lines 180–216** — Fire-and-forget `promoteAndAudit(...)` + replace original message.
13. **Lines 237–249** — Reject path returns `NextResponse.json(...)`.

**rawBody capture pattern (confirmed):** `req.text()` is called at line 27, before any `URLSearchParams` or JSON parsing. The same string is then passed to `verifySlackSignature` for HMAC and to `URLSearchParams` for parsing. This is the canonical pattern for all new Slack routes — `req.text()` first, no body-clone needed.

**Audit insertion point:** There is NO current call to `recordSlackAudit`. The OTTOBOT-01 task adds it. The correct insertion point is **just before each `return NextResponse.json(...)` call** — after `response_status` is determined, before the response is sent. Since there are multiple return paths, the helper needs the captured `requestReceivedAt = Date.now()` from the top of the handler (line ~23, before `req.text()`).

**`slackUserId` extraction for audit (D-11):** `payload.user?.id` at line 64. For commands it will be `params.get('user_id')`. For events it will be `event.user`. These three extraction patterns must all be documented per-route.

**Note on `resolveSlackUserEmail` vs `slackUserToEmail`:** The existing route uses `resolveSlackUserEmail` (imported from `src/lib/slack-identity.ts`), not `slackUserToEmail`. The exported function is `resolveSlackUserEmail`. CONTEXT.md says `slackUserToEmail` — this is the same function, renamed in the v2.0 vault migration. Use `resolveSlackUserEmail` for consistency with existing code.

---

### 2. Slack Signature Verification + rawBody Pattern

**File:** `src/lib/slack-crypto.ts`

`verifySlackSignature` signature:
```typescript
export async function verifySlackSignature(opts: {
  rawBody: string;
  timestamp: string | null;
  signature: string | null;
  now?: number;   // injectable for tests
}): Promise<VerifySignatureResult>
```

**Return type:** `{ ok: true }` or `{ ok: false; reason: 'no_secret' | 'stale' | 'bad_signature' | 'malformed' }`.

**Replay window:** 5 minutes (300 seconds), enforced inside the function.

**Secret source:** `getSecret('SLACK_SIGNING_SECRET')` from `@myalterlego/secrets` — already in vault per Phase 1. Falls back to `process.env.SLACK_SIGNING_SECRET` automatically via the vault client.

**rawBody contract (CRITICAL):** Slack signs the EXACT bytes of the HTTP body. Both `/commands` (form-urlencoded) and `/events` (JSON) must read `await req.text()` first, then pass the same string to `verifySlackSignature`. For `/events` you then do `JSON.parse(rawBody)`. For `/commands` you do `new URLSearchParams(rawBody)`. Never re-stringify.

**sha256 for audit hash (D-09):**
```typescript
import { createHash } from 'node:crypto';
const payloadHash = createHash('sha256').update(rawBody).digest('hex');
```
This is deterministic — same rawBody always produces same hash. Consistent with `slack-crypto.ts` which already imports `node:crypto`.

---

### 3. Slack Slash Command Payload Shape

**Content-Type:** `application/x-www-form-urlencoded` (NOT JSON — critical pitfall).

**Parse approach:** `new URLSearchParams(rawBody)` — same as interact route's parse of its outer wrapper.

**Key fields:**
| Field | Example | Notes |
|-------|---------|-------|
| `token` | `gIkuvaNzQIHg97ATvDxqgjtO` | Legacy verification (do NOT use; use HMAC instead) |
| `team_id` | `T0001` | |
| `team_domain` | `example` | |
| `channel_id` | `C2147483705` | |
| `channel_name` | `general` | |
| `user_id` | `U2147483697` | audit `actor_slack_id` |
| `user_name` | `patricklewis` | display name |
| `command` | `/triarch` | always the registered slash command |
| `text` | `deploy myproject v0.15.0` | everything after the command; empty string if no args |
| `response_url` | `https://hooks.slack.com/commands/...` | POST here for delayed follow-up (valid 30 min) |
| `trigger_id` | `13345224609.738474920.8088930838d88f008e0` | for modals (not used here) |
| `api_app_id` | `A0001` | |

**Parse pattern:**
```typescript
const params = new URLSearchParams(rawBody);
const command  = params.get('command') ?? '';   // '/triarch'
const text     = params.get('text') ?? '';       // 'deploy myproject v0.15.0'
const userId   = params.get('user_id') ?? '';
const userName = params.get('user_name') ?? '';
const responseUrl = params.get('response_url') ?? '';
const channelId = params.get('channel_id') ?? '';
```

**Subcommand routing:**
```typescript
const [subcommand, ...rest] = text.trim().split(/\s+/);
// subcommand = 'deploy' | 'status' | ''
// rest = ['myproject', 'v0.15.0'] for deploy
//        ['myproject'] for status
```

**Response format for immediate ack:**
Slack accepts either:
1. Direct JSON body in the HTTP 200 response: `{ "response_type": "ephemeral", "text": "..." }`
2. Empty 200 + delayed POST to `response_url` (for work > 3s)

For `/triarch deploy`, use pattern 2: return `{ response_type: 'ephemeral', text: ':gear: Dispatching promotion...' }` immediately, then POST to `response_url` with the run URL once dispatch completes (fire-and-forget).

**`response_url` follow-up POST:**
```typescript
await fetch(responseUrl, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    response_type: 'ephemeral',
    replace_original: false,
    text: `:white_check_mark: Dispatched promote-branch.yml — <${runUrl}|view run>`,
  }),
});
```
The `response_url` is valid for 30 minutes and supports up to 5 follow-up messages. Use it for the run URL reply after `dispatchWorkflow` completes.

---

### 4. Slack Events API Payload Shape

**Content-Type:** `application/json` — parse with `JSON.parse(rawBody)`.

**`url_verification` handshake (D-19):**
```json
{ "token": "...", "challenge": "3eZbrw1aDERMpCZQwi5vNe5E", "type": "url_verification" }
```
Response must be:
```typescript
return NextResponse.json({ challenge: body.challenge }, { status: 200 });
```
Note: signature verification does NOT apply to `url_verification` — Slack sends it before the HMAC relationship is established. Return the challenge immediately on `type === 'url_verification'` without calling `verifySlackSignature`. (This is confirmed Slack platform behavior — verify-first would fail because the signing secret isn't yet set up at that stage.)

**`event_callback` with `app_mention` (D-18):**
```json
{
  "token": "...",
  "team_id": "T0001",
  "api_app_id": "A0001",
  "event": {
    "type": "app_mention",
    "user": "U0123",
    "text": "<@UBOT> status feat-website",
    "ts": "1515449522.000016",
    "channel": "C0123",
    "event_ts": "1515449522.000016"
  },
  "type": "event_callback",
  "event_id": "Ev0123",
  "event_time": 1515449522
}
```

**Key fields for audit:**
- `event.user` = `actor_slack_id` (D-11 for events route)
- `event_id` = dedup key (D-20)
- `event.channel` = channel to reply in (for threaded reply)
- `event.ts` = `thread_ts` for the reply

**`url_verification` does NOT carry `event_id`; skip dedup for that type.**

---

### 5. app_mention Text Parsing (D-18)

Strip the bot mention from the event text. Bot mentions have the form `<@UBOT123>` where `UBOT123` is the bot's user ID.

**Recommended regex:**
```typescript
const mentionText = event.text.replace(/^<@[A-Z0-9]+>\s*/i, '').trim();
// "<@UBOT> status feat-website" → "status feat-website"
const [mentionSubcmd, ...mentionArgs] = mentionText.split(/\s+/);
// mentionSubcmd = 'status', mentionArgs = ['feat-website']
```

The regex strips `<@ANY_USER_ID>` at the start of the string, including any leading whitespace after the mention. This works for any bot user ID — no hardcoded ID needed.

**Bot's own messages filter:** Slack may generate `app_mention` events when the bot's own message contains `<@UBOT>`. Filter by checking `event.user !== BOT_USER_ID`. The bot user ID is retrievable via Slack's `auth.test` API — but for simplicity, storing it as an env var (`SLACK_BOT_USER_ID`) or in vault is sufficient. If unavailable, the dedup Set handles repeated delivery; the bot replying to itself in a loop is unlikely given the slash-command design.

---

### 6. Status Block Kit — Concrete JSON

**Query approach for D-15 four sections:**

```typescript
// Section 1 & 2: Dev + Prod current versions
const [devRelease] = await db.select()
  .from(releaseLogs)
  .where(and(eq(releaseLogs.project, projectKey), eq(releaseLogs.env, 'dev')))
  .orderBy(desc(releaseLogs.deployedAt))
  .limit(1);

const [prodRelease] = await db.select()
  .from(releaseLogs)
  .where(and(eq(releaseLogs.project, projectKey), eq(releaseLogs.env, 'prod')))
  .orderBy(desc(releaseLogs.deployedAt))
  .limit(1);

// Section 3: Active RCs (branch != 'main', status in ['dev','pending_approval','approved'])
const activeRCs = await db.select()
  .from(releaseLogs)
  .where(and(
    eq(releaseLogs.project, projectKey),
    ne(releaseLogs.branch, 'main'),
    inArray(releaseLogs.status, ['dev', 'pending_approval', 'approved'])
  ))
  .orderBy(desc(releaseLogs.deployedAt))
  .limit(6); // fetch 6, show 5, detect overflow

// Section 4: Last 3 deploys (any branch/env)
const lastDeploys = await db.select()
  .from(releaseLogs)
  .where(eq(releaseLogs.project, projectKey))
  .orderBy(desc(sql`COALESCE(${releaseLogs.deployedAt}, ${releaseLogs.releasedAt})`))
  .limit(3);
```

**Drizzle imports needed:** `ne` from `drizzle-orm` (not yet in interact route, but in other files — `ne` = `not equal`). Also `inArray`.

**Complete Block Kit JSON for status response:**
```typescript
function buildStatusBlocks(
  projectKey: string,
  devRelease: typeof releaseLogs.$inferSelect | undefined,
  prodRelease: typeof releaseLogs.$inferSelect | undefined,
  activeRCs: typeof releaseLogs.$inferSelect[],
  lastDeploys: typeof releaseLogs.$inferSelect[]
): unknown[] {
  const blocks: unknown[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `${projectKey} — Release Status`, emoji: true },
    },
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*Dev*\n${devRelease ? `${devRelease.version} — ${humanizeDate(devRelease.deployedAt)}` : '_no dev release_'}`,
        },
        {
          type: 'mrkdwn',
          text: `*Prod*\n${prodRelease ? `${prodRelease.version} — ${humanizeDate(prodRelease.deployedAt)}` : '_no prod release_'}`,
        },
      ],
    },
    { type: 'divider' },
  ];

  // Active RCs
  const shownRCs = activeRCs.slice(0, 5);
  const overflowCount = Math.max(0, activeRCs.length - 5);
  const rcLines = shownRCs.map(rc =>
    `• ${rc.branch ?? 'main'} ${rc.version} — ${rc.status}`
  );
  if (overflowCount > 0) rcLines.push(`_+ ${overflowCount} more_`);
  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: `*Active RCs*\n${rcLines.length ? rcLines.join('\n') : '_none_'}`,
    },
  });

  blocks.push({ type: 'divider' });

  // Last 3 deploys
  const deployLines = lastDeploys.map(d => {
    const env = d.env ?? 'unknown';
    const when = humanizeDate(d.deployedAt ?? d.releasedAt);
    return `• ${d.branch ?? 'main'} ${d.version} → ${env} (${when})`;
  });
  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: `*Last 3 Deploys*\n${deployLines.length ? deployLines.join('\n') : '_none_'}`,
    },
  });

  return blocks;
}
```

**`humanizeDate` helper** (lightweight, no dependency):
```typescript
function humanizeDate(d: Date | null | undefined): string {
  if (!d) return 'unknown';
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
```

**Slack message size:** This response is well under 40,000 chars. 5 RC lines + 3 deploy lines + header + 2 dividers = ~10 blocks max, each small.

---

### 7. In-Memory Event Dedup (D-20)

**Recommended implementation using Map for O(1) lookup + ordered insertion for FIFO eviction:**

```typescript
// src/app/api/slack/events/dedup.ts  OR  inline in route.ts
const DEDUP_MAX = 1000;
const DEDUP_TTL_MS = 10 * 60 * 1000; // 10 min (covers Slack's retry window)

const dedupMap = new Map<string, number>(); // eventId → expiresAt

export function isDuplicateEvent(eventId: string): boolean {
  const now = Date.now();
  // Evict expired entries when we add
  if (dedupMap.has(eventId)) {
    return true;
  }
  // FIFO eviction: if at capacity, delete the oldest inserted key
  if (dedupMap.size >= DEDUP_MAX) {
    const firstKey = dedupMap.keys().next().value as string;
    dedupMap.delete(firstKey);
  }
  dedupMap.set(eventId, now + DEDUP_TTL_MS);
  return false;
}
```

`Map` preserves insertion order, so `keys().next().value` is always the oldest. No array needed. The `expiresAt` stored is informational; eviction is FIFO-by-count since 1000 entries at ~50 bytes each = ~50KB max memory.

**Test helper for resetting between tests:**
```typescript
export function resetDedupForTests(): void {
  dedupMap.clear();
}
```

---

### 8. /api/slack/commands — dispatchWorkflow for /triarch deploy

**Release lookup before dispatch:**
```typescript
// Parse: /triarch deploy <project> <version> [<branch>]
const [project, version, branchOverride] = rest;
// rest = args after 'deploy'

const [release] = await db
  .select()
  .from(releaseLogs)
  .where(and(
    eq(releaseLogs.project, project),
    eq(releaseLogs.version, version),
  ))
  .orderBy(desc(releaseLogs.releasedAt))
  .limit(1);

if (!release) {
  // respond ephemerally: "Release ${version} of ${project} not found"
}

const branch = branchOverride ?? release.branch ?? 'main';
```

**dispatchWorkflow call (mirrors Phase 6 promoteAndAudit D-01):**
```typescript
import { dispatchWorkflow } from '@/lib/github-app';
import { db } from '@/lib/db';
import { projects, releaseLogs } from '@/db/schema';

// Get github repo from projects table
const [proj] = await db.select({ githubRepo: projects.githubRepo })
  .from(projects)
  .where(eq(projects.key, projectKey))
  .limit(1);

if (!proj?.githubRepo) {
  // "Project ${projectKey} has no GitHub repo configured"
}

const [owner, repo] = proj.githubRepo.split('/');
await dispatchWorkflow({
  owner,
  repo,
  workflowFile: 'promote-branch.yml',
  ref: 'main',
  inputs: { branch },
});
```

**GitHub Actions API response:** `dispatchWorkflow` returns `{ ok: true, status: 204 }` — it does NOT return a run URL. GitHub workflow_dispatch creates a run asynchronously; the run URL cannot be derived from the dispatch response alone. Resolution: respond with the GitHub Actions runs page URL for the repo as a best-effort link:
```
https://github.com/{owner}/{repo}/actions/workflows/promote-branch.yml
```
This is a stable link the user can click to see the latest run.

**Response via response_url (fire-and-forget):**
```typescript
// Immediately return 200 ack:
const ackResponse = NextResponse.json({
  response_type: 'ephemeral',
  text: `:gear: Dispatching \`promote-branch.yml\` for \`${project} ${version}\` on branch \`${branch}\`...`,
});

// Fire-and-forget dispatch:
void (async () => {
  try {
    await dispatchWorkflow({ owner, repo, workflowFile: 'promote-branch.yml', ref: 'main', inputs: { branch } });
    await fetch(responseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        response_type: 'ephemeral',
        replace_original: false,
        text: `:white_check_mark: Promotion dispatched for \`${project} ${version}\` (branch: \`${branch}\`) — <https://github.com/${owner}/${repo}/actions/workflows/promote-branch.yml|view runs>`,
      }),
    });
  } catch (err) {
    console.error('[slack-commands] dispatchWorkflow failed', err);
    await fetch(responseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        response_type: 'ephemeral',
        replace_original: false,
        text: `:x: Dispatch failed — check server logs.`,
      }),
    }).catch(() => {}); // swallow follow-up failure too
  }
})();

return ackResponse;
```

**Staff authorization check (D-05):**
```typescript
const actorEmail = await resolveSlackUserEmail(userId);
const isStaff = actorEmail?.endsWith('@triarchsecurity.com') ?? false;
// Also check project_members wildcard row if desired; @triarchsecurity.com suffix is sufficient per existing pattern
if (!isStaff) {
  return NextResponse.json({
    response_type: 'ephemeral',
    text: ':no_entry: This command requires Triarch staff access.',
  });
}
```

---

### 9. /admin/platform/slack-audit Page Pattern

**Model:** `src/app/admin/platform/projects/page.tsx` — but note this is a **pure client component** (`'use client'` at line 1) that fetches from `/api/platform/projects`. The CONTEXT.md (D-23) specifies a hybrid: server component fetches first page; client handles filters + load-more.

**Recommended split (matching D-23):**
- `src/app/admin/platform/slack-audit/page.tsx` — React server component (no `'use client'`) that:
  1. Calls `getServerSession(authOptions)` 
  2. Calls `getCurrentUserContext(session)`
  3. If `!ctx?.isStaff` → returns `NextResponse.json({ error: 'forbidden' }, { status: 403 })` or redirects to `/admin` (for page routes, redirect is more conventional)
  4. Fetches first page (50 rows) via direct Drizzle query
  5. Renders `<SlackAuditClient initialRows={rows} hasMore={hasMore} />` passing initial data

- `src/app/admin/platform/slack-audit/SlackAuditClient.tsx` — `'use client'` component that:
  1. Uses `useSearchParams()` for filter state
  2. Renders filter inputs + table
  3. Handles load-more via `fetch('/api/admin/slack-audit?...')`

**Alternative (simpler, consistent with projects page):** Make the entire page a client component that does the auth check via `/api/admin/slack-audit` endpoint returning 403. The projects page uses this pattern. Given D-23 says "server component fetches first page", use the hybrid pattern above.

**Drizzle query for audit rows:**
```typescript
import { and, desc, gte, ilike, lte, eq } from 'drizzle-orm';
import { slackActionAudit } from '@/db/schema';

const rows = await db
  .select()
  .from(slackActionAudit)
  .where(and(
    actionIdFilter ? eq(slackActionAudit.actionId, actionIdFilter) : undefined,
    emailFilter ? ilike(slackActionAudit.actorEmail, `%${emailFilter}%`) : undefined,
    fromDate ? gte(slackActionAudit.createdAt, fromDate) : undefined,
    toDate ? lte(slackActionAudit.createdAt, toDate) : undefined,
  ))
  .orderBy(desc(slackActionAudit.createdAt))
  .limit(51) // 50 + 1 for hasMore detection
  .offset(offset);
```

**URL param pattern (D-25, D-26):**
```
/admin/platform/slack-audit?action_id=slack_promote&email=mike&from=2026-04-28&to=2026-05-05&offset=0
```
Client component reads these via `useSearchParams()` and pushes updates via `router.push()`. Server component on first render reads them from `searchParams` prop (Next.js App Router RSC pattern).

---

### 10. AdminSidebar Update

**File:** `src/components/AdminSidebar.tsx`

The sidebar is a thin wrapper around `DynamicSidebar` from `@myalterlego/shared-ui`. Navigation data is fetched dynamically from `/api/platform/navigation`. **The sidebar does NOT contain hardcoded navigation items** — nav entries are DB-driven.

**Implication:** Adding the `/admin/platform/slack-audit` nav link requires adding a row to the `menu_pages` table (or `menu_sections` / `menu_subpages` depending on where it belongs), NOT editing `AdminSidebar.tsx`. The admin seeding mechanism (likely done via the provision scripts or a migration) is where the nav entry goes.

**However**, given that `menu_pages` is DB-driven and this is admin-only, the simplest approach is to either:
1. Add a direct navigation item to the DB (seeded in a Wave 0 or migration step), OR
2. Since staff already have access and the page will be linked from audit trails, skip nav for MVP and document manual URL

Per D-23, the page must exist and be staff-only. Whether it appears in the nav depends on how the DB seeding works. The planner should include a task to add the nav entry to the `menu_pages` table.

---

### 11. recordSlackAudit Helper Design

**New file:** `src/lib/slack-audit.ts`

```typescript
import { createHash } from 'node:crypto';
import { db } from '@/lib/db';
import { slackActionAudit } from '@/db/schema';

export interface SlackAuditInput {
  actionId: string;
  actorEmail: string | null;
  actorSlackId: string;
  rawBody: string;          // hashed to sha256 hex; original NOT stored
  responseStatus: number;
  latencyMs: number;
}

/**
 * Writes a slack_action_audit row. Never throws.
 * Per D-08: on failure, console.warn and continue.
 */
export async function recordSlackAudit(input: SlackAuditInput): Promise<void> {
  try {
    const payloadHash = createHash('sha256').update(input.rawBody).digest('hex');
    await db.insert(slackActionAudit).values({
      actionId: input.actionId,
      actorEmail: input.actorEmail,
      actorSlackId: input.actorSlackId,
      payloadHash,
      responseStatus: input.responseStatus,
      latencyMs: input.latencyMs,
    });
  } catch (err) {
    console.warn('[slack-audit] audit insert failed (best-effort):', err);
  }
}
```

**Insertion point in /api/slack/interact (OTTOBOT-01):**
Add `const requestReceivedAt = Date.now()` at line 23 (before `req.text()`). At each `return NextResponse.json(...)` call, capture `const response = NextResponse.json(...)`, then call `await recordSlackAudit(...)` (best-effort; already in try/catch), then `return response`. Since interact has ~8 return paths, a single helper accepting the response + inputs and calling both `recordSlackAudit` and returning is cleaner than repeating at every return site. Alternative: restructure with a single return at the end.

**Recommended restructure for interact route:** Rather than patching every `return` site, wrap the entire handler body in a try/finally block where the `finally` fires `recordSlackAudit`. Capture `responseStatus` via a mutable variable set before each return:

```typescript
let responseStatus = 200;
let responseBody: Record<string, unknown> = {};
try {
  // ... all existing logic, set responseStatus + responseBody ...
} finally {
  void recordSlackAudit({
    actionId,
    actorEmail: email ?? null,
    actorSlackId: slackUserId ?? 'unknown',
    rawBody,
    responseStatus,
    latencyMs: Date.now() - requestReceivedAt,
  });
}
return NextResponse.json(responseBody, { status: responseStatus });
```

This is the cleanest approach — single audit call, no duplication. The `void` discards the promise; `recordSlackAudit` is internally async but we don't await it to avoid extending latency.

---

## Codebase Patterns

### Pattern 1: Slack-Best-Effort try/catch (D-15 from Phase 6)

Established in `src/app/api/platform/promote-callback/route.ts`:
```typescript
// Best-effort Slack reply — D-15
try {
  await postSlackThreadedReply({ ... });
} catch (slackErr) {
  console.warn('[promote-callback] Slack reply failed:', slackErr);
}
```
`recordSlackAudit` follows the same pattern internally. The audit INSERT is itself best-effort; the route handler does NOT await `recordSlackAudit` in a way that can block the return.

### Pattern 2: Fire-and-Forget Promise

Established in `src/app/api/slack/interact/route.ts` lines 192–200:
```typescript
promoteAndAudit({ ... }).catch((err) => {
  console.error('[slack-interact] promoteAndAudit unexpected error', err);
});
```
The `/triarch deploy` handler uses the same pattern for `dispatchWorkflow` + `response_url` follow-up.

### Pattern 3: getServerSession + getCurrentUserContext for Admin Pages

Established in `src/app/admin/layout.tsx`:
```typescript
const session = await getServerSession(authOptions);
if (!session?.user) { redirect('/login'); }
```
The layout handles authentication. Individual admin pages handle authorization via `getCurrentUserContext(session)`.

For `slack-audit/page.tsx`, the pattern is:
```typescript
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { getCurrentUserContext } from '@/lib/auth-context';

export default async function SlackAuditPage() {
  const session = await getServerSession(authOptions);
  const ctx = await getCurrentUserContext(session);
  if (!ctx?.isStaff) {
    redirect('/admin?error=forbidden');
  }
  // ... fetch + render
}
```

### Pattern 4: Mock Scaffolding in Tests

**Existing `slack-interact.test.ts` mock pattern:**
- `vi.mock('@myalterlego/secrets', ...)` via `process.env` fallback
- `vi.mock('@/lib/db', ...)` — chainable Drizzle mock
- `vi.mock('@/lib/slack-identity', ...)` — resolveSlackUserEmail mock
- `buildSignedRequest(rawBody, opts)` helper generates valid HMAC signature

New tests reuse the same `buildSignedRequest` helper and extend the mock patterns. The `createHmac` import is already established in the test file.

### Pattern 5: Drizzle ORM Method Signatures (needed for new route)

```typescript
// ne (not equal) — needed for activeRCs query
import { and, desc, eq, gte, ilike, inArray, lte, ne, sql } from 'drizzle-orm';
```

`inArray` is used for status filter. `ilike` for email search. `ne` for `branch != 'main'`. These are all standard Drizzle operators already imported in various files.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.x |
| Config file | `vitest.config.ts` (repo root) |
| Environment | `jsdom` (global default, set in Phase 5) |
| Setup file | `vitest.setup.ts` — imports `@testing-library/jest-dom/vitest`, registers `afterEach(cleanup)` |
| `@/` alias | Configured in `vitest.config.ts` |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| OTTOBOT-01 | `recordSlackAudit` computes sha256 hash deterministically | unit | `npx vitest run src/lib/__tests__/slack-audit.test.ts` | ❌ Wave 0 |
| OTTOBOT-01 | Audit insert populates all columns correctly | unit | `npx vitest run src/lib/__tests__/slack-audit.test.ts` | ❌ Wave 0 |
| OTTOBOT-01 | Audit insert failure swallows and console.warns (does not throw) | unit | `npx vitest run src/lib/__tests__/slack-audit.test.ts` | ❌ Wave 0 |
| OTTOBOT-01 | `/api/slack/interact` calls `recordSlackAudit` after each action | unit | `npx vitest run src/lib/__tests__/slack-interact.test.ts` | ✅ (extend) |
| OTTOBOT-03 | `/api/slack/commands` deploy — staff authz passes, `dispatchWorkflow` called with correct args | unit | `npx vitest run src/app/api/slack/commands/route.test.ts` | ❌ Wave 0 |
| OTTOBOT-03 | `/api/slack/commands` deploy — non-staff gets ephemeral `:no_entry:` | unit | `npx vitest run src/app/api/slack/commands/route.test.ts` | ❌ Wave 0 |
| OTTOBOT-03 | `/api/slack/commands` deploy — ephemeral ack returned within handler; fire-and-forget fires | unit | `npx vitest run src/app/api/slack/commands/route.test.ts` | ❌ Wave 0 |
| OTTOBOT-04 | `/api/slack/commands` status — Block Kit sections contain Dev/Prod/RCs/Deploys | unit | `npx vitest run src/app/api/slack/commands/route.test.ts` | ❌ Wave 0 |
| OTTOBOT-04 | `/api/slack/commands` status — unknown project returns ephemeral with project list | unit | `npx vitest run src/app/api/slack/commands/route.test.ts` | ❌ Wave 0 |
| OTTOBOT-04 | `/api/slack/commands` empty `/triarch` — returns help text with both subcommands | unit | `npx vitest run src/app/api/slack/commands/route.test.ts` | ❌ Wave 0 |
| OTTOBOT-05 | `/api/slack/events` `url_verification` — returns challenge without HMAC check | unit | `npx vitest run src/app/api/slack/events/route.test.ts` | ❌ Wave 0 |
| OTTOBOT-05 | `/api/slack/events` `app_mention` `status` — calls status build logic; returns 200 | unit | `npx vitest run src/app/api/slack/events/route.test.ts` | ❌ Wave 0 |
| OTTOBOT-05 | `/api/slack/events` duplicate `event_id` — returns 200 no-op | unit | `npx vitest run src/app/api/slack/events/route.test.ts` | ❌ Wave 0 |
| OTTOBOT-05 | `app_mention` text parsing strips `<@UBOT>` prefix correctly | unit | `npx vitest run src/app/api/slack/events/route.test.ts` | ❌ Wave 0 |
| OTTOBOT-06 | `/admin/platform/slack-audit` — non-staff redirected | RTL | `npx vitest run src/app/admin/platform/slack-audit/page.test.tsx` | ❌ Wave 0 |
| OTTOBOT-06 | SlackAuditClient renders rows with correct column data | RTL | `npx vitest run src/app/admin/platform/slack-audit/SlackAuditClient.test.tsx` | ❌ Wave 0 |
| OTTOBOT-06 | SlackAuditClient filter change updates URL params | RTL | `npx vitest run src/app/admin/platform/slack-audit/SlackAuditClient.test.tsx` | ❌ Wave 0 |
| OTTOBOT-06 | SlackAuditClient load-more appends rows; hides button when no more | RTL | `npx vitest run src/app/admin/platform/slack-audit/SlackAuditClient.test.tsx` | ❌ Wave 0 |

### Test Helper Design: Slack Fixture Factory

**New file:** `src/lib/__tests__/__fixtures__/slack.ts`

```typescript
import { createHmac } from 'node:crypto';

const DEFAULT_SIGNING = 'test_signing_secret';

// Slash command (application/x-www-form-urlencoded)
export function makeSlashCommandPayload(overrides: Partial<{
  command: string;
  text: string;
  userId: string;
  userName: string;
  channelId: string;
  responseUrl: string;
}> = {}): string {
  const params = new URLSearchParams({
    command: overrides.command ?? '/triarch',
    text: overrides.text ?? '',
    user_id: overrides.userId ?? 'U_STAFF',
    user_name: overrides.userName ?? 'mike',
    channel_id: overrides.channelId ?? 'C_GENERAL',
    response_url: overrides.responseUrl ?? 'https://hooks.slack.com/commands/test',
    team_id: 'T_TEST',
    api_app_id: 'A_TEST',
  });
  return params.toString();
}

// Events API (JSON body)
export function makeEventPayload(overrides: Partial<{
  type: string;
  eventId: string;
  eventType: string;
  userId: string;
  text: string;
  channel: string;
  ts: string;
  challenge: string;
}> = {}): string {
  if (overrides.type === 'url_verification' || overrides.challenge) {
    return JSON.stringify({
      type: 'url_verification',
      challenge: overrides.challenge ?? 'test-challenge-abc',
      token: 'test-token',
    });
  }
  return JSON.stringify({
    type: 'event_callback',
    token: 'test-token',
    team_id: 'T_TEST',
    api_app_id: 'A_TEST',
    event_id: overrides.eventId ?? 'Ev_TEST_001',
    event_time: 1715000000,
    event: {
      type: overrides.eventType ?? 'app_mention',
      user: overrides.userId ?? 'U_CUSTOMER',
      text: overrides.text ?? '<@UBOT> status truth-treason',
      ts: overrides.ts ?? '1715000000.000100',
      channel: overrides.channel ?? 'C_GENERAL',
      event_ts: overrides.ts ?? '1715000000.000100',
    },
  });
}

// Signed Request builder (reusable across all 3 Slack routes)
export function buildSignedSlackRequest(
  url: string,
  rawBody: string,
  contentType: 'application/x-www-form-urlencoded' | 'application/json',
  opts: { signingSecret?: string; tsOffsetSec?: number; tamperSig?: boolean } = {}
): Request {
  const secret = opts.signingSecret ?? DEFAULT_SIGNING;
  const ts = String(Math.floor(Date.now() / 1000) + (opts.tsOffsetSec ?? 0));
  let sig = 'v0=' + createHmac('sha256', secret).update(`v0:${ts}:${rawBody}`).digest('hex');
  if (opts.tamperSig) {
    sig = sig.slice(0, -2) + (sig.endsWith('aa') ? 'bb' : 'aa');
  }
  return new Request(url, {
    method: 'POST',
    body: rawBody,
    headers: new Headers({
      'x-slack-request-timestamp': ts,
      'x-slack-signature': sig,
      'content-type': contentType,
    }),
  });
}

// Interactive payload (existing interact route format — for extending slack-interact.test.ts)
export function makeSlackInteractPayload(overrides: Partial<{
  actionId: string;
  value: string;
  userId: string;
  channelId: string;
  messageTs: string;
}> = {}): string {
  const p = {
    type: 'block_actions',
    user: { id: overrides.userId ?? 'U_STAFF', name: 'mike', username: 'mike' },
    actions: [{ action_id: overrides.actionId ?? 'slack_promote', value: overrides.value ?? 'test', block_id: 'b1' }],
    channel: { id: overrides.channelId ?? 'C_RELEASE', name: 'release-approvals' },
    message: { ts: overrides.messageTs ?? '1714000000.000100' },
  };
  return new URLSearchParams({ payload: JSON.stringify(p) }).toString();
}
```

**Model:** The existing `slack-interact.test.ts` `buildSignedRequest` + `payloadBody` helpers are the immediate prior art. The fixture factory centralizes these patterns for the three new route test files.

### Sampling Rate

- **Per task commit:** `npx vitest run src/app/api/slack/commands/route.test.ts` (or whichever task's files changed)
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `src/lib/__tests__/slack-audit.test.ts` — covers OTTOBOT-01 `recordSlackAudit` unit tests
- [ ] `src/lib/__tests__/__fixtures__/slack.ts` — shared Slack fixture factory
- [ ] `src/app/api/slack/commands/route.test.ts` — covers OTTOBOT-03, OTTOBOT-04
- [ ] `src/app/api/slack/events/route.test.ts` — covers OTTOBOT-05
- [ ] `src/app/admin/platform/slack-audit/page.test.tsx` — covers OTTOBOT-06 staff gate
- [ ] `src/app/admin/platform/slack-audit/SlackAuditClient.test.tsx` — covers OTTOBOT-06 UI behaviors
- [ ] Extend `src/lib/__tests__/slack-interact.test.ts` — add audit-call assertions after each action (OTTOBOT-01)

No framework changes needed — Vitest 4.x + jsdom is already configured; `@testing-library/react` is already installed per Phase 5.

---

## Implementation Approach

### Recommended Plan Sequencing (5–6 plans)

**Plan 07-01: Wave 0 + recordSlackAudit helper + /api/slack/interact audit wire-up (OTTOBOT-01)**
- Create `src/lib/__tests__/__fixtures__/slack.ts`
- Create `src/lib/__tests__/slack-audit.test.ts` (RED stubs)
- Create stub files for the 4 other new test files (RED)
- Implement `src/lib/slack-audit.ts` → tests GREEN
- Add `requestReceivedAt = Date.now()` + `recordSlackAudit` call to `/api/slack/interact/route.ts`
- Extend `slack-interact.test.ts` to assert audit call presence
- Deliverable: OTTOBOT-01 complete; audit helper available for Plans 02–04

**Plan 07-02: POST /api/slack/commands — help + status subcommand (OTTOBOT-04)**
- Create `src/app/api/slack/commands/route.ts`
- Implement HMAC verification, URLSearchParams parse, status DB query, Block Kit builder, `humanizeDate`, help text
- `commands/route.test.ts` tests for help + status GREEN
- Auth on status = project-member check (D-06)
- Deliverable: OTTOBOT-04 complete

**Plan 07-03: POST /api/slack/commands — deploy subcommand (OTTOBOT-03)**
- Add deploy branch to existing `commands/route.ts`
- Staff authz (D-05), release lookup, `dispatchWorkflow`, fire-and-forget `response_url` follow-up
- Add deploy tests to `commands/route.test.ts` GREEN
- Deliverable: OTTOBOT-03 complete

**Plan 07-04: POST /api/slack/events — url_verification + app_mention (OTTOBOT-05)**
- Create `src/app/api/slack/events/route.ts`
- `url_verification` challenge handler (no HMAC)
- `app_mention` → strip mention, route to status/help, threaded reply via `postSlackThreadedReply`
- `isDuplicateEvent` dedup helper (inline or `dedup.ts`)
- `events/route.test.ts` tests GREEN
- HUMAN-UAT step: scope upgrade (OTTOBOT-02) + Events API URL configuration in api.slack.com
- Deliverable: OTTOBOT-02 (HUMAN), OTTOBOT-05 complete

**Plan 07-05: /admin/platform/slack-audit viewer (OTTOBOT-06)**
- Create `src/app/admin/platform/slack-audit/page.tsx` (RSC with staff gate)
- Create `src/app/admin/platform/slack-audit/SlackAuditClient.tsx` (client; filters + load-more + row expand)
- Create `/api/admin/slack-audit/route.ts` (GET; applies filters, returns paginated rows)
- Add nav entry to `menu_pages` DB table (seed in plan or migration step)
- `page.test.tsx` + `SlackAuditClient.test.tsx` GREEN
- Deliverable: OTTOBOT-06 complete

**Plan 07-06: Onboarding docs update + final integration smoke**
- Update `docs/onboarding-projects.md` with OttoBot scope upgrade steps (Step 10)
- Document `https://admin.triarch.dev/api/slack/commands` + `https://admin.triarch.dev/api/slack/events` Slack App configuration
- Full `npx vitest run` green confirmation
- Deliverable: Docs current; phase complete

---

## Risks & Pitfalls

### Pitfall 1: Slack Body Consumption — `req.text()` Must Come First

**What goes wrong:** Calling `req.json()` or `req.formData()` before `req.text()` consumes the ReadableStream. The HMAC verification then receives an empty string, causing permanent `bad_signature` failures.

**Mitigation:** Always call `const rawBody = await req.text()` as the FIRST line after timing capture. Then parse with `JSON.parse(rawBody)` or `new URLSearchParams(rawBody)` on the already-read string. The current `/api/slack/interact` does this correctly (line 27) — replicate verbatim.

**Warning sign:** 401 `bad_signature` on all requests even with correct credentials.

---

### Pitfall 2: `url_verification` Does Not Use HMAC

**What goes wrong:** Running `verifySlackSignature` on a `url_verification` request fails because Slack sends it before the signing secret relationship is established. The `url_verification` body uses `application/json` and has no Slack headers.

**Mitigation:** Parse the raw body as JSON first. If `body.type === 'url_verification'`, immediately return `{ challenge: body.challenge }` — skip HMAC entirely. This is the documented Slack behavior.

**Warning sign:** Slack Events UI shows "Your URL didn't respond with the value of the `challenge` parameter."

---

### Pitfall 3: Slack `application/x-www-form-urlencoded` vs JSON

**What goes wrong:** `/api/slack/commands` receives form-encoded data, not JSON. Calling `req.json()` throws a parse error. The `payload` field in `/api/slack/interact` is also form-encoded (the outer wrapper), but the inner payload is JSON (extracted with `params.get('payload')` then `JSON.parse()`).

**Mitigation:**
- `/api/slack/commands` → `new URLSearchParams(rawBody)` 
- `/api/slack/interact` → `new URLSearchParams(rawBody)` then `JSON.parse(params.get('payload'))`
- `/api/slack/events` → `JSON.parse(rawBody)` directly

---

### Pitfall 4: Audit Must Not Block Slack 3-Second Response

**What goes wrong:** Awaiting `recordSlackAudit` inside the critical path delays the response. Slack retries after 3 seconds, causing duplicate actions and doubled audit rows.

**Mitigation (D-08):** Use `void recordSlackAudit(...)` or fire with `.catch()` (never `await`). The helper is `async` and internally catches its own errors. The route handler's response is returned before the audit insert completes. This is explicitly the pattern: Slack 3-second rule wins; audit is best-effort.

---

### Pitfall 5: `/triarch deploy` Dispatch Does Not Return a Run URL

**What goes wrong:** GitHub's `workflow_dispatch` API returns 204 with no body. There is no run ID or URL in the response. Attempting to construct a run URL from the response fails.

**Mitigation:** Use the GitHub Actions runs page URL for the workflow as a best-effort link: `https://github.com/{owner}/{repo}/actions/workflows/promote-branch.yml`. This is a stable, always-accessible URL the user can click to see the queued/running job.

---

### Pitfall 6: Bot's Own Messages Triggering app_mention Loop

**What goes wrong:** If OttoBot posts a message containing `<@UBOT>`, Slack may fire an `app_mention` event for it. The bot then replies, potentially looping.

**Mitigation:** Check `event.user !== botUserId` before processing. Store bot user ID as env var `SLACK_BOT_USER_ID` (plain env, not a secret — it's public in Slack). If not set, rely on dedup: a looped reply would have a different `event_id` per Slack message, but the same channel + thread context would look suspicious. In practice, status replies don't mention the bot, so loops are unlikely. Log a warning if the event user matches the bot.

---

### Pitfall 7: `ilike` on NULL `actor_email`

**What goes wrong:** Drizzle's `ilike` on a nullable column matches only non-null rows. Passing an empty string filter (`email=''`) could inadvertently filter out all null-email rows.

**Mitigation:** Only apply the `ilike` filter when the query param is non-empty:
```typescript
emailFilter?.trim() ? ilike(slackActionAudit.actorEmail, `%${emailFilter}%`) : undefined
```
`and(..., undefined)` in Drizzle is treated as no condition — confirmed by Drizzle ORM behavior.

---

### Pitfall 8: Status Query Returns Stale RCs After Promotion

**What goes wrong:** A branch RC with status `promoted` or `rejected` might still appear as "Active" if the status filter is wrong.

**Mitigation:** The Active RCs filter explicitly uses `inArray(releaseLogs.status, ['dev', 'pending_approval', 'approved'])`. `promoted` and `rejected` are excluded. Double-check the exact status strings against the schema (`status varchar(24)` per `src/db/schema.ts` line 148).

---

### Pitfall 9: `getServerSession` in RSC Returns Null in Vitest jsdom

**What goes wrong:** Testing the RSC `page.tsx` with RTL renders `getServerSession` which requires a real HTTP request context — unavailable in jsdom.

**Mitigation:** Mock `next-auth` in the RSC test:
```typescript
vi.mock('next-auth', () => ({ getServerSession: vi.fn() }));
vi.mock('@/lib/auth-context', () => ({ getCurrentUserContext: vi.fn() }));
```
Return either a staff context or null to test the two cases. This is the pattern used by existing admin page tests — see how `release-concurrent.test.ts` mocks collaborators.

---

### Pitfall 10: AdminSidebar Is Dynamic (DB-Driven), Not Hardcoded

**What goes wrong:** Editing `AdminSidebar.tsx` to add a nav link for `/admin/platform/slack-audit` has no effect — navigation is fetched from `/api/platform/navigation` which reads `menu_pages`.

**Mitigation:** The plan must include a DB seed step to insert the `slack-audit` page into `menu_pages` under the appropriate section. The planner should reference the `menu_pages` schema fields: `sectionId`, `key`, `label`, `path`, `minRole` (set to `'staff'`), `isActive`.

---

## Open Questions

None — ready to plan.

All integration points are verified against existing code. All Slack API behaviors are confirmed against official documentation and are consistent with the existing `/api/slack/interact` implementation. The HMAC/rawBody pattern, fire-and-forget dispatch pattern, and Slack-best-effort try/catch pattern are all already in the codebase.

---

## Sources

### Primary (HIGH confidence — verified against existing codebase)

- `src/app/api/slack/interact/route.ts` — rawBody capture pattern, HMAC verification flow, fire-and-forget dispatch, response shapes
- `src/lib/slack-crypto.ts` — `verifySlackSignature` signature, `getSecret` vault integration, 5-minute replay window
- `src/lib/slack-identity.ts` — `resolveSlackUserEmail` (exported function name, vault-backed)
- `src/lib/github-app.ts` — `dispatchWorkflow` input/output shape (returns `{ ok: true, status: 204 }`, no run URL)
- `src/db/schema.ts` — `slackActionAudit` columns, `releaseLogs` status values, `projects` columns
- `src/lib/auth-context.ts` — `getCurrentUserContext` + `ctx.isStaff` pattern
- `src/lib/__tests__/slack-interact.test.ts` — test mock patterns, `buildSignedRequest` helper
- `src/app/admin/platform/projects/page.tsx` — admin page structure pattern
- `vitest.config.ts` + `vitest.setup.ts` — test configuration

### Secondary (MEDIUM confidence — official Slack platform docs)

- Slack Slash Commands: `https://api.slack.com/interactivity/slash-commands` — payload fields, response_url behavior, 30-minute validity
- Slack Events API: `https://api.slack.com/apis/events-api` — app_mention shape, url_verification handshake, retry behavior
- Slack Block Kit: `https://api.slack.com/block-kit` — section/fields/header/divider block shapes, 40,000 char limit

---

## RESEARCH COMPLETE
