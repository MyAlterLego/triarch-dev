/**
 * Direct CLI invocation of the destruction primitives for thisnthat.
 * Uses the same lib functions the admin's POST /destroy route calls,
 * so this is functionally identical to running it through the system.
 *
 * Usage: npx tsx scripts/destroy-thisnthat.ts
 *
 * Required env (script reads from thisnthat .env.local where convenient):
 *   - DATABASE_URL          cluster admin URL (defaultdb on triarchdev-24092)
 *   - GODADDY_API_KEY       GoDaddy production key
 *   - GODADDY_API_SECRET    GoDaddy production secret
 *   - GITHUB_TOKEN          must have delete_repo scope
 *   - GCLOUD_ACCESS_TOKEN   from `gcloud auth print-access-token`
 */
import { Pool } from 'pg';
import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import {
  dropCrdbDatabaseAndUser,
  removeDnsRecords,
  deleteGithubRepo,
  deleteFirebaseProject,
} from '../src/lib/decommission';

const TARGET = {
  registryKey: 'thisnthat',
  crdbDatabase: 'thisandthat',
  crdbUser: 'thisandthat',
  subdomain: 'thisnthat',
  githubRepo: 'MyAlterLego/thisnthat',
  firebaseProjectId: 'triarchdev-thisandthat',
};

function loadEnv(): {
  triarchDevUrl: string;
  clusterAdminUrl: string;
  godaddyKey: string;
  godaddySecret: string;
  ghToken: string;
  gcloudToken: string;
} {
  const env = readFileSync(
    '/Users/mikegeehan/claude/triarch/development/thisnthat/.env.local',
    'utf8'
  );
  const dbLine = env.split('\n').find((l) => l.startsWith('DATABASE_URL=')) ?? '';
  const thisnthatUrl = dbLine.replace(/^DATABASE_URL=/, '');
  const triarchDevUrl = thisnthatUrl.replace('/thisandthat?', '/triarch_dev?');
  const clusterAdminUrl = thisnthatUrl.replace('/thisandthat?', '/defaultdb?');

  const godaddyKey = process.env.GODADDY_API_KEY || '';
  const godaddySecret = process.env.GODADDY_API_SECRET || '';
  const ghToken = process.env.GITHUB_TOKEN || execSync('gh auth token').toString().trim();
  const gcloudToken =
    process.env.GCLOUD_ACCESS_TOKEN ||
    execSync('gcloud auth print-access-token').toString().trim();

  return { triarchDevUrl, clusterAdminUrl, godaddyKey, godaddySecret, ghToken, gcloudToken };
}

async function main() {
  const env = loadEnv();
  console.log('═══ DESTROYING thisnthat — burn it all down ═══\n');

  // 1. Drop CRDB DB + user
  console.log('1. CRDB drop database + user...');
  const crdb = await dropCrdbDatabaseAndUser(
    TARGET.crdbDatabase,
    TARGET.crdbUser,
    env.clusterAdminUrl
  );
  console.log('   db:   ', crdb.database);
  console.log('   user: ', crdb.user);

  // 2. Remove DNS records
  console.log('\n2. GoDaddy DNS removal...');
  if (!env.godaddyKey || !env.godaddySecret) {
    console.log(
      '   SKIPPED — GODADDY_API_KEY/SECRET not in env. Will use GoDaddy MCP from main Claude session instead.'
    );
  } else {
    const dns = await removeDnsRecords(TARGET.subdomain, env.godaddyKey, env.godaddySecret);
    for (const r of dns) console.log(`   ${r.type} ${r.name}:`, r.result);
  }

  // 3. Delete GitHub repo
  console.log('\n3. GitHub repo delete...');
  const gh = await deleteGithubRepo(TARGET.githubRepo, env.ghToken);
  console.log('   ', gh);

  // 4. Delete Firebase / GCP project
  console.log('\n4. Firebase / GCP project delete...');
  const fb = await deleteFirebaseProject(TARGET.firebaseProjectId, env.gcloudToken);
  console.log('   ', fb);

  // 5. Delete registry row
  console.log('\n5. Delete registry row...');
  const pool = new Pool({ connectionString: env.triarchDevUrl });
  try {
    const res = await pool.query(
      `DELETE FROM projects WHERE key = $1 RETURNING id, name`,
      [TARGET.registryKey]
    );
    if (res.rowCount && res.rowCount > 0) {
      console.log(`   { ok: true, detail: 'deleted registry row for ${res.rows[0].name}' }`);
    } else {
      console.log(`   { ok: true, detail: 'no row found for key=${TARGET.registryKey}' }`);
    }
  } finally {
    await pool.end();
  }

  console.log('\n═══ DONE — thisnthat decommissioned ═══');
}

main().catch((err) => {
  console.error('\n✖ Destruction failed:', err);
  process.exit(1);
});
