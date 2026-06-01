const globals = require('globals');

const sharedRules = {
  'no-undef': 'error',
  'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_', varsIgnorePattern: '^_' }]
};

module.exports = [
  {
    ignores: [
      'node_modules/**',
      'backend/node_modules/**',
      'workspace/node_modules/**',
      'frontend/app/**',
      'coverage/**'
    ]
  },
  {
    files: ['backend/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: { ...globals.node, ...globals.jest }
    },
    rules: sharedRules
  },
  {
    files: ['workspace/src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser }
    },
    rules: sharedRules
  }
];
