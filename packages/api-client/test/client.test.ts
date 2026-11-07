import { describe, expect, it, vi } from 'vitest';
import { ApiError, createApiClient } from '../src/index.js';

describe('api client', () => {
  it('sends bearer tokens and query strings to /api/v1', async () => {
    const fetch = vi.fn(
      async () => new Response(JSON.stringify({ items: [], nextCursor: null }), { status: 200 }),
    );
    const api = createApiClient({
      baseUrl: 'https://api.example.com/',
      getToken: async () => 'tok',
      fetch,
    });
    await api.transactions.list({ q: 'coffee', limit: 10, accountId: undefined });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.example.com/api/v1/transactions?q=coffee&limit=10');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer tok');
  });

  it('raises ApiError with the server envelope', async () => {
    const fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ error: { code: 'forbidden', message: 'Private', requestId: 'r1' } }),
          {
            status: 403,
          },
        ),
    );
    const api = createApiClient({ baseUrl: 'https://x', getToken: async () => null, fetch });
    const err = await api.dashboard().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({
      status: 403,
      code: 'forbidden',
      requestId: 'r1',
      retryable: false,
    });
  });

  it('classifies network failures as retryable', async () => {
    const fetch = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    const api = createApiClient({ baseUrl: 'https://x', getToken: async () => null, fetch });
    const err = (await api.me().catch((e: unknown) => e)) as ApiError;
    expect(err.status).toBe(0);
    expect(err.retryable).toBe(true);
  });

  it('returns undefined for 204', async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 204 }));
    const api = createApiClient({ baseUrl: 'https://x', getToken: async () => 't', fetch });
    await expect(api.transactions.remove('id')).resolves.toBeUndefined();
  });
});
