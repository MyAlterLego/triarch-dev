// Re-exports the shared schema, then adds dev/admin-local table definitions
// that don't belong in the shared package (avoids cross-repo publish dance
// for tables only this app uses).

export * from '@triarchsecurity/triarch-shared/schema';

// Imports needed for the local additions below.
import { pgTable, uuid, text, jsonb, timestamp } from 'drizzle-orm/pg-core';

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
