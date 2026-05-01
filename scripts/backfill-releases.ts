/**
 * Ad-hoc backfill of release_logs from GitHub for all (or one) project.
 *
 * Usage: DATABASE_URL=... npx tsx scripts/backfill-releases.ts
 *        DATABASE_URL=... npx tsx scripts/backfill-releases.ts <key>
 *
 * Recommended: pull DATABASE_URL from App Hosting Secret Manager:
 *   DATABASE_URL=$(firebase apphosting:secrets:access DATABASE_URL \
 *     --project triarch-dev-website 2>/dev/null | grep ^postgresql) \
 *   npx tsx scripts/backfill-releases.ts
 */
import { Pool } from 'pg';
import { execSync } from 'child_process';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import { projects, releaseLogs } from '../src/db/schema';
import { fetchProjectReleases } from '../src/lib/release-sync';

async function main() {
  const filterKey = process.argv[2];
  const ghToken = process.env.GITHUB_TOKEN || execSync('gh auth token').toString().trim();
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL required');

  const pool = new Pool({ connectionString: dbUrl });
  const db = drizzle(pool, { schema: { projects, releaseLogs } });
  try {
    const rows = filterKey
      ? await db.select().from(projects).where(eq(projects.key, filterKey))
      : await db.select().from(projects);

    if (filterKey && rows.length === 0) {
      console.error(`No project with key=${filterKey}`);
      process.exit(1);
    }

    let totalInserted = 0;
    for (const project of rows) {
      const entries = await fetchProjectReleases(project, ghToken, 100);
      let inserted = 0;
      let skipped = 0;
      for (const entry of entries) {
        const existing = await pool.query(
          `SELECT 1 FROM release_logs WHERE project = $1 AND version = $2 LIMIT 1`,
          [entry.project, entry.version]
        );
        if (existing.rowCount && existing.rowCount > 0) {
          skipped++;
          continue;
        }
        await pool.query(
          `INSERT INTO release_logs (project, version, release_type, released_at, released_by, summary, entries, metadata)
           VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb)`,
          [
            entry.project,
            entry.version,
            entry.releaseType,
            entry.releasedAt,
            entry.releasedBy,
            entry.summary,
            JSON.stringify([]),
            JSON.stringify({ source: entry.source, ...entry.metadata }),
          ]
        );
        inserted++;
      }
      totalInserted += inserted;
      console.log(
        `  ${project.key.padEnd(28)} found=${String(entries.length).padStart(3)}  inserted=${String(inserted).padStart(3)}  skipped=${skipped}`
      );
    }
    console.log(`\nTotal inserted: ${totalInserted} release log entries.`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
