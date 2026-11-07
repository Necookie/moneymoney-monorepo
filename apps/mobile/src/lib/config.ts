/** Public runtime configuration (inlined by Expo from EXPO_PUBLIC_* at build time). */
export const config = {
  clerkPublishableKey: process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? '',
  apiUrl: (process.env.EXPO_PUBLIC_API_URL || 'https://api.moneymoney.necookie.dev').replace(
    /\/+$/,
    '',
  ),
  timeZone: 'Asia/Manila',
} as const;

export const isConfigured = config.clerkPublishableKey.length > 0;
