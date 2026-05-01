/**
 * Recreate the GitHub repo + scaffold for feng-shui-rpg.
 *
 * The original setup created CRDB DB + user but the GitHub repo creation
 * step never landed (registry points at MyAlterLego/feng-shui-2 which
 * returns 404). This re-runs the same logic scaffold-repo would, but
 * directly via the lib so we don't need a NextAuth session.
 *
 * Steps:
 *   1. Verify project exists in registry
 *   2. Create the GitHub repo via API (auto_init)
 *   3. Push the scaffold files into the repo (atomic Git Data API commit)
 *   4. Register the github-deploy webhook
 *   5. Set projects.github_repo to the canonical full_name
 */
import { Pool } from 'pg';
import { execSync } from 'child_process';
import { generateScaffoldFiles } from '../src/lib/scaffold-template';
import { pushFilesToRepo, registerDeployWebhook } from '../src/lib/github-push';

const PROJECT_KEY = 'feng-shui-rpg';
const ORG = 'MyAlterLego';
const REPO_NAME = 'feng-shui-2';
const WEBHOOK_URL = 'https://admin.triarch.dev/api/webhooks/github-deploy';

function loadSecret(): string {
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
  const ghToken = process.env.GITHUB_TOKEN || execSync('gh auth token').toString().trim();
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL required');

  const pool = new Pool({ connectionString: dbUrl });
  try {
    // 1. Load project
    const r = await pool.query(`SELECT * FROM projects WHERE key = $1`, [PROJECT_KEY]);
    if (r.rowCount === 0) throw new Error(`No project with key=${PROJECT_KEY}`);
    const project = r.rows[0];
    console.log(`Project: ${project.name} (${project.key})`);
    console.log(`  current github_repo: ${project.github_repo}\n`);

    // 2. Create the GitHub repo (MyAlterLego is a User account, not an Org,
    //    so use /user/repos which creates under the authenticated user.
    //    Token must be authed as MyAlterLego.)
    console.log(`Creating GitHub repo ${ORG}/${REPO_NAME}...`);
    const createRes = await fetch(`https://api.github.com/user/repos`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ghToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/vnd.github+json',
      },
      body: JSON.stringify({
        name: REPO_NAME,
        description: project.description || `${project.name} — triarch.dev project`,
        private: true,
        auto_init: true,
      }),
    });
    if (!createRes.ok) {
      const body = await createRes.text();
      throw new Error(`GitHub repo create ${createRes.status}: ${body.slice(0, 200)}`);
    }
    const repo = await createRes.json();
    const fullName = repo.full_name as string;
    console.log(`  ✓ ${fullName} created (${repo.html_url})`);

    // 3. Push the scaffold
    console.log(`\nPushing scaffold files...`);
    const projectForLib = {
      key: project.key,
      name: project.name,
      description: project.description,
      subdomain: project.subdomain,
      firebaseProjectId: project.firebase_project_id,
    } as Parameters<typeof generateScaffoldFiles>[0];
    const files = generateScaffoldFiles(projectForLib);
    const commit = await pushFilesToRepo({
      owner: ORG,
      repo: REPO_NAME,
      files,
      commitMessage: `v0.1.0: scaffold ${project.name} from triarch-dev admin`,
      ghToken,
    });
    console.log(`  ✓ commit ${commit.commitSha.slice(0, 8)} (${Object.keys(files).length} files)`);

    // 4. Register the webhook
    console.log(`\nRegistering github-deploy webhook...`);
    const secret = loadSecret();
    const hook = await registerDeployWebhook({
      owner: ORG,
      repo: REPO_NAME,
      webhookUrl: WEBHOOK_URL,
      secret,
      ghToken,
    });
    if (hook) console.log(`  ✓ hook ${hook.id}`);
    else console.log(`  ⚠ webhook registration failed (non-fatal)`);

    // 5. Update DB row
    console.log(`\nUpdating registry...`);
    const updated = await pool.query(
      `UPDATE projects SET github_repo = $1, updated_at = now() WHERE key = $2 RETURNING github_repo`,
      [fullName, PROJECT_KEY]
    );
    console.log(`  ✓ github_repo = ${updated.rows[0].github_repo}`);
    console.log(`\n═══ feng-shui-rpg recreated ═══`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
