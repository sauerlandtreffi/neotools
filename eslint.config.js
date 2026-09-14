import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/.astro/**',
      '**/node_modules/**',
      '**/src-tauri/**',
      'docs/**',
      'apps/web/public/assets/**',
      'apps/web/public/tessdata/**',
      'coverage/**',
      '**/test-results/**',
      '**/playwright-report/**',
      '**/blob-report/**',
      'pnpm-lock.yaml',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    files: ['**/*.{js,mjs,cjs,ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.es2022 },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-expressions': 'warn',
      '@typescript-eslint/no-this-alias': 'warn',
      '@typescript-eslint/no-require-imports': 'warn',
      '@typescript-eslint/no-empty-object-type': 'warn',
      '@typescript-eslint/triple-slash-reference': 'off',
      'prefer-const': 'warn',
      'no-empty': 'warn',
      'no-fallthrough': 'warn',
      'no-useless-escape': 'warn',
    },
  },
  {
    files: [
      '**/scripts/**/*.{js,mjs,cjs}',
      '**/*.{config,conf}.{js,mjs,cjs,ts}',
      'eslint.config.js',
      'apps/web/e2e/**/*.{js,mjs,cjs,ts}',
      'apps/web/playwright.config.ts',
      'apps/api/**/*.{js,mjs,cjs,ts}',
      'packages/license/**/*.{js,mjs,cjs,ts}',
    ],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: ['apps/web/public/sw.js'],
    languageOptions: {
      globals: globals.serviceworker,
    },
  },
  {
    files: ['apps/web/src/**/*.{ts,tsx}', 'apps/web/test/**/*.{ts,tsx}'],
    languageOptions: {
      globals: globals.browser,
    },
  },
);
