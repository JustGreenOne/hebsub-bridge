import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: { globals: true, include: ['tests/**/*.test.ts'] },
  resolve: {
    alias: {
      '@hebsub/core': path.resolve(__dirname, '../../packages/core/src/index.ts'),
    },
  },
});
