/**
 * ESLint Configuration for Pike LSP
 *
 * Shared linting rules for the monorepo.
 * Individual packages can extend or override these rules.
 */

module.exports = {
    root: true,
    parser: '@typescript-eslint/parser',
    parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        project: ['./tsconfig.json', './packages/*/tsconfig.json'],
    },
    plugins: ['@typescript-eslint'],
    extends: [
        'eslint:recommended',
        'plugin:@typescript-eslint/recommended',
    ],
    rules: {
        // Allow console.log for debugging (common in this codebase)
        'no-console': 'off',

        // TypeScript-specific rules
        '@typescript-eslint/no-unused-vars': ['error', {
            argsIgnorePattern: '^_',
            varsIgnorePattern: '^_',
        }],
        '@typescript-eslint/explicit-function-return-type': 'off',
        '@typescript-eslint/explicit-module-boundary-types': 'off',
        '@typescript-eslint/no-explicit-any': 'error',
        '@typescript-eslint/ban-ts-comment': ['error', {
            'ts-ignore': true,
            'ts-expect-error': 'allow-with-description',
            'ts-nocheck': true,
            minimumDescriptionLength: 10,
        }],
        '@typescript-eslint/no-non-null-assertion': 'off',

        // Relax some rules for flexibility
        'no-constant-condition': 'off', // Common in while loops
    },
    ignorePatterns: [
        'dist',
        'node_modules',
        '*.js',
        '!.eslintrc.js',
    ],
};
