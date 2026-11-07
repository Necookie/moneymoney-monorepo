# Coolify deployment (API + database) on `necore`

**Principle: one physical server, many isolated application stacks.** Money Money owns its API,
database, credentials, volumes, networks, tunnel, backups and lifecycle.

## Resources

| Logical resource | Implementation |
|---|---|
| Coolify project | **Money Money** (environment `production`) |
| API service | `moneymoney-api` (Git-based *Docker Compose* application; service of the same name) |
| PostgreSQL | `moneymoney-postgres` — dedicated Postgres 17 container, user/db `moneymoney`, unique password |
| Networks | `moneymoney-db` (internal, no internet) + `moneymoney-network` (egress); Coolify adds a resource-specific network. Not attached to the shared `coolify` network |
| Volumes | `moneymoney-db-data` (Postgres), `moneymoney-backups` (Coolify may prefix names with the resource UUID) |
| Public ingress | `api.moneymoney.necookie.dev` → Worker `moneymoney-api-gateway` → Workers VPC → dedicated tunnel `moneymoney-api` ← `moneymoney-tunnel` (cloudflared) → `moneymoney-api:3001` (see [infra/cloudflare](../../infra/cloudflare/README.md)) |
| Backups | `moneymoney-backup` sidecar (see [backup-restore.md](backup-restore.md)) |

Compose file: [`infra/coolify/docker-compose.yml`](../../infra/coolify/docker-compose.yml)
(Base Directory `/infra/coolify`, Compose Location `/docker-compose.yml`).

### Resource limits (server: 8 vCPU, 14 GiB RAM, ~13 GiB available at provisioning)

| Service | CPU | Memory |
|---|---|---|
| moneymoney-postgres | 1.0 | 1 GiB |
| moneymoney-api | 1.0 | 768 MiB |
| moneymoney-backup | 0.5 | 256 MiB |
| moneymoney-tunnel | 0.25 | 128 MiB |

All services: `restart: unless-stopped`, health checks, json-file logs capped at 3 × 10 MB.

## Provisioning (idempotent scripts)

Prerequisites in `.secrets.local.env` (gitignored): `COOLIFY_API_TOKEN` (write + deploy; enable
*Settings → Advanced → API access*), `CLERK_SECRET_KEY`, `OWNER_CLERK_USER_ID`,
`CLOUDFLARE_TUNNEL_TOKEN` (see [infra/cloudflare](../../infra/cloudflare/README.md)).

```bash
node infra/scripts/provision-coolify.mjs --inspect        # read-only: list servers/projects/apps
node infra/scripts/provision-coolify.mjs                   # project, app, env vars, deploy
```

The Coolify script never modifies other projects; it reuses the Money Money project/app if they
exist, generates a dedicated Postgres password once, and stores every variable as
**runtime-only** (Coolify's default would also pass them to `docker build` as build args).

Deployed resource names (Coolify prefixes compose networks/volumes with the app UUID
`mli5raiuwaglmp8qjcxku2vp`): networks `…_moneymoney-db` (internal) and `…_moneymoney-network`;
volumes `…_moneymoney-db-data` and `…_moneymoney-backups`.

## Deploy / update / restart / remove

- **Deploy:** push to `main`, then Coolify → Money Money → moneymoney-api → *Deploy* (auto-deploy
  is off deliberately), or `POST /api/v1/deploy?uuid=<app uuid>`.
- **Migrations** run automatically before the API starts (`node dist/migrate.js`, advisory lock).
  Only reviewed, non-destructive migrations are merged.
- **Restart:** *Restart* in the Money Money app only — other stacks are unaffected.
- **Logs:** Coolify → app → *Logs* (per service).
- **Remove:** delete the Money Money project in Coolify, then remove the `moneymoney-*` volumes
  only after taking and verifying a final backup.

## Verify

```bash
curl -s https://api.moneymoney.necookie.dev/health   # {"status":"ok",...}
curl -s https://api.moneymoney.necookie.dev/ready    # DB reachable
curl -s https://api.moneymoney.necookie.dev/api/v1/me   # 401 without a token
```
