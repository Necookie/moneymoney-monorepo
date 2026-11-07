/** Public configuration, inlined at build time. */
export const API_URL = (
  process.env.NEXT_PUBLIC_API_URL || 'https://api.moneymoney.necookie.dev'
).replace(/\/+$/, '');
