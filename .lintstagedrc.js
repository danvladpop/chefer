const path = require('path');

const buildEslintCommand = (filenames) =>
  `eslint --fix ${filenames.map((f) => path.relative(process.cwd(), f)).join(' ')}`;

/** @type {import('lint-staged').Config} */
const config = {
  '*.{ts,tsx}': [buildEslintCommand, 'prettier --write'],
  '*.{js,jsx,mjs,cjs}': [buildEslintCommand, 'prettier --write'],
  '*.{json,css,md,yaml,yml}': ['prettier --write'],
};

module.exports = config;
