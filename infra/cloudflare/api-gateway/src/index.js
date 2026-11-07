/**
 * Money Money API gateway (Cloudflare Worker on api.moneymoney.necookie.dev).
 *
 * The API container is never published on the internet: the Money Money stack runs its own
 * cloudflared connector, and this Worker reaches the API privately through a Workers VPC service
 * bound to that tunnel. Only the API's public surface is forwarded.
 */

const ALLOWED = [
  /^\/health$/,
  /^\/ready$/,
  /^\/api\/v1(\/|$)/,
  /^\/docs(\/|$)/,
  /^\/openapi\.json$/,
];
const HOP_BY_HOP = [
  'connection',
  'keep-alive',
  'proxy-connection',
  'transfer-encoding',
  'upgrade',
  'te',
  'trailer',
];

function json(status, code, message, requestId) {
  return new Response(
    JSON.stringify({ error: { code, message, ...(requestId ? { requestId } : {}) } }),
    {
      status,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    },
  );
}

export default {
  /** @param {Request} request @param {{ API: { fetch: typeof fetch } }} env */
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.protocol !== 'https:') {
      url.protocol = 'https:';
      return Response.redirect(url.toString(), 301);
    }
    if (!ALLOWED.some((re) => re.test(url.pathname))) {
      return json(404, 'not_found', `Route ${request.method} ${url.pathname} not found`);
    }

    const requestId = request.headers.get('x-request-id') ?? crypto.randomUUID();
    const clientIp = request.headers.get('cf-connecting-ip') ?? '';
    const headers = new Headers(request.headers);
    for (const h of HOP_BY_HOP) headers.delete(h);
    // Overwrite (never append) client-identifying headers so they cannot be spoofed.
    headers.set('x-forwarded-for', clientIp);
    headers.set('cf-connecting-ip', clientIp);
    headers.set('x-forwarded-proto', 'https');
    headers.set('x-forwarded-host', url.host);
    headers.set('x-request-id', requestId);

    const hasBody = !['GET', 'HEAD'].includes(request.method);
    try {
      // Routing is decided by the VPC service (moneymoney-api:3001); the URL host only sets Host.
      const upstream = await env.API.fetch(`http://moneymoney-api${url.pathname}${url.search}`, {
        method: request.method,
        headers,
        body: hasBody ? request.body : undefined,
        redirect: 'manual',
      });
      const response = new Response(upstream.body, upstream);
      response.headers.set('strict-transport-security', 'max-age=31536000; includeSubDomains');
      if (!response.headers.has('x-request-id')) response.headers.set('x-request-id', requestId);
      return response;
    } catch (err) {
      console.error('upstream unreachable', {
        requestId,
        message: err instanceof Error ? err.message : String(err),
      });
      return json(
        502,
        'upstream_unavailable',
        'Money Money API is temporarily unreachable',
        requestId,
      );
    }
  },
};
