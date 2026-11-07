import { z } from 'zod';

const list = z
  .string()
  .default('')
  .transform((s) =>
    s
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean),
  );

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().default(3001),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  APP_VERSION: z.string().default('dev'),

  DATABASE_URL: z.string().min(1),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(50).default(10),
  /** Run pending migrations before the server starts listening. */
  MIGRATE_ON_START: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),

  CLERK_SECRET_KEY: z.string().min(1),
  /** PEM public key for networkless JWT verification (optional; JWKS is fetched otherwise). */
  CLERK_JWT_KEY: z.string().optional(),
  /** Allowed `azp` origins for session tokens, e.g. https://moneymoney.necookie.dev */
  CLERK_AUTHORIZED_PARTIES: list,
  /**
   * Clerk user ids allowed to use this private, single-user instance. Requests from any other
   * signed-in Clerk user are rejected with 403. Empty = any Clerk user of the app (dev only).
   */
  OWNER_CLERK_USER_IDS: list,

  CORS_ORIGINS: list,
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(10).default(300),
  ENABLE_API_DOCS: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  /** Trust X-Forwarded-* from the reverse proxy / Cloudflare tunnel. */
  TRUST_PROXY: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  const env = parsed.data;
  if (env.NODE_ENV === 'production' && env.OWNER_CLERK_USER_IDS.length === 0) {
    throw new Error(
      'OWNER_CLERK_USER_IDS must be set in production (private single-user instance).',
    );
  }
  return env;
}
