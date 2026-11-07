#!/usr/bin/env node
// Provision the isolated "Money Money" Coolify project and its compose application.
// Idempotent: reuses the project/application when they already exist, never touches other
// projects. Secrets come from .secrets.local.env and are sent only to Coolify.
//
//   node infra/scripts/provision-coolify.mjs            # create/update + deploy
//   node infra/scripts/provision-coolify.mjs --inspect  # read-only listing
//
// COOLIFY_URL defaults to http://necore:8000 (Tailscale).
import { randomBytes } from 'node:crypto';
import { http, log, readSecrets, require, writeSecret } from './lib.mjs';

const PROJECT = 'Money Money';
const APP = 'moneymoney-api';
const REPO = 'https://github.com/necookie/moneymoney-monorepo';
const BRANCH = process.env.MM_BRANCH ?? 'main';
const inspect = process.argv.includes('--inspect');

const s = readSecrets();
require(s, 'COOLIFY_API_TOKEN');
const base = `${s.COOLIFY_URL || 'http://necore:8000'}/api/v1`;
const api = (method, path, body) =>
  http(method, `${base}${path}`, { token: s.COOLIFY_API_TOKEN, body });

const version = await http('GET', `${base}/version`, {
  token: s.COOLIFY_API_TOKEN,
  headers: { accept: 'text/plain' },
}).catch((e) => e.message);
log(`coolify version: ${typeof version === 'string' ? version : JSON.stringify(version)}`);

const servers = await api('GET', '/servers');
log(`servers: ${servers.map((x) => `${x.name} (${x.uuid}) ip=${x.ip}`).join('; ')}`);
const projects = await api('GET', '/projects');
log(`existing projects: ${projects.map((p) => p.name).join(', ') || '(none)'}`);
const apps = await api('GET', '/applications');
const dbs = await api('GET', '/databases').catch(() => []);
const services = await api('GET', '/services').catch(() => []);
log(`existing applications: ${apps.map((a) => a.name).join(', ') || '(none)'}`);
log(
  `existing databases: ${dbs.map((d) => d.name).join(', ') || '(none)'}; services: ${services.map((d) => d.name).join(', ') || '(none)'}`,
);
if (inspect) process.exit(0);

require(s, 'CLERK_SECRET_KEY', 'OWNER_CLERK_USER_ID', 'CLOUDFLARE_TUNNEL_TOKEN'); // tunnel token: see infra/cloudflare/README.md
const server = servers.find((x) => x.name === (s.COOLIFY_SERVER_NAME || 'localhost')) ?? servers[0];
if (!server) throw new Error('No Coolify server found');

let project = projects.find((p) => p.name === PROJECT);
if (!project) {
  project = await api('POST', '/projects', {
    name: PROJECT,
    description: 'Money Money - isolated personal finance stack (API, Postgres, tunnel, backups)',
  });
  log(`created project "${PROJECT}" (${project.uuid})`);
} else log(`reusing project "${PROJECT}" (${project.uuid})`);

let app = apps.find((a) => a.name === APP);
if (!app) {
  app = await api('POST', '/applications/public', {
    project_uuid: project.uuid,
    server_uuid: server.uuid,
    environment_name: 'production',
    git_repository: REPO,
    git_branch: BRANCH,
    build_pack: 'dockercompose',
    base_directory: '/infra/coolify',
    docker_compose_location: '/docker-compose.yml',
    ports_exposes: '3001',
    name: APP,
    description: 'Money Money API stack (api, postgres, tunnel, backup)',
    instant_deploy: false,
    is_auto_deploy_enabled: false,
  });
  log(`created application ${APP} (${app.uuid})`);
} else log(`reusing application ${APP} (${app.uuid})`);

if (!s.MM_POSTGRES_PASSWORD) {
  writeSecret('MM_POSTGRES_PASSWORD', randomBytes(24).toString('base64url'));
  log('generated a new dedicated Postgres password (saved to .secrets.local.env)');
}
const fresh = readSecrets();
const env = {
  POSTGRES_PASSWORD: fresh.MM_POSTGRES_PASSWORD,
  CLERK_SECRET_KEY: fresh.CLERK_SECRET_KEY,
  OWNER_CLERK_USER_IDS: fresh.OWNER_CLERK_USER_ID,
  CLOUDFLARE_TUNNEL_TOKEN: fresh.CLOUDFLARE_TUNNEL_TOKEN,
  CLERK_AUTHORIZED_PARTIES: 'https://moneymoney.necookie.dev',
  CORS_ORIGINS: 'https://moneymoney.necookie.dev',
  ...(fresh.RCLONE_CONFIG_B64
    ? { RCLONE_CONFIG_B64: fresh.RCLONE_CONFIG_B64, RCLONE_REMOTE: fresh.RCLONE_REMOTE }
    : {}),
};
// Production and preview copies, both runtime-only: secrets must never become Docker build args
// (Coolify's default), because build args are recorded in image history.
const envRows = (isPreview) =>
  Object.entries(env).map(([key, value]) => ({
    key,
    value,
    is_preview: isPreview,
    is_literal: true,
    is_buildtime: false,
    is_runtime: true,
  }));
await api('PATCH', `/applications/${app.uuid}/envs/bulk`, {
  data: [...envRows(false), ...envRows(true)],
});
log(`set ${Object.keys(env).length} environment variables (values not printed)`);

if (process.argv.includes('--no-deploy')) {
  log('skipping deployment (--no-deploy)');
  process.exit(0);
}
const deploy = await api('POST', `/deploy?uuid=${app.uuid}&force=false`);
log(`deployment queued: ${JSON.stringify(deploy.deployments?.map((d) => d.deployment_uuid))}`);
writeSecret('COOLIFY_APP_UUID', app.uuid);
