import { runMigrations } from '@mm/database';

/** Apply pending (non-destructive, reviewed) migrations. Run before starting a new release. */
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

runMigrations(url)
  .then(() => {
    console.warn('migrations applied');
    process.exit(0);
  })
  .catch((err) => {
    console.error('migration failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
