import js from '@eslint/js';
import tseslint from 'typescript-eslint';

const nodeGlobals = {
  Buffer: 'readonly',
  __dirname: 'readonly',
  console: 'readonly',
  fetch: 'readonly',
  global: 'readonly',
  module: 'readonly',
  process: 'readonly',
  require: 'readonly',
  setInterval: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  URL: 'readonly',
};

const browserGlobals = {
  atob: 'readonly',
  btoa: 'readonly',
  document: 'readonly',
  File: 'readonly',
  FileReader: 'readonly',
  localStorage: 'readonly',
  navigator: 'readonly',
  TextDecoder: 'readonly',
  TextEncoder: 'readonly',
  window: 'readonly',
};

export default tseslint.config(
  {
    ignores: [
      '.next/**',
      'build/**',
      'coverage/**',
      'dist/**',
      'node_modules/**',
      'out/**',
      'public/vendor/**',
      'codex-official-docs/**',
      'next-env.d.ts',
    ],
  },
  {
    files: ['**/*.{js,cjs,mjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      globals: {
        ...nodeGlobals,
        document: 'readonly',
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-console': 'off',
      'no-debugger': 'error',
      'no-unused-vars': 'off',
      'no-useless-assignment': 'off',
      'no-warning-comments': [
        'error',
        {
          terms: ['todo', 'fixme', 'hack', 'xxx'],
          location: 'anywhere',
        },
      ],
    },
  },
  {
    files: ['**/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      '@typescript-eslint': tseslint.plugin,
    },
    languageOptions: {
      parser: tseslint.parser,
      ecmaVersion: 'latest',
      globals: {
        ...nodeGlobals,
        ...browserGlobals,
      },
    },
    rules: {
      'no-console': 'off',
      'no-control-regex': 'off',
      'no-debugger': 'error',
      'no-ex-assign': 'off',
      'no-undef': 'off',
      'no-useless-escape': 'off',
      'no-warning-comments': [
        'error',
        {
          terms: ['todo', 'fixme', 'hack', 'xxx'],
          location: 'anywhere',
        },
      ],
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
);
