/**
 * Migration runner for 0022_bug_reports_build_plan.sql.
 *
 * Adds the build_plan, build_plan_status, estimated_effort columns to
 * bug_reports and seeds the menu_pages row for /admin/modules/build-queue.
 *
 * Uses Node 22's process.loadEnvFile (no dotenv dep) per the
 * security-portal lesson where dotenv was an unwanted dependency add.
 *
 * Usage:
 *   npx tsx scripts/run-migration-0022.ts
 *
 * Reads DATABASE_URL from .env.local at the repo root. If running this
 * from a non-root cwd the path.resolve anchors it to this file's parent.
 */
import { Pool } from 'pg';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';

const MIGRATION_FILE = '0022_bug_reports_build_plan.sql';

async function main() {
  // Anchor .env.local path to the repo root (one level up from scripts/).
  const envPath = path.resolve(__dirname, '..', '.env.local');
  try {
    process.loadEnvFile(envPath);
  } catch (e) {
    // Allow inline DATABASE_URL to win if .env.local is missing.
    console.warn(`[warn] Could not load ${envPath}: ${(e as Error).message}`);
  }

  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL not set (neither in env nor in .env.local).');
    process.exit(1);
  }

  const filePath = path.resolve(__dirname, '..', 'src', 'db', 'migrations', MIGRATION_FILE);
  const sql = readFileSync(filePath, 'utf8');

  const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
  const c = await pool.connect();
  try {
    console.log(`=== Apply ${MIGRATION_FILE} ===`);
    await c.query(sql);
    console.log('  done');

    console.log('\n=== Verify bug_reports plan columns ===');
    const cols = await c.query<{ column_name: string; data_type: string }>(
      `SELECT column_name, data_type
         FROM information_schema.columns
        WHERE table_name = 'bug_reports'
          AND column_name IN ('build_plan', 'build_plan_status', 'estimated_effort')
        ORDER BY column_name`,
    );
    cols.rows.forEach((r) => console.log(`  ${r.column_name.padEnd(20)} ${r.data_type}`));
    const colNames = new Set(cols.rows.map((r) => r.column_name));
    const expected = ['build_plan', 'build_plan_status', 'estimated_effort'];
    const missing = expected.filter((n) => !colNames.has(n));
    if (missing.length > 0) {
      console.error(`  FAIL: missing columns: ${missing.join(', ')}`);
      process.exit(1);
    }
    console.log('  OK: all three columns present');

    console.log('\n=== Verify Build Queue menu_pages row ===');
    const navRows = await c.query<{ section: string; page: string; path: string }>(
      `SELECT s.label AS section, p.label AS page, p.path
         FROM menu_pages p
         JOIN menu_sections s ON s.id = p.section_id
        WHERE s.project = 'triarch-dev'
          AND s.key = 'modules'
          AND p.key = 'build-queue'`,
    );
    if (navRows.rows.length !== 1) {
      console.error(`  FAIL: expected 1 build-queue menu_pages row, got ${navRows.rows.length}`);
      process.exit(1);
    }
    const r = navRows.rows[0];
    console.log(`  OK: ${r.section} → ${r.page} (${r.path})`);
  } finally {
    c.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
