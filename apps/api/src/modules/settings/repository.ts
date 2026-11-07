import { categories, type Database, userSettings, users } from '@mm/database';
import type { UpdateSettings } from '@mm/validation';
import { eq } from 'drizzle-orm';
import { DEFAULT_CATEGORIES } from '../categories/defaults.js';

/** Find or create the internal user (and default settings) for a Clerk subject. Idempotent. */
export async function ensureUser(db: Database, clerkUserId: string): Promise<string> {
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.clerkUserId, clerkUserId))
    .limit(1);
  if (existing[0]) return existing[0].id;
  return db.transaction(async (tx) => {
    const inserted = await tx
      .insert(users)
      .values({ clerkUserId })
      .onConflictDoNothing({ target: users.clerkUserId })
      .returning({ id: users.id });
    const [row] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.clerkUserId, clerkUserId));
    if (!row) throw new Error('Failed to provision user');
    await tx.insert(userSettings).values({ userId: row.id }).onConflictDoNothing();
    if (inserted.length > 0) {
      await tx
        .insert(categories)
        .values(DEFAULT_CATEGORIES.map((c) => ({ ...c, userId: row.id })))
        .onConflictDoNothing();
    }
    return row.id;
  });
}

export async function getSettings(db: Database, userId: string) {
  const [row] = await db.select().from(userSettings).where(eq(userSettings.userId, userId));
  if (row) return row;
  const [created] = await db
    .insert(userSettings)
    .values({ userId })
    .onConflictDoNothing()
    .returning();
  if (created) return created;
  const [again] = await db.select().from(userSettings).where(eq(userSettings.userId, userId));
  if (!again) throw new Error('Settings missing');
  return again;
}

export async function updateSettings(db: Database, userId: string, patch: UpdateSettings) {
  await getSettings(db, userId);
  const [row] = await db
    .update(userSettings)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(userSettings.userId, userId))
    .returning();
  if (!row) throw new Error('Settings missing');
  return row;
}

export async function setDemoMode(db: Database, userId: string, demoMode: boolean) {
  await db
    .update(userSettings)
    .set({ demoMode, updatedAt: new Date() })
    .where(eq(userSettings.userId, userId));
}
