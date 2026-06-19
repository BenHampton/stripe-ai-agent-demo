// Flat ESLint config (ESLint 10+). One config at the repo root covers all packages.
//
// The headline rule here is naming-convention: it enforces camelCase for our own
// internal code while DELIBERATELY allowing snake_case at system boundaries.
//
// Why the exemptions matter — these snake_case names are NOT ours to rename:
//   • Tool names + tool input-schema keys  → the LLM is prompted on these exact strings
//   • DB column names (Drizzle mappings)   → real Postgres identifiers
//   • Stripe API fields                    → Stripe's contract (cancel_at_period_end, etc.)
//   • SSE event types / wire payloads      → backend↔frontend contract, must match both sides
//   • Anthropic SDK fields                 → max_tokens, stop_reason, input_tokens, ...
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default tseslint.config(
    { ignores: ['**/dist/**', '**/node_modules/**', '**/*.config.*'] },

    js.configs.recommended,
    ...tseslint.configs.recommended,

    {
        files: ['**/*.ts', '**/*.tsx'],
        rules: {
            // ── camelCase internals, snake_case allowed at boundaries ──
            '@typescript-eslint/naming-convention': [
                'warn',
                { selector: 'variable', format: ['camelCase', 'UPPER_CASE', 'PascalCase'], leadingUnderscore: 'allow' },
                { selector: 'function', format: ['camelCase', 'PascalCase'] },
                { selector: 'parameter', format: ['camelCase', 'PascalCase'], leadingUnderscore: 'allow' },
// Destructured params mirror object/schema keys — exempt them so tool handlers
                // like ({ customer_id, amount_cents }) don't trip the rule at the LLM boundary.
                { selector: 'parameter', modifiers: ['destructured'], format: null },                { selector: 'typeLike', format: ['PascalCase'] },
                // Object/type properties: NO format — the boundary exemption.
                { selector: ['objectLiteralProperty', 'typeProperty'], format: null },
            ],
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
        },
    },

    // ── React rules — apply only to frontend .tsx files ──
    {
        files: ['**/*.tsx'],
        plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
        rules: {
            ...reactHooks.configs.recommended.rules,
            'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
        },
    },
);