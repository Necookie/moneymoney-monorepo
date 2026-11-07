import { createDatabase, runMigrations } from '@mm/database';
import { buildApp } from './app.js';
import { loadEnv } from './config/env.js';
import { createClerkVerifier } from './plugins/auth.js';

const env = loadEnv();

const logger = {
  level: env.LOG_LEVEL,
  // Never log credentials or financial request bodies.
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'headers.authorization',
      'res.headers["set-cookie"]',
      '*.password',
      '*.token',
      '*.secret',
    ],
    censor: '[redacted]',
  },
  ...(env.NODE_ENV === 'development'
    ? { transport: { target: 'pino-pretty', options: { singleLine: true } } }
    : {}),
};

async function main() {
  if (env.MIGRATE_ON_START) {
    await runMigrations(env.DATABASE_URL);
  }
  const database = createDatabase({ url: env.DATABASE_URL, maxConnections: env.DATABASE_POOL_MAX });
  const app = await buildApp({
    db: database.db,
    verifyToken: createClerkVerifier({
      secretKey: env.CLERK_SECRET_KEY,
      jwtKey: env.CLERK_JWT_KEY,
      authorizedParties: env.CLERK_AUTHORIZED_PARTIES,
    }),
    ownerClerkUserIds: env.OWNER_CLERK_USER_IDS,
    corsOrigins: env.CORS_ORIGINS,
    rateLimitPerMinute: env.RATE_LIMIT_PER_MINUTE,
    enableDocs: env.ENABLE_API_DOCS,
    trustProxy: env.TRUST_PROXY,
    version: env.APP_VERSION,
    logger,
  });

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    app.log.info({ signal }, 'shutting down');
    const timer = setTimeout(() => process.exit(1), 10_000);
    try {
      await app.close();
      await database.close();
    } finally {
      clearTimeout(timer);
      process.exit(0);
    }
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  await app.listen({ host: env.HOST, port: env.PORT });
}

main().catch((err) => {
  console.error('fatal startup error', err instanceof Error ? err.message : err);
  process.exit(1);
});
