// Re-exports the shared schema, then adds dev/admin-local table definitions
// that don't belong in the shared package (avoids cross-repo publish dance
// for tables only this app uses).

export * from '@triarchsecurity/triarch-shared/schema';

// Imports needed for the local additions below.
import { pgTable, uuid, text, jsonb, timestamp, index } from 'drizzle-orm/pg-core';

// ─── Agent identities (Sitting H — migration 0018) ─────────────────────────
// Drizzle definition for the agent_identities table introduced in
// migration 0018_agent_identities.sql. Auth surface for /api/agents/*
// reads of project state.
//
// Pattern matches admin.triarchsecurity.com's agent_identities (migration
// 0011 over there). The two tables live in separate databases and do NOT
// share rows.

export const agentIdentities = pgTable('agent_identities', {
  id:             uuid('id').defaultRandom().primaryKey(),
  name:           text('name').notNull().unique(),
  personaName:    text('persona_name'),
  description:    text('description'),
  apiKeyHash:     text('api_key_hash').notNull().unique(),
  apiKeyPrefix:   text('api_key_prefix').notNull(),
  scopes:         jsonb('scopes').notNull().default([]),
  email:          text('email'),
  createdAt:      timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy:      text('created_by').notNull(),
  lastUsedAt:     timestamp('last_used_at', { withTimezone: true }),
  disabledAt:     timestamp('disabled_at', { withTimezone: true }),
});

// Type helpers for use in route handlers
export type AgentIdentity = typeof agentIdentities.$inferSelect;
export type NewAgentIdentity = typeof agentIdentities.$inferInsert;

// Scope constants — single source of truth, import in route handlers
// to avoid typo drift. Dev-side surface is read-only at v1; triage/write
// scopes can be added later if/when agents need to mutate project state.
export const AGENT_SCOPES = {
  // Reads
  READ_PROJECTS:   'read:projects',

  // Universal
  WRITE_AUDIT:     'write:audit',  // every agent has this
} as const;

export type AgentScope = (typeof AGENT_SCOPES)[keyof typeof AGENT_SCOPES];

/**
 * Check whether an agent has a given scope. Used in route handler middleware.
 */
export function agentHasScope(agent: AgentIdentity, scope: AgentScope): boolean {
  const scopes = agent.scopes as string[];
  return scopes.includes(scope);
}

// ─── Deploy gate check (CL-6 — Phase 27 — migration 0019) ──────────────────
// Audit + lookup table for the CL-6 server-side adoption enforcement.
// The /api/platform/cicd/gate-verdict POST endpoint writes a row per gate
// outcome; the /api/platform/ingest/release-logs route reads the most
// recent row (project_key, created_at DESC, last 15 min) and rejects prod
// ingests when no passing verdict is paired with this Bearer apiKey.
//
// verdict values:
//   'pass'             — workflow gate ran and approved this target_version
//   'fail'             — workflow gate ran and rejected this target_version
//   'reject_no_pair'   — synthetic: ingest endpoint itself writes this when
//                        a prod ingest arrived with no paired pass-verdict
//                        in the prior 15 min. Distinguishes "gate ran and
//                        said fail" from "consumer skipped the gate entirely."
//
// api_key_hash is SHA-256 hex of the Bearer apiKey (never plaintext) so
// an audit-log dump never leaks credentials.

export const deployGateCheck = pgTable('deploy_gate_check', {
  id:              uuid('id').defaultRandom().primaryKey(),
  projectKey:      text('project_key').notNull(),
  targetVersion:   text('target_version').notNull(),
  verdict:         text('verdict').notNull(),           // 'pass' | 'fail' | 'reject_no_pair' — validated in route handlers, no DB CHECK constraint
  devVersion:      text('dev_version').notNull(),
  apiKeyHash:      text('api_key_hash').notNull(),       // SHA-256 hex of Bearer token
  reason:          text('reason'),                       // nullable
  workflowRunUrl:  text('workflow_run_url'),              // nullable
  createdAt:       timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('deploy_gate_check_project_created_at_idx').on(
    table.projectKey,
    table.createdAt.desc(),
  ),
]);

export type DeployGateCheck = typeof deployGateCheck.$inferSelect;
export type NewDeployGateCheck = typeof deployGateCheck.$inferInsert;
