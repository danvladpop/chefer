/** @type {import('lint-staged').Config} */
const config = {
  '*.{ts,tsx,js,jsx,mjs,cjs}': ['prettier --write --cache'],
  '*.{json,css,md,yaml,yml}': ['prettier --write --cache'],
};

module.exports = config;
