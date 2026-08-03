import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.spec.ts'],
    exclude: ['test/e2e/**', 'test/integration/**', 'node_modules', 'dist'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/main.ts',
        'src/app.module.ts',
        'src/interfaces/workers/main.ts',
        'src/**/*.module.ts',
        'src/config/**',
      ],
      thresholds: {
        'src/domain/**': {
          statements: 85,
          branches: 75,
          functions: 80,
          lines: 85,
        },
      },
    },
    setupFiles: ['test/setup.ts'],
  },
  resolve: {
    alias: {
      '@domain': path.resolve(__dirname, 'src/domain'),
      '@application': path.resolve(__dirname, 'src/application'),
      '@infrastructure': path.resolve(__dirname, 'src/infrastructure'),
      '@interfaces': path.resolve(__dirname, 'src/interfaces'),
      '@observability': path.resolve(__dirname, 'src/observability'),
      '@config': path.resolve(__dirname, 'src/config'),
    },
  },
});
