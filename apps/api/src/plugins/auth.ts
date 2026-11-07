import { verifyToken } from '@clerk/backend';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { forbidden, unauthorized } from '../lib/errors.js';
import { ensureUser } from '../modules/settings/repository.js';

export interface AuthContext {
  /** Internal Money Money user id (UUID). Never taken from the client. */
  userId: string;
  clerkUserId: string;
}

export interface VerifiedToken {
  sub: string;
}

/** Verifies a bearer token and returns its subject. Injected so tests can stub Clerk. */
export type TokenVerifier = (token: string) => Promise<VerifiedToken>;

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthContext;
  }
}

export interface ClerkVerifierOptions {
  secretKey: string;
  jwtKey?: string | undefined;
  authorizedParties?: string[];
}

/**
 * Authorized-party rule: browser session tokens carry `azp` (the page origin) and it must be in
 * the allow-list. Native (Android/iOS) session tokens carry no `azp`, so they are accepted on
 * signature, expiry and owner checks alone. (Clerk's own `authorizedParties` option rejects tokens
 * without `azp`, which would lock out the mobile app.)
 */
export function isAuthorizedParty(azp: unknown, allowed: readonly string[]): boolean {
  if (azp === undefined || azp === null || azp === '') return true;
  if (allowed.length === 0) return true;
  return typeof azp === 'string' && allowed.includes(azp);
}

/** Clerk session-token verification (JWKS fetched with the secret key and cached by the SDK). */
export function createClerkVerifier(options: ClerkVerifierOptions): TokenVerifier {
  const allowed = options.authorizedParties ?? [];
  return async (token) => {
    const payload = await verifyToken(token, {
      secretKey: options.secretKey,
      ...(options.jwtKey ? { jwtKey: options.jwtKey } : {}),
    });
    if (!payload?.sub) throw new Error('Token has no subject');
    if (!isAuthorizedParty(payload.azp, allowed)) {
      throw new Error(`Unauthorized party ${String(payload.azp)}`);
    }
    return { sub: payload.sub };
  };
}

export interface AuthPluginOptions {
  verify: TokenVerifier;
  /** Allow-list of Clerk user ids; empty allows any verified user (development only). */
  ownerClerkUserIds: string[];
}

function bearerToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
  return token.trim();
}

/**
 * Authentication guard for every route registered in the same encapsulation context.
 * Verifies the Clerk session token, enforces the private-instance owner allow-list, and maps the
 * Clerk subject to an internal user id (provisioning it on first sign-in).
 */
export const authPlugin = fp<AuthPluginOptions>(
  async (app: FastifyInstance, opts) => {
    const userIdCache = new Map<string, string>();
    app.decorateRequest('auth', null as unknown as AuthContext);

    app.addHook('onRequest', async (request) => {
      const token = bearerToken(request);
      if (!token) throw unauthorized();

      let claims: VerifiedToken;
      try {
        claims = await opts.verify(token);
      } catch (err) {
        request.log.info({ reason: (err as Error).message }, 'token verification failed');
        throw unauthorized('Invalid or expired session');
      }

      if (opts.ownerClerkUserIds.length > 0 && !opts.ownerClerkUserIds.includes(claims.sub)) {
        request.log.warn({ clerkUserId: claims.sub }, 'non-owner access attempt');
        throw forbidden('This Money Money instance is private');
      }

      let userId = userIdCache.get(claims.sub);
      if (!userId) {
        userId = await ensureUser(app.db, claims.sub);
        userIdCache.set(claims.sub, userId);
      }
      request.auth = { userId, clerkUserId: claims.sub };
    });
  },
  { name: 'mm-auth', encapsulate: false },
);
