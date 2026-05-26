import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/unit/**/*.test.tsx', 'tests/unit/**/*.test.mjs'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx,cjs}', 'app/**/*.{ts,tsx}', 'server.cjs', 'start-all.cjs'],
      exclude: [
        'src/lib/codex-runtime/official-manifest.generated.ts',
        'src/lib/codex-runtime/protocol.ts',
        'src/lib/codex-runtime/types.ts',
      ],
      reporter: ['text', 'html', 'json-summary'],
      thresholds: {
        statements: 42,
        branches: 38,
        functions: 36,
        lines: 43,
      },
    },
  },
});
