/**
 * Ad-hoc backfill of the github-deploy webhook on every existing project repo.
 *
 * Usage:
 *   DATABASE_URL=... DEPLOY_WEBHOOK_SECRET=... \
 *     npx tsx scripts/backfill-webhooks.ts                # all projects
 *   DATABASE_URL=... DEPLOY_WEBHOOK_SECRET=... \
 *     npx tsx scripts/backfill-webhooks.ts <key>          # one project
 *
 * Pulls DEPLOY_WEBHOOK_SECRET from App Hosting secret manager when not set:
 *   firebase apphosting:secrets:access DEPLOY_WEBHOOK_SECRET --project triarch-dev-website
 */
import { Pool } from 'pg';
import { execSync } from 'child_process';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import { projects } from '../src/db/schema';
import { backfillWebhookForProject } from '../src/lib/webhook-backfill';

const WEBHOOK_URL =
  process.env.DEPLOY_WEBHOOK_URL || 'https://admin.triarch.dev/api/webhooks/github-deploy';

function loadSecret(): string {
  if (process.env.DEPLOY_WEBHOOK_SECRET) return process.env.DEPLOY_WEBHOOK_SECRET;
  return execSync(
    'firebase apphosting:secrets:access DEPLOY_WEBHOOK_SECRET --project triarch-dev-website 2>/dev/null'
  )
    .toString()
    .trim()
    .split('\n')
    .pop()!
    .trim();
}

async function main() {
  const filterKey = process.argv[2];
  const ghToken = process.env.GITHUB_TOKEN || execSync('gh auth token').toString().trim();
  const webhookSecret = loadSecret();
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL required');

  const pool = new Pool({ connectionString: dbUrl });
  const db = drizzle(pool, { schema: { projects } });
  try {
    const rows = filterKey
      ? await db.select().from(projects).where(eq(projects.key, filterKey))
      : await db.select().from(projects);

    if (filterKey && rows.length === 0) {
      console.error(`No project with key=${filterKey}`);
      process.exit(1);
    }

    console.log(`Webhook URL: ${WEBHOOK_URL}\n`);
    const counts = { installed: 0, already_present: 0, repo_missing: 0, no_repo: 0, error: 0 };
    for (const project of rows) {
      const r = await backfillWebhookForProject(project, WEBHOOK_URL, webhookSecret, ghToken);
      counts[r.status]++;
      const tag = {
        installed: 'installed',
        already_present: 'already',
        repo_missing: 'NO REPO',
        no_repo: 'no_repo',
        error: 'ERROR',
      }[r.status];
      console.log(`  ${r.project.padEnd(28)} ${(r.repo ?? '-').padEnd(40)} ${tag.padEnd(11)} ${r.detail}`);
    }
    console.log(
      `\nSummary: ${counts.installed} installed, ${counts.already_present} already present, ` +
        `${counts.repo_missing} repo missing, ${counts.no_repo} no repo, ${counts.error} errors.`
    );
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
