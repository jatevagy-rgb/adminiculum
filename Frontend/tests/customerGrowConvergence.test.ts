/**
 * CUSTOMER GROW CONVERGENCE — focused source-contract proof.
 *
 * Locks the canonical customer Grow information architecture and proves the
 * customer-safe publication boundary, the preserved input journeys, the
 * outcome-basis distinction and the #370 design-system convergence.
 *
 * The customer portal must never expose workforce-only models:
 *   - raw DiagnosisCandidate / ResearchEvidence / RecommendationCandidate
 *   - internal rationale / confidence / AI certainty
 *   - fake maturity / ROI / progress metrics
 *   - unpublished opportunities
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

test('CUSTOMER_IA: six canonical tabs, inputs demoted, no assessment hero', () => {
  const src = read(VIEW);
  for (const id of ['attekintes', 'teendok', 'fejlesztesi-iranyok', 'kezdemenyezesek', 'eredmenyek', 'mukodes']) {
    assert.match(src, new RegExp(`activeTab === "${id}"`), `missing tab body ${id}`);
    assert.match(src, new RegExp(`id: "${id}"`), `missing tab nav entry ${id}`);
  }
  assert.doesNotMatch(src, /label: "Felmérések"/);
  assert.doesNotMatch(src, /Felmérések és fejlesztési lehetőségek/);
});

test('CUSTOMER_IA: legacy tab ids map deterministically', () => {
  const src = read(VIEW);
  for (const mapping of ['felmeresek: "teendok"', 'folyamatok: "mukodes"', 'lehetosegek: "fejlesztesi-iranyok"']) {
    assert.ok(src.includes(mapping), `missing legacy mapping ${mapping}`);
  }
  assert.match(src, /resolveGrowTab\(/);
});

test('CUSTOMER_IA: opportunities are customer-safe published projections only', () => {
  const src = read(VIEW);
  assert.match(src, /data\?\.opportunities/);
  assert.match(src, /opportunitiesDeferredNotice/);
  assert.match(src, /grow-opportunities-section/);
  for (const internal of ['recommendationId', 'evidenceStrength', 'internalState', 'publicationState']) {
    assert.doesNotMatch(src, new RegExp(internal), `opportunity surface leaked ${internal}`);
  }
});

test('ASSESSMENTS: catalogue, runner, submit, completed result, unavailable, process scope preserved', () => {
  const src = read(VIEW);
  assert.match(src, /listPortalGrowAssessments/);
  assert.match(src, /getPortalGrowAssessment/);
  assert.match(src, /submitPortalGrowAssessment/);
  assert.match(src, /data-testid="grow-assessment-catalogue"/);
  assert.match(src, /data-testid="grow-assessment-runner"/);
  assert.match(src, /data-testid="grow-assessment-result"/);
  assert.match(src, /data-testid="grow-assessment-result-unavailable"/);
  assert.match(src, /data-testid="grow-assessment-process-scope"/);
  assert.match(src, /data-testid="grow-assessment-result-scopes"/);
  assert.match(src, /idempotencyKey: assessmentKeyRef\.current/);
  // Unfinished input is framed as availability, never as office-assigned work.
  assert.match(src, /Felmérések és jelzések/);
});

test('SURVEY: submit, history and failure semantics preserved', () => {
  const src = read(VIEW);
  assert.match(src, /submitPortalGrowSurvey/);
  assert.match(src, /listPortalGrowSurveys/);
  assert.match(src, /idempotencyKey: idempotencyKeyRef\.current/);
  assert.match(src, /submitError/);
  assert.match(src, /Korábban beküldött működési visszajelzések/);
  assert.match(src, /data-testid="grow-feltaras-section"/);
});

test('DETAIL: opportunity and initiative deep links stay URL-backed and reload-safe', () => {
  const src = read(VIEW);
  assert.match(src, /handleSelectOpportunity/);
  assert.match(src, /handleSelectInitiative/);
  assert.match(src, /data-testid="grow-opportunity-detail"/);
  assert.match(src, /data-testid="grow-initiative-detail"/);
  assert.match(src, /url\.searchParams\.set\("opportunity", pubId\)/);
  assert.match(src, /url\.searchParams\.delete\("opportunity"\)/);
  assert.match(src, /url\.searchParams\.set\("initiative", initiativeId\)/);
  assert.match(src, /url\.searchParams\.delete\("initiative"\)/);
  assert.match(src, /window\.addEventListener\("popstate"/);
  assert.match(src, /window\.history\.pushState/);
  assert.match(src, /window\.history\.replaceState/);
});

test('OUTCOMES: MEASURED, CALCULATED and ESTIMATED remain distinct', () => {
  const src = read(VIEW);
  assert.match(src, /data\?\.outcomes\.measured/);
  assert.match(src, /data\?\.outcomes\.calculatedOrEstimated/);
  assert.match(src, /o\.basis === "CALCULATED"/);
  assert.match(src, /o\.basis === "ESTIMATED"/);
  assert.match(src, /Mért eredmények/);
  assert.match(src, /Számított eredmények/);
  assert.match(src, /Becsült eredmények/);
  assert.match(src, /Mért eredményként csak MEASURED alapú eredmény jelenik meg/);
  // Basis tone keeps calculated/estimated visually distinct from measured.
  assert.match(src, /function outcomeTone/);
  const api = read(API);
  assert.match(api, /basis: 'MEASURED' \| 'CALCULATED' \| 'ESTIMATED'/);
  assert.doesNotMatch(api, /ASSUMED/);
});

test('BOUNDARY: no raw diagnosis, research, recommendation or fake AI metrics', () => {
  const src = read(VIEW);
  for (const forbidden of [
    'DiagnosisCandidate',
    'ResearchEvidence',
    'RecommendationCandidate',
    'evidenceStrength',
    'recommendationId',
    'internalNote',
    'reviewNote',
    'ASSUMED',
    'confidence',
    'maturity',
    'getDiagnosticWorkbench',
    'reviewOpportunity',
    'runResearch',
  ]) {
    assert.doesNotMatch(src, new RegExp(forbidden), `customer Grow must not expose ${forbidden}`);
  }
  assert.doesNotMatch(src, /megtérülés|\bROI\b/);
  assert.doesNotMatch(src, /fake|mock/i);
  // The old milestone percentage bar was replaced by milestone counts/status.
  assert.doesNotMatch(src, /\(completed \/ milestones\.length\)/);
});

test('STYLE: canonical #370 primitives, zero raw hex, no warm route-local mini-theme', () => {
  const src = read(VIEW);
  for (const primitive of [
    'OperationalPageHeader',
    'AdminPanel',
    'AdminSectionHeader',
    'AdminButton',
    'AdminStatusPill',
    'AdminBadge',
    'CompactState',
    'SafePanelError',
  ]) {
    assert.ok(src.includes(primitive), `missing canonical primitive ${primitive}`);
  }
  assert.doesNotMatch(src, /#[0-9a-fA-F]{3,8}\b/);
  assert.doesNotMatch(src, /stone-/);
  assert.doesNotMatch(src, /beige|sand-|rounded-3xl|rounded-2xl/);
  assert.doesNotMatch(src, /bg-gradient-to/);
  assert.match(src, /var\(--adm-/);
});
