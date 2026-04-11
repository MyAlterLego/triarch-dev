import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { db } from '@/lib/db';
import { projects } from '@/db/schema';
import { eq } from 'drizzle-orm';

// ── CI/CD Workflow Generator ─────────────────────────────────────────

function generateCICD(project: Record<string, unknown>): Record<string, string> {
  const key = String(project.key);
  const name = String(project.name);

  const qualityGate = `name: Quality Gate
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  quality-gate:
    uses: MyAlterLego/shared-workflows/.github/workflows/quality-gate.yml@main
    with:
      project-name: ${key}
    secrets: inherit
`;

  const deploy = `name: Deploy to Firebase
on:
  push:
    branches: [main]

jobs:
  deploy:
    needs: quality-gate
    uses: MyAlterLego/shared-workflows/.github/workflows/deploy-firebase.yml@main
    with:
      project-name: ${key}
      firebase-project: ${project.firebaseProjectId || `${key}-website`}
    secrets: inherit
`;

  const notify = `name: Notify
on:
  workflow_run:
    workflows: ["Deploy to Firebase"]
    types: [completed]

jobs:
  notify:
    uses: MyAlterLego/shared-workflows/.github/workflows/notify.yml@main
    with:
      project-name: ${key}
    secrets: inherit
`;

  return {
    '.github/workflows/quality-gate.yml': qualityGate,
    '.github/workflows/deploy.yml': deploy,
    '.github/workflows/notify.yml': notify,
  };
}

// ── Firebase Config Generator ────────────────────────────────────────

function generateFirebaseConfig(project: Record<string, unknown>): Record<string, string> {
  const key = String(project.key);
  const firebaseProject = String(project.firebaseProjectId || `${key}-website`);
  const subdomain = project.subdomain ? String(project.subdomain) : key;

  const firebaserc = JSON.stringify({
    projects: { default: firebaseProject },
  }, null, 2);

  const apphosting = `runConfig:
  runtime: nodejs22
  concurrency: 10
  cpu: 1
  memoryMiB: 512
  minInstances: 0
  maxInstances: 2

env:
  - variable: NEXTAUTH_URL
    value: https://${subdomain}.triarch.dev
    availability:
      - BUILD
      - RUNTIME

  - variable: ADMIN_EMAIL
    value: mike@triarchsecurity.com
    availability:
      - RUNTIME

  # Secrets — set via: firebase apphosting:secrets:set <KEY>
  - variable: DATABASE_URL
    secret: DATABASE_URL

  - variable: NEXTAUTH_SECRET
    secret: NEXTAUTH_SECRET

  - variable: GOOGLE_CLIENT_ID
    secret: GOOGLE_CLIENT_ID

  - variable: GOOGLE_CLIENT_SECRET
    secret: GOOGLE_CLIENT_SECRET
`;

  const firebaseJson = JSON.stringify({
    hosting: {
      public: 'public',
      ignore: ['firebase.json', '**/.*', '**/node_modules/**'],
      rewrites: [{ source: '**', destination: '/index.html' }],
    },
  }, null, 2);

  return {
    '.firebaserc': firebaserc,
    'apphosting.yaml': apphosting,
    'firebase.json': firebaseJson,
  };
}

// ── Navigation Seed Templates ────────────────────────────────────────

interface NavTemplate {
  name: string;
  sections: Array<{
    key: string;
    label: string;
    icon: string;
    pages: Array<{ key: string; label: string; icon: string; path: string }>;
  }>;
}

function getNavTemplates(): Record<string, NavTemplate> {
  return {
    'admin-console': {
      name: 'Admin Console',
      sections: [
        {
          key: 'dashboard', label: 'Dashboard', icon: 'layout-dashboard',
          pages: [{ key: 'overview', label: 'Overview', icon: 'layout-dashboard', path: '/admin' }],
        },
        {
          key: 'platform', label: 'Platform', icon: 'shield',
          pages: [
            { key: 'projects', label: 'Projects', icon: 'briefcase', path: '/admin/platform/projects' },
            { key: 'navigation', label: 'Navigation Editor', icon: 'settings', path: '/admin/platform/navigation' },
          ],
        },
        {
          key: 'modules', label: 'Modules', icon: 'activity',
          pages: [
            { key: 'tracker', label: 'Work Tracker', icon: 'columns-3', path: '/admin/modules/tracker' },
            { key: 'release-logs', label: 'Release Logs', icon: 'file-text', path: '/admin/modules/release-logs' },
            { key: 'bug-reports', label: 'Bug Reports', icon: 'bug', path: '/admin/modules/bug-reports' },
            { key: 'feature-requests', label: 'Feature Requests', icon: 'lightbulb', path: '/admin/modules/feature-requests' },
          ],
        },
        {
          key: 'settings', label: 'Settings', icon: 'settings',
          pages: [{ key: 'settings', label: 'Settings', icon: 'settings', path: '/admin/settings' }],
        },
      ],
    },
    'rpg-portal': {
      name: 'RPG Portal',
      sections: [
        {
          key: 'player', label: 'Player', icon: 'sword',
          pages: [
            { key: 'dashboard', label: 'Dashboard', icon: 'layout-dashboard', path: '/player/dashboard' },
            { key: 'character', label: 'Character', icon: 'user', path: '/player/character' },
            { key: 'inventory', label: 'Inventory', icon: 'backpack', path: '/player/inventory' },
            { key: 'battle', label: 'Battle', icon: 'swords', path: '/player/battle' },
          ],
        },
        {
          key: 'gm', label: 'Game Master', icon: 'crown',
          pages: [
            { key: 'campaigns', label: 'Campaigns', icon: 'map', path: '/gm/campaigns' },
            { key: 'bestiary', label: 'Bestiary', icon: 'skull', path: '/gm/bestiary' },
            { key: 'battles', label: 'Battles', icon: 'swords', path: '/gm/battles' },
            { key: 'players', label: 'Players', icon: 'users', path: '/gm/players' },
          ],
        },
      ],
    },
    'customer-portal': {
      name: 'Customer Portal',
      sections: [
        {
          key: 'dashboard', label: 'Dashboard', icon: 'layout-dashboard',
          pages: [{ key: 'overview', label: 'Overview', icon: 'layout-dashboard', path: '/dashboard' }],
        },
        {
          key: 'account', label: 'Account', icon: 'user',
          pages: [
            { key: 'profile', label: 'Profile', icon: 'user', path: '/account/profile' },
            { key: 'security', label: 'Security', icon: 'shield', path: '/account/security' },
            { key: 'billing', label: 'Billing', icon: 'credit-card', path: '/account/billing' },
          ],
        },
        {
          key: 'support', label: 'Support', icon: 'help-circle',
          pages: [
            { key: 'tickets', label: 'Tickets', icon: 'message-square', path: '/support/tickets' },
            { key: 'docs', label: 'Documentation', icon: 'book', path: '/support/docs' },
          ],
        },
      ],
    },
  };
}

// ── API Handler ──────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  const body = await req.json();
  const { tool, projectKey, templateKey } = body;

  if (!tool) {
    return NextResponse.json({ error: 'tool is required' }, { status: 400 });
  }

  // Load project if needed
  let project: Record<string, unknown> | null = null;
  if (projectKey) {
    const rows = await db.select().from(projects).where(eq(projects.key, projectKey));
    if (!rows.length) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    project = rows[0] as unknown as Record<string, unknown>;
  }

  switch (tool) {
    case 'cicd': {
      if (!project) return NextResponse.json({ error: 'projectKey required' }, { status: 400 });
      return NextResponse.json({ files: generateCICD(project) });
    }
    case 'firebase-config': {
      if (!project) return NextResponse.json({ error: 'projectKey required' }, { status: 400 });
      return NextResponse.json({ files: generateFirebaseConfig(project) });
    }
    case 'nav-templates': {
      if (templateKey) {
        const templates = getNavTemplates();
        const template = templates[templateKey];
        if (!template) return NextResponse.json({ error: 'Template not found' }, { status: 404 });
        return NextResponse.json({ template });
      }
      return NextResponse.json({ templates: getNavTemplates() });
    }
    default:
      return NextResponse.json({ error: `Unknown tool: ${tool}` }, { status: 400 });
  }
}
