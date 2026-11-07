#!/usr/bin/env node
// Create (or reuse) a Cloudflare Tunnel used ONLY by Money Money, route
// api.moneymoney.necookie.dev → http://moneymoney-api:3001 inside the Money Money stack, and
// create the proxied DNS record. Idempotent. Refuses to touch an existing DNS record that
// points somewhere else. Writes CLOUDFLARE_TUNNEL_TOKEN into .secrets.local.env (never printed).
//
//   node infra/scripts/provision-cloudflare-tunnel.mjs [--dry-run]
import { http, log, readSecrets, require, writeSecret } from './lib.mjs';

const TUNNEL_NAME = 'moneymoney-api';
const HOSTNAME = 'api.moneymoney.necookie.dev';
const ZONE = 'necookie.dev';
const SERVICE = 'http://moneymoney-api:3001';
const dryRun = process.argv.includes('--dry-run');

const s = readSecrets();
require(s, 'CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID');
const cf = (method, path, body) =>
  http(method, `https://api.cloudflare.com/client/v4${path}`, {
    token: s.CLOUDFLARE_API_TOKEN,
    body,
  }).then((r) => r.result);
const acct = s.CLOUDFLARE_ACCOUNT_ID;

const [zone] = await cf('GET', `/zones?name=${ZONE}`);
if (!zone) throw new Error(`Zone ${ZONE} not visible to this token`);
log(`zone ${ZONE} found`);

const existing =
  (await cf('GET', `/accounts/${acct}/cfd_tunnel?name=${TUNNEL_NAME}&is_deleted=false`)) ?? [];
let tunnel = existing[0];
if (tunnel) log(`reusing tunnel ${TUNNEL_NAME} (${tunnel.id})`);
else if (dryRun) log(`[dry-run] would create tunnel ${TUNNEL_NAME}`);
else {
  tunnel = await cf('POST', `/accounts/${acct}/cfd_tunnel`, {
    name: TUNNEL_NAME,
    config_src: 'cloudflare',
  });
  log(`created tunnel ${TUNNEL_NAME} (${tunnel.id})`);
}

const ingress = {
  config: {
    ingress: [
      {
        hostname: HOSTNAME,
        service: SERVICE,
        originRequest: { connectTimeout: 10, noHappyEyeballs: false },
      },
      { service: 'http_status:404' },
    ],
  },
};
if (tunnel && !dryRun) {
  await cf('PUT', `/accounts/${acct}/cfd_tunnel/${tunnel.id}/configurations`, ingress);
  log(`ingress set: ${HOSTNAME} → ${SERVICE}`);
}

const records = await cf('GET', `/zones/${zone.id}/dns_records?name=${HOSTNAME}`);
const target = tunnel ? `${tunnel.id}.cfargotunnel.com` : '<tunnel-id>.cfargotunnel.com';
const record = records[0];
if (record) {
  if (record.type === 'CNAME' && record.content === target)
    log(`DNS ${HOSTNAME} already points at the tunnel`);
  else
    throw new Error(
      `DNS record ${HOSTNAME} exists (${record.type} ${record.content}); refusing to modify it`,
    );
} else if (dryRun) log(`[dry-run] would create CNAME ${HOSTNAME} → ${target}`);
else {
  await cf('POST', `/zones/${zone.id}/dns_records`, {
    type: 'CNAME',
    name: HOSTNAME,
    content: target,
    proxied: true,
    comment: 'Money Money API (dedicated tunnel)',
  });
  log(`created proxied CNAME ${HOSTNAME}`);
}

if (tunnel && !dryRun) {
  const token = await cf('GET', `/accounts/${acct}/cfd_tunnel/${tunnel.id}/token`);
  writeSecret('CLOUDFLARE_TUNNEL_TOKEN', token);
  writeSecret('CLOUDFLARE_TUNNEL_ID', tunnel.id);
  log('tunnel token saved to .secrets.local.env (CLOUDFLARE_TUNNEL_TOKEN)');
}
