import { alerts, type Database } from '@mm/database';
import {
  cashFlow,
  endOfMonth,
  evaluateAlerts,
  spendingByCategory,
  startOfMonth,
} from '@mm/finance-engine';
import { and, eq, inArray, notInArray, sql } from 'drizzle-orm';
import type { Snapshot } from '../../lib/snapshot.js';

/**
 * Evaluate rule-based alerts and reconcile them with stored alerts:
 * - new fingerprints are inserted as active;
 * - existing ones are refreshed (a dismissed alert stays dismissed — no re-nagging);
 * - active alerts whose condition no longer holds are marked resolved.
 */
export async function refreshAlerts(db: Database, userId: string, snap: Snapshot) {
  const periodStart = startOfMonth(snap.today);
  const periodEnd = endOfMonth(snap.today);
  const spentByCat = spendingByCategory(snap.engineTxs, periodStart, periodEnd);
  const categoryName = new Map(snap.categoryRows.map((c) => [c.id, c.name]));

  const candidates = evaluateAlerts({
    today: snap.today,
    forecast: snap.forecastInput(90),
    budgets: snap.budgetRows.map((b) => ({
      id: b.id,
      name: b.categoryId ? (categoryName.get(b.categoryId) ?? 'Category') : 'Overall',
      limit: b.amount,
      spent:
        b.categoryId === null
          ? cashFlow(snap.engineTxs, periodStart, periodEnd).netSpending
          : (spentByCat.get(b.categoryId) ?? 0),
      periodStart,
      periodEnd,
    })),
    goals: snap.goalRows
      .filter((g) => g.archivedAt === null)
      .map((g) => ({
        id: g.id,
        name: g.name,
        target: g.targetAmount,
        current: snap.goalCurrent.get(g.id) ?? 0,
        targetDate: g.targetDate,
        monthlyContribution: g.monthlyContribution,
      })),
  });

  await db.transaction(async (tx) => {
    const now = new Date();
    for (const c of candidates) {
      await tx
        .insert(alerts)
        .values({ userId, ...c, status: 'active', firstSeenAt: now, lastSeenAt: now })
        .onConflictDoUpdate({
          target: [alerts.userId, alerts.fingerprint],
          set: {
            severity: c.severity,
            title: c.title,
            reason: c.reason,
            amount: c.amount,
            affectedDate: c.affectedDate,
            suggestion: c.suggestion,
            lastSeenAt: now,
            status: sql`case when ${alerts.status} = 'resolved' then 'active'::alert_status else ${alerts.status} end`,
          },
        });
    }
    const live = candidates.map((c) => c.fingerprint);
    await tx
      .update(alerts)
      .set({ status: 'resolved' })
      .where(
        and(
          eq(alerts.userId, userId),
          eq(alerts.status, 'active'),
          ...(live.length ? [notInArray(alerts.fingerprint, live)] : []),
        ),
      );
  });

  return db
    .select()
    .from(alerts)
    .where(and(eq(alerts.userId, userId), inArray(alerts.status, ['active'])));
}
