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
  // A 401 right after sign-in/token rotation is retried once with a freshly fetched token.
  if (isApiError(error) && error.status === 401) return failureCount < 1;
  if (isApiError(error) && !error.retryable) return false;
  return failureCount < 2;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
  const { getToken, isLoaded, isSignedIn } = useAuth();
  // Keep the latest auth state without recreating the client on every render.
  const authRef = useRef({ getToken, isLoaded, isSignedIn });
  authRef.current = { getToken, isLoaded, isSignedIn };

  const client = useMemo(
    () =>
      injected ??
      createApiClient({
        baseUrl: API_URL,
        // Right after sign-in Clerk can briefly report no session token; wait (≤ 5 s) for one
        // instead of sending an unauthenticated request that would surface as a session error.
        getToken: async () => {
          for (let attempt = 0; attempt < 25; attempt++) {
            const auth = authRef.current;
            if (auth.isLoaded && auth.isSignedIn) {
              const token = await auth.getToken();
              if (token) return token;
            } else if (auth.isLoaded && !auth.isSignedIn) {
              return null;
            }
            await sleep(200);
          }
          return authRef.current.getToken();
        },
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
