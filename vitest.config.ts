import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['__tests__/**/*.test.{js,ts}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      exclude: [
        '**/__mocks__/**',
        '**/__tests__/**',
        '**/node_modules/**',
        '**/dist/**',
      ],
    },
  },
});
