// Real Next routes with synthetic API responses. No hosted APIs or real writes.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const BASE = process.env.CASE_AI_BASE || 'http://127.0.0.1:3111';
const shots = 'test-results/master-remediation';
fs.mkdirSync(shots, { recursive: true });
const client = { id: 'qa-client', name: 'Szervezeti tesztügyfél', portalAccessEnabled: false };
const user = { id: 'qa-admin', name: 'Teszt ügyvéd', email: 'qa@example.invalid', role: 'ADMIN', status: 'ACTIVE', isActive: true };
const matter = { id: 'qa-case', title: 'Tesztügy', caseNumber: 'QA-2026-1', clientId: client.id, clientName: client.name, status: 'ACTIVE', priority: 'MEDIUM', createdAt: '2026-10-01T08:00:00Z', client };
const finding = { id: 'finding-exact', title: 'Ágazati pontosítás szükséges', severity: 'MEDIUM', operationalStatus: 'OPEN', applicabilityStatus: 'INSUFFICIENT_FACTS', requirementKey: 'qa-requirement', scopeType: 'COMPANY' };
const area = { applicabilityId: 'snapshot-exact', requirementKey: 'qa-requirement', requirementVersionId: 'requirement-version-exact', requirementVersionKey: 'v1', ruleVersionKey: 'r1', title: 'Visszaélés-bejelentés ágazati érintettsége', normativeStatement: 'Ügyvédi értékelést igénylő terület.', domainLabel: 'Vállalati működés', outcome: 'INSUFFICIENT_FACTS', scopeType: 'COMPANY', subjectLabel: null, evaluationAt: '2026-10-06T08:00:00Z', evaluationFreshness: 'RECORDED', sourceSupportState: 'SUFFICIENT', specialistRequirement: 'NONE', activeFindingId: finding.id, usedFacts: [], missingFacts: [{ factKey: 'whistle_special_sector', label: 'Ágazati érintettség', profileAnswerable: false }], citations: [{ sourceUrl: 'https://njt.hu/jogszabaly/2023-25-00-00', supportRole: 'PRIMARY', sourceTitle: 'Jóváhagyott jogforrás', canonicalCitation: '2023. évi XXV. törvény', versionLabel: 'v1' }] };
const opportunities = [0, 1, 2].map(i => ({ id: `recommendation-${i}`, runId: `research-${i}-exact`, createdAt: `2026-10-0${i + 1}T08:00:00Z`, status: i === 2 ? 'ACCEPTED' : 'PENDING_REVIEW', kind: 'PROCESS_IMPROVEMENT', sufficiency: 'SUPPORTED', actionable: true, interventionCodes: [], title: 'Azonos című lehetőség', problemStatement: 'Lassú adatátadás', direction: 'Egyeztetési folyamat pontosítása', impactTags: [], domainKey: 'OPERATIONS', businessProcess: { id: 'process-1', name: 'Ügyfélkiszolgálás' }, evidenceStrength: 'MODERATE', opportunity: i === 2 ? { id: 'opportunity-exact', status: 'ACCEPTED', developmentInitiativeId: null } : null }));
let writes = [], started = false, stale = false;
function response(path, method, body) {
  if (method !== 'GET') {
    writes.push({ path, body });
    if (path.endsWith('/opportunity-exact/start-initiative')) { started = true; return { opportunity: {}, initiative: { id: 'initiative-exact', title: 'Indított kezdeményezés' } }; }
    if (path.endsWith('/requests')) return { id: 'request-draft', revision: 0, status: 'DRAFT' };
    return undefined;
  }
  if (path === '/auth/me') return user;
  if (path.includes('notifications')) return { items: [], unreadCount: 0, total: 0 };
  if (path === '/users') return [user];
  if (path === '/clients') return { data: [client], pagination: { total: 1, page: 1, pageSize: 100, totalPages: 1 } };
  if (path === `/clients/${client.id}`) return client;
  if (path === '/cases/attention') return { items: [], counts: {}, total: 0 };
  if (path === '/cases') return { data: [matter], pagination: { total: 1, page: 1, pageSize: 100, totalPages: 1 } };
  if (path === '/client-identity/admin/workspaces') return { items: [{ id: 'workspace', clientId: client.id, name: client.name, mode: 'ORGANIZATION', status: 'ACTIVE' }] };
  if (path === '/work-package-admin/case-types/creation-options') return { capabilities: { clientOwner: false }, items: [{ caseTypeDefinition: { id: 'type', name: 'Általános ügy', isActive: true }, template: null }] };
  if (path === '/work-package-admin/case-types') return { items: [{ id: 'type', name: 'Általános ügy', isActive: true }] };
  if (path.endsWith('/grow/opportunities')) return { items: opportunities.map(o => o.opportunity && started ? { ...o, opportunity: { ...o.opportunity, developmentInitiativeId: 'initiative-exact' } } : o) };
  if (path.endsWith('/processes')) return [];
  if (path.endsWith('/profile')) return { id: 'profile', status: null, complianceEnrollmentStatus: 'ENROLLED', summary: null, lastReviewedAt: null, nextReviewAt: null };
  if (path.endsWith('/diagnostic-workbench')) return { problems: { diagnoses: [] }, proposed: { recommendations: [] }, missing: { unresolvedItems: [] } };
  if (path.startsWith('/client-company/') || /\/(grow|observatory)\//.test(path)) return { items: [] };
  if (path === `/compliance/clients/${client.id}/workspace`) return { summary: { enrollment: 'ENROLLED', evaluatedCount: 1, applies: 0, doesNotApply: 0, insufficientFacts: 1, legalReviewRequired: 0, technicalReviewRequired: 0, sourceSupportInsufficient: 0, openFindings: 1, openProposals: 0 }, evaluatedAt: area.evaluationAt, areas: [{ ...area, evaluationFreshness: stale ? 'STALE' : 'RECORDED' }] };
  if (path === `/compliance/clients/${client.id}/overview`) return { findings: [finding] };
  if (path.endsWith('/compliance/controls')) return { requirements: [] };
  if (path.endsWith('/proposals')) return { items: [] };
  return undefined;
}

const browser = await chromium.launch({ headless: true });
try {
  for (const width of [390, 768, 1440]) {
    started = false; stale = false; writes = [];
    const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : width === 768 ? 1024 : 1000 }, locale: 'hu-HU' });
    const page = await context.newPage(); page.setDefaultTimeout(20000);
    const errors = [];
    page.on('pageerror', e => { errors.push(e.message); console.error('PAGE_ERROR', e.message); });
    await page.addInitScript(profile => { localStorage.setItem('auth_token', 'qa-token'); sessionStorage.setItem('adminiculum_auth_profile', JSON.stringify(profile)); }, user);
    await page.route('**/api/v1/**', async route => {
      const req = route.request(), url = new URL(req.url());
      const path = url.pathname.replace('/api/v1', '');
      const result = response(path, req.method(), req.postDataJSON());
      if (result === undefined) console.log('UNMOCKED', path);
      await route.fulfill({ status: result === undefined ? 404 : 200, contentType: 'application/json', body: JSON.stringify(result ?? { code: 'QA_UNMOCKED' }) });
    });
    const geometry = async name => {
      const measure = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth, h1: document.querySelectorAll('h1').length }));
      assert.ok(measure.scroll <= width, `${name} overflow ${JSON.stringify(measure)}`);
      assert.equal(measure.h1, 1, `${name} must have one page heading`);
      await page.screenshot({ path: `${shots}/${name}-${width}.png`, fullPage: true });
    };
    try {
    await page.goto(`${BASE}/clients/${client.id}/grow`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.getByText('Azonos című lehetőség', { exact: true }).first().waitFor();
    assert.equal(await page.getByText('Azonos című lehetőség', { exact: true }).count(), 2, 'pending rows retain separate identities');
    await geometry('grow');
    await page.goto(`${BASE}/clients/${client.id}/grow?tab=dontesek`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Kezdeményezés indítása', exact: true }).click();
    await page.getByRole('link', { name: 'Kezdeményezés megnyitása', exact: true }).waitFor();
    assert.equal(writes[0].path, '/client-company/clients/qa-client/grow/opportunities/opportunity-exact/start-initiative');
    assert.match(await page.getByRole('link', { name: 'Kezdeményezés megnyitása', exact: true }).getAttribute('href'), /#grow-initiative-initiative-exact$/);
    await geometry('grow-decisions');

    await page.goto(`${BASE}/clients/${client.id}/compliance`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.getByRole('button', { name: 'Értékelés frissítése', exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Értékelés frissítése', exact: true }).count(), 1);
    await geometry('compliance');
    await page.getByRole('tab', { name: 'Követelmények', exact: true }).click();
    await page.getByRole('button', { name: new RegExp(area.title) }).click();
    const requestTrigger = page.getByRole('button', { name: 'Adat pontosítása az ügyféllel', exact: true });
    await requestTrigger.click();
    const dialog = page.getByRole('dialog');
    await dialog.waitFor();
    assert.match(await dialog.getByLabel('Ügyfélnek szóló útmutató').inputValue(), /tevékenységi ágazatait/);
    await dialog.getByRole('combobox', { name: /^Ügy \*/ }).selectOption(matter.id);
    await dialog.getByRole('button', { name: 'Tervezet mentése', exact: true }).click();
    await dialog.getByRole('status').filter({ hasText: 'Tervezet mentve' }).waitFor();
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
    const draft = writes.find(w => w.path.endsWith('/requests'));
    assert.deepEqual(draft?.body.complianceContext, { requirementVersionId: area.requirementVersionId, applicabilityId: area.applicabilityId, factKey: 'whistle_special_sector' });
    assert.match(await page.getByRole('link', { name: 'Jóváhagyott jogforrás megnyitása', exact: true }).getAttribute('href'), /^https:\/\/njt.hu\//);
    await geometry('requirements');
    await page.getByRole('button', { name: 'Kapcsolódó megállapítás megnyitása', exact: true }).click();
    await page.waitForFunction(() => document.activeElement?.getAttribute('data-finding-id') === 'finding-exact');
    await geometry('finding');
    stale = true;
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByRole('tab', { name: 'Követelmények', exact: true }).click();
    await page.getByRole('button', { name: new RegExp(area.title) }).click();
    assert.equal(await page.getByRole('button', { name: 'Adat pontosítása az ügyféllel', exact: true }).count(), 0, 'stale snapshot cannot start a fact-specific request');

    await page.goto(`${BASE}/cases`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    const openCase = page.getByRole('main').getByRole('button', { name: 'Új ügy', exact: true });
    await openCase.focus(); await page.keyboard.press('Enter');
    const caseDialog = page.getByRole('dialog', { name: 'Új ügy', exact: true });
    await caseDialog.getByLabel('Ügy neve', { exact: false }).waitFor();
    const box = await caseDialog.boundingBox();
    assert.ok(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= width, 'new-case viewport geometry');
    assert.equal(await caseDialog.evaluate(el => el.closest('body > div')?.parentElement === document.body), true, 'body portal');
    assert.ok(await page.evaluate(() => document.activeElement?.closest('[role="dialog"]')), 'initial focus in dialog');
    await page.keyboard.press('Shift+Tab');
    assert.ok(await page.evaluate(() => document.activeElement?.closest('[role="dialog"]')), 'backward focus trap');
    await caseDialog.getByText('Csapat és feladatok (opcionális)', { exact: true }).click();
    await caseDialog.getByRole('button', { name: 'Ügy létrehozása', exact: true }).scrollIntoViewIfNeeded();
    const saveBox = await caseDialog.getByRole('button', { name: 'Ügy létrehozása', exact: true }).boundingBox();
    assert.ok(saveBox && saveBox.y >= 0 && saveBox.y + saveBox.height <= (width === 390 ? 844 : width === 768 ? 1024 : 1000), 'save stays reachable');
    await page.screenshot({ path: `${shots}/new-case-${width}.png`, fullPage: true });
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
    assert.equal(await openCase.evaluate(el => el === document.activeElement), true, 'focus restored');
    assert.ok(!writes.some(w => w.path === '/cases'), 'accessibility QA must not submit a case');
    assert.deepEqual(errors, []);
    console.log(`PASS ${width}: Grow identity/start, Compliance/Requirements provenance/staleness/source/finding, New Case portal/focus/scroll/Escape; no overflow`);
    } catch (error) { console.error(JSON.stringify({width,url:page.url(),body:await page.locator('body').innerText(),errors},null,2)); await page.screenshot({path:shots+'/failure-'+width+'.png',fullPage:true}); throw error; }
    await context.close();
  }
} finally { await browser.close(); }
