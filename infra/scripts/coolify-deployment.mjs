#!/usr/bin/env node
// Show the status (and tail of the logs) of a Coolify deployment for the Money Money app.
//   node infra/scripts/coolify-deployment.mjs <deployment-uuid> [--lines 40]
import { http, readSecrets } from './lib.mjs';

const s = readSecrets();
const id = process.argv[2];
const lines = Number(process.argv[process.argv.indexOf('--lines') + 1]) || 40;
const base = `${s.COOLIFY_URL || 'http://necore:8000'}/api/v1`;
const d = await http('GET', `${base}/deployments/${id}`, { token: s.COOLIFY_API_TOKEN });
console.log(`status: ${d.status}`);
let logs = [];
try {
  logs = JSON.parse(d.logs || '[]');
} catch {
  logs = [];
}
const text = logs
  .filter((l) => !l.hidden)
  .map((l) => String(l.output ?? '').trim())
  .filter(Boolean)
  // Never echo anything that looks like a credential.
  .map((l) => l.replace(/(PASSWORD|SECRET|TOKEN|KEY)[^\s]*=\S+/gi, '$1=[redacted]'));
console.log(text.slice(-lines).join('\n'));
