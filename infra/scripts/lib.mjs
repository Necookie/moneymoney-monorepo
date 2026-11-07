// Shared helpers for provisioning scripts. Secrets are read from / written to the gitignored
// .secrets.local.env at the repo root and are never printed.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const SECRETS_FILE = fileURLToPath(new URL('../../.secrets.local.env', import.meta.url));

export function readSecrets() {
  if (!existsSync(SECRETS_FILE)) throw new Error(`Missing ${SECRETS_FILE}`);
  const out = {};
  for (const line of readFileSync(SECRETS_FILE, 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) out[m[1]] = m[2].trim().replace(/^(["'])(.*)\1$/, '$2');
  }
  return out;
}

/** Set (or replace) KEY=value in the secrets file without echoing the value. */
export function writeSecret(key, value) {
  const text = readFileSync(SECRETS_FILE, 'utf8');
  const re = new RegExp(`^${key}=.*$`, 'm');
  const next = re.test(text)
    ? text.replace(re, `${key}=${value}`)
    : `${text.trimEnd()}\n${key}=${value}\n`;
  writeFileSync(SECRETS_FILE, next);
}

export function require(secrets, ...keys) {
  const missing = keys.filter((k) => !secrets[k]);
  if (missing.length)
    throw new Error(`Fill these in .secrets.local.env first: ${missing.join(', ')}`);
}

export async function http(method, url, { token, body, headers = {} } = {}) {
  const res = await fetch(url, {
    method,
    headers: {
      accept: 'application/json',
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const msg = typeof data === 'string' ? data.slice(0, 300) : JSON.stringify(data).slice(0, 600);
    throw new Error(`${method} ${url} → ${res.status}: ${msg}`);
  }
  return data;
}

export const log = (...args) => console.log('•', ...args);
