'use client';

import { useAuth } from '@clerk/nextjs';
import { ApiError, createApiClient, type ApiClient } from '@mm/api-client';
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createContext, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { API_URL } from './env';

const ApiContext = createContext<ApiClient | null>(null);

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

/** 403 from the API's owner allow-list: this signed-in Clerk user is not the instance owner. */
export function isPrivateInstanceError(error: unknown): boolean {
  return isApiError(error) && error.status === 403;
}

export function errorMessage(error: unknown): string {
  if (isApiError(error)) return error.message;
  if (error instanceof Error) return error.message;
  return 'Something went wrong';
}

function shouldRetry(failureCount: number, error: unknown): boolean {
  if (isApiError(error) && !error.retryable) return false;
  return failureCount < 2;
}

/**
 * Provides the typed API client (bearer token from the Clerk session) and a TanStack Query
 * client. Mutation errors surface as toasts (with the request id) unless a mutation opts out via
 * `meta: { silent: true }`.
 */
export function ApiProvider({
  children,
  client: injected,
}: {
  children: ReactNode;
  /** Optional pre-built client (tests/previews); defaults to the Clerk-authenticated client. */
  client?: ApiClient;
}) {
  const { getToken } = useAuth();
  // Keep the latest getToken without recreating the client on every render.
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  const client = useMemo(
    () =>
      injected ??
      createApiClient({
        baseUrl: API_URL,
        getToken: () => getTokenRef.current(),
      }),
    [injected],
  );

  const [queryClient] = useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache(),
        mutationCache: new MutationCache({
          onError: (error, _vars, _ctx, mutation) => {
            if (mutation.meta?.silent) return;
            const requestId = isApiError(error) ? error.requestId : undefined;
            toast.error(errorMessage(error), {
              description: requestId ? `Request ID: ${requestId}` : undefined,
            });
          },
        }),
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            gcTime: 10 * 60_000,
            retry: shouldRetry,
            refetchOnWindowFocus: true,
          },
          mutations: { retry: false },
        },
      }),
  );

  return (
    <ApiContext.Provider value={client}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </ApiContext.Provider>
  );
}

export function useApi(): ApiClient {
  const client = useContext(ApiContext);
  if (!client) throw new Error('useApi must be used inside <ApiProvider>');
  return client;
}

declare module '@tanstack/react-query' {
  interface Register {
    mutationMeta: { silent?: boolean };
  }
}
