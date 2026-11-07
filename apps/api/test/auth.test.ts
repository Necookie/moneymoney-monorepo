import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, id, peso } from './helpers.js';

let t: Awaited<ReturnType<typeof createTestApp>>;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => t.close());

describe('authentication & authorization', () => {
  it('serves health and readiness without auth', async () => {
    expect((await t.app.inject({ method: 'GET', url: '/health' })).statusCode).toBe(200);
    const ready = await t.app.inject({ method: 'GET', url: '/ready' });
    expect(ready.statusCode).toBe(200);
    expect(ready.json().status).toBe('ok');
  });

  it('rejects requests without a token', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/api/v1/accounts' });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('unauthorized');
    expect(res.json().error.requestId).toBeTruthy();
    expect(res.headers['x-request-id']).toBeTruthy();
  });

  it('rejects malformed and invalid tokens', async () => {
    for (const authorization of ['Basic abc', 'Bearer', 'Bearer nope']) {
      const res = await t.app.inject({
        method: 'GET',
        url: '/api/v1/accounts',
        headers: { authorization },
      });
      expect(res.statusCode).toBe(401);
    }
  });

  it('rejects valid Clerk users who are not the instance owner', async () => {
    const res = await t.stranger.get('/accounts');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('forbidden');
  });

  it('propagates a safe inbound correlation id', async () => {
    const res = await t.app.inject({
      method: 'GET',
      url: '/health',
      headers: { 'x-request-id': 'abc-123' },
    });
    expect(res.headers['x-request-id']).toBe('abc-123');
  });

  it('isolates data between users and never trusts client-supplied ownership', async () => {
    const acc = await t.owner.post('/accounts', {
      name: 'Owner bank',
      type: 'bank',
      openingBalance: peso(1_000),
      openingDate: '2026-01-01',
    });
    expect(acc.status).toBe(201);

    // Partner cannot read, list, modify, or delete the owner's account.
    expect((await t.partner.get(`/accounts/${acc.body.id}`)).status).toBe(404);
    expect((await t.partner.get('/accounts')).body).toEqual([]);
    expect((await t.partner.patch(`/accounts/${acc.body.id}`, { name: 'hacked' })).status).toBe(
      404,
    );
    expect((await t.partner.del(`/accounts/${acc.body.id}`)).status).toBe(404);

    // Nor post a transaction against it (composite FK enforces ownership in the database).
    const tx = await t.partner.post('/transactions', {
      id: id(),
      type: 'expense',
      amount: 100,
      accountId: acc.body.id,
      occurredOn: '2026-02-01',
    });
    expect(tx.status).toBe(422);

    // An unknown userId field in a body is ignored (strip), never used.
    const sneaky = await t.partner.post('/accounts', {
      name: 'Mine',
      type: 'cash',
      openingDate: '2026-01-01',
      userId: 'someone-else',
    });
    expect(sneaky.status).toBe(201);
    expect((await t.owner.get('/accounts')).body.map((a: { name: string }) => a.name)).toEqual([
      'Owner bank',
    ]);
  });

  it('returns validation errors in the standard envelope', async () => {
    const res = await t.owner.post('/accounts', { name: '', type: 'piggybank' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation_failed');
    expect(Array.isArray(res.body.error.details)).toBe(true);
  });

  it('exposes the OpenAPI document', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/openapi.json' });
    expect(res.statusCode).toBe(200);
    expect(Object.keys(res.json().paths)).toContain('/api/v1/transactions');
  });

  it('applies CORS only to allowed origins', async () => {
    const allowed = await t.app.inject({
      method: 'OPTIONS',
      url: '/api/v1/accounts',
      headers: {
        origin: 'https://moneymoney.necookie.dev',
        'access-control-request-method': 'GET',
      },
    });
    expect(allowed.headers['access-control-allow-origin']).toBe('https://moneymoney.necookie.dev');
    const denied = await t.app.inject({
      method: 'OPTIONS',
      url: '/api/v1/accounts',
      headers: { origin: 'https://evil.example', 'access-control-request-method': 'GET' },
    });
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });
});
