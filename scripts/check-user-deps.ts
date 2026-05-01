import { Pool } from 'pg';
import { readFileSync } from 'fs';

const env = readFileSync(
  '/Users/mikegeehan/claude/triarch/development/thisnthat/.env.local',
  'utf8'
);
const dbLine = env.split('\n').find((l) => l.startsWith('DATABASE_URL=')) ?? '';
const adminUrl = dbLine.replace(/^DATABASE_URL=/, '').replace('/thisandthat?', '/defaultdb?');

async function main() {
  const pool = new Pool({ connectionString: adminUrl });
  try {
    const users = await pool.query(`SELECT username FROM [SHOW USERS] WHERE username NOT IN ('node', 'admin', 'root') ORDER BY username`);
    console.log('Active CRDB users:');
    for (const r of users.rows) console.log(`  - ${r.username}`);

    console.log('\nObjects owned by thisandthat:');
    const owned = await pool.query(
      `SELECT table_catalog, table_schema, table_name
         FROM "".information_schema.tables
        WHERE table_catalog NOT IN ('system', 'crdb_internal', 'information_schema', 'pg_catalog', 'pg_extension')`
    );
    for (const r of owned.rows) {
      const own = await pool.query(`SHOW GRANTS ON TABLE "${r.table_catalog}".${r.table_schema}."${r.table_name}" FOR thisandthat`);
      if (own.rowCount && own.rowCount > 0) {
        console.log(`  - ${r.table_catalog}.${r.table_schema}.${r.table_name}`);
      }
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
