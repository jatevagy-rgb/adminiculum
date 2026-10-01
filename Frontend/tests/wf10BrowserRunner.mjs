// Bounded, local-only preview owned by this test. No build and no backend.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const logs = path.join(root, '../work/evidence/browser');
fs.mkdirSync(logs, { recursive: true });
const env = { ...process.env, NEXT_PUBLIC_BACKEND_BASE_URL: 'http://127.0.0.1:3137', CASE_AI_BASE: 'http://127.0.0.1:3137', PREVIEW_PORT:'3137', WF01_OUTPUT:logs };
const children = [];
const stop = () => {
  for (const child of children.reverse()) {
    if (child.exitCode === null && child.pid) {
      if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, timeout: 10000, stdio: 'ignore' });
      else child.kill();
    }
  }
};
const timeout = setTimeout(() => { console.error('TIMEOUT: preview + browser checks exceeded 300 seconds'); stop(); process.exit(124); }, 300000);
try {
  const server = spawn(process.execPath, ['tests/wordWorkflowPreview.mjs'], { cwd: root, env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  children.push(server);
  server.stdout.pipe(fs.createWriteStream(path.join(logs, 'dev.stdout.log')));
  server.stderr.pipe(fs.createWriteStream(path.join(logs, 'dev.stderr.log')));
  await new Promise((resolve, reject) => {
    server.stdout.on('data', chunk => { if (chunk.toString().includes('Ready in')) resolve(); });
    server.on('error', reject);
    server.on('exit', code => reject(new Error(`Preview exited ${code}`)));
  });
  const qa = spawn(process.execPath, ['tests/wf10BrowserQA.mjs'], { cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  children.push(qa);
  qa.stdout.pipe(process.stdout); qa.stderr.pipe(process.stderr);
  process.exitCode = await new Promise((resolve, reject) => { qa.on('exit', resolve); qa.on('error', reject); });
} finally { clearTimeout(timeout); stop(); }
