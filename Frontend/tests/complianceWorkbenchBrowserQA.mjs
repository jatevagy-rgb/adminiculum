import assert from 'node:assert/strict';
import { build } from 'esbuild';
import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.UX13_QA_PORT || 3193);
const BASE = `http://127.0.0.1:${PORT}`;
const CLIENT_ID = 'qa-client-ux13';
const APPLICABILITY_ID = 'qa-applicability-ux13';
const FACT_KEY = 'whistle_special_sector';
const REQUIREMENT_VERSION_ID = 'qa-requirement-version-ux13';
const user = { id: 'qa-workforce-user', email: 'qa@example.invalid', name: 'QA Lawyer', role: 'ADMIN' };
let server;

function startServer() {
  return new Promise((resolve, reject) => {
    server = spawn(process.execPath, [path.join(ROOT, 'node_modules/next/dist/bin/next'), 'dev', '-p', String(PORT)], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    let ready = false;
    const timer = setTimeout(() => reject(new Error('Timed out waiting for Next.js dev server')), 120000);
    const onOutput = (chunk) => {
      const output = chunk.toString();
      if (/Ready in|Local:/i.test(output)) {
        ready = true;
        clearTimeout(timer);
        resolve();
      }
    };
    server.stdout.on('data', onOutput);
    server.stderr.on('data', onOutput);
    server.on('error', reject);
    server.on('exit', (code) => { if (!ready) reject(new Error(`Next.js dev server exited before ready: ${code}`)); });
  });
}

function stopServer() {
  if (!server) return;
  if (process.platform === 'win32' && server.pid) spawnSync('taskkill', ['/F', '/T', '/PID', String(server.pid)], { stdio: 'ignore' });
  else server.kill('SIGTERM');
  server = undefined;
}

async function assertExistingDecisionJourney() {
  const built = await build({
    stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import {ComplianceWorkbench} from './src/components/clients/compliance/ComplianceWorkbench'; createRoot(document.getElementById('root')).render(<ComplianceWorkbench clientId="client-a" onNavigate={v => window.qaNavigation=v} onChanged={() => {}} />);`, resolveDir: ROOT, loader: 'tsx' },
    bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
    plugins: [{ name: 'isolated-api-transport', setup(b) {
      b.onResolve({ filter: /^(?:@\/lib\/api|\.\/api)$/ }, () => ({ path: 'api', namespace: 'test' }));
      b.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: `export async function fetchApi(url, options={}) { const response=await fetch('/api'+url, {...options,headers:{'content-type':'application/json'}}); if(!response.ok) throw new Error('Request failed'); return response.json(); } export class ApiError extends Error {}`, loader: 'js' }));
    } }],
  });
  const testServer = http.createServer((req, res) => {
    if (req.url === '/bundle.js') { res.setHeader('content-type', 'text/javascript'); res.end(built.outputFiles[0].text); }
    else { res.setHeader('content-type', 'text/html'); res.end('<!doctype html><html lang="hu"><head><meta charset="utf-8"></head><body><main id="root"></main><script src="/bundle.js"></script></body></html>'); }
  });
  await new Promise(resolve => testServer.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
    const calls = []; let decided = false;
    const source = { observationId: 'obs', legalSourceId: 'source', legalSourceVersionId: 'exact-version', versionKey: 'V1', sourceKey: 'CELEX fixture', event: 'consolidated version', reviewedNote: 'Human review completed', revision: 'a'.repeat(64), requirementVersions: [{ id: 'req', title: 'Exactly impacted requirement' }], proposals: [], decision: null };
    const row = { id: 'SOURCE_IMPACT:obs', kind: 'SOURCE_IMPACT', sourceId: 'obs', clientId: 'client-a', title: 'Reviewed source', status: 'IMPACT_CONFIRMED', action: 'IMPACT_DECISION', readOnly: false, source };
    await page.route('**/api/**', async route => {
      const req = route.request();
      if (req.method() === 'POST') { calls.push({ url: new URL(req.url()).pathname, body: req.postDataJSON() }); decided = true; await route.fulfill({ json: { id: 'receipt' } }); return; }
      await route.fulfill({ json: { clientId: 'client-a', acceptanceTargets: [], truncated: {}, rows: [{ ...row, readOnly: decided, reason: decided ? 'DECISION_RECORDED' : null, source: { ...source, decision: decided ? { kind: 'NO_ACTION', note: 'Reviewed; no client work required.', result: {} } : null } }] } });
    });
    await page.goto(`http://127.0.0.1:${testServer.address().port}`);
    await page.getByText('Forrás technikai adatai').click();
    await page.getByText('Azonosító: exact-version', { exact: false }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Döntés rögzítése' }).isDisabled(), true);
    await page.getByLabel('Döntési indok').fill('Reviewed; no client work required.');
    await page.getByRole('button', { name: 'Döntés rögzítése' }).click();
    await page.getByText('Csak olvasható:', { exact: false }).waitFor();
    assert.deepEqual(calls, [{ url: '/api/compliance/clients/client-a/source-impacts/obs/decision', body: { sourceRevision: 'a'.repeat(64), kind: 'NO_ACTION', note: 'Reviewed; no client work required.' } }]);
    assert.equal(await page.getByRole('button', { name: 'Döntés rögzítése' }).count(), 0);
    console.log('EXISTING_SOURCE_DECISION_BROWSER_QA=PASS');
  } finally {
    await browser.close();
    await new Promise(resolve => testServer.close(resolve));
  }
}

async function main() {
  await assertExistingDecisionJourney();
  await startServer();
  const browser = await chromium.launch({ headless: true });
  const mutations = [];
  const requestDrafts = [];
  const hardErrors = [];
  try {
    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }, { width: 1280, height: 800, stale: true }]) {
      const context = await browser.newContext({ viewport });
      const page = await context.newPage();
      page.on('pageerror', error => hardErrors.push(error.message));
      await page.addInitScript(({ profile }) => {
        localStorage.setItem('auth_token', 'qa-ux13-token');
        sessionStorage.setItem('adminiculum_auth_profile', JSON.stringify(profile));
      }, { profile: user });
      await page.route('**/api/v1/**', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        const pathname = url.pathname;
        if (request.method() === 'POST' && pathname === '/api/v1/internal/client-interaction/requests') {
          requestDrafts.push(request.postDataJSON());
          await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: 'qa-request-draft', revision: 1 }) });
          return;
        }
        if (request.method() !== 'GET') mutations.push(`${request.method()} ${pathname}`);
        let body = {};
        if (pathname.endsWith('/auth/me')) body = user;
        else if (pathname === `/api/v1/clients/${CLIENT_ID}`) body = { id: CLIENT_ID, name: 'UX-13 QA ügyfél', email: 'client@example.invalid' };
        else if (pathname === '/api/v1/client-identity/admin/workspaces') body = { items: [{ id: 'qa-org-workspace', clientId: CLIENT_ID, status: 'ACTIVE', mode: 'ORGANIZATION' }] };
        else if (pathname === '/api/v1/cases') body = { data: [{ id: 'qa-case', clientId: CLIENT_ID, caseNumber: 'QA-UX13', title: 'QA ügy', status: 'ACTIVE' }], page: 1, limit: 100, total: 1, totalPages: 1 };
        else if (pathname === `/api/v1/compliance/clients/${CLIENT_ID}/overview`) body = { findings: [] };
        else if (pathname === `/api/v1/clients/${CLIENT_ID}/compliance/controls`) body = { requirements: [] };
        else if (pathname === `/api/v1/compliance/clients/${CLIENT_ID}/workbench`) body = {
          schemaVersion: 1, clientId: CLIENT_ID, generatedAt: '2026-10-05T00:00:00.000Z', acceptanceTargets: [], truncated: {},
          rows: [{ id: 'missing-1', kind: 'MISSING_FACT', sourceId: `${APPLICABILITY_ID}:${FACT_KEY}`, clientId: CLIENT_ID, caseId: null, subject: null,
            title: 'Belső visszaélés-bejelentési követelmény — Ügyvédi pontosítás szükséges.', status: 'INSUFFICIENT_FACTS', since: '2026-10-05T00:00:00.000Z', dueAt: null,
            ownerId: null, ownerName: null, readOnly: false, reason: null, action: 'REQUIREMENTS',
            requirementsTarget: { clientId: CLIENT_ID, applicabilityId: APPLICABILITY_ID, factKey: viewport.stale ? 'stale_fact' : FACT_KEY } }],
        };
        else if (pathname === `/api/v1/compliance/clients/${CLIENT_ID}/workspace`) body = {
          summary: { enrollment: 'ENROLLED', evaluatedCount: 1, applies: 0, doesNotApply: 0, insufficientFacts: 1, legalReviewRequired: 0, technicalReviewRequired: 0, sourceSupportInsufficient: 0, openFindings: 0, openProposals: 0 },
          evaluatedAt: '2026-10-05T00:00:00.000Z',
          areas: [{ applicabilityId: APPLICABILITY_ID, requirementKey: 'WHISTLEBLOWING_INTERNAL_CHANNEL', requirementVersionId: REQUIREMENT_VERSION_ID,
            requirementVersionKey: 'V1', ruleVersionKey: 'R1', title: 'Belső visszaélés-bejelentési követelmény', normativeStatement: 'QA stored requirement text.',
            domainLabel: 'QA', outcome: 'INSUFFICIENT_FACTS', scopeType: 'COMPANY', subjectLabel: null, evaluationAt: '2026-10-05T00:00:00.000Z',
            sourceSupportState: 'SUFFICIENT', specialistRequirement: 'NONE', activeFindingId: null, usedFacts: [],
            missingFacts: [{ factKey: FACT_KEY, label: null, profileAnswerable: false }], citations: [] }],
        };
        else if (pathname.startsWith(`/api/v1/compliance/clients/${CLIENT_ID}/`)) body = {};
        else if (pathname === '/api/v1/users') body = { data: [user] };
        else if (pathname.startsWith('/api/v1/')) body = {};
        else return route.continue();
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
      });

      await page.goto(`${BASE}/clients/${CLIENT_ID}/compliance`, { waitUntil: 'domcontentloaded', timeout: 120000 });
      await page.getByRole('tab', { name: 'Döntési munkalista' }).waitFor({ state: 'visible', timeout: 120000 });
      await page.getByRole('tab', { name: 'Döntési munkalista' }).click();
      await page.getByRole('button', { name: 'Követelmény és adatbekérés megnyitása' }).click();
      await page.getByRole('tab', { name: 'Követelmények' }).waitFor();
      assert.equal(await page.locator('button[role="tab"][aria-selected="true"]').innerText(), 'Követelmények');
      if (viewport.stale) {
        await page.getByRole('alert').getByText('A kiválasztott hiányzó adat már nem érhető el ezen az ügyfélen.', { exact: false }).waitFor({ state: 'visible' });
        assert.equal(await page.locator('[aria-expanded="true"]').count(), 0, 'stale target does not select another area');
      } else {
        const area = page.getByText('További vállalati adat szükséges', { exact: true });
        await area.waitFor({ state: 'visible' });
        assert.equal(await page.locator('[aria-expanded="true"]').count(), 1, 'only the exact applicability area expands');
        assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-current')), 'location');
        await page.getByRole('button', { name: 'Kérdés az ügyfélnek' }).waitFor({ state: 'visible' });
        await page.getByRole('button', { name: 'Dokumentum bekérése' }).waitFor({ state: 'visible' });
        assert.deepEqual(mutations, [], 'navigation and revealing request controls perform no writes');
        await page.getByRole('button', { name: 'Kérdés az ügyfélnek' }).click();
        const questionDialog = page.getByRole('dialog');
        await questionDialog.getByText('Belső visszaélés-bejelentési követelmény', { exact: true }).waitFor();
        await questionDialog.getByLabel('Ügy (case) *').selectOption('qa-case');
        await questionDialog.getByLabel('Ügyfélbiztos cím').fill('QA kérdés');
        await questionDialog.getByLabel('Ügyfélnek szóló útmutató').fill('QA instructions');
        await questionDialog.getByRole('button', { name: 'Tervezet mentése' }).click();
        await questionDialog.getByRole('status').getByText('Tervezet mentve.', { exact: false }).waitFor();
        assert.equal(requestDrafts[0]?.complianceContext?.requirementVersionId, REQUIREMENT_VERSION_ID, 'question request retains the resolved requirement version');
        await questionDialog.getByRole('button', { name: 'Bezárás' }).click();
        await page.getByRole('button', { name: 'Dokumentum bekérése' }).click();
        const documentDialog = page.getByRole('dialog');
        await documentDialog.getByText('Belső visszaélés-bejelentési követelmény', { exact: true }).waitFor();
        await documentDialog.getByRole('button', { name: 'Bezárás' }).click();
      }
      assert.doesNotMatch(await page.locator('body').innerText(), new RegExp(FACT_KEY));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, `no horizontal overflow at ${viewport.width}px`);
      await context.close();
    }
    assert.deepEqual(mutations, [], 'navigation itself performs no Compliance mutations');
    assert.deepEqual(hardErrors, [], 'browser journey has no uncaught errors');
    console.log('UX13_BROWSER_QA=PASS');
    console.log('VIEWPORTS=1440x900,390x844');
    console.log('EXACT_TARGET=PASS');
    console.log('STALE_TARGET_FAILS_SAFE=PASS');
    console.log('REQUEST_CONTROLS_VISIBLE=PASS');
    console.log('NAVIGATION_MUTATIONS=0');
  } finally {
    await browser.close();
    stopServer();
  }
}

main().catch((error) => { console.error(error); stopServer(); process.exitCode = 1; });
