import { describe, expect, it } from 'vitest';
import {
  accountBalances,
  balanceHistory,
  cashFlow,
  netEffect,
  spendingByCategory,
  summarizePosition,
  type EngineAccount,
  type EngineTransaction,
} from '../src/index.js';
import { peso } from './fixtures.js';

const accounts: EngineAccount[] = [
  { id: 'cash', type: 'cash', openingBalance: peso(1_000), openingDate: '2026-11-01' },
  { id: 'bank', type: 'bank', openingBalance: peso(50_000), openingDate: '2026-11-01' },
  { id: 'savings', type: 'savings', openingBalance: peso(20_000), openingDate: '2026-11-01' },
  { id: 'card', type: 'credit', openingBalance: -peso(5_000), openingDate: '2026-11-01' },
];

const txs: EngineTransaction[] = [
  { id: '1', type: 'income', amount: peso(30_000), accountId: 'bank', occurredOn: '2026-11-05' },
  {
    id: '2',
    type: 'expense',
    amount: peso(1_200),
    accountId: 'cash',
    categoryId: 'food',
    occurredOn: '2026-11-05',
  },
  {
    id: '3',
    type: 'transfer',
    amount: peso(10_000),
    accountId: 'bank',
    counterAccountId: 'savings',
    occurredOn: '2026-11-06',
  },
  {
    id: '4',
    type: 'transfer',
    amount: peso(5_000),
    accountId: 'bank',
    counterAccountId: 'card',
    occurredOn: '2026-11-06',
  },
  {
    id: '5',
    type: 'expense',
    amount: peso(3_000),
    accountId: 'card',
    categoryId: 'shopping',
    occurredOn: '2026-11-07',
  },
  {
    id: '6',
    type: 'refund',
    amount: peso(500),
    accountId: 'card',
    categoryId: 'shopping',
    occurredOn: '2026-11-07',
  },
  { id: '7', type: 'adjustment', amount: -peso(50), accountId: 'cash', occurredOn: '2026-11-07' },
];

describe('balances', () => {
  it('transfers move money between owned accounts without changing net position', () => {
    expect(netEffect(txs[2]!)).toBe(0);
    expect(netEffect(txs[3]!)).toBe(0);
  });

  it('reconciles account balances', () => {
    const b = accountBalances(accounts, txs);
    expect(b.get('cash')).toBe(peso(1_000) - peso(1_200) - peso(50));
    expect(b.get('bank')).toBe(peso(50_000) + peso(30_000) - peso(10_000) - peso(5_000));
    expect(b.get('savings')).toBe(peso(30_000));
    expect(b.get('card')).toBe(-peso(5_000) + peso(5_000) - peso(3_000) + peso(500));
    const pos = summarizePosition(accounts, b);
    expect(pos.liabilities).toBe(peso(2_500));
    expect(pos.net).toBe(pos.assets - pos.liabilities);
    expect(pos.liquid).toBe((b.get('cash') ?? 0) + (b.get('bank') ?? 0));
  });

  it('never counts transfers as income or spending', () => {
    const flow = cashFlow(txs, '2026-11-01', '2026-11-30');
    expect(flow).toEqual({
      income: peso(30_000),
      expenses: peso(4_200),
      refunds: peso(500),
      netSpending: peso(3_700),
      net: peso(26_300),
    });
    const byCat = spendingByCategory(txs, '2026-11-01', '2026-11-30');
    expect(byCat.get('food')).toBe(peso(1_200));
    expect(byCat.get('shopping')).toBe(peso(2_500));
  });

  it('builds daily history consistent with balances', () => {
    const hist = balanceHistory(accounts, txs, '2026-11-04', '2026-11-07');
    const end = [...accountBalances(accounts, txs).values()].reduce((a, b) => a + b, 0);
    expect(hist).toHaveLength(4);
    expect(hist[0]!.balance).toBe(peso(66_000));
    expect(hist.at(-1)!.balance).toBe(end);
  });
});
