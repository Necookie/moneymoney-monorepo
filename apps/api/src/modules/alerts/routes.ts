import { alerts } from '@mm/database';
import { alert, alertStatus, uuid } from '@mm/validation';
import { and, desc, eq } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { notFound } from '../../lib/errors.js';
import { toAlertDto } from '../../lib/mappers.js';
import { loadSnapshot } from '../../lib/snapshot.js';
import { refreshAlerts } from './service.js';

const SEVERITY_RANK = { critical: 0, warning: 1, info: 2 } as const;

export const alertsRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/alerts',
    {
      schema: {
        tags: ['alerts'],
        summary: 'Evaluate overspending and cash-flow warnings',
        querystring: z.object({ status: alertStatus.default('active') }),
        response: { 200: z.array(alert) },
      },
    },
    async (request) => {
      const { userId } = request.auth;
      const snap = await loadSnapshot(app.db, userId);
      const active = await refreshAlerts(app.db, userId, snap);
      const rows =
        request.query.status === 'active'
          ? active
          : await app.db
              .select()
              .from(alerts)
              .where(and(eq(alerts.userId, userId), eq(alerts.status, request.query.status)))
              .orderBy(desc(alerts.lastSeenAt))
              .limit(100);
      return rows
        .sort(
          (a, b) =>
            SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
            b.lastSeenAt.getTime() - a.lastSeenAt.getTime(),
        )
        .map(toAlertDto);
    },
  );

  app.post(
    '/alerts/:id/dismiss',
    { schema: { tags: ['alerts'], params: z.object({ id: uuid }), response: { 200: alert } } },
    async (request) => {
      const [row] = await app.db
        .update(alerts)
        .set({ status: 'dismissed' })
        .where(and(eq(alerts.id, request.params.id), eq(alerts.userId, request.auth.userId)))
        .returning();
      if (!row) throw notFound('Alert');
      return toAlertDto(row);
    },
  );
};
