import type { Account, Transaction } from '@mm/api-client';
import { add, transactionEffects, type EngineTransaction } from '@mm/finance-engine';
import type { LocalTransaction } from './types';

/**
 * What the server will hold for this row once outstanding work settles:
 * - pending rows → their local content (or nothing if deleted locally);
 * - failed rows → the last server copy (the rejected change will never land);
 * - synced rows → their content.
 */
function effectiveState(row: LocalTransaction): EngineTransaction | null {
  if (row.syncState === 'failed') return liveServer(row.serverCopy);
  if (row.deletedAt) return null;
  return row;
}

function liveServer(tx: Transaction | null): EngineTransaction | null {
  return tx && !tx.deletedAt ? tx : null;
}

function addEffects(map: Map<string, number>, tx: EngineTransaction | null, sign: 1 | -1) {
  if (!tx) return;
  for (const e of transactionEffects(tx)) {
    map.set(e.accountId, add(map.get(e.accountId) ?? 0, sign * e.delta));
  }
}

export interface UnsyncedDeltas {
  /** Signed balance change per account not yet reflected in the pulled server balances. */
  byAccount: Map<string, number>;
  /** Rows contributing a non-zero delta. */
  count: number;
}

/**
 * Server balances come from the last pull. Anything that changed since (pending edits, or edits
 * pushed but not yet pulled back) is the difference between the effective state and the copy
 * that pull saw.
 */
export function unsyncedDeltas(rows: readonly LocalTransaction[]): UnsyncedDeltas {
  const byAccount = new Map<string, number>();
  let count = 0;
  for (const row of rows) {
    const rowDelta = new Map<string, number>();
    addEffects(rowDelta, effectiveState(row), 1);
    addEffects(rowDelta, liveServer(row.pulledCopy), -1);
    let changed = false;
    for (const [accountId, delta] of rowDelta) {
      if (delta === 0) continue;
      changed = true;
      byAccount.set(accountId, add(byAccount.get(accountId) ?? 0, delta));
    }
    if (changed) count++;
  }
  return { byAccount, count };
}

export interface AccountWithLocal extends Account {
  /** Server balance from the last pull. */
  serverBalance: number;
  /** Unsynced local change included in `balance`. */
  unsyncedDelta: number;
}

export function withLocalBalances(
  accounts: readonly Account[],
  rows: readonly LocalTransaction[],
): { accounts: AccountWithLocal[]; unsyncedCount: number; net: number } {
  const { byAccount, count } = unsyncedDeltas(rows);
  let net = 0;
  const out = accounts.map((a) => {
    const unsyncedDelta = byAccount.get(a.id) ?? 0;
    const balance = add(a.balance, unsyncedDelta);
    net = add(net, balance);
    return { ...a, serverBalance: a.balance, unsyncedDelta, balance };
  });
  return { accounts: out, unsyncedCount: count, net };
}
