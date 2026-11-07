import base from '@mm/config/eslint';

/**
 * Shared Money Money base config. React-hooks / Next lint plugins are not installed in this
 * workspace, so only the TypeScript rules apply (no extra dependencies were added for lint).
 */
export default [
  ...base,
  {
    ignores: ['.next/**', '.open-next/**', '.wrangler/**', 'next-env.d.ts', 'cloudflare-env.d.ts'],
  },
];
