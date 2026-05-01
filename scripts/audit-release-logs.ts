/**
 * Audit which projects have release_logs entries vs which are missing.
 * Reads DATABASE_URL from process.env (we no longer rely on the deleted
 * thisnthat .env.local — pass via env or use a project that still exists).
 */
import { Pool } from 'pg';
import { readFileSync } from 'fs';

function loadDbUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  // Fallback: pull from any working project's .env.local that uses the dev cluster
  const candidates = [
    '/Users/mikegeehan/claude/triarch/development/tmi/.env.local',
    '/Users/mikegeehan/claude/triarch/development/www/.env.local',
    '/Users/mikegeehan/claude/triarch/development/rpg/darksouls-rpg/.env.local',
  ];
  for (const path of candidates) {
    try {
      const env = readFileSync(path, 'utf8');
      const dbLine = env.split('\n').find((l) => l.startsWith('DATABASE_URL='));
      if (!dbLine) continue;
      const url = dbLine.replace(/^DATABASE_URL=/, '');
      return url.replace(/\/[^/?]+\?/, '/triarch_dev?');
    } catch {
      continue;
    }
  }
  throw new Error('No DATABASE_URL available');
}

async function main() {
  const pool = new Pool({ connectionString: loadDbUrl() });
  try {
    const counts = await pool.query(
      `SELECT project, count(*)::int AS n, max(released_at) AS latest
         FROM release_logs GROUP BY project ORDER BY n DESC`
    );
    console.log('Release logs by project:');
    for (const r of counts.rows) {
      const latest = r.latest ? new Date(r.latest).toISOString() : '-';
      console.log(`  ${r.project.padEnd(28)} ${String(r.n).padStart(4)} entries — latest: ${latest}`);
    }

    const total = await pool.query(`SELECT count(*)::int AS n FROM release_logs`);
    console.log(`\nTotal release_logs rows: ${total.rows[0].n}`);

    const reg = await pool.query(`SELECT key, github_repo FROM projects ORDER BY key`);
    console.log(`\nProjects in registry (${reg.rows.length}):`);
    for (const p of reg.rows) {
      const haveLogs = counts.rows.find((c) => c.project === p.key);
      const status = haveLogs ? `${haveLogs.n} logs` : 'NO LOGS';
      console.log(`  ${p.key.padEnd(28)} ${(p.github_repo ?? '(no repo)').padEnd(40)} ${status}`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
