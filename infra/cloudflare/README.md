# Cloudflare (account `668f78c5…`, zone `necookie.dev`, Free plan)

All resources below are new and Money Money-specific. No existing DNS record, shared tunnel or
other Worker was modified. Provisioned with Wrangler's OAuth login (`wrangler login`), which has
Workers, Workers routes and Connectivity (tunnels / Workers VPC) scopes but **no DNS-write scope**
— hence the design below needs no hand-made DNS records.

| Resource | Purpose |
|---|---|
| Worker `moneymoney-web` + custom domain `moneymoney.necookie.dev` | Web app (Next.js via OpenNext) — `apps/web/wrangler.jsonc` |
| Tunnel `moneymoney-api` (`79f966a9-59a4-4189-bb80-8aec70e98b71`, remotely managed) | Private connector run by the `moneymoney-tunnel` container inside the Money Money stack. **No public hostname / ingress rules.** |
| Workers VPC service `moneymoney-api` (`01a1b4ca-fd2a-7bf3-a6cf-2c6192c79874`) | HTTP → hostname `moneymoney-api`, port 3001, via that tunnel. cloudflared resolves the name with Docker's DNS on the stack network. |
| Worker `moneymoney-api-gateway` + custom domain `api.moneymoney.necookie.dev` | Public API entry point; forwards only `/health`, `/ready`, `/api/v1/*`, `/docs`, `/openapi.json` to the VPC binding; sets `X-Forwarded-For`/`CF-Connecting-IP` from the real client IP; 502 envelope if the stack is down. Source: [`api-gateway/`](api-gateway) |

```text
client ──HTTPS──▶ Worker moneymoney-api-gateway (api.moneymoney.necookie.dev)
                     │  env.API.fetch()  (Workers VPC, open beta)
                     ▼
               Tunnel moneymoney-api ◀── QUIC (outbound UDP 7844) ── cloudflared container
                                                                         │ Docker DNS
                                                                         ▼
                                                            moneymoney-api:3001 ─▶ moneymoney-postgres
```

Workers custom domains get their own edge certificate, so the two-level hostname
`api.moneymoney.necookie.dev` works on the Free plan (issuance took ~5 minutes the first time).

## Recreate from scratch

```bash
export CLOUDFLARE_ACCOUNT_ID=668f78c5a9581c5051bd60a4985d6166
npx wrangler tunnel create moneymoney-api
# tunnel token → .secrets.local.env CLOUDFLARE_TUNNEL_TOKEN
#   (GET /accounts/$CLOUDFLARE_ACCOUNT_ID/cfd_tunnel/<id>/token, or dashboard → Tunnels → Install)
npx wrangler vpc service create moneymoney-api --type http \
  --tunnel-id <tunnel-id> --hostname moneymoney-api --http-port 3001
# put the service id into infra/cloudflare/api-gateway/wrangler.jsonc, then:
npx wrangler deploy --config infra/cloudflare/api-gateway/wrangler.jsonc
node infra/scripts/provision-coolify.mjs       # passes the tunnel token to the stack
```

Web: see [docs/deployment/cloudflare-web.md](../../docs/deployment/cloudflare-web.md).
