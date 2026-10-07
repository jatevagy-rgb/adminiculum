// Local-only browser acceptance. API responses and closure transitions are synthetic,
// not database/backend authorization proof. Start Next separately with tracked tooling.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.CASE_AI_BASE || 'http://127.0.0.1:3111';
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(BASE).hostname), 'Loopback preview required');
const OUTPUT = path.resolve(ROOT, process.env.LEGACY_HANDOFF_OUTPUT || 'test-results/legacy-handoff/browser');
fs.mkdirSync(OUTPUT, { recursive: true });

// The existing QA script has no fixture exports. Evaluate only its fixture prelude,
// never its browser runner, so exact document/version/TaskSubmission data stays shared.
// These explicit boundaries fail loudly if that script is reorganized.
const fixtureSource = fs.readFileSync(path.join(ROOT, 'tests/wordWorkflowBrowserQA.mjs'), 'utf8');
const fixtureStart = fixtureSource.indexOf('const CASE_ID =');
const fixtureEnd = fixtureSource.indexOf('const browser = await chromium.launch');
assert.ok(fixtureStart > 0 && fixtureEnd > fixtureStart, 'Word workflow fixture boundaries changed');
const fixture = vm.runInNewContext(`${fixtureSource.slice(fixtureStart, fixtureEnd)}
({ CASE_ID, AUTH_ME, DOC_ID, VERSION_ID, TASK, mock, responsibility,
   reset() { attached = []; writes.length = 0; readOnly = false; missingContext = false; failAttach = false; },
   writes() { return writes; } })`, {
  URL, path, fs: { mkdirSync() {} }, process: { env: {} },
}, { filename: 'wordWorkflowBrowserQA.fixture', timeout: 1000 });
const { CASE_ID, AUTH_ME, DOC_ID, VERSION_ID, TASK } = fixture;
const PREPARER = { ...AUTH_ME, role: 'ASSISTANT' };
const REVIEWER = { ...AUTH_ME, id: '66666666-6666-4666-8666-666666666666', name: 'Synthetic reviewer', role: 'LAWYER' };
const STAMP = '2026-10-01T10:00:00.000Z';
const handoffUrl = `${BASE}/cases/${CASE_ID}/handoff`;
const documentUrl = `${BASE}/cases/${CASE_ID}/documents?documentId=${DOC_ID}&versionId=${VERSION_ID}`;
const tasksHref = `/cases/${CASE_ID}#ck-tasks`;
const emptyText = 'Nincs korábbi Leadás ehhez az ügyhöz.';
const record = (status = 'DRAFT') => ({
  id: 'legacy-existing-record-00000001', caseId: CASE_ID, status, packageType: 'FINAL_APPROVAL',
  sourceDocumentId: DOC_ID, anonymizedDocumentId: 'synthetic-anonymized-reference-00001',
  generatedContractId: 'synthetic-generated-contract-00001', legalAnalysisId: 'synthetic-legal-analysis-00001',
  reviewNotesId: 'synthetic-review-notes-00001', preparedById: PREPARER.id,
  preparerSummary: 'Existing synthetic work summary', reviewDecision: null, reviewComment: null,
  reviewedById: null, reviewedAt: null, submittedAt: null, createdAt: STAMP, updatedAt: STAMP,
});
const completed = [];
const screenshots = [];
const browser = await chromium.launch({ headless: true });
try {
  for (const width of [390, 768, 1440]) {
    fixture.reset();
    const height = width === 390 ? 844 : width === 768 ? 1024 : 1000;
    const context = await browser.newContext({ viewport: { width, height }, locale: 'hu-HU', serviceWorkers: 'block' });
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    let user = PREPARER;
    let packages = [record()];
    let listStatus = 200, summaryStatus = 200, writeStatus = 200;
    let holdSummary = null, holdList = null;
    const requests = [], writes = [], errors = [], unexpectedWrites = [], external = [];
    const row = () => page.getByTestId('legacy-handoff-record');
    const panel = () => page.getByTestId('legacy-handoff-history');
    page.on('pageerror', error => errors.push(error.message));
    await context.addInitScript(profile => {
      localStorage.setItem('auth_token', 'synthetic-legacy-qa-token');
      sessionStorage.setItem('adminiculum_auth_profile', JSON.stringify(profile));
    }, AUTH_ME);
    await context.route('**/*', async route => {
      const req = route.request();
      const url = new URL(req.url());
      if (url.origin !== new URL(BASE).origin) {
        external.push(req.url());
        await route.abort('blockedbyclient');
        return;
      }
      if (!url.pathname.startsWith('/api/v1/')) { await route.continue(); return; }
      const method = req.method();
      const body = req.postData() ? req.postDataJSON() : null;
      const entry = { method, path: url.pathname, search: url.search, body };
      requests.push(entry);
      const send = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
      if (method !== 'GET') writes.push(entry);
      if (url.pathname.endsWith('/auth/me')) return send(user);
      if (url.pathname.endsWith(`/cases/${CASE_ID}/summary`)) {
        if (holdSummary) await holdSummary;
        return send(summaryStatus === 200 ? { case: { id: CASE_ID, caseNumber: 'SYNTHETIC-1', title: 'Synthetic legacy handoff case', clientName: 'Synthetic client' } } : { code: 'SYNTHETIC_CASE_DENIED' }, summaryStatus);
      }
      if (url.pathname.endsWith(`/cases/${CASE_ID}/responsibility`)) {
        return send({ ...fixture.responsibility(), responsibleLawyer: { id: REVIEWER.id, name: REVIEWER.name } });
      }
      if (url.pathname.endsWith(`/cases/${CASE_ID}/handoff-packages`)) {
        if (method !== 'GET') { unexpectedWrites.push(entry); return send({ code: 'HANDOFF_PACKAGE_CREATION_RETIRED' }, 410); }
        if (holdList) await holdList;
        return send(listStatus === 200 ? packages : { code: 'SYNTHETIC_LIST_FAILURE' }, listStatus);
      }
      if (url.pathname.includes('/handoff-packages/')) {
        const pkg = packages.find(item => url.pathname.split('/')[4] === item.id);
        if (!pkg || !['PATCH', 'POST'].includes(method)) return send({ code: 'NOT_FOUND' }, 404);
        if (writeStatus !== 200) return send({ code: 'FORBIDDEN' }, writeStatus);
        if (url.pathname.endsWith('/archive') && method === 'POST') pkg.status = 'ARCHIVED';
        else if (url.pathname.endsWith('/review') && method === 'POST') {
          Object.assign(pkg, { status: 'APPROVED', reviewDecision: body.decision, reviewComment: body.reviewComment, reviewedById: user.id, reviewedAt: STAMP });
        } else if (method === 'PATCH') {
          Object.assign(pkg, body);
          if (body.status === 'SUBMITTED') pkg.submittedAt = STAMP;
        } else { unexpectedWrites.push(entry); return send({ code: 'UNEXPECTED_WRITE' }, 500); }
        return send(pkg);
      }
      if (url.pathname.endsWith(`/cases/${CASE_ID}/lifecycle`)) {
        const active = packages.filter(pkg => ['DRAFT', 'PREPARED', 'SUBMITTED', 'IN_REVIEW'].includes(pkg.status)).length;
        return send({ caseId: CASE_ID, status: 'ACTIVE', lifecycleCategory: 'ACTIVE',
          blockers: active ? [{ code: 'ACTIVE_HANDOFF', label: 'Synthetic active legacy handoff', count: active }] : [],
          closureReadiness: { ready: active === 0, reasons: active ? ['Synthetic legacy handoff blocks closure.'] : [] },
          capabilities: { canClose: true }, availability: {} });
      }
      if (method !== 'GET' && !url.pathname.endsWith('/submissions/draft-1/documents')) {
        unexpectedWrites.push(entry); return send({ code: 'UNEXPECTED_WRITE' }, 500);
      }
      const response = fixture.mock(req.url(), method, body);
      return send(response.body, response.status);
    });
    const visit = async (url = handoffUrl) => page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
    const noOverflow = async () => {
      const sizes = await page.evaluate(() => ({ page: document.documentElement.scrollWidth, viewport: innerWidth }));
      assert.ok(sizes.page <= sizes.viewport, `${width}: horizontal overflow ${JSON.stringify(sizes)}`);
    };
    const shot = async (name, fullPage = true) => {
      const file = `${name}-${width}x${height}.png`;
      await page.screenshot({ path: path.join(OUTPUT, file), fullPage });
      screenshots.push(file);
    };
    const test = async (name, run) => {
      try {
        await run();
        await noOverflow();
        assert.deepEqual(errors, [], 'No uncaught browser errors');
        assert.deepEqual(unexpectedWrites, [], 'Only explicitly expected synthetic writes');
        await shot(name);
        completed.push({ viewport: `${width}x${height}`, name });
        console.log(`PASS ${width}x${height} ${name}`);
      } catch (error) {
        await shot(`FAIL-${name}`);
        fs.writeFileSync(path.join(OUTPUT, `failure-${width}.json`), JSON.stringify({ name, message: error.message, url: page.url(), body: await page.locator('body').innerText(), requests, errors, external }, null, 2));
        throw error;
      }
    };

    await test('A-canonical-document-submission', async () => {
      await visit(documentUrl);
      await page.getByTestId('word-document-header').waitFor();
      await page.waitForFunction(() => document.querySelector('[data-testid="submission-version-context"]')?.getAttribute('title') === 'qa-historical-version');
      assert.equal(await panel().count(), 0);
      assert.equal(await page.getByTestId('document-submission-task').inputValue(), '');
      assert.ok(await page.getByTestId('document-top-submission').isDisabled());
      await page.getByTestId('document-submission-task').selectOption(TASK.id);
      await page.waitForFunction(() => !document.querySelector('[data-testid="document-top-submission"]')?.disabled);
      await page.getByTestId('document-top-submission').focus();
      await page.keyboard.press('Enter');
      const linked = page.getByRole('link', { name: 'Beküldött verzió megnyitása' });
      await linked.waitFor();
      assert.ok((await linked.getAttribute('href')).includes(`versionId=${VERSION_ID}`));
      assert.deepEqual(JSON.parse(JSON.stringify(fixture.writes())), [{ documentId: DOC_ID, role: 'PRIMARY_OUTPUT', documentVersionId: VERSION_ID }]);
      assert.ok(await page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]'))));
      await noOverflow();
      await shot('A-canonical-drawer', false);
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => document.activeElement?.getAttribute('data-testid') === 'document-top-submission');
    });
    await test('B-existing-draft-summary-submit', async () => {
      await visit();
      await row().waitFor();
      assert.equal(await panel().getAttribute('data-mode'), 'legacy-continuation');
      assert.equal(await page.getByTestId('canonical-case-tasks-link').getAttribute('href'), tasksHref);
      await page.getByRole('heading', { name: 'Korábbi leadások', exact: true, level: 2 }).waitFor();
      assert.equal(await panel().getByRole('button', { name: /létrehoz|új leadás/i }).count(), 0);
      await row().getByRole('button', { name: 'Szerkesztés', exact: true }).click();
      await row().getByRole('textbox').fill('Updated synthetic continuation summary');
      await row().getByRole('button', { name: 'Mentés', exact: true }).click();
      await row().getByText('Updated synthetic continuation summary', { exact: true }).waitFor();
      await row().getByRole('button', { name: 'Beküldés ügyvédi review-ra', exact: true }).click();
      await page.locator('[data-testid="legacy-handoff-record"][data-status="SUBMITTED"]').waitFor();
      await row().getByText('A saját Leadásod nem hagyhatod jóvá és nem küldheted vissza.').waitFor();
      assert.equal(await row().getByRole('button', { name: 'Ügyvédi döntés', exact: true }).count(), 0);
      assert.deepEqual(writes.filter(item => item.method === 'PATCH').map(item => item.body), [{ preparerSummary: 'Updated synthetic continuation summary' }, { status: 'SUBMITTED' }]);
    });
    await test('B-assigned-nonpreparer-review-approve', async () => {
      user = REVIEWER;
      await visit();
      await row().getByRole('button', { name: 'Ügyvédi döntés', exact: true }).click();
      await row().getByRole('textbox').fill('Synthetic assigned lawyer approval');
      await row().getByRole('button', { name: 'Jóváhagyás', exact: true }).click();
      await page.locator('[data-testid="legacy-handoff-record"][data-status="APPROVED"]').waitFor();
      assert.equal(packages[0].reviewedById, REVIEWER.id);
      assert.deepEqual(writes.filter(item => item.path.endsWith('/review')).map(item => item.body), [{ decision: 'APPROVED', reviewComment: 'Synthetic assigned lawyer approval' }]);
    });
    await test('C-archived-history-references-readonly', async () => {
      user = AUTH_ME;
      packages[0].status = 'ARCHIVED';
      const before = writes.length;
      await visit();
      await page.locator('[data-testid="legacy-handoff-record"][data-status="ARCHIVED"]').waitFor();
      assert.equal(await row().getByRole('button').count(), 0);
      const details = row().locator('details').filter({ has: page.locator('summary', { hasText: 'Technikai részletek' }) });
      await details.locator('summary').focus();
      await page.keyboard.press('Enter');
      for (const field of ['id', 'caseId', 'sourceDocumentId', 'anonymizedDocumentId', 'generatedContractId', 'legalAnalysisId', 'reviewNotesId', 'preparedById', 'reviewedById', 'submittedAt', 'reviewedAt', 'createdAt', 'updatedAt']) {
        assert.ok((await details.innerText()).includes(packages[0][field]), `Preserved ${field}`);
      }
      assert.equal(writes.length, before);
      assert.ok(requests.filter(item => item.path.endsWith('/handoff-packages')).every(item => item.method === 'GET' && item.search === '?includeArchived=true'));
    });
    await test('D-mocked-active-closure-blocked', async () => {
      user = PREPARER;
      packages = [record('PREPARED')];
      await visit(documentUrl);
      await page.getByRole('button', { name: 'Lezárás ellenőrzése' }).click();
      await page.getByText('Synthetic legacy handoff blocks closure.', { exact: true }).waitFor();
      assert.ok(await page.getByRole('button', { name: 'Ügy lezárása', exact: true }).isDisabled());
    });
    await test('D-keyboard-archive-cancel-confirm-history', async () => {
      await visit();
      const archive = row().getByRole('button', { name: 'Archiválás', exact: true });
      await archive.waitFor();
      const before = writes.length;
      await archive.focus();
      const cancel = page.waitForEvent('dialog').then(async dialog => {
        assert.equal(dialog.type(), 'confirm');
        assert.match(dialog.message(), /lezárhatóságát/);
        await dialog.dismiss();
      });
      await page.keyboard.press('Enter');
      await cancel;
      assert.equal(writes.length, before, 'Cancel must not mutate');
      assert.equal(await row().getAttribute('data-status'), 'PREPARED');
      assert.ok(await archive.evaluate(element => element === document.activeElement), 'Archive cancel retains keyboard focus');
      const confirm = page.waitForEvent('dialog').then(dialog => dialog.accept());
      await page.keyboard.press('Enter');
      await confirm;
      await page.locator('[data-testid="legacy-handoff-record"][data-status="ARCHIVED"]').waitFor();
      assert.equal(await row().getByRole('button').count(), 0);
      assert.equal(writes.length, before + 1);
      assert.ok(writes.at(-1).path.endsWith('/archive'));
      await visit();
      await page.locator('[data-testid="legacy-handoff-record"][data-status="ARCHIVED"]').waitFor();
    });
    await test('D-mocked-archive-clears-closure-blocker', async () => {
      await visit(documentUrl);
      await page.getByRole('button', { name: 'Lezárás ellenőrzése' }).click();
      await page.getByRole('region', { name: 'Lezárási feltételek' }).waitFor();
      assert.ok(await page.getByRole('button', { name: 'Ügy lezárása', exact: true }).isEnabled());
      assert.equal(await page.getByText('Synthetic legacy handoff blocks closure.', { exact: true }).count(), 0);
      // Deliberately do not close the case: this checks UI projection of mock state only.
    });
    await test('E-case-loading-gates-history', async () => {
      let release;
      holdSummary = new Promise(resolve => { release = resolve; });
      const before = requests.filter(item => item.path.endsWith('/handoff-packages')).length;
      try {
        await visit();
        await page.getByRole('status').filter({ hasText: 'Ügyadatok betöltése' }).waitFor();
        assert.equal(await panel().count(), 0);
        assert.equal(requests.filter(item => item.path.endsWith('/handoff-packages')).length, before);
        await noOverflow();
        await shot('E-case-loading');
      } finally { holdSummary = null; release(); }
      await row().waitFor();
    });
    await test('E-history-loading-not-empty', async () => {
      let release;
      holdList = new Promise(resolve => { release = resolve; });
      try {
        await visit();
        await panel().getByRole('status').filter({ hasText: 'Korábbi leadások betöltése' }).waitFor();
        assert.equal(await page.getByText(emptyText, { exact: true }).count(), 0);
        assert.equal(await row().count(), 0);
        await noOverflow();
        await shot('E-history-loading');
      } finally { holdList = null; release(); }
      await row().waitFor();
    });
    await test('E-empty-history', async () => {
      packages = [];
      await visit();
      await page.getByText(emptyText, { exact: true }).waitFor();
      assert.equal(await panel().getByRole('alert').count(), 0);
      assert.equal(await row().count(), 0);
    });
    for (const [status, text] of [[503, 'A művelet nem sikerült. Próbáld újra később.'], [403, 'Jogosultság hiányzik a Leadás művelethez.'], [501, 'A funkció jelenleg nem elérhető ebben a környezetben.']]) {
      await test(`E-history-error-${status}-not-empty`, async () => {
        listStatus = status;
        await visit();
        await panel().getByRole('alert').filter({ hasText: text }).waitFor();
        assert.equal(await page.getByText(emptyText, { exact: true }).count(), 0);
        assert.equal(await row().count(), 0);
      });
    }
    listStatus = 200;
    await test('E-case-forbidden-gates-history', async () => {
      summaryStatus = 403;
      const before = requests.filter(item => item.path.endsWith('/handoff-packages')).length;
      await visit();
      await page.getByRole('alert').filter({ hasText: 'Az ügy nem található vagy nem érhető el számodra.' }).waitFor();
      assert.equal(await panel().count(), 0);
      assert.equal(requests.filter(item => item.path.endsWith('/handoff-packages')).length, before);
      summaryStatus = 200;
    });
    await test('F-unassigned-lawyer-no-mutations', async () => {
      packages = [record('SUBMITTED')];
      user = { ...REVIEWER, id: 'unassigned-lawyer' };
      await visit();
      await row().getByText(/a döntést a kijelölt ügyvéd vagy adminisztrátor/).waitFor();
      assert.equal(await row().getByRole('button').count(), 0);
    });
    await test('F-continuation-write-forbidden-preserves-record', async () => {
      packages = [record('PREPARED')];
      user = AUTH_ME;
      writeStatus = 403;
      await visit();
      await row().getByRole('button', { name: 'Beküldés ügyvédi review-ra', exact: true }).click();
      await panel().getByRole('alert').filter({ hasText: 'Jogosultság hiányzik a Leadás művelethez.' }).waitFor();
      assert.equal(await row().getAttribute('data-status'), 'PREPARED');
      assert.equal(packages[0].status, 'PREPARED');
      writeStatus = 200;
    });
    await test('G-compare-canonical-links-no-legacy-panel', async () => {
      const before = requests.filter(item => item.path.endsWith('/handoff-packages')).length;
      await visit(`${BASE}/documents/compare?caseId=${CASE_ID}&documentId=${DOC_ID}`);
      const links = page.getByTestId('compare-canonical-handoff');
      await links.waitFor();
      assert.equal(await page.getByRole('link', { name: 'Leadás', exact: true }).getAttribute('href'), tasksHref);
      assert.equal(await links.getByRole('link', { name: 'Leadás az ügy feladatainál', exact: true }).getAttribute('href'), tasksHref);
      assert.equal(await links.getByRole('link', { name: 'Korábbi leadások és előzmények', exact: true }).getAttribute('href'), `/cases/${CASE_ID}/handoff`);
      assert.equal(await panel().count(), 0);
      assert.equal(requests.filter(item => item.path.endsWith('/handoff-packages')).length, before);
    });
    for (const entry of ['handoff', 'compare']) {
      await test(`H-${entry}-clickthrough-canonical-task-workspace`, async () => {
        await visit(entry === 'handoff' ? handoffUrl : `${BASE}/documents/compare?caseId=${CASE_ID}&documentId=${DOC_ID}`);
        const link = entry === 'handoff'
          ? page.getByTestId('canonical-case-tasks-link')
          : page.getByRole('link', { name: 'Leadás', exact: true });
        await link.focus();
        await page.keyboard.press('Enter');
        await page.waitForURL(`${BASE}${tasksHref}`);
        await page.locator('#ck-tasks').waitFor();
        await page.getByTestId('task-submission-leadas').click();
        await page.getByTestId('case-submission-continue').click();
        await page.getByRole('link', { name: 'Beküldött verzió megnyitása' }).waitFor();
        assert.ok(await page.getByRole('dialog').isVisible());
        assert.equal(await panel().count(), 0);
      });
    }
    assert.equal(writes.filter(item => item.method === 'POST' && item.path.endsWith(`/cases/${CASE_ID}/handoff-packages`)).length, 0, 'No legacy creation request');
    fs.writeFileSync(path.join(OUTPUT, `requests-${width}.json`), JSON.stringify({ requests, writes, externalBlocked: external, pageErrors: errors }, null, 2));
    await context.close();
  }
} finally {
  await browser.close();
  fs.writeFileSync(path.join(OUTPUT, 'results.json'), JSON.stringify({ passed: completed.length, tests: completed, screenshots,
    limitations: ['All API data and closure transitions are synthetic, not DB persistence or backend authorization proof.', 'No production access, actual case closure, or legacy creation attempted.', 'Existing Word QA fixture prelude is reused; its runner and full regression suite are not executed.'] }, null, 2));
}
console.log(`PASS ${completed.length} browser checks; ${screenshots.length} screenshots; ${OUTPUT}`);
