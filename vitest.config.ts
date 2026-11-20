import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      'tests/unit/**/*.test.ts',
      'tests/integration/**/*.test.ts',
      'tests/integration/**/*.test.tsx',
    ],
    setupFiles: ['tests/setup.ts'],
    pool: 'forks',
    fileParallelism: false,
    testTimeout: 300000,
    hookTimeout: 300000,
  },
});
