import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    // Every integration test file truncates and repopulates the SAME MySQL
    // schema, so two running at once would delete each other's rows mid-test.
    // fileParallelism alone still hands each file its own worker; singleFork
    // puts them all in one process, one after another, which makes the
    // ordering genuinely deterministic. The suite is small enough that the
    // lost parallelism costs under a second.
    fileParallelism: false,
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    setupFiles: ['tests/helpers/setup-env.ts'],
    include: ['tests/**/*.test.ts'],
    hookTimeout: 30_000,
    testTimeout: 30_000,
  },
});
