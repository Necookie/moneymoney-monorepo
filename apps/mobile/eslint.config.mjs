import base from '@mm/config/eslint';

export default [
  ...base,
  {
    ignores: [
      'babel.config.js',
      'metro.config.js',
      'tailwind.config.js',
      'scripts/**',
      'android/**',
      'ios/**',
    ],
  },
];
