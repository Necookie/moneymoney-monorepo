import { ApiError, createApiClient, type ApiClient } from '@mm/api-client';
import { getAuthToken } from './auth';
import { config } from './config';

let client: ApiClient | null = null;

export function getApi(): ApiClient {
  if (!client) {
    client = createApiClient({ baseUrl: config.apiUrl, getToken: getAuthToken, timeoutMs: 20_000 });
  }
  return client;
}

export { ApiError };

export function isPrivateInstanceError(err: unknown): boolean {
  return err instanceof ApiError && err.status === 403;
}

export function isOfflineError(err: unknown): boolean {
  const status = (err as { status?: unknown } | null)?.status;
  return status === 0;
}

/** Human-readable message for any thrown error. */
export function errorMessage(err: unknown): string {
  if (isPrivateInstanceError(err)) {
    return 'This Money Money instance is private. Your account is not on the owner allow-list.';
  }
  if (isOfflineError(err))
    return "You're offline. This needs a connection — try again when online.";
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Something went wrong';
}
