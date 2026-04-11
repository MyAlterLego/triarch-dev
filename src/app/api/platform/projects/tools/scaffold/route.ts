import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { db } from '@/lib/db';
import { projects } from '@/db/schema';
import { eq } from 'drizzle-orm';

/**
 * Generates a full Next.js starter template with triarch conventions.
 * Returns a map of filename → content for the scaffold.
 */
export async function POST(req: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { projectKey } = await req.json();
  if (!projectKey) {
    return NextResponse.json({ error: 'projectKey is required' }, { status: 400 });
  }

  const rows = await db.select().from(projects).where(eq(projects.key, projectKey));
  if (!rows.length) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  const project = rows[0];

  const key = project.key;
  const name = project.name;
  const subdomain = project.subdomain || key;
  const firebaseProject = project.firebaseProjectId || `${key}-website`;

  const files: Record<string, string> = {
    'package.json': JSON.stringify({
      name: key,
      version: '0.1.0',
      private: true,
      scripts: {
        dev: 'next dev --turbopack',
        build: 'next build',
        start: 'next start',
        lint: 'next lint',
        'db:generate': 'drizzle-kit generate',
        'db:migrate': 'drizzle-kit migrate',
        'db:push': 'drizzle-kit push',
      },
      dependencies: {
        next: '^16',
        react: '^19',
        'react-dom': '^19',
        'drizzle-orm': '^0.45',
        pg: '^8',
        'next-auth': '^4',
        'lucide-react': '^1',
      },
      devDependencies: {
        typescript: '^5',
        '@types/node': '^22',
        '@types/react': '^19',
        'drizzle-kit': '^0.31',
        tailwindcss: '^4',
      },
    }, null, 2),

    'src/lib/version.ts': `export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? 'v0.1.0';\n`,

    'src/lib/db.ts': `import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL!,
});

export const db = drizzle(pool);
`,

    'src/db/schema.ts': `import { pgTable, uuid, varchar, text, timestamp, jsonb } from 'drizzle-orm/pg-core';

export const example = pgTable('example', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 256 }).notNull(),
  description: text('description'),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
`,

    'drizzle.config.ts': `import type { Config } from 'drizzle-kit';

export default {
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
} satisfies Config;
`,

    'src/app/layout.tsx': `import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '${name}',
  description: '${project.description || name}',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
`,

    'src/app/page.tsx': `export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-zinc-950">
      <h1 className="text-4xl font-bold text-white">${name}</h1>
    </main>
  );
}
`,

    'src/app/globals.css': `@import "tailwindcss";\n`,

    'next.config.ts': `import type { NextConfig } from 'next';

const nextConfig: NextConfig = {};

export default nextConfig;
`,

    '.firebaserc': JSON.stringify({ projects: { default: firebaseProject } }, null, 2),

    'apphosting.yaml': `runConfig:
  runtime: nodejs22
  concurrency: 10
  cpu: 1
  memoryMiB: 512
  minInstances: 0
  maxInstances: 2

env:
  - variable: DATABASE_URL
    secret: DATABASE_URL
`,

    'CLAUDE.md': `# ${name}

@AGENTS.md
`,

    'AGENTS.md': `# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in \`node_modules/next/dist/docs/\` before writing any code. Heed deprecation notices.
`,

    '.github/workflows/quality-gate.yml': `name: Quality Gate
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
`,
  };

  return NextResponse.json({ files, projectName: name });
}
