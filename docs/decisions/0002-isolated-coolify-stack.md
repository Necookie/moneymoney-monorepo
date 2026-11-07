# ADR 0002 — Money Money as an isolated Coolify compose stack

**Status:** accepted · 2026-11-07

**Context.** `necore` will host many independent applications. Money Money must own its backend,
database, credentials, storage, backups and lifecycle, without touching shared infrastructure.

**Options.** (a) Coolify standalone Postgres + Dockerfile app on the shared destination network;
(b) one Git-based *Docker Compose* application containing API, a dedicated Postgres, a dedicated
cloudflared tunnel and a backup sidecar.

**Decision.** (b). Coolify gives the stack its own network; we add an `internal` DB network so
Postgres has no route out and no other stack can reach it. Public ingress is a tunnel dedicated to
Money Money, so the shared Coolify proxy, shared tunnels and firewall stay untouched. Backups are
part of the stack (Coolify's built-in scheduled backups only cover standalone database resources).

**Consequences.** Deploy/restart/remove affects only Money Money. Database backup tooling is
ours to maintain (scripts + weekly restore verification). Shared physical risks remain → off-server
copies recommended.
