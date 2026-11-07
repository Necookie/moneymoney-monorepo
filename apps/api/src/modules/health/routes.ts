import { health } from '@mm/validation';
import { sql } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

export const healthRoutes: FastifyPluginAsyncZod = async (app) => {
  // Liveness: the process is up. Never touches dependencies.
  app.get(
    '/health',
    {
      config: { rateLimit: false },
      schema: { tags: ['health'], hide: true, response: { 200: health } },
    },
    async () => ({ status: 'ok' as const, version: app.version_, time: new Date().toISOString() }),
  );

  // Readiness: the database answers. Used by Docker/Coolify health checks.
  app.get(
    '/ready',
    {
      config: { rateLimit: false },
      schema: { tags: ['health'], hide: true, response: { 200: health, 503: health } },
    },
    async (_request, reply) => {
      try {
        await app.db.execute(sql`select 1`);
        return { status: 'ok' as const, version: app.version_, time: new Date().toISOString() };
      } catch (err) {
        app.log.error({ err }, 'readiness check failed');
        return reply
          .status(503)
          .send({ status: 'degraded', version: app.version_, time: new Date().toISOString() });
      }
    },
  );
};
