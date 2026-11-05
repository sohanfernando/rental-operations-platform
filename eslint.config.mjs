import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig(
  globalIgnores(['**/dist/**', '**/coverage/**', 'apps/api/src/generated/**', 'test-results/**', 'playwright-report/**']),
  js.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    extends: [tseslint.configs.recommended],
  },
  {
    files: ['apps/api/{test,integration}/**/*.cjs', 'tests/browser/**/*.cjs'],
    languageOptions: { globals: { fetch: 'readonly', FormData: 'readonly', __dirname: 'readonly' } },
  },
);
