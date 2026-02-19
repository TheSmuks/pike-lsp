import tseslint from 'typescript-eslint';
import eslint from '@eslint/js';
import globals from 'globals';

export default [
    eslint.configs.recommended,
    ...tseslint.configs.recommended,
    {
        ignores: [
            '**/dist/**',
            '**/*.tsbuildinfo',
            '**/coverage/**',
            '**/.nyc_output/**',
            '**/.vscode-test/**',
            '**/*.vsix',
            '**/*.mjs',
            '**/scripts/**',
            '**/.planning/**',
            '**/*.test.ts',
            'packages/vscode-pike/**/*.ts',
            'docs/**',
        ],
    },
    // TypeDoc generated files need browser globals
    {
        files: ['docs/api/typescript/**/*.js'],
        languageOptions: {
            globals: {
                ...globals.browser,
            },
        },
        rules: {
            '@typescript-eslint/no-unused-vars': 'off',
            '@typescript-eslint/no-explicit-any': 'off',
            'no-undef': 'warn',
            '@typescript-eslint/no-unused-expressions': 'off',
            '@typescript-eslint/no-this-alias': 'off',
            'no-redeclare': 'off',
            'no-prototype-builtins': 'off',
        },
    },
    {
        languageOptions: {
            globals: {
                ...globals.node,
                ...globals.es2021,
            },
        },
        rules: {
            '@typescript-eslint/no-unused-vars': ['warn', {
                argsIgnorePattern: '^_',
                varsIgnorePattern: '^_'
            }],
            '@typescript-eslint/consistent-type-imports': 'off',
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/explicit-function-return-type': 'off',
            '@typescript-eslint/ban-ts-comment': 'error',
            '@typescript-eslint/no-non-null-asserted-optional-chain': 'off',
            '@typescript-eslint/no-require-imports': 'off',
            '@typescript-eslint/ban-types': 'off',
            'no-console': 'off',
            'no-unused-labels': 'off',
            'no-useless-escape': 'off',
            // ESLint 10 new rules - disable errors
            'no-useless-assignment': 'off',
            'preserve-caught-error': 'off',
            'no-unassigned-vars': 'off',
        },
    },
];
