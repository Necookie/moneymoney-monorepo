import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import type { Database } from '@mm/database';
import Fastify, { type FastifyServerOptions } from 'fastify';
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { randomUUID } from 'node:crypto';
import { authPlugin, type TokenVerifier } from './plugins/auth.js';
import { errorsPlugin } from './plugins/errors.js';
import { accountsRoutes } from './modules/accounts/routes.js';
import { alertsRoutes } from './modules/alerts/routes.js';
import { budgetsRoutes } from './modules/budgets/routes.js';
import { categoriesRoutes } from './modules/categories/routes.js';
import { dashboardRoutes } from './modules/dashboard/routes.js';
import { demoRoutes } from './modules/demo/routes.js';
import { forecastsRoutes } from './modules/forecasts/routes.js';
import { goalsRoutes } from './modules/goals/routes.js';
import { healthRoutes } from './modules/health/routes.js';
import { scheduledEventsRoutes } from './modules/scheduled-events/routes.js';
import { settingsRoutes } from './modules/settings/routes.js';
import { syncRoutes } from './modules/sync/routes.js';
import { systemRoutes } from './modules/system/routes.js';
import { transactionsRoutes } from './modules/transactions/routes.js';

declare module 'fastify' {
  interface FastifyInstance {
    db: Database;
    version_: string;
  }
}

export interface AppOptions {
  db: Database;
  verifyToken: TokenVerifier;
  ownerClerkUserIds: string[];
  corsOrigins: string[];
  rateLimitPerMinute?: number;
  enableDocs?: boolean;
  trustProxy?: boolean;
  version?: string;
  logger?: FastifyServerOptions['logger'];
}

const REQUEST_ID_RE = /^[A-Za-z0-9._-]{1,64}$/;

/** Build the Fastify application. No I/O at construction: callers own the DB and listening. */
export async function buildApp(options: AppOptions) {
  const app = Fastify({
    logger: options.logger ?? false,
    trustProxy: options.trustProxy ?? true,
    bodyLimit: 1024 * 1024,
    // Correlation ids: honour a sane inbound X-Request-Id, else generate one.
    genReqId: (req) => {
      const inbound = req.headers['x-request-id'];
      return typeof inbound === 'string' && REQUEST_ID_RE.test(inbound) ? inbound : randomUUID();
    },
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.decorate('db', options.db);
  app.decorate('version_', options.version ?? 'dev');

  app.addHook('onSend', async (request, reply) => {
    reply.header('x-request-id', request.id);
  });

  await app.register(errorsPlugin);
  await app.register(helmet, {
    // JSON API: no HTML except Swagger UI, which needs inline assets.
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'same-site' },
  });
  await app.register(cors, {
    origin: (origin, cb) => {
      // Native mobile apps and server-to-server calls send no Origin header.
      if (!origin || options.corsOrigins.includes(origin)) return cb(null, true);
      cb(null, false);
    },
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['authorization', 'content-type', 'x-request-id'],
    exposedHeaders: ['x-request-id'],
    maxAge: 600,
  });
  await app.register(rateLimit, {
    max: options.rateLimitPerMinute ?? 300,
    timeWindow: '1 minute',
    keyGenerator: (req) => (req.headers['cf-connecting-ip'] as string | undefined) ?? req.ip,
  });

  if (options.enableDocs ?? true) {
    await app.register(swagger, {
      openapi: {
        info: {
          title: 'Money Money API',
          version: options.version ?? 'dev',
          description:
            'Personal finance API. Money values are integer centavos (PHP); dates are YYYY-MM-DD in the user timezone. All /api/v1 routes require a Clerk session token (Authorization: Bearer).',
        },
        servers: [{ url: '/' }],
        components: {
          securitySchemes: { clerk: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
        },
        security: [{ clerk: [] }],
      },
      transform: jsonSchemaTransform,
    });
    await app.register(swaggerUi, { routePrefix: '/docs' });
    app.get('/openapi.json', { schema: { hide: true } }, async () => app.swagger());
  }

  await app.register(healthRoutes);

  // Everything under /api/v1 is authenticated and owner-scoped.
  await app.register(
    async (api) => {
      await api.register(authPlugin, {
        verify: options.verifyToken,
        ownerClerkUserIds: options.ownerClerkUserIds,
      });
      await api.register(settingsRoutes);
      await api.register(accountsRoutes);
      await api.register(categoriesRoutes);
      await api.register(transactionsRoutes);
      await api.register(scheduledEventsRoutes);
      await api.register(budgetsRoutes);
      await api.register(goalsRoutes);
      await api.register(forecastsRoutes);
      await api.register(alertsRoutes);
      await api.register(dashboardRoutes);
      await api.register(syncRoutes);
      await api.register(demoRoutes);
      await api.register(systemRoutes);
    },
    { prefix: '/api/v1' },
  );

  return app;
}

export type App = Awaited<ReturnType<typeof buildApp>>;
