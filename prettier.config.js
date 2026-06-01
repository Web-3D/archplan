/** @type {import('prettier').Config} */
export default {
  printWidth: 100,
  tabWidth: 2,
  useTabs: false,
  semi: false,
  singleQuote: true,
  quoteProps: 'as-needed',
  trailingComma: 'es5',
  bracketSpacing: true,
  arrowParens: 'always',
  endOfLine: 'lf',
  overrides: [
    {
      files: ['*.glsl', '*.vert', '**/*.frag', '*.wgsl'],
      options: { printWidth: 120 },
    },
    {
      files: ['*.json'],
      options: { trailingComma: 'none' },
    },
  ],
}
