import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';
import importX from 'eslint-plugin-import-x';

import baseConfig from './.config/eslint.config.mjs';

export default defineConfig([
  {
    ignores: [
      '**/node_modules/',
      '**/dist/',
      '**/artifacts/',
      'test-results/',
      'playwright-report/',
      '**/.eslintcache',
      '**/coverage',
      '**/*.generated.ts',
      // Narrow ignores for scaffold-managed files that produce false positives
      // (e.g. duplicate `webpack` imports inside `declare module` blocks).
      // Hand-written code in .config/ subdirs remains linted.
      '.config/types/**',
      '.config/eslint.config.mjs',
    ],
  },

  ...baseConfig,

  // Type-aware recommended for src/** — recommended (not strict) keeps signal high without noise
  ...tseslint.configs.recommendedTypeChecked.map((c) => ({
    ...c,
    files: ['src/**/*.{ts,tsx}'],
  })),

  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { 'import-x': importX },
    rules: {
      'import-x/no-default-export': 'error',
      'import-x/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
    },
  },

  // module.ts must default-export PanelPlugin
  {
    files: ['src/module.ts'],
    rules: { 'import-x/no-default-export': 'off' },
  },

  // .d.ts files may re-export 3rd-party defaults
  {
    files: ['**/*.d.ts'],
    rules: { 'import-x/no-default-export': 'off' },
  },

  // Looser rules for tests / dev / e2e
  {
    files: ['dev/**/*', 'e2e/**/*', 'tests/**/*', '**/*.test.{ts,tsx}'],
    rules: {
      'import-x/no-default-export': 'off',
      'react-hooks/rules-of-hooks': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },

  {
    rules: { 'react/prop-types': 'off' },
  },
]);
