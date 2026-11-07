import { categories } from '@mm/database';
import { category, createCategory, updateCategory, uuid } from '@mm/validation';
import { and, eq } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { notFound } from '../../lib/errors.js';
import { toCategoryDto } from '../../lib/mappers.js';

const idParams = z.object({ id: uuid });

export const categoriesRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/categories',
    { schema: { tags: ['categories'], response: { 200: z.array(category) } } },
    async (request) => {
      const rows = await app.db
        .select()
        .from(categories)
        .where(eq(categories.userId, request.auth.userId))
        .orderBy(categories.kind, categories.name);
      return rows.map(toCategoryDto);
    },
  );

  app.post(
    '/categories',
    { schema: { tags: ['categories'], body: createCategory, response: { 201: category } } },
    async (request, reply) => {
      const { id, ...rest } = request.body;
      const [row] = await app.db
        .insert(categories)
        .values({
          ...(id ? { id } : {}),
          ...rest,
          color: rest.color ?? null,
          icon: rest.icon ?? null,
          userId: request.auth.userId,
        })
        .returning();
      return reply.status(201).send(toCategoryDto(row!));
    },
  );

  app.patch(
    '/categories/:id',
    {
      schema: {
        tags: ['categories'],
        params: idParams,
        body: updateCategory,
        response: { 200: category },
      },
    },
    async (request) => {
      const { archived, ...rest } = request.body;
      const [row] = await app.db
        .update(categories)
        .set({
          ...rest,
          ...(archived === undefined ? {} : { archivedAt: archived ? new Date() : null }),
          updatedAt: new Date(),
        })
        .where(
          and(eq(categories.id, request.params.id), eq(categories.userId, request.auth.userId)),
        )
        .returning();
      if (!row) throw notFound('Category');
      return toCategoryDto(row);
    },
  );
};
