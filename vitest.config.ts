import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * Tests run against the modules the app imports, by the same `@/` paths, so a
 * test cannot pass against a copy of the code that is not the one shipping.
 *
 * Node's own runner was the first choice and could not resolve those paths
 * without a build step, which is how these assertions spent a while living as
 * throwaway scripts that verified the code once and never ran again.
 */
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['./src/test-setup.ts'],
  },
});
