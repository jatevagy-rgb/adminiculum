// Bounded, local-only preview owned by this test. No build and no backend.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const logs = path.join(root, 'test-results/grow-v2');
fs.mkdirSync(logs, { recursive: true });
const env = { ...process.env, NEXT_PUBLIC_ENTRA_CLIENT_ID: "grow-v2-qa", NEXT_PUBLIC_ENTRA_AUTHORITY: "https://qa.ciamlogin.com/qa", NEXT_PUBLIC_ENTRA_REDIRECT_URI: "http://127.0.0.1:3111/portal", NEXT_PUBLIC_ADMINICULUM_API_SCOPE: "api://qa/access_as_client", NEXT_PUBLIC_ENABLE_LOCAL_DEV_AUTH: "true", NEXT_PUBLIC_WORKFORCE_ENTRA_CLIENT_ID: "00000000-0000-0000-0000-000000000000", NEXT_PUBLIC_WORKFORCE_ENTRA_TENANT_ID: "00000000-0000-0000-0000-000000000000", NEXT_PUBLIC_BACKEND_BASE_URL: 'http://127.0.0.1:3111', CASE_AI_BASE: 'http://127.0.0.1:3111' };
const children = [];
const stop = () => {
  for (const child of children.reverse()) {
    if (child.exitCode === null && child.pid) {
      if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, timeout: 10000, stdio: 'ignore' });
      else child.kill();
    }
  }
};
const timeout = setTimeout(() => { console.error('TIMEOUT: preview + browser checks exceeded 420 seconds'); stop(); process.exit(124); }, 420000);
try {
  const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '-p', '3111', '--hostname', '127.0.0.1'], { cwd: root, env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  children.push(server);
  server.stdout.pipe(fs.createWriteStream(path.join(logs, 'dev.stdout.log')));
  server.stderr.pipe(fs.createWriteStream(path.join(logs, 'dev.stderr.log')));
  await new Promise((resolve, reject) => {
    server.stdout.on('data', chunk => { if (chunk.toString().includes('Ready in')) resolve(); });
    server.on('error', reject);
    server.on('exit', code => reject(new Error(`Preview exited ${code}`)));
  });
  // Precompile this route before browser boot. A cold Windows dev compiler can
  // return empty runtime assets while its first compilation is being finalized.
  await fetch(env.CASE_AI_BASE + '/portal/fejlesztes').then(r => r.text());
  for (const route of ['/portal/fejlesztes']) { await fetch(env.CASE_AI_BASE + route).then(r => r.text()); }
  for (const asset of ['/webpack.js', '/app/layout.js']) {
    let bytes = 0;
    for (let attempt = 0; attempt < 10 && bytes === 0; attempt++) {
      bytes = (await (await fetch(env.CASE_AI_BASE + '/_next/static/chunks' + asset)).arrayBuffer()).byteLength;
      if (!bytes) await new Promise(resolve => setTimeout(resolve, 500));
    }
    if (!bytes) throw new Error('Preview returned an empty runtime asset: ' + asset);
  }
  const qa = spawn(process.execPath, ['tests/growV2BrowserQA.mjs'], { cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  children.push(qa);
  qa.stdout.pipe(process.stdout); qa.stderr.pipe(process.stderr);
  process.exitCode = await new Promise((resolve, reject) => { qa.on('exit', resolve); qa.on('error', reject); });
} finally { clearTimeout(timeout); stop(); }
