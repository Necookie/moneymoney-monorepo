import { defineCloudflareConfig } from '@opennextjs/cloudflare';

/**
 * OpenNext adapter config for Cloudflare Workers.
 *
 * Every Money Money page is user-specific and rendered on demand (no ISR / `revalidate`), so no
 * incremental cache (R2/KV) is configured. Add one here if static/ISR pages are introduced.
 */
export default defineCloudflareConfig({});
