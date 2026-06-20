import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'node',
        include:     ['src/**/__tests__/**/*.test.ts'],
        globals:     false,
        // Runs before each test file. Sets fake env so importing @sai/shared
        // (whose schema validates at import) doesn't throw. The file sits at the
        // package root; tsconfig.node.json gives it @types/node (process).
        setupFiles:  ['./vitest.setup.ts'],
        coverage: {
            provider: 'v8',
            include:  ['src/agents/guardrails.ts', 'src/scripts/ingest.ts'],
            thresholds: { lines: 80, functions: 80 },
        },
    },
});