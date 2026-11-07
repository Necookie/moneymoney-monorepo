import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Only pure TypeScript modules (src/lib/sync/**) are unit-tested here; React Native code is not.
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: { include: ['test/**/*.test.ts'], environment: 'node' },
});
