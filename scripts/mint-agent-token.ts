#!/usr/bin/env tsx
// scripts/mint-agent-token.ts
//
// Generate (or rotate) an agent API token.
// Outputs the plaintext token ONCE to stdout for capture, then updates the
// agent_identities row's api_key_hash + api_key_prefix.
//
// Self-contained: matches the style of run-migration-0010.ts (direct pg Pool +
// dotenv, no @/ aliases, no Drizzle ORM) so it works the same way as your
// other admin scripts.
//
// Usage:
//   npx tsx scripts/mint-agent-token.ts --agent engagement-lead
//   npx tsx scripts/mint-agent-token.ts --agent operator --rotate

import { Pool } from 'pg';
import { createHash, randomBytes } from 'node:crypto';

function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

function generateAgentToken(): { plaintext: string; apiKeyHash: string; apiKeyPrefix: string } {
  const prefix = randomBytes(4).toString('hex');   // 8 hex chars
  const secret = randomBytes(16).toString('hex');  // 32 hex chars
  const plaintext = `tak_${prefix}_${secret}`;
  return {
    plaintext,
    apiKeyHash: sha256Hex(plaintext),
    apiKeyPrefix: `tak_${prefix}`,
  };
}

async function main() {
  console.log('mint-agent-token starting…');

  // Parse args
  const args = process.argv.slice(2);
  let agentName = '';
  let rotate = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--agent') agentName = args[i + 1] ?? '';
    if (args[i] === '--rotate') rotate = true;
  }

  if (!agentName) {
    console.error('Usage: npx tsx scripts/mint-agent-token.ts --agent <name> [--rotate]');
    process.exit(1);
  }

  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL not set (check .env.local)');
    process.exit(1);
  }

  console.log(`Connecting to database…`);
  const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
  const c = await pool.connect();

  try {
    // Look up the agent row
    const lookup = await c.query<{ id: string; api_key_hash: string }>(
      'SELECT id, api_key_hash FROM agent_identities WHERE name = $1',
      [agentName],
    );

    if (lookup.rowCount === 0) {
      console.error(`Agent '${agentName}' not found in agent_identities.`);
      console.error('Run migration 0011_agent_identities.sql first.');
      process.exit(2);
    }

    const row = lookup.rows[0];
    const isPlaceholder = row.api_key_hash.startsWith('PLACEHOLDER_PENDING_');

    if (!isPlaceholder && !rotate) {
      console.error(`Agent '${agentName}' already has an active API key.`);
      console.error('Pass --rotate to replace it (and update Secret Manager + restart MCP clients).');
      process.exit(3);
    }

    // Generate and store
    const { plaintext, apiKeyHash, apiKeyPrefix } = generateAgentToken();

    await c.query(
      'UPDATE agent_identities SET api_key_hash = $1, api_key_prefix = $2 WHERE id = $3',
      [apiKeyHash, apiKeyPrefix, row.id],
    );

    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`✓ Token minted for agent: ${agentName}`);
    // apiKeyPrefix is the public 8-char identifier (stored as agent_identities.api_key_prefix
    // for display in admin UI/CLI). It is NOT secret material; only the full plaintext token
    // — printed below this block — is.
    // codeql[js/clear-text-logging]
    console.log(`  prefix:    ${apiKeyPrefix}`);
    // apiKeyHash is sha256(plaintext) — by design, this hash is what's stored in the DB.
    // Logging the first 16 chars is for operator confirmation; the full token cannot be
    // reversed from this hash.
    // codeql[js/clear-text-logging]
    console.log(`  hash (db): ${apiKeyHash.slice(0, 16)}…`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log('Plaintext token (store NOW; will not be shown again):');
    console.log('');
    console.log(`  ${plaintext}`);
    console.log('');
    console.log('To store in GCP Secret Manager:');
    console.log('');
    console.log(`  printf '%s' '${plaintext}' | gcloud secrets create triarch-agent-token-${agentName} \\`);
    console.log(`    --data-file=- --replication-policy=automatic`);
    console.log('');
    console.log('Or for rotation:');
    console.log('');
    console.log(`  printf '%s' '${plaintext}' | gcloud secrets versions add triarch-agent-token-${agentName} \\`);
    console.log(`    --data-file=-`);
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  } finally {
    c.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(99);
});
