module.exports = {
  root: true,
  ignorePatterns: [
    'node_modules/',
    '.runtime/',
    '.runtime-*/',
    'build-output/',
    'api/',
    'engine/',
    'extraction/',
    'infrastructure/',
    'presentation/',
    'runtime/',
    'services/',
    'worker/'
  ],
  overrides: [
    {
      files: [
        'apps/**/*.{ts,tsx}',
        'packages/**/*.{ts,tsx}',
        'tests/vitest/**/*.ts',
        'vitest.config.ts'
      ],
      parser: '@typescript-eslint/parser',
      parserOptions: {
        project: ['./tsconfig.json'],
        tsconfigRootDir: __dirname
      },
      plugins: ['@typescript-eslint'],
      extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended', 'prettier'],
      rules: {
        '@typescript-eslint/consistent-type-imports': 'error'
      }
    }
  ]
};
