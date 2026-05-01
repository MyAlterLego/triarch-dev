import { Pool } from 'pg';
import { readFileSync } from 'fs';

const env = readFileSync(
  '/Users/mikegeehan/claude/triarch/development/thisnthat/.env.local',
  'utf8'
);
const dbLine = env.split('\n').find((l) => l.startsWith('DATABASE_URL=')) ?? '';
const triarchDevUrl = dbLine.replace(/^DATABASE_URL=/, '').replace('/thisandthat?', '/triarch_dev?');

async function main() {
  const pool = new Pool({ connectionString: triarchDevUrl });
  try {
    const res = await pool.query(
      `SELECT id, key, name, github_repo, firebase_project_id, crdb_cluster, crdb_database,
              crdb_user, subdomain, custom_domain, deployed_url, current_version, status, ecosystem
         FROM projects WHERE key = 'thisnthat'`
    );
    if (!res.rowCount) {
      console.log('No thisnthat row in registry.');
      return;
    }
    console.log(JSON.stringify(res.rows[0], null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
