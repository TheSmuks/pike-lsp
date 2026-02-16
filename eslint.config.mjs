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
        ],
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
            '@typescript-eslint/no-explicit-any': 'warn',
            '@typescript-eslint/explicit-function-return-type': 'off',
            '@typescript-eslint/ban-ts-comment': 'error',
            '@typescript-eslint/no-non-null-asserted-optional-chain': 'off',
            '@typescript-eslint/no-require-imports': 'off',
            '@typescript-eslint/ban-types': 'off',
            'no-console': 'off',
            'no-unused-labels': 'off',
            'no-useless-escape': 'off',
        },
    },
];
