/** @type {import('@commitlint/types').UserConfig} */
const config = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      [
        'feat',
        'fix',
        'docs',
        'style',
        'refactor',
        'perf',
        'test',
        'build',
        'ci',
        'chore',
        'revert',
        'wip',
      ],
    ],
    'scope-enum': [
      2,
      'always',
      [
        'web',
        'api',
        'ui',
        'database',
        'types',
        'utils',
        'config',
        'eslint',
        'tsconfig',
        'docker',
        'ci',
        'deps',
        'release',
      ],
    ],
    'scope-empty': [0],
    'body-max-line-length': [2, 'always', 200],
    'subject-case': [2, 'never', ['start-case', 'pascal-case', 'upper-case']],
  },
};

module.exports = config;
