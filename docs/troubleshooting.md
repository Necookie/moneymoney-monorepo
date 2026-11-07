# Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| API `401 Invalid or expired session` | Wrong Clerk instance keys (test vs live), clock skew, token from a different app | Use keys from app `app_3LlSjoo…`; ensure web/mobile and API use the same instance |
| API `401` only from the web | `azp` not in `CLERK_AUTHORIZED_PARTIES` | Add the exact web origin (scheme + host, no slash) |
| API `403 This Money Money instance is private` | Signed-in Clerk user isn't in `OWNER_CLERK_USER_IDS` | Add your `user_…` id; disable sign-ups in Clerk |
| Browser CORS error | Origin not in `CORS_ORIGINS` | Add it and redeploy |
| `/ready` returns 503 | Postgres down / wrong password | Check `moneymoney-postgres` health and `POSTGRES_PASSWORD` |
| API container restarts at boot | Invalid env (logged as `Invalid environment configuration`) or failed migration | Fix env; for migration errors restore from backup — never edit applied migrations |
| `api.moneymoney.necookie.dev` 502 `upstream_unavailable` | Tunnel connector down (needs outbound UDP 7844/QUIC) or API unhealthy | Check `moneymoney-tunnel` logs (`Registered tunnel connection … protocol=quic`) and API health; `wrangler tunnel info moneymoney-api` |
| Valid mobile token rejected with 401 | Clerk SDK `authorizedParties` rejects tokens without `azp` | Already handled by `isAuthorizedParty` — don't pass `authorizedParties` to `verifyToken` |
| `409 A record with these values already exists` | Planned occurrence already converted, duplicate category/budget | Expected guard — edit the existing record |
| `422 Transactions record money that already moved` | Future-dated transaction | Add it in the Financial Calendar (planner) instead |
| Forecast looks too optimistic | No budgets → day-to-day spending not projected | Add budgets; see `assumptions` in the forecast response |
| Mobile shows "Pending N" for long | Offline, or server rejects ops | Check connectivity; failed items show the server message — edit or delete them |
| Mobile can't reach API | `EXPO_PUBLIC_API_URL` is a LAN/Tailscale address | Use the public HTTPS URL for release builds |
| OpenNext build fails on Windows | Known Windows limitations | Build in WSL or CI (`deploy-web.yml`) |
| Backup container unhealthy | No successful backup in 26 h | Read `moneymoney-backup` logs; run `backup.sh` manually |
