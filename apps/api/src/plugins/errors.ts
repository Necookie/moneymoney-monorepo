import type { FastifyError, FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import {
  hasZodFastifySchemaValidationErrors,
  isResponseSerializationError,
} from 'fastify-type-provider-zod';
import { AppError, fromDatabaseError } from '../lib/errors.js';

/**
 * Consistent error envelope: `{ error: { code, message, requestId, details? } }`.
 * Internal errors never leak stack traces or SQL to clients.
 */
export const errorsPlugin = fp(async (app: FastifyInstance) => {
  app.setNotFoundHandler((request, reply) => {
    void reply.status(404).send({
      error: {
        code: 'not_found',
        message: `Route ${request.method} ${request.url} not found`,
        requestId: request.id,
      },
    });
  });

  app.setErrorHandler((err: FastifyError, request, reply) => {
    const requestId = request.id;

    if (hasZodFastifySchemaValidationErrors(err)) {
      return reply.status(400).send({
        error: {
          code: 'validation_failed',
          message: 'Request validation failed',
          requestId,
          details: err.validation.map((v) => ({ path: v.instancePath, message: v.message })),
        },
      });
    }

    if (isResponseSerializationError(err)) {
      request.log.error({ err, issues: err.cause.issues }, 'response serialization failed');
      return reply
        .status(500)
        .send({ error: { code: 'internal_error', message: 'Internal server error', requestId } });
    }

    if (err instanceof AppError) {
      return reply.status(err.statusCode).send({
        error: {
          code: err.code,
          message: err.message,
          requestId,
          ...(err.details ? { details: err.details } : {}),
        },
      });
    }

    const dbError = fromDatabaseError(err);
    if (dbError) {
      request.log.warn({ err }, 'database constraint error');
      return reply.status(dbError.statusCode).send({
        error: {
          code: dbError.code,
          message: dbError.message,
          requestId,
          details: dbError.details,
        },
      });
    }

    if (err.statusCode && err.statusCode < 500) {
      // Fastify-native client errors (bad JSON, payload too large, rate limited, …)
      return reply.status(err.statusCode).send({
        error: { code: err.code?.toLowerCase() ?? 'bad_request', message: err.message, requestId },
      });
    }

    request.log.error({ err }, 'unhandled error');
    return reply
      .status(500)
      .send({ error: { code: 'internal_error', message: 'Internal server error', requestId } });
  });
});
