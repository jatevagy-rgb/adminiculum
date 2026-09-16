/**
 * GROW customer assessment journey — frontend source-contract regression test.
 *
 * Locks the new assessment catalogue / runner / result journey AND proves the
 * pre-existing generic pain survey, survey history, initiatives and outcomes
 * remain intact (OLD_GENERIC_SURVEY_PRESERVED).
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const read = (relative: string) => readFileSync(path.join(root, relative), 'utf8');

const VIEW = 'Frontend/src/components/client-portal/OrgGrowView.tsx';
const API = 'Frontend/src/lib/clientPortalApi.ts';

test('catalogue: customer Grow view renders the assessment catalogue section', () => {
  const src = read(VIEW);
  assert.match(src, /data-testid="grow-assessments-section"/);
  assert.match(src, /data-testid="grow-assessment-catalogue"/);
  assert.match(src, /Cégfelmérések \/ diagnózisok/);
  assert.match(src, /listPortalGrowAssessments/);
});

test('catalogue: pack cards are backend-driven (no hardcoded questionnaire truth)', () => {
  const src = read(VIEW);
  assert.match(src, /catalogue\?\.packs/);
  // Questions/packs must come from the backend; the UI must not embed pack keys.
  for (const forbidden of ['DIGITAL_MATURITY', 'TRANSFORMATION_READINESS', 'PROCESS_AUTOMATION_READINESS', 'SYSTEMS_DATA_FLOW']) {
    assert.doesNotMatch(src, new RegExp(forbidden));
  }
  for (const prompt of ['dm_strategy_alignment', 'pa_rework', 'sd_reentry', 'tr_baseline']) {
    assert.doesNotMatch(src, new RegExp(prompt));
  }
});

test('runner: one question at a time with progress, answers and navigation', () => {
  const src = read(VIEW);
  assert.match(src, /data-testid="grow-assessment-runner"/);
  assert.match(src, /role="progressbar"/);
  assert.match(src, /runnerIndex \+ 1/);
  assert.match(src, /Vissza/);
  assert.match(src, /Tovább/);
  assert.match(src, /currentQuestion\.promptHu/);
  assert.match(src, /option\.labelHu/);
  assert.match(src, /aria-pressed=\{selected\}/);
});

test('result: findings, suggested directions and evidence are rendered', () => {
  const src = read(VIEW);
  assert.match(src, /data-testid="grow-assessment-result"/);
  assert.match(src, /Felmérés elkészült/);
  assert.match(src, /Amit látunk/);
  assert.match(src, /Javasolt irányok/);
  assert.match(src, /Mi alapján\?/);
  assert.match(src, /assessmentResult\.findings/);
  assert.match(src, /assessmentResult\.directions/);
  assert.match(src, /assessmentResult\.evidence/);
  assert.match(src, /strengthLabelHu/);
});

test('completed state: cards show status and result/refill actions', () => {
  const src = read(VIEW);
  assert.match(src, /Kitöltve/);
  assert.match(src, /Eredmény megtekintése/);
  assert.match(src, /Újra kitöltöm/);
  assert.match(src, /latestCompletedAt/);
});

test('aggregated: "Mit látunk eddig?" combines latest findings without duplicates source', () => {
  const src = read(VIEW);
  assert.match(src, /data-testid="grow-aggregated-findings"/);
  assert.match(src, /Mit látunk eddig\?/);
  assert.match(src, /aggregatedFindings/);
});

test('no fake maturity percentage or score is displayed', () => {
  const src = read(VIEW);
  assert.doesNotMatch(src, /érettség\w*[^\n]{0,24}\d+\s*%/i);
  assert.doesNotMatch(src, /pontszám/i);
  assert.doesNotMatch(src, /százalék/i);
  assert.doesNotMatch(src, /maturityScore|maturityPercent|maturityLevel/i);
  // The result DTO must not carry a global score/percentage field.
  const api = read(API);
  const resultBlock = api.slice(api.indexOf('export type PortalGrowAssessmentResult'));
  assert.doesNotMatch(resultBlock.slice(0, 600), /percent|score|level/i);
});

test('clientPortalApi exposes customer-safe assessment endpoints', () => {
  const src = read(API);
  assert.match(src, /\/client-portal\/org\/grow-assessments/);
  assert.match(src, /export async function listPortalGrowAssessments/);
  assert.match(src, /export async function getPortalGrowAssessment/);
  assert.match(src, /export async function submitPortalGrowAssessment/);
  assert.match(src, /PortalGrowAssessmentResult/);
  assert.match(src, /PortalGrowAssessmentDetail/);
});

test('OLD_GENERIC_SURVEY_PRESERVED=PASS', () => {
  const src = read(VIEW);
  assert.match(src, /data-testid="grow-feltaras-section"/);
  assert.match(src, /Gyors működési jelzés/);
  assert.match(src, /Hol érdemes javítani\?/);
  assert.match(src, /SURVEY_CATEGORY_LABELS_HU/);
  assert.match(src, /submitPortalGrowSurvey/);
  assert.match(src, /Korábban beküldött működési visszajelzések/);
});

test('OLD_INITIATIVES_AND_OUTCOMES_PRESERVED=PASS', () => {
  const src = read(VIEW);
  assert.match(src, /Min dolgozunk jelenleg\?/);
  assert.match(src, /Mit értünk el\?/);
  assert.match(src, /measuredOutcomes/);
  assert.match(src, /estimatedOutcomes/);
  assert.match(src, /Feltérképezett üzleti folyamatok/);
});

test('process-scoped packs: runner offers and sends the selected process', () => {
  const src = read(VIEW);
  assert.match(src, /data-testid="grow-assessment-process-scope"/);
  assert.match(src, /allowsProcessReference/);
  assert.match(src, /assessmentProcessId/);
  assert.match(src, /processId: assessmentProcessId \|\| undefined/);
  assert.match(src, /Melyik folyamatot szeretné ezzel a felméréssel áttekinteni\?/);
  assert.match(src, /requiresProcess/);
});

test('catalogue states: loading, success, error and retry all exist', () => {
  const src = read(VIEW);
  assert.match(src, /A felmérések betöltése folyamatban…/);
  assert.match(src, /data-testid="grow-assessment-catalogue"/);
  assert.match(src, /data-testid="grow-assessment-catalogue-error"/);
  assert.match(src, /A felmérések most nem érhetők el/);
  assert.match(src, /Újrapróbálás/);
  // Error is rendered AHEAD of cached packs, so a failed refresh stays visible.
  assert.match(src, /catalogueError \?\s*\(/);
  assert.match(src, /catalogueError \? null/);
});

test('catalogue failure is local: base Grow stays and no raw error leaks', () => {
  const src = read(VIEW);
  assert.match(src, /clientSafeError\(err\)/);
  assert.match(src, /data-testid="grow-feltaras-section"/);
  assert.match(src, /Min dolgozunk jelenleg\?/);
  // No raw Error object is interpolated into the UI.
  assert.doesNotMatch(src, /\{err\.message\}/);
  assert.doesNotMatch(src, /\{error\.message\}/);
});

test('aggregated empty states: NO_COMPLETION / ZERO_FINDINGS / UNKNOWN / WITH_FINDINGS', () => {
  const src = read(VIEW);
  assert.match(src, /hasCompletedPack/);
  assert.match(src, /Még nincs kitöltött felmérés/);
  assert.match(src, /jelenleg nem azonosítottunk figyelmet igénylő pontot/);
  assert.match(src, /aggregatedUnknownAreaCount/);
  assert.match(src, /aggregatedFindings\.length > 0/);
});

test('unevaluable completion has an explicit unavailable state, not zero findings', () => {
  const src = read(VIEW);
  assert.match(src, /latestResultAvailable/);
  assert.match(src, /hasEvaluableCompletedPack/);
  assert.match(src, /hasUnavailableCompletedPack/);
  assert.match(src, /data-testid="grow-assessment-result-unavailable"/);
  assert.match(src, /Az eredmény jelenleg nem jeleníthető meg/);
  // The zero-findings summary is qualified when any completed scope is unavailable.
  assert.match(src, /Néhány kitöltött felmérés eredménye jelenleg nem jeleníthető meg/);
  const api = read(API);
  assert.match(api, /latestResultAvailable: boolean/);
});

test('multi-process results: chooser by process name, never raw process id', () => {
  const src = read(VIEW);
  assert.match(src, /data-testid="grow-assessment-result-scopes"/);
  assert.match(src, /pack\.resultScopes\.map/);
  assert.match(src, /scope\.processName \|\| "Általános"/);
  assert.match(src, /viewAssessmentResult\(pack\.packKey, scope\.processId\)/);
  // Customer-visible result labels the process by NAME.
  assert.match(src, /Folyamat: \{assessmentResultScope\.processName\}/);
  assert.match(src, /data-testid="grow-assessment-result-process"/);
  const api = read(API);
  assert.match(api, /resultScopes: PortalGrowAssessmentResultScope\[\]/);
  assert.match(api, /processName: string \| null/);
});

test('retake preserves the selected process scope', () => {
  const src = read(VIEW);
  assert.match(src, /startAssessment\(assessmentResult\.packKey, assessmentResultScope\?\.processId/);
  assert.match(src, /setAssessmentProcessId\(processId \?\? ""\)/);
  assert.match(src, /getPortalGrowAssessment\(packKey, processId\)/);
});

test('non-process packs keep the single result action', () => {
  const src = read(VIEW);
  assert.match(src, /pack\.allowsProcessReference && pack\.resultScopes\.length > 1/);
});

test('P2 scope availability: any available scope keeps the chooser reachable', () => {
  const src = read(VIEW);
  // Result-action availability derives from ALL scopes for process packs...
  assert.match(
    src,
    /pack\.allowsProcessReference\s*\?\s*pack\.resultScopes\.some\(\(s\) => s\.resultAvailable\)/,
  );
  // ...while non-process packs keep the pack-level flag.
  assert.match(src, /: pack\.latestResultAvailable\)/);
  // Per-scope control: available scopes open, unavailable scopes are disabled.
  assert.match(src, /disabled=\{assessmentBusy \|\| !scope\.resultAvailable\}/);
  assert.match(src, /viewAssessmentResult\(pack\.packKey, scope\.processId\)/);
  // All scopes unavailable → honest unavailable note, not a hidden healthy state.
  assert.match(src, /!pack\.resultScopes\.some\(\(s\) => s\.resultAvailable\)/);
  assert.match(
    src,
    /A kitöltés rögzítve van, de az eredmény ehhez a verzióhoz jelenleg nem jeleníthető meg\./,
  );
  // Raw process id is never rendered; the chooser labels by process name.
  assert.match(src, /scope\.processName \|\| "Általános"/);
});

test('P2 summary availability: derived from every completed scope', () => {
  const src = read(VIEW);
  assert.match(src, /const completedResultScopes = packs/);
  assert.match(src, /\.flatMap\(\(p\) => p\.resultScopes\)/);
  assert.match(src, /completedResultScopes\.some\(\(s\) => s\.resultAvailable\)/);
  assert.match(src, /completedResultScopes\.some\(\(s\) => !s\.resultAvailable\)/);
  // Existing copy preserved when everything is available.
  assert.match(src, /jelenleg nem azonosítottunk figyelmet igénylő pontot/);
  assert.match(src, /aggregatedFindings\.length > 0/);
  // All unavailable → honest summary rather than a healthy claim.
  assert.match(src, /A kitöltött felmérések eredménye jelenleg nem jeleníthető meg\./);
});

test('truthful semantic doctrine: declared observations, observations vs facts, non-universal research, measured vs verified', () => {
  const src = read(VIEW);
  const journeySrc = read('Frontend/src/components/clients/GrowJourney.tsx');

  // 1. DECLARED_OBSERVATION_ERASED=NO
  // Proves declared observations, survey answers, and measurements are integrated with separated sources
  assert.match(src, /rögzített megfigyelésekből, felmérési válaszokból, mérésekből és elérhető bizonyítékokból építkezik, azok forrását elkülönítve/);
  assert.match(journeySrc, /rögzített megfigyelésekből, felmérési válaszokból, mérésekből és elérhető bizonyítékokból építkezik, azok forrását elkülönítve/);

  // 2. OBSERVATION_PRESENTED_AS_CANONICAL_FACT=NO
  // Proves survey answers are observations rather than canonical facts
  assert.match(src, /A felmérések a vállalat által megadott válaszokat és működési megfigyeléseket rendszerezik/);
  assert.doesNotMatch(src, /kizárólag a vállalat által megerősített tényeket/);

  // 3. RESEARCH_SUPPORT_UNIVERSALIZED=NO
  // Proves interventions are not universally claimed as scientifically validated
  assert.match(src, /Az elérhető szakirodalmi és egyéb bizonyítékokat is figyelembe vevő, szakértői felülvizsgálattal kialakított fejlesztési irányok/);
  assert.doesNotMatch(src, /tudományos bizonyítékokkal alátámasztott beavatkozási javaslatok/);

  // 4. MEASURED_PRESENTED_AS_VERIFIED=NO
  // Proves measured is not presented as verified / igazolt
  assert.match(src, /Mért eredményként csak MEASURED alapú eredmény jelenik meg/);
  assert.doesNotMatch(src, /igazolt, mérhető megfigyelések/);
  assert.doesNotMatch(src, /igazolt hatás|igazolt eredmény/);
  assert.doesNotMatch(journeySrc, /igazolt hatás|igazolt eredmény/);
});

test('PUB-3 opportunity experience: list, detail, zero-published normal empty state, and URL state', () => {
  const src = read(VIEW);

  // GROW_OPPORTUNITY_CUSTOMER_PUBLICATION_GAP_FRONTEND_REFERENCES=0
  // STALE_CAPABILITY_GAP_ASSUMPTION_PRESENT=NO
  assert.doesNotMatch(src, /GROW_OPPORTUNITY_CUSTOMER_PUBLICATION_GAP/);

  // ZERO_PUBLISHED_IS_NORMAL_EMPTY_STATE=YES
  assert.match(src, /Jelenleg nincs ügyféloldalon közzétett fejlesztési lehetőség\./);
  assert.match(src, /data-testid="grow-opportunities-empty"/);
  assert.match(src, /Ha egy fejlesztési irány szakértői felülvizsgálat után közzétételre kerül, itt fog megjelenni\./);

  // PUBLISHED_OPPORTUNITY_LIST=YES
  assert.match(src, /data\?\.opportunities && data\.opportunities\.length > 0/);
  assert.match(src, /data-testid="grow-opportunities-list"/);
  assert.match(src, /data-testid="grow-opportunity-item"/);
  assert.match(src, /data-testid="grow-opportunity-open-detail"/);
  assert.match(src, /opp\.title/);
  assert.match(src, /opp\.summary/);
  assert.match(src, /opp\.direction/);
  assert.match(src, /opp\.publishedAt/);

  // PUBLISHED_OPPORTUNITY_DETAIL=YES
  assert.match(src, /data-testid="grow-opportunity-detail"/);
  assert.match(src, /data-testid="grow-opportunity-detail-title"/);
  assert.match(src, /data-testid="grow-opportunity-detail-back"/);
  assert.match(src, /Vissza a lehetőségekhez/);
  assert.match(src, /Összefoglaló/);
  assert.match(src, /Javasolt irány/);

  // DETAIL_URL_STATE=YES
  assert.match(src, /url\.searchParams\.set\("opportunity",/);
  assert.match(src, /url\.searchParams\.delete\("opportunity"\)/);

  // FORBIDDEN_FIELDS_ABSENT=YES
  // Does not use forbidden internal fields in opportunity presentation
  assert.doesNotMatch(src, /evidenceStrength/);
  assert.doesNotMatch(src, /recommendationId/);
});
