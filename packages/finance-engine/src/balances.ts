import type { AccountType, Centavos, IsoDate, TransactionType } from '@mm/types';
import { LIABILITY_ACCOUNT_TYPES } from '@mm/types';
import { addDays, eachDay } from './dates.js';
import { add, assertCentavos } from './money.js';

/**
 * Account balance conventions (signed "net contribution" model):
 * - Asset accounts (cash, bank, e-wallet, savings) hold positive balances.
 * - Liability accounts (credit) hold negative balances: owing ₱5,000 is stored as −500000.
 * - Net position = sum of all account balances.
 */
export interface EngineAccount {
  id: string;
  type: AccountType;
  /** Signed opening balance in centavos (negative for amounts owed on credit accounts). */
  openingBalance: Centavos;
  openingDate: IsoDate;
}

export interface EngineTransaction {
  id: string;
  type: TransactionType;
  /** Positive centavos; `adjustment` may be negative. */
  amount: Centavos;
  accountId: string;
  /** Destination account for transfers. */
  counterAccountId?: string | null;
  categoryId?: string | null;
  occurredOn: IsoDate;
}

export interface BalanceEffect {
  accountId: string;
  delta: Centavos;
}

export function isLiability(type: AccountType): boolean {
  return LIABILITY_ACCOUNT_TYPES.includes(type);
}

/** The signed balance change(s) a transaction causes. Transfers move money between owned accounts. */
export function transactionEffects(tx: EngineTransaction): BalanceEffect[] {
  assertCentavos(tx.amount);
  switch (tx.type) {
    case 'income':
    case 'refund':
      return [{ accountId: tx.accountId, delta: Math.abs(tx.amount) }];
    case 'expense':
      return [{ accountId: tx.accountId, delta: -Math.abs(tx.amount) }];
    case 'adjustment':
      return [{ accountId: tx.accountId, delta: tx.amount }];
    case 'transfer': {
      if (!tx.counterAccountId) throw new Error(`Transfer ${tx.id} has no destination account`);
      const amount = Math.abs(tx.amount);
      return [
        { accountId: tx.accountId, delta: -amount },
        { accountId: tx.counterAccountId, delta: amount },
      ];
    }
  }
}

/** Effect of a transaction on the user's total net position (transfers net to zero). */
export function netEffect(tx: EngineTransaction): Centavos {
  return add(...transactionEffects(tx).map((e) => e.delta));
}

/** Balances per account as of the end of `asOf` (inclusive). Omit `asOf` for all-time. */
export function accountBalances(
  accounts: readonly EngineAccount[],
  transactions: readonly EngineTransaction[],
  asOf?: IsoDate,
): Map<string, Centavos> {
  const balances = new Map<string, Centavos>();
  for (const a of accounts) {
    balances.set(a.id, !asOf || a.openingDate <= asOf ? a.openingBalance : 0);
  }
  for (const tx of transactions) {
    if (asOf && tx.occurredOn > asOf) continue;
    for (const e of transactionEffects(tx)) {
      if (!balances.has(e.accountId)) continue; // unknown/archived account: ignore defensively
      balances.set(e.accountId, add(balances.get(e.accountId) ?? 0, e.delta));
    }
  }
  return balances;
}

export interface PositionSummary {
  /** Assets minus liabilities. */
  net: Centavos;
  /** Sum of positive asset-account balances (cash, bank, e-wallet, savings). */
  assets: Centavos;
  /** Amount owed on liability accounts, as a positive number. */
  liabilities: Centavos;
  /** Cash, bank and e-wallet balances (excludes savings and credit). */
  liquid: Centavos;
}

export function summarizePosition(
  accounts: readonly EngineAccount[],
  balances: ReadonlyMap<string, Centavos>,
): PositionSummary {
  let net = 0;
  let assets = 0;
  let liabilities = 0;
  let liquid = 0;
  for (const a of accounts) {
    const b = balances.get(a.id) ?? 0;
    net = add(net, b);
    if (isLiability(a.type)) liabilities = add(liabilities, -b);
    else {
      assets = add(assets, b);
      if (a.type !== 'savings') liquid = add(liquid, b);
    }
  }
  return { net, assets, liabilities, liquid };
}

export interface CashFlowSummary {
  income: Centavos;
  /** Gross expenses. */
  expenses: Centavos;
  refunds: Centavos;
  /** Expenses minus refunds. */
  netSpending: Centavos;
  /** Income minus net spending. Transfers and adjustments are excluded. */
  net: Centavos;
}

/** Income & spending between two dates (inclusive). Transfers are never income or spending. */
export function cashFlow(
  transactions: readonly EngineTransaction[],
  from: IsoDate,
  to: IsoDate,
): CashFlowSummary {
  let income = 0;
  let expenses = 0;
  let refunds = 0;
  for (const tx of transactions) {
    if (tx.occurredOn < from || tx.occurredOn > to) continue;
    if (tx.type === 'income') income = add(income, Math.abs(tx.amount));
    else if (tx.type === 'expense') expenses = add(expenses, Math.abs(tx.amount));
    else if (tx.type === 'refund') refunds = add(refunds, Math.abs(tx.amount));
  }
  const netSpending = expenses - refunds;
  return { income, expenses, refunds, netSpending, net: income - netSpending };
}

/** Net spending (expenses − refunds) per category between two dates. Key `null` = uncategorised. */
export function spendingByCategory(
  transactions: readonly EngineTransaction[],
  from: IsoDate,
  to: IsoDate,
): Map<string | null, Centavos> {
  const out = new Map<string | null, Centavos>();
  for (const tx of transactions) {
    if (tx.occurredOn < from || tx.occurredOn > to) continue;
    if (tx.type !== 'expense' && tx.type !== 'refund') continue;
    const key = tx.categoryId ?? null;
    const delta = tx.type === 'expense' ? Math.abs(tx.amount) : -Math.abs(tx.amount);
    out.set(key, add(out.get(key) ?? 0, delta));
  }
  return out;
}

export interface BalancePoint {
  date: IsoDate;
  balance: Centavos;
}

/** End-of-day net position for each day in [from, to]. */
export function balanceHistory(
  accounts: readonly EngineAccount[],
  transactions: readonly EngineTransaction[],
  from: IsoDate,
  to: IsoDate,
): BalancePoint[] {
  // Start with the position at the end of the day before `from`, then roll forward day by day.
  const startBalances = accountBalances(accounts, transactions, addDays(from, -1));
  let running = 0;
  for (const v of startBalances.values()) running = add(running, v);

  const deltas = new Map<IsoDate, Centavos>();
  const bump = (date: IsoDate, delta: Centavos) =>
    deltas.set(date, add(deltas.get(date) ?? 0, delta));
  const accountIds = new Set(accounts.map((a) => a.id));
  for (const a of accounts) {
    if (a.openingDate >= from && a.openingDate <= to) bump(a.openingDate, a.openingBalance);
  }
  for (const tx of transactions) {
    if (tx.occurredOn < from || tx.occurredOn > to) continue;
    for (const e of transactionEffects(tx))
      if (accountIds.has(e.accountId)) bump(tx.occurredOn, e.delta);
  }

  return eachDay(from, to).map((date) => {
    running = add(running, deltas.get(date) ?? 0);
    return { date, balance: running };
  });
}
