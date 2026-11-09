/** Pure feature-toggle helpers (unit-tested with `node --test`). */
import { DEFAULT_APP_FEATURES, type AppFeatures } from '@mm/types';

/**
 * Settings → complete feature map. Missing keys (an API that predates a toggle, or a partial
 * `features` object) fall back to the defaults (everything on), so pages never read `undefined`.
 */
export function resolveFeatures(features: Partial<AppFeatures> | null | undefined): AppFeatures {
  return { ...DEFAULT_APP_FEATURES, ...(features ?? {}) };
}
