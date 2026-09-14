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
