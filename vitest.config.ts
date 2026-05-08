import { defineConfig } from 'vitest/config';
import path from 'path';

const PKG_DIST = path.resolve(__dirname, 'packages/triarch-shared/dist');

/**
 * Vite plugin that redirects package dist imports back through admin's shim
 * paths during test execution. This ensures vi.mock('@/lib/db'),
 * vi.mock('@/lib/auth-context'), etc. intercept the same module instance that
 * package dist files (auth-context.js, slack-status.js) use at runtime.
 *
 * Without this, dist/slack-status.js's `import { db } from './db'` resolves to
 * dist/db.js (real Pool), which is a different module identity from @/lib/db
 * (the shim). vi.mock patches @/lib/db but dist/db.js is never intercepted.
 */
const packageTestRedirectPlugin = {
  name: 'triarch-shared-test-redirect',
  enforce: 'pre' as const,
  resolveId(source: string, importer: string | undefined) {
    if (!importer) return;
    // Only intercept relative imports from the package dist directory
    if (!importer.startsWith(PKG_DIST)) return;
    const shimMap: Record<string, string> = {
      './db': path.resolve(__dirname, 'src/lib/db.ts'),
      './auth-context': path.resolve(__dirname, 'src/lib/auth-context.ts'),
      './slack-status': path.resolve(__dirname, 'src/lib/slack-status.ts'),
      './schema': path.resolve(__dirname, 'src/db/schema.ts'),
      './sanitize-commit': path.resolve(__dirname, 'src/lib/sanitize-commit.ts'),
      './release-entry-summary': path.resolve(__dirname, 'src/lib/release-entry-summary.ts'),
      './release-history': path.resolve(__dirname, 'src/lib/release-history.ts'),
      './pipeline-summary': path.resolve(__dirname, 'src/lib/pipeline-summary.ts'),
      './group-sections': path.resolve(__dirname, 'src/app/projects/[slug]/releases/group-sections.ts'),
    };
    if (source in shimMap) {
      return shimMap[source];
    }
    return undefined;
  },
};

export default defineConfig({
  plugins: [packageTestRedirectPlugin as never],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
  },
});
