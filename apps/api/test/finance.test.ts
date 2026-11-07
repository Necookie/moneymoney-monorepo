import { addDays, todayInTimeZone } from '@mm/finance-engine';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, id, peso } from './helpers.js';

let t: Awaited<ReturnType<typeof createTestApp>>;
const today = todayInTimeZone('Asia/Manila');
const ago = (n: number) => addDays(today, -n);
const ahead = (n: number) => addDays(today, n);
let bank: string;
let cash: string;
let savings: string;
let foodId: string;
let salaryCat: string;

beforeAll(async () => {
  t = await createTestApp();
  bank = (
    await t.owner.post('/accounts', {
      name: 'Bank',
      type: 'bank',
      openingBalance: peso(50_000),
      openingDate: ago(60),
    })
  ).body.id;
  cash = (
    await t.owner.post('/accounts', {
      name: 'Cash',
      type: 'cash',
      openingBalance: peso(2_000),
      openingDate: ago(60),
    })
  ).body.id;
  savings = (
    await t.owner.post('/accounts', {
      name: 'Savings',
      type: 'savings',
      openingBalance: 0,
      openingDate: ago(60),
    })
  ).body.id;
  const cats = (await t.owner.get('/categories')).body as Array<{ id: string; name: string }>;
  foodId = cats.find((c) => c.name === 'Food & Dining')!.id;
  salaryCat = cats.find((c) => c.name === 'Salary')!.id;
});
afterAll(async () => t.close());

const balanceOf = async (accountId: string) =>
  ((await t.owner.get('/accounts')).body as Array<{ id: string; balance: number }>).find(
    (a) => a.id === accountId,
  )!.balance;

describe('accounts & transactions', () => {
  it('provisions default categories for a new user', async () => {
    const cats = (await t.owner.get('/categories')).body;
    expect(cats.length).toBeGreaterThan(10);
  });

  it('reconciles balances; transfers are neither income nor spending', async () => {
    await t.owner.post('/transactions', {
      id: id(),
      type: 'income',
      amount: peso(30_000),
      accountId: bank,
      categoryId: salaryCat,
      occurredOn: ago(3),
      description: 'Salary',
    });
    await t.owner.post('/transactions', {
      id: id(),
      type: 'expense',
      amount: peso(1_234.56),
      accountId: cash,
      categoryId: foodId,
      occurredOn: ago(2),
      description: 'Dinner',
      tags: ['date-night'],
    });
    const transfer = await t.owner.post('/transactions', {
      id: id(),
      type: 'transfer',
      amount: peso(10_000),
      accountId: bank,
      counterAccountId: savings,
      occurredOn: ago(1),
      description: 'Save',
    });
    expect(transfer.status).toBe(201);

    expect(await balanceOf(bank)).toBe(peso(50_000 + 30_000 - 10_000));
    expect(await balanceOf(cash)).toBe(peso(2_000) - peso(1_234.56));
    expect(await balanceOf(savings)).toBe(peso(10_000));

    const page = (await t.owner.get(`/transactions?from=${ago(10)}&to=${today}`)).body;
    expect(page.totals.income).toBe(peso(30_000));
    expect(page.totals.expenses).toBe(peso(1_234.56));
    expect(page.items).toHaveLength(3);
    expect(page.countsByType).toEqual({
      income: 1,
      expense: 1,
      transfer: 1,
      refund: 0,
      adjustment: 0,
    });
    const onlyIncome = (await t.owner.get(`/transactions?type=income&from=${ago(10)}`)).body;
    expect(onlyIncome.items).toHaveLength(1);
    expect(onlyIncome.countsByType.expense).toBe(1); // counts ignore the type filter

    const dash = (await t.owner.get('/dashboard')).body;
    expect(dash.position.net).toBe(peso(52_000 + 30_000) - peso(1_234.56));
  });

  it('creates transactions idempotently on the client id', async () => {
    const txId = id();
    const body = {
      id: txId,
      type: 'expense',
      amount: peso(99),
      accountId: cash,
      categoryId: foodId,
      occurredOn: today,
      description: 'Coffee',
    };
    const first = await t.owner.post('/transactions', body);
    const retry = await t.owner.post('/transactions', body);
    expect(first.status).toBe(201);
    expect(retry.status).toBe(200);
    expect(retry.body.id).toBe(txId);
    const all = (await t.owner.get('/transactions?q=Coffee')).body.items;
    expect(all).toHaveLength(1);
  });

  it('validates money, transfers, categories and dates', async () => {
    const base = { id: id(), accountId: cash, occurredOn: today };
    expect(
      (await t.owner.post('/transactions', { ...base, type: 'expense', amount: 10.5 })).status,
    ).toBe(400);
    expect(
      (await t.owner.post('/transactions', { ...base, type: 'expense', amount: -100 })).status,
    ).toBe(400);
    expect(
      (
        await t.owner.post('/transactions', {
          ...base,
          type: 'transfer',
          amount: 100,
          counterAccountId: cash,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await t.owner.post('/transactions', {
          ...base,
          type: 'income',
          amount: 100,
          categoryId: foodId,
        })
      ).status,
    ).toBe(422);
    expect(
      (
        await t.owner.post('/transactions', {
          ...base,
          occurredOn: ahead(30),
          type: 'expense',
          amount: 100,
        })
      ).status,
    ).toBe(422);
  });

  it('PATCH keeps fields that are not sent (tags, description)', async () => {
    const txId = id();
    await t.owner.post('/transactions', {
      id: txId,
      type: 'expense',
      amount: 500,
      accountId: cash,
      categoryId: foodId,
      occurredOn: today,
      description: 'Snacks',
      tags: ['work'],
    });
    const patched = await t.owner.patch(`/transactions/${txId}`, { amount: 600 });
    expect(patched.status).toBe(200);
    expect(patched.body.tags).toEqual(['work']);
    expect(patched.body.description).toBe('Snacks');
    expect(patched.body.amount).toBe(600);
  });

  it('filters by tag, type, account and text; paginates with a cursor', async () => {
    expect((await t.owner.get('/transactions?tag=date-night')).body.items).toHaveLength(1);
    expect((await t.owner.get('/transactions?type=transfer')).body.items).toHaveLength(1);
    expect((await t.owner.get(`/transactions?accountId=${savings}`)).body.items).toHaveLength(1);
    const p1 = (await t.owner.get('/transactions?limit=2')).body;
    expect(p1.items).toHaveLength(2);
    const p2 = (await t.owner.get(`/transactions?limit=2&cursor=${p1.nextCursor}`)).body;
    expect(p2.items[0].id).not.toBe(p1.items[1].id);
  });

  it('soft-deletes and refuses to delete accounts with history', async () => {
    const txId = id();
    await t.owner.post('/transactions', {
      id: txId,
      type: 'expense',
      amount: 100,
      accountId: cash,
      occurredOn: today,
    });
    const before = await balanceOf(cash);
    expect((await t.owner.del(`/transactions/${txId}`)).status).toBe(204);
    expect(await balanceOf(cash)).toBe(before + 100);
    expect((await t.owner.del(`/accounts/${cash}`)).status).toBe(409);
  });

  it('exports and re-imports CSV without duplicates', async () => {
    const res = await t.app.inject({
      method: 'GET',
      url: '/api/v1/transactions/export.csv',
      headers: { authorization: 'Bearer token-owner' },
    });
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.body.split('\r\n')[0]).toBe(
      'date,type,amount,account,to_account,category,description,notes,tags',
    );

    const csv = [
      'date,amount,description,category',
      `${ago(5)},-250.75,Taxi,Transport`,
      `${ago(4)},1500,Sold old phone,Other Income`,
    ].join('\n');
    const dry = await t.owner.post('/transactions/import', {
      csv,
      defaultAccountId: cash,
      dryRun: true,
    });
    expect(dry.body).toMatchObject({ dryRun: true, imported: 0, errors: [] });
    expect(dry.body.preview).toHaveLength(2);
    expect(dry.body.preview[0]).toMatchObject({ type: 'expense', amount: 25_075 });

    const real = await t.owner.post('/transactions/import', {
      csv,
      defaultAccountId: cash,
      dryRun: false,
    });
    expect(real.body).toMatchObject({ imported: 2, skippedDuplicates: 0 });
    const again = await t.owner.post('/transactions/import', {
      csv,
      defaultAccountId: cash,
      dryRun: false,
    });
    expect(again.body).toMatchObject({ imported: 0, skippedDuplicates: 2 });

    const bad = await t.owner.post('/transactions/import', {
      csv: 'date,amount\nnot-a-date,abc',
      defaultAccountId: cash,
      dryRun: true,
    });
    expect(bad.body.errors.length).toBeGreaterThan(0);
  });
});

describe('future expense planner & forecasting', () => {
  let laptop: string;

  it('planned purchases change the forecast but never the actual balance', async () => {
    const before = (await t.owner.get('/dashboard')).body;
    const fBefore = (await t.owner.get('/forecast?horizonDays=60&includeBudgetedSpending=false'))
      .body.forecast;
    const created = await t.owner.post('/scheduled-events', {
      name: 'Laptop',
      direction: 'outflow',
      kind: 'purchase',
      amount: peso(25_000),
      accountId: bank,
      startDate: ahead(20),
    });
    expect(created.status).toBe(201);
    laptop = created.body.id;
    const after = (await t.owner.get('/dashboard')).body;
    const fAfter = (await t.owner.get('/forecast?horizonDays=60&includeBudgetedSpending=false'))
      .body.forecast;
    expect(after.position.net).toBe(before.position.net);
    expect(fAfter.startingBalance).toBe(fBefore.startingBalance);
    expect(fBefore.endingBalance - fAfter.endingBalance).toBe(peso(25_000));
  });

  it('marking paid converts it to a transaction without double counting', async () => {
    const netBefore = (await t.owner.get('/dashboard')).body.position.net;
    const txId = id();
    const paid = await t.owner.post(`/scheduled-events/${laptop}/mark-paid`, {
      occurrenceDate: ahead(20),
      transactionId: txId,
    });
    expect(paid.status).toBe(201);
    expect(paid.body).toMatchObject({
      type: 'expense',
      amount: peso(25_000),
      scheduledEventId: laptop,
      occurredOn: today,
    });

    // Balance drops once; the projection no longer contains the planned item.
    expect((await t.owner.get('/dashboard')).body.position.net).toBe(netBefore - peso(25_000));
    const forecast = (await t.owner.get('/forecast?horizonDays=60&includeBudgetedSpending=false'))
      .body.forecast;
    const items = forecast.points.flatMap((p: { items: Array<{ eventId: string }> }) => p.items);
    expect(items.some((i: { eventId: string }) => i.eventId === laptop)).toBe(false);
    expect((await t.owner.get(`/scheduled-events/${laptop}`)).body.status).toBe('paid');

    // Retrying is idempotent; a second, different conversion is rejected.
    expect(
      (
        await t.owner.post(`/scheduled-events/${laptop}/mark-paid`, {
          occurrenceDate: ahead(20),
          transactionId: txId,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await t.owner.post('/transactions', {
          id: id(),
          type: 'expense',
          amount: 100,
          accountId: bank,
          occurredOn: today,
          scheduledEventId: laptop,
          occurrenceDate: ahead(20),
        })
      ).status,
    ).toBe(409);

    // Deleting the transaction puts the plan back.
    await t.owner.del(`/transactions/${txId}`);
    expect((await t.owner.get(`/scheduled-events/${laptop}`)).body.status).toBe('committed');
  });

  it('salary projections respect contract end dates', async () => {
    const contract = await t.owner.post('/scheduled-events', {
      name: 'Client contract',
      direction: 'inflow',
      kind: 'contract',
      status: 'recurring',
      amount: peso(20_000),
      confidence: 'confirmed',
      accountId: bank,
      startDate: ahead(5),
      recurrence: { frequency: 'monthly', endDate: ahead(70) },
    });
    expect(contract.status).toBe(201);
    const f = (await t.owner.get('/forecast?horizonDays=365&includeBudgetedSpending=false')).body
      .forecast;
    const dates = f.points.filter((p: { items: Array<{ eventId: string }> }) =>
      p.items.some((i) => i.eventId === contract.body.id),
    );
    expect(dates.length).toBe(3);
    expect(dates.every((p: { date: string }) => p.date <= ahead(70))).toBe(true);
  });

  it('postpones, skips and splits planned items', async () => {
    const bill = (
      await t.owner.post('/scheduled-events', {
        name: 'Internet',
        direction: 'outflow',
        kind: 'bill',
        status: 'recurring',
        amount: peso(1_500),
        startDate: ahead(3),
        recurrence: { frequency: 'monthly' },
      })
    ).body;
    const moved = await t.owner.post(`/scheduled-events/${bill.id}/postpone`, {
      occurrenceDate: ahead(3),
      newDate: ahead(9),
    });
    expect(moved.status).toBe(200);
    const occ = (
      await t.owner.get(`/scheduled-events/occurrences?from=${today}&to=${ahead(40)}`)
    ).body.filter((o: { eventId: string }) => o.eventId === bill.id);
    expect(occ[0]).toMatchObject({ date: ahead(9), originalDate: ahead(3), rescheduled: true });
    expect(
      (
        await t.owner.post(`/scheduled-events/${bill.id}/postpone`, {
          occurrenceDate: ahead(4),
          newDate: ahead(9),
        })
      ).status,
    ).toBe(422);

    const trip = (
      await t.owner.post('/scheduled-events', {
        name: 'Trip',
        direction: 'outflow',
        kind: 'purchase',
        amount: peso(10_000),
        startDate: ahead(30),
      })
    ).body;
    const split = await t.owner.post(`/scheduled-events/${trip.id}/split`, {
      amount: peso(4_000),
      startDate: ahead(10),
    });
    expect(split.body.original.amount).toBe(peso(6_000));
    expect(split.body.created.amount).toBe(peso(4_000));
    expect((await t.owner.post(`/scheduled-events/${trip.id}/cancel`)).body.status).toBe(
      'cancelled',
    );
  });

  it('compares scenarios and simulates purchases without saving anything', async () => {
    const eventsBefore = (await t.owner.get('/scheduled-events')).body.length;
    const scen = await t.owner.post('/forecast/scenarios', {
      horizonDays: 90,
      scenarios: [
        { type: 'salary_delayed', days: 7 },
        { type: 'purchase_added', amount: peso(40_000), date: ahead(10), name: 'TV' },
        { type: 'spending_reduced', percent: 20 },
      ],
    });
    expect(scen.status).toBe(200);
    expect(scen.body.comparisons[0].label).toBe('Baseline');
    expect(scen.body.comparisons[2].delta.endingBalance).toBe(-peso(40_000));

    const afford = await t.owner.post('/forecast/affordability', {
      amount: peso(500_000),
      date: ahead(2),
      accountId: bank,
    });
    expect(afford.status).toBe(200);
    expect(afford.body.verdict).toBe('not_affordable_today');
    const small = await t.owner.post('/forecast/affordability', {
      amount: peso(100),
      date: ahead(2),
    });
    expect(small.body.affordableToday).toBe(true);
    expect((await t.owner.get('/scheduled-events')).body.length).toBe(eventsBefore);
  });
});

describe('budgets, goals & alerts', () => {
  it('raises a budget-exceeded alert once and respects dismissal', async () => {
    const b = await t.owner.post('/budgets', { categoryId: foodId, amount: peso(1_000) });
    expect(b.status).toBe(201);
    expect(b.body.status.state).toBe('exceeded');
    const alerts1 = (await t.owner.get('/alerts')).body;
    const exceeded = alerts1.filter((a: { rule: string }) => a.rule === 'budget_exceeded');
    expect(exceeded).toHaveLength(1);
    expect(exceeded[0]).toMatchObject({ severity: 'critical' });
    expect(exceeded[0].suggestion.length).toBeGreaterThan(0);

    const alerts2 = (await t.owner.get('/alerts')).body;
    expect(alerts2.filter((a: { rule: string }) => a.rule === 'budget_exceeded')[0].id).toBe(
      exceeded[0].id,
    );

    await t.owner.post(`/alerts/${exceeded[0].id}/dismiss`);
    const alerts3 = (await t.owner.get('/alerts')).body;
    expect(alerts3.some((a: { id: string }) => a.id === exceeded[0].id)).toBe(false);

    // Raising the budget resolves the condition.
    await t.owner.patch(`/budgets/${b.body.id}`, { amount: peso(100_000) });
    const budgets = (await t.owner.get('/budgets')).body;
    expect(budgets[0].status.state).toBe('ok');
  });

  it('tracks goals with allocations that are not expenses', async () => {
    const netBefore = (await t.owner.get('/dashboard')).body.position.net;
    const g = await t.owner.post('/goals', {
      name: 'Emergency fund',
      kind: 'emergency',
      targetAmount: peso(100_000),
      monthlyContribution: peso(10_000),
      targetDate: ahead(400),
      initialAmount: peso(10_000),
    });
    expect(g.status).toBe(201);
    expect(g.body.currentAmount).toBe(peso(10_000));
    expect(g.body.projection.monthsToComplete).toBe(9);
    await t.owner.post(`/goals/${g.body.id}/allocations`, {
      amount: peso(5_000),
      allocatedOn: today,
    });
    const goals = (await t.owner.get('/goals')).body;
    expect(goals[0].currentAmount).toBe(peso(15_000));
    expect((await t.owner.get('/dashboard')).body.position.net).toBe(netBefore);
  });
});

describe('offline sync', () => {
  it('applies queued operations exactly once and resolves conflicts server-side', async () => {
    const txId = id();
    const createOp = {
      opId: id(),
      entity: 'transaction',
      op: 'create',
      clientUpdatedAt: new Date().toISOString(),
      data: {
        id: txId,
        type: 'expense',
        amount: peso(150),
        accountId: cash,
        categoryId: foodId,
        occurredOn: today,
        description: 'Offline lunch',
      },
    };
    const first = await t.owner.post('/sync/push', { operations: [createOp] });
    expect(first.body.results[0].status).toBe('applied');

    // Network retry of the same batch: no duplicate.
    const retry = await t.owner.post('/sync/push', { operations: [createOp] });
    expect(retry.body.results[0].status).toBe('duplicate');
    // New op id, same transaction id (e.g. app reinstalled mid-sync): still no duplicate.
    const replay = await t.owner.post('/sync/push', { operations: [{ ...createOp, opId: id() }] });
    expect(replay.body.results[0].status).toBe('duplicate');
    expect((await t.owner.get('/transactions?q=Offline')).body.items).toHaveLength(1);

    // Stale update loses to a newer server edit.
    const stale = new Date(Date.now() - 60_000).toISOString();
    await t.owner.patch(`/transactions/${txId}`, { amount: peso(175) });
    const conflict = await t.owner.post('/sync/push', {
      operations: [
        {
          opId: id(),
          entity: 'transaction',
          op: 'update',
          id: txId,
          data: { amount: peso(999) },
          clientUpdatedAt: stale,
          baseUpdatedAt: stale,
        },
      ],
    });
    expect(conflict.body.results[0].status).toBe('conflict');
    expect(conflict.body.results[0].transaction.amount).toBe(peso(175));

    // Invalid ops are rejected (client stops retrying) without failing the batch.
    const rejected = await t.owner.post('/sync/push', {
      operations: [
        { ...createOp, opId: id(), data: { ...createOp.data, id: id(), occurredOn: ahead(60) } },
      ],
    });
    expect(rejected.body.results[0].status).toBe('rejected');

    const pull = await t.owner.get(`/sync/pull?since=${encodeURIComponent(stale)}`);
    expect(pull.status).toBe(200);
    expect(pull.body.transactions.some((x: { id: string }) => x.id === txId)).toBe(true);
    expect(pull.body.accounts.length).toBe(3);
  });
});

describe('demo mode', () => {
  it('seeds clearly flagged demo data and removes it completely', async () => {
    const seeded = await t.partner.post('/demo');
    expect(seeded.body).toEqual({ demoMode: true });
    const accounts = (await t.partner.get('/accounts')).body as Array<{ isDemo: boolean }>;
    expect(accounts).toHaveLength(5);
    expect(accounts.every((a) => a.isDemo)).toBe(true);
    expect((await t.partner.get('/settings')).body.demoMode).toBe(true);
    expect((await t.partner.get('/dashboard')).body.isEmpty).toBe(false);
    expect((await t.partner.get('/forecast?horizonDays=90')).status).toBe(200);
    expect((await t.partner.post('/demo')).status).toBe(409);

    const cleared = await t.partner.del('/demo');
    expect(cleared.body).toEqual({ demoMode: false });
    expect((await t.partner.get('/accounts')).body).toHaveLength(0);
    expect((await t.partner.get('/transactions')).body.items).toHaveLength(0);
    expect((await t.partner.get('/scheduled-events')).body).toHaveLength(0);
    expect((await t.partner.get('/goals')).body).toHaveLength(0);
    // The owner's real data is untouched.
    expect((await t.owner.get('/accounts')).body).toHaveLength(3);
  });
});
