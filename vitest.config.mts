import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// O tsconfig do Expo usa "extends: expo/tsconfig.base", que o transformador do vitest não resolve.
export default defineConfig({
  oxc: { tsconfig: false },
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: { include: ['tests/**/*.test.ts'] },
});
