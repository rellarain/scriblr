// A deliberately small lint: the hooks rules are what catch the bugs a type check cannot (a hook called conditionally, a stale closure in
// an effect). Everything else is left to TypeScript. Run with `npm run lint`.
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 2022, sourceType: 'module', ecmaFeatures: { jsx: true } },
  plugins: ['react-hooks'],
  rules: {
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',
  },
  ignorePatterns: ['dist', 'node_modules', '*.cjs'],
}
