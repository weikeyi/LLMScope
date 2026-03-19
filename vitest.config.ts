import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const rootDirectory = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@llmscope/cli': fileURLToPath(new URL('./apps/cli/src/index.ts', import.meta.url)),
      '@llmscope/web': fileURLToPath(new URL('./apps/web/src/index.ts', import.meta.url)),
      '@llmscope/config': fileURLToPath(new URL('./packages/config/src/index.ts', import.meta.url)),
      '@llmscope/core': fileURLToPath(new URL('./packages/core/src/index.ts', import.meta.url)),
      '@llmscope/proxy-engine': fileURLToPath(new URL('./packages/proxy-engine/src/index.ts', import.meta.url)),
      '@llmscope/shared-types': fileURLToPath(new URL('./packages/shared-types/src/index.ts', import.meta.url)),
      '@llmscope/storage-memory': fileURLToPath(new URL('./packages/storage-memory/src/index.ts', import.meta.url)),
      '@llmscope/storage-sqlite': fileURLToPath(new URL('./packages/storage-sqlite/src/index.ts', import.meta.url)),
    },
  },
  test: {
    root: rootDirectory,
    include: ['apps/*/tests/**/*.test.ts', 'packages/*/tests/**/*.test.ts'],
    exclude: ['**/.claude/**', '**/.omc/**', '**/dist/**', '**/coverage/**', '**/node_modules/**'],
    coverage: {
      provider: 'v8',
    },
  },
});

