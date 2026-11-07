# ADR 0006 — Next.js on Cloudflare Workers via OpenNext; API stays on necore

**Status:** accepted · 2026-11-07

**Decision.** The web app is deployed to Cloudflare Workers with `@opennextjs/cloudflare` (the
Cloudflare-recommended adapter; Node.js compatibility mode). The browser calls the API directly
with a Clerk token; the Worker holds no database credentials. The API and database stay on `necore`
behind a dedicated tunnel.

**Consequences.** Global edge delivery for the UI, minimal server-side surface on Workers, and a
single backend for web and mobile.
