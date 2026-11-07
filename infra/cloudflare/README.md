# Cloudflare

| Resource | Purpose | Managed by |
|---|---|---|
| Worker `moneymoney-web` + custom domain `moneymoney.necookie.dev` | Web app (OpenNext) | `apps/web/wrangler.jsonc`, `pnpm --filter @mm/web run deploy` |
| Tunnel `moneymoney-api` (remotely managed) | Public ingress for the API only | `infra/scripts/provision-cloudflare-tunnel.mjs` |
| DNS `api.moneymoney.necookie.dev` CNAME → `<tunnel>.cfargotunnel.com` (proxied) | API hostname | same script (refuses to overwrite existing records) |

Only new, Money Money-specific resources are created. Existing DNS records, shared tunnels and
other Workers are never modified. See [docs/deployment/cloudflare-web.md](../../docs/deployment/cloudflare-web.md).
