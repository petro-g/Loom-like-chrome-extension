module.exports = {
  env: {
    browser: true,
    es2021: true,
    webextensions: true,
  },
  extends: ['eslint:recommended', 'airbnb-base', 'plugin:prettier/recommended'],
  parserOptions: {
    ecmaVersion: 13,
  },
  rules: {
    'prefer-template': 'off',
    'no-useless-return': 'off',
    'consistent-return': 'off',
    'no-return-assign': {
      'except-parens': 'off',
    },
  },
};
