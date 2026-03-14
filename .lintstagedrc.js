/** @type {import('lint-staged').Config} */
const config = {
  '*.{ts,tsx,js,jsx,mjs,cjs}': ['prettier --write'],
  '*.{json,css,md,yaml,yml}': ['prettier --write'],
};

module.exports = config;
