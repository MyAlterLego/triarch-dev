/**
 * Backfill env=prod release_logs entries from env=dev for projects where the
 * tracker shows no prod release but reality is prod==dev (because past deploys
 * went via the shared-workflows env-mislabeling bug — every deploy tagged dev
 * regardless of target backend).
 *
 * Per Mike's 2026-05-14 directive: "where there is a version in production,
 * and it maps to the same version in dev, mark that version as having been
 * promoted to production already."
 *
 * Behavior:
 *   - If a project already has an env=prod row and it matches the latest dev:
 *     no-op (already correct).
 *   - If a project has an env=prod row that DIFFERS from latest dev:
 *     no-op (legitimately dev-ahead — skip).
 *   - If a project has NO env=prod row at all:
 *     insert a mirror of the latest env=dev row with env='prod', status='promoted',
 *     deployed_at set to the dev row's deployed_at, released_by = 'backfill-2026-05-14'.
 *
 * Usage:
 *   DATABASE_URL=... npx tsx scripts/backfill-prod-from-dev.ts            # dry-run
 *   DATABASE_URL=... npx tsx scripts/backfill-prod-from-dev.ts --apply    # write
 *
 * Recommended:
 *   DATABASE_URL=$(firebase apphosting:secrets:access DATABASE_URL \
 *     --project triarch-dev-website 2>/dev/null | grep ^postgresql) \
 *     npx tsx scripts/backfill-prod-from-dev.ts --apply
 */
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { and, desc, eq, sql } from 'drizzle-orm';
import { projects, releaseLogs } from '../src/db/schema';

const APPLY = process.argv.includes('--apply');

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('DATABASE_URL required');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: dbUrl });
  const db = drizzle(pool, { schema: { projects, releaseLogs } });

  try {
    const allProjects = await db.select({ key: projects.key, name: projects.name }).from(projects);
    console.log(`Found ${allProjects.length} projects.`);
    console.log(APPLY ? '*** APPLY MODE — will write to DB ***' : '(dry-run — no DB writes)');
    console.log('');

    let willInsert = 0;
    let skippedDevAhead = 0;
    let skippedSynced = 0;
    let skippedNoDev = 0;

    for (const p of allProjects) {
      // Latest dev row (excluding rejected).
      const [latestDev] = await db
        .select()
        .from(releaseLogs)
        .where(
          and(
            eq(releaseLogs.project, p.key),
            eq(releaseLogs.env, 'dev'),
            sql`coalesce(${releaseLogs.status}, '') != 'rejected'`,
          ),
        )
        .orderBy(desc(sql`coalesce(${releaseLogs.deployedAt}, ${releaseLogs.releasedAt})`))
        .limit(1);

      if (!latestDev) {
        console.log(`[skip] ${p.key.padEnd(28)} no dev release recorded — nothing to mirror`);
        skippedNoDev++;
        continue;
      }

      // Latest prod row (excluding rejected).
      const [latestProd] = await db
        .select()
        .from(releaseLogs)
        .where(
          and(
            eq(releaseLogs.project, p.key),
            eq(releaseLogs.env, 'prod'),
            sql`coalesce(${releaseLogs.status}, '') != 'rejected'`,
          ),
        )
        .orderBy(desc(sql`coalesce(${releaseLogs.deployedAt}, ${releaseLogs.releasedAt})`))
        .limit(1);

      if (latestProd) {
        if (latestProd.version === latestDev.version) {
          console.log(`[ok  ] ${p.key.padEnd(28)} prod v${latestProd.version} matches dev — synced`);
          skippedSynced++;
        } else {
          console.log(
            `[skip] ${p.key.padEnd(28)} prod v${latestProd.version} != dev v${latestDev.version} — legitimately dev-ahead`,
          );
          skippedDevAhead++;
        }
        continue;
      }

      // No prod row — insert one mirroring latest dev.
      console.log(
        `[ins ] ${p.key.padEnd(28)} insert prod row mirroring dev v${latestDev.version}` +
          ` (deployed_at=${latestDev.deployedAt?.toISOString() ?? latestDev.releasedAt.toISOString()})`,
      );
      willInsert++;

      if (APPLY) {
        await db.insert(releaseLogs).values({
          project: p.key,
          version: latestDev.version,
          releaseType: latestDev.releaseType,
          releasedAt: latestDev.releasedAt,
          releasedBy: 'backfill-2026-05-14',
          summary: latestDev.summary,
          entries: latestDev.entries as unknown,
          env: 'prod',
          status: 'promoted',
          commitSha: latestDev.commitSha,
          deployedAt: latestDev.deployedAt,
          branch: latestDev.branch,
          promotionDispatchedAt: null,
          promotionDispatchedBy: null,
          metadata: {
            ...(latestDev.metadata as Record<string, unknown> | null ?? {}),
            backfilledFrom: latestDev.id,
            backfillReason:
              'prod_unrecorded_but_live (shared-workflows v8 env-tag fix retroactive)',
          },
        });
      }
    }

    console.log('');
    console.log('=== Summary ===');
    console.log(`Projects total:       ${allProjects.length}`);
    console.log(`Would insert (or did):${willInsert}`);
    console.log(`Already synced:       ${skippedSynced}`);
    console.log(`Dev-ahead (skipped):  ${skippedDevAhead}`);
    console.log(`No dev release:       ${skippedNoDev}`);
    if (!APPLY && willInsert > 0) {
      console.log('');
      console.log('Re-run with --apply to actually insert.');
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
