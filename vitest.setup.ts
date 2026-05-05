import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// RTL auto-cleanup requires afterEach to be a global, but vitest requires explicit imports.
// Register cleanup manually so rendered components are unmounted between tests.
afterEach(() => {
  cleanup();
});
