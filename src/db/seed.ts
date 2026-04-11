import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema';

const DATABASE_URL = process.env.DATABASE_URL!;
const PROJECT = 'triarch-dev';

async function seed() {
  const pool = new Pool({ connectionString: DATABASE_URL });
  const db = drizzle(pool, { schema });

  console.log('Seeding navigation for', PROJECT);

  // Clear existing nav data for this project
  const { menuSections, menuPages, menuSubpages } = schema;
  const { eq } = await import('drizzle-orm');

  const existingSections = await db.select().from(menuSections).where(eq(menuSections.project, PROJECT));
  if (existingSections.length > 0) {
    console.log('Navigation data already exists, skipping seed.');
    await pool.end();
    return;
  }

  // Section: Dashboard (single page)
  const [dashSection] = await db.insert(menuSections).values({
    project: PROJECT,
    key: 'dashboard',
    label: 'Dashboard',
    icon: 'layout-dashboard',
    sortOrder: 0,
    minRole: 'admin',
  }).returning();

  await db.insert(menuPages).values({
    sectionId: dashSection.id,
    key: 'overview',
    label: 'Overview',
    icon: 'layout-dashboard',
    path: '/admin',
    sortOrder: 0,
    minRole: 'admin',
  });

  // Section: Platform
  const [platformSection] = await db.insert(menuSections).values({
    project: PROJECT,
    key: 'platform',
    label: 'Platform',
    icon: 'shield',
    sortOrder: 1,
    minRole: 'admin',
  }).returning();

  await db.insert(menuPages).values([
    {
      sectionId: platformSection.id,
      key: 'navigation',
      label: 'Navigation Editor',
      icon: 'settings',
      path: '/admin/platform/navigation',
      sortOrder: 0,
      minRole: 'admin',
    },
    {
      sectionId: platformSection.id,
      key: 'projects',
      label: 'Projects',
      icon: 'briefcase',
      path: '/admin/platform/projects',
      sortOrder: 1,
      minRole: 'admin',
    },
  ]);

  // Section: Modules
  const [modulesSection] = await db.insert(menuSections).values({
    project: PROJECT,
    key: 'modules',
    label: 'Modules',
    icon: 'activity',
    sortOrder: 2,
    minRole: 'admin',
  }).returning();

  await db.insert(menuPages).values([
    {
      sectionId: modulesSection.id,
      key: 'tracker',
      label: 'Work Tracker',
      icon: 'columns-3',
      path: '/admin/modules/tracker',
      sortOrder: 0,
      minRole: 'admin',
    },
    {
      sectionId: modulesSection.id,
      key: 'release-logs',
      label: 'Release Logs',
      icon: 'file-text',
      path: '/admin/modules/release-logs',
      sortOrder: 1,
      minRole: 'admin',
    },
    {
      sectionId: modulesSection.id,
      key: 'bug-reports',
      label: 'Bug Reports',
      icon: 'bug',
      path: '/admin/modules/bug-reports',
      sortOrder: 2,
      minRole: 'admin',
    },
  ]);

  // Section: Settings (single page)
  const [settingsSection] = await db.insert(menuSections).values({
    project: PROJECT,
    key: 'settings',
    label: 'Settings',
    icon: 'settings',
    sortOrder: 99,
    minRole: 'admin',
  }).returning();

  await db.insert(menuPages).values({
    sectionId: settingsSection.id,
    key: 'settings',
    label: 'Settings',
    icon: 'settings',
    path: '/admin/settings',
    sortOrder: 0,
    minRole: 'admin',
  });

  console.log('Seed complete!');
  await pool.end();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
