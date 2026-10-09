// Real Next routes, synthetic intercepted APIs only. Start Next separately.
// From Frontend: $env:GROW_V25_QA_BASE='http://127.0.0.1:3111'; node tests/growV25BrowserQA.mjs
// Requires the local mock-auth Next environment used by growV2BrowserRunner.mjs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = new URL(process.env.GROW_V25_QA_BASE || 'http://127.0.0.1:3111');
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname), 'Only a loopback Next server is permitted');
assert.equal(base.protocol, 'http:', 'Use the local HTTP development server, not a hosted deployment');
const output = path.join(root, 'test-results', 'grow-v25');
fs.mkdirSync(output, { recursive: true });
for (const artifact of ['failure.json', 'failure.png', 'failure-body.txt']) fs.rmSync(path.join(output, artifact), { force: true });
const widths = [390, 768, 1440];
const timestamp = '2026-10-07T08:00:00.000Z';
const client = { id: 'qa-v25-client', name: 'Synthetic Grow Company', portalAccessEnabled: false };
const companyRoot = `/client-company/clients/${client.id}`;
const routeRoot = `/clients/${client.id}/grow`;
const workspace = { id: 'qa-v25-workspace', publicReference: 'qa-v25-workspace', name: 'Synthetic workspace', clientId: client.id, clientDisplayName: client.name, mode: 'ORGANIZATION', status: 'ACTIVE', communicationMode: 'PORTAL_PRIMARY', connectedSystemState: 'NOT_CONFIGURED', membershipRole: 'APPROVER', capabilities: { home: true, matters: true, tasks: true, documents: true, messages: true } };
const processItem = { id: 'qa-process', clientId: client.id, name: 'Synthetic invoice process', category: 'OPERATIONS', description: null, ownerPersonName: null, organizationGroupName: null, criticality: 'MEDIUM', frequency: 'DAILY', status: 'ACTIVE', steps: [] };
const finding = { findingKey: 'v2_repeatable_candidate', titleHu: 'Synthetic repeatable candidate', summaryHu: 'A bounded investigation direction, not a confirmed defect.', nextCheckHu: 'Synthetic next check: validate a repeatable sample with its owner.', evidence: [] };
const assessment = { packKey: 'PROCESS_STABILITY_V2', packVersion: 2, titleHu: 'Synthetic V2 assessment', completedAt: timestamp, findings: [finding], directions: [{ labelHu: 'Investigate automation suitability' }], evidence: [], attentionAreaCount: 1, unknownAreaCount: 1, summaryHu: 'Synthetic declared assessment result', noticeHu: 'Synthetic client declaration; human review required.' };
const snapshot = { id: 'qa-estimated-snapshot', clientId: client.id, businessProcessId: processItem.id, businessProcess: { id: processItem.id, name: processItem.name }, provenanceClass: 'ESTIMATED_SNAPSHOT', sourceBasis: 'ESTIMATED', metricVersion: '1', observedAt: timestamp, createdAt: timestamp, inputDigest: 'a'.repeat(64), snapshotDigest: 'b'.repeat(64), metrics: [{ code: 'TOTAL_ACTIVE_MINUTES', value: 60, unit: 'MINUTES', metricVersion: '1' }], metricSourceBasis: [{ code: 'TOTAL_ACTIVE_MINUTES', sourceBasis: 'ESTIMATED', sourceFields: ['estimatedActiveMinutes'] }], provenance: { source: 'CANONICAL_BUSINESS_PROCESS', calculatedBy: 'PROCESS_OBSERVATION_V1', stepCount: 1, inputFieldInventory: ['estimatedActiveMinutes'] } };
const sourceRefs = { sourceBasis: 'ESTIMATED', snapshotIds: [snapshot.id], observationIds: ['qa-observation'], businessProcessId: processItem.id, sufficiency: 'SUPPORTED', reasons: [], assessmentFindings: [{ ...finding, packKey: assessment.packKey, packVersion: 2, suggestedInterventionCodes: ['AUTOMATE_REPETITIVE_STEP'], polarity: 'INVESTIGATION' }] };
const evidence = { id: 'qa-evidence', clientId: client.id, corpusKey: null, kind: 'INTERNAL_OBSERVATION', sourceBasis: 'ESTIMATED', title: 'Synthetic estimated process evidence', authors: null, venue: null, year: null, doi: null, locator: null, origin: null, boundedClaim: 'Estimated input, not an observed measurement.', evidenceType: null, verificationStatus: 'ESTIMATED', strength: 'MODERATE', domainKeys: ['MANUAL_ADMIN_LOAD'], supportedInterventions: ['AUTOMATE_REPETITIVE_STEP'], supportedOutcomes: [], applicabilityNotes: null, limitations: 'Validate estimates before implementation.', createdAt: timestamp };
const opportunity = (id, status, improvement = null) => ({ id, runId: 'qa-research-run-0001', status, kind: 'RECOMMENDATION', sufficiency: 'SUPPORTED', actionable: true, interventionCodes: ['AUTOMATE_REPETITIVE_STEP'], title: `INTERNAL_ONLY_${id}`, problemStatement: 'INTERNAL_ONLY_problem', direction: finding.nextCheckHu, impactTags: [], domainKey: 'MANUAL_ADMIN_LOAD', businessProcess: { id: processItem.id, name: processItem.name }, evidenceStrength: 'MODERATE', opportunity: improvement, createdAt: timestamp });
const opportunities = [opportunity('qa-pending', 'PENDING_REVIEW'), opportunity('qa-accepted', 'ACCEPTED', { id: 'qa-improvement', status: 'OPEN', developmentInitiativeId: null }), opportunity('qa-linked', 'ACCEPTED', { id: 'qa-linked-improvement', status: 'IN_PROGRESS', developmentInitiativeId: 'qa-init-a' })];
const initiatives = ['a', 'b'].map(key => ({ id: `qa-init-${key}`, clientId: client.id, title: 'Same initiative title', status: 'ACTIVE', priority: 'NORMAL', reason: `Synthetic initiative ${key}`, currentState: `Current ${key}`, targetState: `Target ${key}`, targetAt: null, startedAt: timestamp, completedAt: null, lawFirmOwnerName: null, clientOwnerDisplay: null, relatedCaseId: null, relatedCaseNumber: null, createdAt: timestamp, updatedAt: timestamp }));
const outcomes = initiatives.map((initiative, index) => ({ id: `qa-outcome-${index}`, basis: 'ESTIMATED', synthetic: false, businessProcess: { id: `qa-result-process-${index}`, name: `Result process ${index}` }, opportunityTitle: null, initiative: { id: initiative.id, title: initiative.title, status: initiative.status }, metricsSummary: { before: { TOTAL_ACTIVE_MINUTES: 60, TOTAL_WAITING_MINUTES: 20, TOTAL_CYCLE_MINUTES: 80 }, after: { TOTAL_ACTIVE_MINUTES: 45, TOTAL_WAITING_MINUTES: 25, TOTAL_CYCLE_MINUTES: 80 }, comparable: false }, roi: { basis: 'ESTIMATED', provenanceType: 'CLIENT_ESTIMATE', timeSavedMinutesPerMonth: { low: 10, base: 20, high: 30 }, cashSavedHufPerMonth: null, provenance: { formulaVersion: 'qa-formula-v1', computedAt: timestamp, type: 'CLIENT_ESTIMATE', timeSavedIsNotCashSaved: true, explanationHu: 'Synthetic estimate, not realized cash savings.' } }, note: `Outcome belongs only to ${initiative.id}`, recordedBy: { id: 'qa-admin', name: 'Synthetic reviewer' }, createdAt: timestamp }));
const diagnosis = { id: 'qa-diagnosis', provenanceClass: 'DERIVED_DIAGNOSIS', title: finding.titleHu, summary: finding.summaryHu, status: 'CONFIRMED', problemDomain: { id: 'qa-domain', key: 'MANUAL_ADMIN_LOAD', name: 'Synthetic investigation' }, businessProcess: { id: processItem.id, name: processItem.name }, evidence: [] };
outcomes[1].basis = 'CALCULATED';
const diagnostic = { client: { id: client.id, name: client.name, operatingProfile: null }, known: { facts: [], processes: [{ ...processItem, provenanceClass: 'CANONICAL_STATE', owner: null, organizationGroup: null }], systems: [] }, observed: { observations: [], processSnapshots: [snapshot] }, problems: { domains: [], diagnoses: [diagnosis], sufficiency: [{ recommendationId: 'qa-pending', provenanceClass: 'RECOMMENDATION', decision: 'SUPPORTED', evidenceCount: 1 }] }, proposed: { recommendations: [{ ...opportunities[0], provenanceClass: 'RECOMMENDATION', diagnosisId: diagnosis.id, domain: { key: 'MANUAL_ADMIN_LOAD', name: 'Synthetic investigation' }, evidence: [] }] }, evidence: { records: [], research: [] }, missing: { hasUnknownFacts: true, hasConflictingEvidence: false, insufficientRecommendationCount: 0, unresolvedItems: [{ code: 'QA_VALIDATE_ESTIMATES', message: finding.nextCheckHu }] } };
// Both linked and unlinked diagnostic consumers must render the projected basis.
diagnosis.evidence = [{ id: evidence.id, title: evidence.title, kind: evidence.kind, strength: evidence.strength, sourceBasis: evidence.sourceBasis }];
diagnostic.evidence.research = [evidence, { ...evidence, id: 'qa-unlinked-evidence', title: 'Synthetic unlinked estimated evidence' }];
const publication = { id: 'qa-publication', opportunityId: 'qa-improvement', clientId: client.id, workspaceId: workspace.id, status: 'APPROVED', currentRevisionId: 'qa-revision', preparedById: 'qa-admin', approvedById: 'qa-partner', publishedById: null, revokedById: null, approvedAt: timestamp, publishedAt: null, revokedAt: null, revision: 1, snapshot: { id: 'qa-revision', revisionNumber: 1, clientSafeTitle: 'Customer safe direction', clientSafeSummary: 'Human approved bounded summary.', clientSafeDirection: 'Discuss the next sample.', sourceFingerprint: 'c'.repeat(64), audienceSnapshot: {}, createdAt: timestamp } };
const portalData = { customerName: client.name, processes: [processItem], initiatives: initiatives.map(i => ({ id: i.id, title: i.title, targetState: i.targetState, statusLabel: 'Folyamatban', targetAt: null, hasRelatedMatter: false, milestones: [] })), opportunities: [{ publicationId: 'qa-published-only', title: 'Customer safe published title', summary: 'Only this explicitly published snapshot is customer visible.', direction: 'Discuss next action.', publishedAt: timestamp }], opportunitiesDeferredNotice: null, outcomes: { measured: [], calculatedOrEstimated: outcomes.map(o => ({ id: o.id, basis: o.basis, basisLabel: 'Becs\u00fclt', initiativeId: o.initiative.id, initiativeTitle: o.initiative.title, processName: o.businessProcess.name })) }, surveys: [] };

const report = [];
let browser;
let current;

async function session(width, role = 'ADMIN', failures = {}) {
  const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 1000 }, locale: 'hu-HU', serviceWorkers: 'block' });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.setDefaultNavigationTimeout(90000);
  const qa = { context, page, role, width, errors: [], unexpected: [], requests: [], writes: [], consoleErrors: [], failures, currentOpportunities: structuredClone(opportunities), currentPublications: [structuredClone(publication)], publicationWorkspaces: [workspace] };
  current = qa;
  page.on('pageerror', error => qa.errors.push(error.stack || error.message));
  page.on('console', message => { if (message.type() === 'error') qa.consoleErrors.push(message.text()); });
  const profile = { id: `qa-${role.toLowerCase()}`, name: 'Synthetic reviewer', email: 'qa@example.invalid', role, status: 'ACTIVE', isActive: true };
  await page.addInitScript(({ profile, customer }) => {
    if (!customer) {
      localStorage.setItem('auth_token', 'synthetic-workforce-token');
      sessionStorage.setItem('adminiculum_auth_profile', JSON.stringify(profile));
      return;
    }
    // Same isolated MSAL controller shim as growV2BrowserQA; no auth source edits.
    Object.defineProperty(Object.prototype, 'controller', { configurable: true, set(value) {
      Object.defineProperty(this, 'controller', { value, writable: true, configurable: true });
      if (typeof this.getAllAccounts === 'function' && typeof this.acquireTokenSilent === 'function') {
        const proto = Object.getPrototypeOf(this);
        const account = { homeAccountId: 'qa-grow-v25', environment: 'login.windows.net', tenantId: '', username: 'qa@example.invalid', localAccountId: 'qa-grow-v25', name: 'Synthetic customer' };
        proto.getAllAccounts = () => [account]; proto.getActiveAccount = () => account;
        proto.acquireTokenSilent = async () => ({ accessToken: 'synthetic-customer-token' });
        proto.handleRedirectPromise = async () => null;
      }
    } });
    localStorage.setItem('adminiculum:client-portal-workspace', 'qa-v25-workspace');
    localStorage.setItem('adminiculum:auth_token:customer', 'synthetic-customer-token');
  }, { profile, customer: role === 'CUSTOMER' });
  await context.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    if (!url.pathname.startsWith('/api/v1/')) {
      if (url.origin === base.origin) return route.continue();
      qa.unexpected.push(`Blocked external network ${url.origin}${url.pathname}`);
      return route.abort('blockedbyclient');
    }
    const p = url.pathname.slice('/api/v1'.length);
    qa.requests.push({ path: p, method: req.method() });
    let body, status = 200;
    const fail = failures[p];
    if (req.method() !== 'GET') {
      const data = req.postDataJSON();
      qa.writes.push({ path: p, data });
      if (p === `${companyRoot}/grow/opportunities/qa-pending/review` && ['ADMIN', 'PARTNER'].includes(role) && data.decision === 'ACCEPT' && qa.allowAccept) {
        const item = qa.currentOpportunities[0];
        item.status = 'ACCEPTED'; item.opportunity = { id: 'qa-new-improvement', status: 'OPEN', developmentInitiativeId: null };
        body = { recommendation: item, opportunity: item.opportunity };
      } else if (req.method() === 'POST' && p === `${companyRoot}/grow/opportunity-publications` && qa.allowPrepare && ['ADMIN', 'PARTNER', 'LAWYER', 'COLLAB_LAWYER'].includes(role) && data.opportunityId === 'qa-improvement' && data.workspaceId === 'qa-draft-workspace' && data.title === 'Explicit safe draft title' && data.summary === 'Explicit safe draft summary') {
        qa.allowPrepare = false;
        body = { ...structuredClone(publication), id: 'qa-reader-draft', workspaceId: data.workspaceId, status: 'DRAFT', preparedById: profile.id, approvedById: null, approvedAt: null, currentRevisionId: 'qa-draft-revision', snapshot: { ...publication.snapshot, id: 'qa-draft-revision', clientSafeTitle: data.title, clientSafeSummary: data.summary, clientSafeDirection: data.direction ?? null } };
        qa.currentPublications.unshift(body);
      } else if (req.method() === 'POST' && p === `${companyRoot}/grow/opportunity-publications/qa-reader-draft/submit` && qa.allowSubmit && data.expectedRevision === 1 && qa.currentPublications[0]?.status === 'DRAFT') {
        qa.allowSubmit = false;
        body = { ...qa.currentPublications[0], status: 'READY_FOR_APPROVAL', revision: 2 };
        qa.currentPublications[0] = body;
      } else {
        qa.unexpected.push(`Unexpected mutation ${req.method()} ${p}`);
        status = 403; body = { code: 'QA_WRITE_FORBIDDEN', message: 'Synthetic QA rejects unexpected writes' };
      }
    } else if (fail) { status = fail; body = { status, code: 'QA_SYNTHETIC_FAILURE', message: 'Synthetic resource unavailable' }; }
    else if (p === '/auth/me') body = profile;
    else if (p === '/notifications/unread-count') body = { unreadCount: 0 };
    else if (p === `/clients/${client.id}`) body = client;
    else if (p === '/users') body = [profile];
    else if (p === '/tasks') body = [];
    else if (p === `${companyRoot}/grow/opportunity-publication-workspaces`) body = { organizationMode: true, items: qa.publicationWorkspaces };
    else if (p === `${companyRoot}/grow/opportunities`) body = { items: qa.currentOpportunities.filter(o => !url.searchParams.get('status') || o.status === url.searchParams.get('status')) };
    else if (p === `${companyRoot}/grow/opportunities/qa-improvement/publications`) body = { items: qa.currentPublications };
    else if (p.endsWith('/publications') && p.startsWith(`${companyRoot}/grow/opportunities/`)) body = { items: [] };
    else if (p.startsWith(`${companyRoot}/grow/opportunities/`)) {
      const item = qa.currentOpportunities.find(o => o.id === p.split('/').at(-1));
      if (item) body = { ...item, diagnosis: { ...diagnosis, domainTitle: 'Synthetic investigation', sourceRefs }, evidence: [evidence], review: item.status === 'ACCEPTED' ? { byId: 'qa-admin', byName: 'Synthetic reviewer', at: timestamp, note: 'Human reviewed' } : null };
      else { status = 404; body = { code: 'NOT_FOUND' }; }
    } else if (p === `${companyRoot}/grow/home`) body = { canRunResearch: ['ADMIN', 'PARTNER'].includes(role), opportunityCounts: { total: 3, supported: 3, evidenceBacked: 3, measurementBacked: 0 }, topOpportunities: qa.currentOpportunities, activeInitiatives: initiatives, completedOutcomes: outcomes };
    else if (p === `${companyRoot}/grow/evidence`) body = { items: [evidence] };
    else if (p === `${companyRoot}/grow/outcomes`) body = { items: outcomes };
    else if (p === `${companyRoot}/grow/diagnostic-workbench`) body = diagnostic;
    else if (p === `${companyRoot}/grow/assessment-summaries`) body = { items: [{ id: 'qa-summary', titleHu: assessment.titleHu, packVersion: 2, completedAt: timestamp, submittedBy: 'Synthetic customer', processName: processItem.name, workspaceName: workspace.name, result: assessment, answers: [{ questionHu: 'Synthetic declared question', answerHu: 'Synthetic declared answer' }], nextDecisionHu: finding.nextCheckHu }] };
    else if (p === `${companyRoot}/processes`) body = [processItem];
    else if (p === `${companyRoot}/initiatives`) body = { items: initiatives };
    else if (p === `${companyRoot}/milestones`) body = { items: [] };
    else if (p === `${companyRoot}/operating-profile`) body = { status: 'ACTIVE', summary: 'Synthetic operating profile' };
    else if ([`${companyRoot}/observatory/sources`, `${companyRoot}/observatory/survey-intake`].includes(p)) body = { items: [] };
    else if (p === '/client-portal/me') body = { identity: { displayName: 'Synthetic customer', email: 'qa@example.invalid', accountType: 'ORGANIZATION' }, state: 'READY', workspaces: [workspace], selectedWorkspace: workspace };
    else if (p === '/client-portal/org/grow') body = portalData;
    else if (p === '/client-portal/org/grow-survey') body = { items: [] };
    else if (p === '/client-portal/org/grow-assessments') body = { packs: [], aggregatedFindings: [], aggregatedAttentionAreaCount: 0, aggregatedUnknownAreaCount: 0, noticeHu: 'Synthetic assessment catalogue' };
    else if (p === '/client-portal/org/grow-assessments/journey') body = { resumeScope: workspace.id, categories: [], branches: [], history: [{ processId: processItem.id, processName: processItem.name, result: assessment }], noticeHu: assessment.noticeHu };
    else if (p === '/client-portal/home') body = { portalActionsEnabled: true, access: { state: 'READY', grantCount: 1 }, attention: [], matters: [], updates: [] };
    else if (p === '/client-portal/workspace') body = { actions: [], documents: [], messages: [], upcomingDeadlines: [], matterCount: 0 };
    else { qa.unexpected.push(`Unmocked API ${p}`); status = 404; body = { code: 'QA_UNMOCKED_ENDPOINT' }; }
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
  return qa;
}

async function open(qa, query) {
  await qa.page.goto(new URL(routeRoot + query, base).href, { waitUntil: 'domcontentloaded' });
  await qa.page.getByTestId(query.includes('view=journey') ? 'grow-journey' : 'grow-workbench').waitFor();
}
async function shot(qa, name) {
  assert.deepEqual(qa.errors, [], `Unhidden pageerrors at ${name}`);
  assert.deepEqual(qa.unexpected, [], `Network contract at ${name}`);
  assert.ok(await qa.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name}: horizontal overflow at ${qa.width}`);
  await qa.page.screenshot({ path: path.join(output, `${qa.width}-${qa.role}-${name}.png`), fullPage: true });
}
async function close(qa) {
  assert.deepEqual(qa.errors, [], 'No pageerrors may be ignored');
  assert.deepEqual(qa.unexpected, [], 'All API calls must be explicitly intercepted');
  assert.equal(qa.requests.some(r => r.path.startsWith('/client-identity/admin/')), false, 'Read-scoped Grow must not require an admin workspace endpoint');
  await qa.context.close();
}
async function signedComparison(page, testId) {
  const card = page.getByTestId(testId).first();
  await card.locator('table').waitFor();
  for (const [label, expected] of [['Akt\u00edv id\u0151', '\u221215 p'], ['V\u00e1rakoz\u00e1si id\u0151', '+5 p'], ['Teljes \u00e1tfut\u00e1si id\u0151', '0 p']]) {
    assert.equal((await card.getByRole('row').filter({ hasText: label }).locator('td').last().innerText()).trim(), expected, 'Signed change must preserve improvement, worsening and zero');
  }
  assert.match(await card.innerText(), /m\u00e9r\u0151sz\u00e1m-verzi\u00f3ja elt\u00e9r/);
  assert.match(await card.innerText(), /nem egyenl\u0151 p\u00e9nzmegtakar\u00edt\u00e1ssal/);
  await card.getByRole('button', { name: 'Hogyan sz\u00e1moltuk?' }).click();
  assert.match(await card.innerText(), /qa-formula-v1/);
}

async function workforce(width) {
  const qa = await session(width), { page } = qa;
  await open(qa, '?tab=adatforrasok');
  const summary = page.getByTestId('grow-assessment-summaries');
  await summary.locator('summary').first().click();
  const result = summary.getByTestId('grow-v2-result');
  await result.waitFor();
  assert.match(await result.innerText(), /Synthetic repeatable candidate/);
  assert.match(await result.innerText(), /Synthetic next check/);
  assert.match(await result.innerText(), /\u00dcgyf\u00e9l \u00e1ltal megadott inform\u00e1ci\u00f3/);
  await shot(qa, 'assessment-result');

  await page.getByTestId('grow-subnav-diagnosztika').click();
  // F17 progressive disclosure: the retained provenance panels live inside the collapsed
  // diagnostic-technical-detail <details>, so expand it before interacting with them.
  await page.getByTestId('diagnostic-technical-detail').locator(':scope > summary').click();
  const observations = page.getByTestId('diagnostic-observation-panel');
  await observations.getByRole('button', { name: /Folyamatpillanatk\u00e9pek/ }).click();
  assert.match(await observations.innerText(), /Becsl\u00e9sen alapul\u00f3/);
  assert.doesNotMatch(await observations.innerText(), /M\u00e9rt folyamatpillanatk\u00e9p/);
  const diagnosticEvidence = page.getByTestId('diagnostic-evidence-panel');
  await diagnosticEvidence.getByText('Synthetic estimated process evidence', { exact: true }).waitFor();
  assert.deepEqual(await diagnosticEvidence.getByTestId('diagnostic-evidence-source-basis').allTextContents(), ['Becsl\u00e9sen alapul\u00f3 adat', 'Becsl\u00e9sen alapul\u00f3 adat'], 'Linked and unlinked evidence must expose the estimated source basis');
  assert.doesNotMatch(await diagnosticEvidence.innerText(), /STRONG|Folyamat-m\u00e9r\u00e9si pillanatk\u00e9p/);
  await shot(qa, 'estimated-diagnostic');
  await page.getByTestId('grow-subnav-attekintes').click();
  await page.locator('details').filter({ has: page.getByTestId('grow-diagnostic-worklist') }).locator(':scope > summary').click();
  const decisionLink = page.getByTestId('grow-diagnostic-worklist').locator('a[href*="opportunity=qa-pending"]');
  await decisionLink.click();
  const pending = page.getByTestId('grow-decision-qa-pending');
  await pending.waitFor();
  await page.waitForFunction(() => document.activeElement?.id === 'grow-opportunity-qa-pending');
  assert.equal(qa.writes.length, 0, 'Navigation must never submit a review');
  await shot(qa, 'diagnostic-exact-decision');
  qa.allowAccept = true;
  await pending.getByTestId('grow-decide-accept-qa-pending').click();
  await pending.getByRole('link', { name: /R\u00e9szletek/ }).waitFor();
  assert.equal(qa.writes.length, 1, 'Exactly one explicit review mutation');
  assert.equal(qa.currentOpportunities[0].status, 'ACCEPTED');

  await open(qa, '?tab=attekintes');
  const researchLink = page.locator('a[href*="view=journey&destination=home"]').first();
  await researchLink.click();
  await page.getByTestId('grow-journey').waitFor();
  await page.getByRole('button', { name: /kutat\u00e1si fut\u00e1s/i }).waitFor();
  await shot(qa, 'research-next-action');
  await open(qa, '?view=journey&destination=detail&opportunity=qa-accepted');
  await page.getByTestId('evidence-basis-summary').waitFor();
  assert.match(await page.getByTestId('evidence-basis-summary').innerText(), /Becsl\u00e9sen alapul\u00f3/);
  await page.getByRole('button', { name: 'Kezdem\u00e9nyez\u00e9s ind\u00edt\u00e1sa', exact: true }).waitFor();
  await page.getByTestId('opportunity-publication-APPROVED').waitFor();
  assert.match(await page.locator('body').innerText(), /alap\u00e9rtelmez\u00e9sben nem l\u00e1that\u00f3/);
  assert.equal(qa.writes.length, 1, 'Accepted detail must not start initiatives or publish');
  await shot(qa, 'accepted-publication-boundary');

  await open(qa, '?tab=kezdemenyezesek');
  const initA = page.getByTestId('grow-initiative-qa-init-a');
  await initA.waitFor();
  assert.match(await initA.innerText(), /Becs\u00fclt/);
  assert.doesNotMatch(await initA.innerText(), /Sz\u00e1m\u00edtott/);
  const initB = page.getByTestId('grow-initiative-qa-init-b');
  assert.match(await initB.innerText(), /Sz\u00e1m\u00edtott/);
  assert.doesNotMatch(await initB.innerText(), /Becs\u00fclt/);
  await shot(qa, 'initiative-identity');
  await open(qa, '?tab=eredmenyek');
  await signedComparison(page, 'grow-outcome-ESTIMATED');
  await shot(qa, 'workbench-signed-results');
  await page.locator('a[href*="view=journey&destination=results"]').click();
  await signedComparison(page, 'outcome-ESTIMATED');
  await shot(qa, 'journey-signed-results');
  await close(qa);
  return { assessment: 'PASS', diagnostic: 'PASS', nextAction: 'PASS', accepted: 'PASS', initiativeIdentity: 'PASS', signedResults: 'PASS' };
}

async function roles(width) {
  const result = {};
  for (const role of ['ADMIN', 'PARTNER', 'LAWYER', 'COLLAB_LAWYER']) {
    const qa = await session(width, role), { page } = qa;
    qa.publicationWorkspaces = [workspace, ...['ready', 'published', 'draft'].map(key => ({ ...workspace, id: `qa-${key}-workspace`, publicReference: `qa-${key}-workspace`, name: `Synthetic ${key} workspace` }))];
    qa.currentPublications.push(
      { ...structuredClone(publication), id: 'qa-ready', workspaceId: 'qa-ready-workspace', status: 'READY_FOR_APPROVAL', approvedById: null, approvedAt: null },
      { ...structuredClone(publication), id: 'qa-published', workspaceId: 'qa-published-workspace', status: 'PUBLISHED', publishedById: 'qa-partner', publishedAt: timestamp },
    );
    const manage = ['ADMIN', 'PARTNER'].includes(role), publish = ['ADMIN', 'PARTNER', 'LAWYER'].includes(role);
    await open(qa, '?tab=dontesek&opportunity=qa-pending');
    await page.getByTestId('grow-decision-qa-pending').waitFor();
    assert.equal(await page.getByTestId('grow-decide-accept-qa-pending').isVisible(), manage, `${role}: Workbench management authority`);
    await open(qa, '?view=journey&destination=detail&opportunity=qa-pending');
    await page.getByTestId('evidence-basis-summary').waitFor();
    assert.equal(await page.getByRole('button', { name: 'Elfogadom', exact: true }).isVisible(), manage, `${role}: Journey review authority`);
    await open(qa, '?view=journey&destination=detail&opportunity=qa-accepted');
    await page.getByTestId('opportunity-publication-APPROVED').waitFor();
    assert.equal(await page.getByRole('button', { name: 'Kezdem\u00e9nyez\u00e9s ind\u00edt\u00e1sa', exact: true }).isVisible(), manage, `${role}: initiative authority`);
    const publishButton = page.getByRole('button', { name: 'K\u00f6zz\u00e9teszem az \u00fcgyf\u00e9lnek', exact: true });
    assert.equal(await publishButton.isVisible() && await publishButton.isEnabled(), publish, `${role}: publication is distinct from management authority`);
    assert.equal(await page.getByRole('button', { name: 'J\u00f3v\u00e1hagyom', exact: true }).isVisible(), publish, `${role}: approval authority`);
    assert.equal(await page.getByRole('button', { name: 'Visszavonom a k\u00f6zz\u00e9t\u00e9telt', exact: true }).isVisible(), publish, `${role}: revocation authority`);
    const prepareButton = page.getByRole('button', { name: 'K\u00f6zz\u00e9t\u00e9tel el\u0151k\u00e9sz\u00edt\u00e9se', exact: true });
    assert.equal(await prepareButton.isVisible(), true, `${role}: authorized workforce readers retain preparation authority`);
    assert.equal(await page.getByLabel('\u00dcgyf\u00e9lbiztos c\u00edm', { exact: true }).inputValue(), '', 'Internal title must never autofill a customer publication');
    assert.equal(await page.getByLabel('\u00dcgyf\u00e9lbiztos \u00f6sszefoglal\u00f3', { exact: true }).inputValue(), '', 'Internal diagnosis must never autofill customer summary');
    await shot(qa, 'role-controls');
    assert.equal(qa.writes.length, 0, 'Navigation never prepares, submits, approves or publishes');
    await page.getByLabel('Munkater\u00fclet (\u00fcgyf\u00e9l-audience)').selectOption('qa-draft-workspace');
    await page.getByLabel('\u00dcgyf\u00e9lbiztos c\u00edm', { exact: true }).fill('Explicit safe draft title');
    await page.getByLabel('\u00dcgyf\u00e9lbiztos \u00f6sszefoglal\u00f3', { exact: true }).fill('Explicit safe draft summary');
    qa.allowPrepare = true;
    await prepareButton.click();
    const draft = page.getByTestId('opportunity-publication-DRAFT');
    await draft.waitFor();
    assert.equal(qa.writes.length, 1, 'Preparing a draft never automatically submits or publishes');
    assert.equal(qa.currentPublications[0].publishedAt, null);
    assert.equal(qa.currentPublications[0].approvedAt, null);
    await shot(qa, 'explicit-draft-not-published');
    qa.allowSubmit = true;
    await draft.getByRole('button', { name: 'J\u00f3v\u00e1hagy\u00e1sra k\u00fcld\u00f6m', exact: true }).click();
    const submitted = page.getByTestId('opportunity-publication-READY_FOR_APPROVAL').filter({ hasText: 'Explicit safe draft title' });
    await submitted.waitFor();
    assert.deepEqual(qa.writes.map(write => write.path), [`${companyRoot}/grow/opportunity-publications`, `${companyRoot}/grow/opportunity-publications/qa-reader-draft/submit`], 'Only explicit prepare and submit writes are permitted');
    assert.equal(qa.currentPublications[0].publishedAt, null, 'Submission is not publication');
    assert.equal(qa.currentPublications[0].approvedAt, null, 'Submission is not approval');
    assert.equal(await submitted.getByRole('button', { name: 'J\u00f3v\u00e1hagyom', exact: true }).isVisible(), publish, `${role}: submitting does not confer approval authority`);
    assert.equal(await submitted.getByRole('button', { name: 'K\u00f6zz\u00e9teszem az \u00fcgyf\u00e9lnek', exact: true }).count(), 0, 'Unapproved drafts cannot be published');
    await shot(qa, 'submitted-not-approved-or-published');
    await open(qa, '?view=journey&destination=home');
    await page.getByTestId('grow-company-state-panel').waitFor();
    assert.equal(await page.getByRole('button', { name: /kutat\u00e1si fut\u00e1s/i }).isVisible(), manage, `${role}: research authority`);
    await open(qa, '?tab=eredmenyek');
    await page.getByTestId('grow-outcome-ESTIMATED').waitFor();
    assert.equal(await page.getByTestId('grow-record-outcome-open').isVisible(), manage, `${role}: outcome recording authority`);
    assert.equal(qa.writes.length, 2, 'Only the two explicit preparation/submission actions wrote data');
    await close(qa); result[role] = 'PASS';
  }
  return result;
}

async function errors(width) {
  const result = {};
  for (const status of [403, 503]) {
    const qa = await session(width, 'ADMIN', { [`${companyRoot}/grow/opportunities`]: status });
    await open(qa, '?tab=dontesek&opportunity=qa-pending');
    await qa.page.getByTestId('grow-opportunity-check-failed').waitFor();
    await qa.page.locator(`[data-read-state="${status === 403 ? 'UNAUTHORIZED' : 'UNAVAILABLE'}"]`).first().waitFor();
    assert.equal(await qa.page.getByTestId('grow-opportunity-unavailable').count(), 0, 'Failure is not absence');
    assert.equal(await qa.page.getByTestId('grow-decide-accept-qa-pending').count(), 0);
    await shot(qa, `error-${status}`);
    await qa.page.getByTestId('grow-subnav-kezdemenyezesek').click();
    await qa.page.getByTestId('grow-initiative-qa-init-a').waitFor();
    assert.equal(qa.writes.length, 0);
    await close(qa); result[status] = 'PASS';
  }
  const missing = await session(width);
  await open(missing, '?view=journey&destination=detail&opportunity=qa-foreign-id');
  await missing.page.getByRole('alert').first().waitFor();
  assert.equal(await missing.page.getByTestId('evidence-basis-summary').count(), 0, 'Missing exact detail must not show another opportunity');
  await shot(missing, 'missing-detail');
  await close(missing);
  return { ...result, missingDetail: 'PASS' };
}

async function customer(width) {
  const qa = await session(width, 'CUSTOMER'), { page } = qa;
  await page.goto(new URL('/portal/fejlesztes?tab=kezdemenyezesek&initiative=qa-init-a', base).href, { waitUntil: 'domcontentloaded' });
  const detail = page.getByTestId('grow-initiative-detail');
  await detail.waitFor();
  assert.match(await detail.innerText(), /Result process 0/);
  assert.doesNotMatch(await detail.innerText(), /Result process 1/);
  await shot(qa, 'customer-initiative-a');
  await page.goto(new URL('/portal/fejlesztes?tab=kezdemenyezesek&initiative=qa-init-b', base).href, { waitUntil: 'domcontentloaded' });
  await detail.waitFor();
  assert.match(await detail.innerText(), /Result process 1/);
  assert.doesNotMatch(await detail.innerText(), /Result process 0/);
  await page.getByTestId('grow-tab-fejlesztesi-iranyok').click();
  await page.getByTestId('grow-opportunity-item').waitFor();
  assert.match(await page.locator('body').innerText(), /Customer safe published title/);
  assert.doesNotMatch(await page.locator('body').innerText(), /INTERNAL_ONLY_|qa-formula-v1|qa-research-run|Customer safe direction|Explicit safe draft title/);
  assert.equal(qa.requests.some(r => r.path.startsWith('/client-company/')), false, 'Customer must not request workforce evidence or internal recommendations');
  assert.equal(qa.writes.length, 0, 'Reading published customer data does not publish or approve');
  await shot(qa, 'customer-safe-boundary');
  await close(qa);
  return { sameTitleDifferentIds: 'PASS', publishedDTOOnly: 'PASS', workforceRequests: 0 };
}

try {
  browser = await chromium.launch({ headless: true });
  for (const width of widths) {
    const row = { width, status: 'RUNNING' }; report.push(row);
    row.workflow = await workforce(width);
    row.roles = await roles(width);
    row.errors = await errors(width);
    row.customer = await customer(width);
    row.pageErrors = 0;
    row.unexpectedNetworkOrWrites = 0;
    row.status = 'PASS';
    console.log(`GROW_V25_WIDTH=${width} ${JSON.stringify(row)}`);
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  }
  console.log(`GROW_V25_BROWSER_QA=PASS screenshots=${output}`);
} catch (error) {
  if (report.length) report.at(-1).status = 'FAIL';
  const failure = { message: error.stack || String(error), width: current?.width, role: current?.role, url: current?.page.url(), pageerrors: current?.errors, unexpected: current?.unexpected, requests: current?.requests, writes: current?.writes, consoleErrors: current?.consoleErrors };
  fs.writeFileSync(path.join(output, 'failure.json'), JSON.stringify(failure, null, 2));
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  if (current && !current.page.isClosed()) {
    await current.page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true }).catch(screenshotError => console.error(screenshotError));
    fs.writeFileSync(path.join(output, 'failure-body.txt'), await current.page.locator('body').innerText().catch(() => 'Body unavailable'));
  }
  console.error(JSON.stringify({ ...failure, requests: undefined, consoleErrors: undefined }));
  process.exitCode = 1;
} finally {
  await browser?.close();
}
