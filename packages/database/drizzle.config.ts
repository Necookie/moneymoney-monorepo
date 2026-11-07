import { defineConfig } from 'drizzle-kit';

// `drizzle-kit generate` only diffs the TypeScript schema against the committed snapshots;
// it never connects to a database. Migrations are applied by the API's migrate step.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema.ts',
  out: './drizzle',
  strict: true,
});
