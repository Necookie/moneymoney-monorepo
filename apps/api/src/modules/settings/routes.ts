import { me, settings, updateSettings } from '@mm/validation';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { badRequest } from '../../lib/errors.js';
import { toSettingsDto } from '../../lib/mappers.js';
import { getSettings, updateSettings as saveSettings } from './repository.js';

export const settingsRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/me',
    { schema: { tags: ['settings'], summary: 'Current user and settings', response: { 200: me } } },
    async (request) => {
      const row = await getSettings(app.db, request.auth.userId);
      return { userId: request.auth.userId, email: null, settings: toSettingsDto(row) };
    },
  );

  app.get(
    '/settings',
    { schema: { tags: ['settings'], summary: 'Get settings', response: { 200: settings } } },
    async (request) => toSettingsDto(await getSettings(app.db, request.auth.userId)),
  );

  app.patch(
    '/settings',
    {
      schema: {
        tags: ['settings'],
        summary: 'Update settings',
        body: updateSettings,
        response: { 200: settings },
      },
    },
    async (request) => {
      if (request.body.timezone) {
        try {
          new Intl.DateTimeFormat('en-US', { timeZone: request.body.timezone });
        } catch {
          throw badRequest('Unknown timezone');
        }
      }
      return toSettingsDto(await saveSettings(app.db, request.auth.userId, request.body));
    },
  );
};
