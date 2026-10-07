// Real local Next routes + registry-derived synthetic API responses. No hosted writes.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const base = process.env.CASE_AI_BASE || 'http://127.0.0.1:3111';
const output = process.env.GROW_V2_QA_OUTPUT || 'test-results/grow-v2';
const fixture = JSON.parse(fs.readFileSync(process.env.GROW_V2_QA_FIXTURE, 'utf8'));
fs.mkdirSync(output, { recursive: true });
const workspace = { publicReference: 'grow-v2-qa', name: 'Teszt munkaterület', clientDisplayName: 'Teszt Kft.', mode: 'ORGANIZATION', status: 'ACTIVE', communicationMode: 'PORTAL_PRIMARY', connectedSystemState: 'NOT_CONFIGURED', membershipRole: 'APPROVER', capabilities: { home: true, matters: true, tasks: true, documents: true, messages: true } };
const processItem = { id: 'qa-process', name: 'Számlázás', category: 'OPERATIONS', criticality: 'MEDIUM', frequency: 'DAILY', organizationGroupName: null, steps: [] };
const browser = await chromium.launch({ headless: true });
const report = []; let lastPage;
try {
  for (const width of [390, 768, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : width === 768 ? 1024 : 1000 }, locale: 'hu-HU' });
    const page = await context.newPage(); lastPage = page; page.setDefaultTimeout(25000);
    const errors = [], writes = [], history = []; let delayDetail = false;
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => {
      Object.defineProperty(Object.prototype, 'controller', { configurable: true, set(value) {
        Object.defineProperty(this, 'controller', { value, writable: true, configurable: true });
        if (typeof this.getAllAccounts === 'function' && typeof this.acquireTokenSilent === 'function') {
          const proto = Object.getPrototypeOf(this), account = { homeAccountId: 'grow-qa', environment: 'login.windows.net', tenantId: '', username: 'qa@example.test', localAccountId: 'grow-qa', name: 'Grow Teszt' };
          proto.getAllAccounts = () => [account]; proto.getActiveAccount = () => account; proto.acquireTokenSilent = async () => ({ accessToken: 'synthetic-grow-token' }); proto.handleRedirectPromise = async () => null;
        }
      } });
      localStorage.setItem('adminiculum:client-portal-workspace', 'grow-v2-qa'); localStorage.setItem('adminiculum:auth_token:customer', 'synthetic-grow-token');
    });
    await page.route('**/api/v1/**', async route => {
      const req = route.request(), path = new URL(req.url()).pathname.replace('/api/v1', '');
      let body, status = 200;
      const root = '/client-portal/org/grow-assessments';
      if (path === '/client-portal/me') body = { identity: { displayName: 'Grow Teszt', email: 'qa@example.test', accountType: 'ORGANIZATION' }, state: 'READY', workspaces: [workspace], selectedWorkspace: workspace };
      else if (path === '/client-portal/org/grow') body = { processes: [processItem], initiatives: [], opportunities: [], outcomes: { measured: [], calculatedOrEstimated: [] }, surveys: [] };
      else if (path === '/client-portal/org/grow-survey') body = { items: [] };
      else if (path === root + '/journey') body = { resumeScope: 'scope-grow-qa', categories: fixture.categories, branches: Object.values(fixture.examples).filter(e => e.definition.version === 2 && !['QUICK_SCAN_V2','PROCESS_STABILITY_REWORK_V2'].includes(e.definition.packKey)).map(e => ({ packKey: e.definition.packKey, titleHu: e.definition.titleHu })), history, noticeHu: 'Ügyfél által megadott információ.' };
      else if (path === root + '/journey/pain') { const data = req.postDataJSON(); writes.push({ path, data }); assert.equal(data.processId, undefined); body = { routes: [...new Set(data.categories.map(c => fixture.painRoutes[c]))].map(packKey => ({ packKey, titleHu: fixture.examples[packKey].definition.titleHu })), message: 'Rögzítettük.' }; }
      else if (path === root) body = { packs: fixture.v1.map(p => ({ ...p, questionCount: p.questions.length, status: 'COMPLETED', latestCompletedAt: '2026-10-07T08:00:00Z', latestFindingCount: 0, latestSummaryHu: 'Korábbi kitöltés.', latestResultAvailable: true, resultScopes: [{ processId: null, processName: null, completedAt: '2026-10-07T08:00:00Z', findingCount: 0, resultAvailable: true }] })), aggregatedFindings: [], aggregatedAttentionAreaCount: 0, aggregatedUnknownAreaCount: 0 };
      else if (path.startsWith(root + '/')) {
        const key = path.slice(root.length + 1).split('/')[0], ex = fixture.examples[key];
        if (!ex) { status = 404; body = {}; }
        else if (req.method() === 'POST') {
          const data = req.postDataJSON(); writes.push({ path, data }); assert.equal(data.packVersion, ex.definition.version); assert.deepEqual(data.answers, ex.answers);
          if (ex.definition.allowsProcessReference) assert.equal(data.processId, processItem.id);
          history.unshift({ processId: data.processId || null, processName: data.processId ? processItem.name : null, result: ex.result });
          status = 201; body = { submission: { packKey: key, packVersion: ex.definition.version, replayed: false, completedAt: ex.result.completedAt }, result: ex.result };
        } else { if (delayDetail) await new Promise(resolve => setTimeout(resolve, 600)); body = { definition: ex.definition, latestResult: ex.definition.version === 1 ? ex.result : null, latestResultAvailable: true, resultScope: { processId: null, processName: null } }; }
      } else if (path === '/client-portal/home') body = { portalActionsEnabled: true, access: { state: 'READY', grantCount: 1 }, attention: [], matters: [], updates: [] };
      else if (path === '/client-portal/workspace') body = { actions: [], documents: [], messages: [], upcomingDeadlines: [], matterCount: 0 };
      else { body = { items: [], topics: [], questions: [], screens: [] }; }
      await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    });
    const shot = async name => {
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), name + ' horizontal overflow');
      await page.screenshot({ path: `${output}/${name}-${width}.png`, fullPage: true });
    };
    await page.goto(base + '/portal/fejlesztes', { waitUntil: 'domcontentloaded' });
    const journey = page.getByTestId('grow-v2-journey');
    await journey.getByRole('heading', { name: 'Mondd el, hol fáj' }).waitFor();
    assert.equal(await page.getByTestId('grow-detailed-assessments').getAttribute('open'), null);
    await shot('landing');
    await journey.getByRole('button', { name: 'Elmondom, hol akad el a munka' }).click();
    await journey.getByRole('checkbox', { name: 'Ugyanazokat az adatokat többször rögzítjük' }).check();
    await shot('pain');
    await journey.getByText('A kiválasztott témákat és a megadott kiegészítést mentjük a visszajelzéséhez', { exact: false }).waitFor();
    await journey.getByRole('button', { name: 'Mentés és folytatás' }).click();
    await journey.getByRole('button', { name: /Adatok és rendszerek közötti munka/ }).click();
    await journey.getByLabel('Folyamat', { exact: true }).selectOption('qa-process');
    await shot('process');
    await journey.getByRole('button', { name: 'Kérdések indítása' }).click();
    await journey.getByRole('radio', { name: 'Szinte mindig', exact: true }).check();
    await journey.getByRole('button', { name: 'Tovább', exact: true }).click();
    await journey.getByRole('button', { name: 'Vissza', exact: true }).click();
    assert.equal(await journey.getByRole('radio', { name: 'Szinte mindig', exact: true }).isChecked(), true);
    await journey.getByRole('button', { name: 'Tovább', exact: true }).click();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await journey.getByRole('button', { name: 'Félbehagyott felmérés folytatása' }).click();
    assert.match(await journey.getByTestId('grow-v2-progress').innerText(), /^2 /);
    await journey.getByRole('radio', { name: 'Nem', exact: true }).check();
    await journey.getByRole('button', { name: 'Tovább', exact: true }).click();
    await journey.getByRole('radio', { name: 'Nem', exact: true }).check();
    await journey.getByRole('button', { name: 'Tovább', exact: true }).click();
    await journey.getByRole('radio', { name: 'Körülbelül hetente', exact: true }).check();
    await shot('question');
    const sizes = await journey.locator('label').evaluateAll(nodes => nodes.map(n => n.getBoundingClientRect().height)); assert.ok(sizes.every(h => h >= 40));
    await journey.getByRole('button', { name: 'Eredmény megtekintése', exact: true }).click();
    await journey.getByTestId('grow-v2-result').waitFor();
    assert.equal(await journey.getByTestId('grow-v2-result').locator('article').count(), 3);
    await shot('result');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await journey.getByText(/Korábbi rövid felmérések/).click();
    await journey.getByRole('button', { name: /Adatok és rendszerek közötti munka · Számlázás/ }).click();
    await journey.getByTestId('grow-v2-result').waitFor();
    await journey.getByRole('button', { name: 'Vissza az áttekintéshez' }).click();
    await journey.getByRole('button', { name: 'Gyors állapotfelmérés', exact: true }).click();
    for (let i = 0; i < 6; i++) { await journey.getByRole('radio', { name: i === 0 ? 'Körülbelül hetente' : 'Nem tudom', exact: true }).check(); await journey.getByRole('button', { name: i === 5 ? 'Eredmény megtekintése' : 'Tovább', exact: true }).click(); }
    await journey.getByRole('button', { name: /Adatok és rendszerek közötti munka/ }).click();
    await journey.getByLabel('Folyamat', { exact: true }).waitFor();
    await journey.getByRole('button', { name: 'Vissza az áttekintéshez' }).click();
    await journey.getByRole('button', { name: 'Részletes felmérések és korábbi V1-eredmények' }).click();
    await page.getByTestId('grow-assessment-result-DIGITAL_MATURITY').click();
    await page.getByTestId('grow-assessment-result').waitFor();
    await shot('historical-v1');
    await page.goBack(); await page.goForward();
    await page.goto(base + '/portal/fejlesztes', { waitUntil: 'domcontentloaded' });
    await journey.getByRole('button', { name: 'Gyors állapotfelmérés', exact: true }).waitFor();
    delayDetail = true;
    const pendingDefinition = page.waitForRequest(r => r.url().includes('/QUICK_SCAN_V2') && r.method() === 'GET');
    await journey.getByRole('button', { name: 'Gyors állapotfelmérés', exact: true }).click();
    await pendingDefinition;
    await page.evaluate(() => { localStorage.setItem('adminiculum:client-portal-workspace', 'other-workspace'); window.dispatchEvent(new StorageEvent('storage', { key: 'adminiculum:client-portal-workspace' })); });
    await page.getByRole('alert').filter({ hasText: 'A munkaterület vagy a bejelentkezés megváltozott' }).waitFor();
    await page.waitForTimeout(800);
    assert.equal(await page.getByTestId('grow-v2-question').count(), 0);
    assert.equal(errors.length, 0, errors.join('\n'));
    assert.equal(writes.length, 3, 'one pain + one branch + one quick scan submission');
    report.push({ width, pain: 'PASS', targetedBranch: 'PASS', process: 'PASS', back: 'PASS', refreshResume: 'PASS', resultReadback: 'PASS', quickScanRouting: 'PASS', historicalV1: 'PASS', staleScopeResponse: 'PASS', overflow: 0, pageErrors: errors.length });
    await context.close();
    const internal = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : width === 768 ? 1024 : 1000 } });
    const staff = await internal.newPage(); lastPage = staff; staff.setDefaultTimeout(40000);
    const user = { id: 'qa-admin', name: 'Teszt ügyvéd', email: 'qa@example.invalid', role: 'ADMIN', status: 'ACTIVE', isActive: true };
    const client = { id: 'qa-client', name: 'Teszt Kft.', portalAccessEnabled: false };
    await staff.addInitScript(user => { localStorage.setItem('auth_token', 'qa-token'); sessionStorage.setItem('adminiculum_auth_profile', JSON.stringify(user)); }, user);
    await staff.route('**/api/v1/**', async route => {
      const p = new URL(route.request().url()).pathname.replace('/api/v1', ''); let body = { items: [] };
      assert.equal(route.request().method(), 'GET', 'workforce summary must be read only');
      if (p === '/auth/me') body = user;
      else if (p === '/clients/qa-client') body = client;
      else if (p === '/users') body = [user];
      else if (p === '/client-identity/admin/workspaces') body = { items: [{ id: 'qa-workspace', clientId: client.id, name: client.name, mode: 'ORGANIZATION', status: 'ACTIVE' }] };
      else if (p.endsWith('/processes')) body = [];
      else if (p.endsWith('/profile')) body = { status: null, summary: null };
      else if (p.endsWith('/diagnostic-workbench')) body = { problems: { diagnoses: [] }, proposed: { recommendations: [] }, missing: { unresolvedItems: [] } };
      else if (p.endsWith('/assessment-summaries')) body = { items: [{ id: 'qa-summary', titleHu: 'Adatok és rendszerek közötti munka', packVersion: 2, completedAt: '2026-10-07T08:00:00Z', submittedBy: 'Grow Teszt', processName: 'Számlázás', workspaceName: 'Teszt munkaterület', result: fixture.examples.DATA_FLOW_V2.result, answers: fixture.examples.DATA_FLOW_V2.answers.map(a => ({ questionHu: fixture.examples.DATA_FLOW_V2.definition.questions.find(q => q.questionKey === a.questionKey).promptHu, answerHu: a.answer })), nextDecisionHu: 'Egyeztesse a jelzést az ügyféllel.' }] };
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
    });
    await staff.goto(base + '/clients/qa-client/grow?tab=adatforrasok', { waitUntil: 'domcontentloaded' });
    const summary = staff.getByTestId('grow-assessment-summaries'); await summary.waitFor();
    await summary.locator('summary').first().click();
    await summary.getByTestId('grow-v2-result').waitFor();
    assert.ok(await staff.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await staff.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await staff.screenshot({ path: output + '/workforce-' + width + '.png', fullPage: true });
    report[report.length - 1].workforce = 'PASS'; await internal.close();
  }
  fs.writeFileSync(`${output}/report.json`, JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
} catch (error) { if (lastPage) { await lastPage.screenshot({ path: `${output}/failure.png`, fullPage: true }); console.error(await lastPage.locator("body").innerText()); } throw error; } finally { await browser.close(); }
