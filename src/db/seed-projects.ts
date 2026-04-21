import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema';
import crypto from 'crypto';

const DATABASE_URL = process.env.DATABASE_URL!;

function generateApiKey(): string {
  return `tdp_${crypto.randomBytes(24).toString('hex')}`;
}

async function seed() {
  const pool = new Pool({ connectionString: DATABASE_URL });
  const db = drizzle(pool, { schema });

  const existing = await db.select().from(schema.projects).limit(1);
  if (existing.length > 0) {
    console.log('Projects already exist, skipping seed.');
    await pool.end();
    return;
  }

  console.log('Seeding projects registry...');

  await db.insert(schema.projects).values([
    {
      key: 'triarch-dev',
      name: 'Triarch Dev',
      description: 'Control plane and marketing site for triarch.dev ecosystem',
      status: 'active',
      firebaseProjectId: 'triarch-dev-website',
      crdbCluster: 'triarchdev-24092.j77.aws-us-east-2.cockroachlabs.cloud:26257',
      crdbDatabase: 'triarch_dev',
      crdbUser: 'triarch-dev',
      subdomain: 'www',
      deployedUrl: 'https://www.triarch.dev',
      githubRepo: 'MyAlterLego/triarch-dev',
      techStack: { framework: 'Next.js 16', orm: 'Drizzle', auth: 'NextAuth v4', ui: 'Tailwind 4' },
      currentVersion: 'v0.9.0',
      ecosystem: 'triarch-dev',
      apiKey: generateApiKey(),
    },
    {
      key: 'thisnthat',
      name: 'this+that',
      description: 'Streetwear content platform',
      status: 'active',
      crdbCluster: 'triarchdev-24092.j77.aws-us-east-2.cockroachlabs.cloud:26257',
      crdbDatabase: 'thisandthat',
      crdbUser: 'thisandthat',
      subdomain: 'thisnthat',
      deployedUrl: 'https://thisnthat.triarch.dev',
      githubRepo: 'MyAlterLego/thisnthat',
      techStack: { framework: 'Next.js 16', orm: 'Drizzle', auth: 'NextAuth v5', ui: 'Tailwind 4' },
      currentVersion: 'v0.4.4',
      ecosystem: 'triarch-dev',
      apiKey: generateApiKey(),
    },
    {
      key: 'darksouls-rpg',
      name: 'Dark Souls RPG',
      description: 'Tabletop RPG campaign manager with GM/Player roles',
      status: 'active',
      firebaseProjectId: 'angular-concord-489522-c4',
      crdbCluster: 'valued-pomchi-13159.jxf.gcp-us-central1.cockroachlabs.cloud:26257',
      crdbDatabase: 'darksouls_rpg',
      crdbUser: 'darksouls-rpg',
      subdomain: 'darksouls',
      deployedUrl: 'https://darksouls.triarch.dev',
      githubRepo: 'MyAlterLego/darksouls-rpg',
      techStack: { framework: 'Next.js 16', orm: 'Drizzle', auth: 'Firebase', ui: 'Tailwind 4, Radix UI' },
      currentVersion: 'v6.9.1',
      ecosystem: 'triarch-dev',
      apiKey: generateApiKey(),
    },
    {
      key: 'triarchsecurity-admin',
      name: 'Triarch Security Admin',
      description: 'Internal operations console for Triarch Security',
      status: 'active',
      firebaseProjectId: 'triarchsecurity-admin',
      crdbCluster: 'triarchsecurity-13305.jxf.gcp-us-central1.cockroachlabs.cloud:26257',
      crdbDatabase: 'triarchsecurity-admin',
      crdbUser: 'triarchsecurity',
      customDomain: 'admin.triarchsecurity.com',
      deployedUrl: 'https://admin.triarchsecurity.com',
      githubRepo: 'MyAlterLego/triarchsecurity-admin',
      techStack: { framework: 'Next.js 16', orm: 'Drizzle', auth: 'NextAuth v4', ui: 'Tailwind 4' },
      currentVersion: 'v2.24.5',
      ecosystem: 'triarch-security',
      apiKey: generateApiKey(),
    },
    {
      key: 'triarchsecurity-portal',
      name: 'Triarch Security Portal',
      description: 'Customer portal for Triarch Security clients',
      status: 'active',
      crdbCluster: 'triarchsecurity-13305.jxf.gcp-us-central1.cockroachlabs.cloud:26257',
      crdbDatabase: 'triarchsecurity-admin',
      crdbUser: 'triarchsecurity',
      customDomain: 'portal.triarchsecurity.com',
      deployedUrl: 'https://portal.triarchsecurity.com',
      githubRepo: 'MyAlterLego/triarchsecurity-portal',
      techStack: { framework: 'Next.js 16', orm: 'Drizzle', auth: 'JWT + TOTP', ui: 'Tailwind 4' },
      currentVersion: 'v0.11.11',
      ecosystem: 'triarch-security',
      apiKey: generateApiKey(),
    },
  ]);

  console.log('5 projects seeded!');
  await pool.end();
}

seed().catch((err) => { console.error('Seed failed:', err); process.exit(1); });
