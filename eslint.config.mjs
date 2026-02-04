import tseslint from 'typescript-eslint';
import eslint from '@eslint/js';

export default [
    eslint.configs.recommended,
    ...tseslint.configs.recommended,
    {
        rules: {
            '@typescript-eslint/no-unused-vars': ['error', {
                argsIgnorePattern: '^_',
                varsIgnorePattern: '^_'
            }],
            '@typescript-eslint/consistent-type-imports': 'off',
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/explicit-function-return-type': 'off',
            'no-console': 'off',
        },
    },
];
