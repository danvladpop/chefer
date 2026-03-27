/** @type {import('lint-staged').Config} */
const config = {
  '*.{ts,tsx,js,jsx,mjs,cjs}': (files) =>
    `node node_modules/prettier/bin/prettier.cjs --write ${files.map((f) => `"${f}"`).join(' ')}`,
  '*.{json,css,md,yaml,yml}': ['prettier --write'],
};

module.exports = config;
