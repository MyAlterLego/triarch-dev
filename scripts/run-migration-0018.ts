import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
// DATABASE_URL provided via inline env (no .env.local in this repo).

const MIGRATION_FILE = '0018_agent_identities.sql';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error('DATABASE_URL not set'); process.exit(1); }
  const filePath = path.join(__dirname, '..', 'src', 'db', 'migrations', MIGRATION_FILE);
  const sql = fs.readFileSync(filePath, 'utf8');
  const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
  const c = await pool.connect();
  try {
    console.log(`Applying ${MIGRATION_FILE} ...`);
    await c.query(sql);
    console.log('Migration applied.');

    const { rows: agents } = await c.query(
      'SELECT name, persona_name, api_key_prefix, jsonb_array_length(scopes) AS scope_count, email FROM agent_identities ORDER BY name'
    );
    console.log('\nSeeded agent identities:');
    for (const r of agents) {
      console.log(`  ${r.name.padEnd(20)} ${r.persona_name?.padEnd(20) ?? ''}  prefix=${r.api_key_prefix}  scopes=${r.scope_count}  email=${r.email}`);
    }

    const { rows: memberships } = await c.query(
      "SELECT project_key, email, role FROM project_members WHERE email IN ('operator@triarch.dev','algorithm@triarch.dev') ORDER BY email"
    );
    console.log('\nWildcard membership rows:');
    for (const r of memberships) {
      console.log(`  ${r.email.padEnd(30)} project_key=${r.project_key}  role=${r.role}`);
    }

    console.log('\nNext: run scripts/mint-agent-token.ts --agent <name> for operator and algorithm.');
  } finally {
    c.release(); await pool.end();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
