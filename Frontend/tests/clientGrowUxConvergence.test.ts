/**
 * CUSTOMER GROW WITH US — UX convergence source-contract regression.
 *
 * Proves the ORGANIZATION Grow frontend now reads as one Adminiculum domain:
 * a single hero identity, one explanatory lead, normalized summary metrics,
 * a single journey framing, and an explicitly lightweight quick signal — while
 * every existing Grow journey and URL-backed state survives unchanged.
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

test('HERO_SIMPLIFIED=PASS — one Grow identity, one title, one lead', () => {
  const src = read(VIEW);
  assert.match(src, /Grow With Us/);
  assert.match(src, /Felmérések és fejlesztési lehetőségek/);
  // Competing duplicate titles describing the same page are gone.
  assert.doesNotMatch(src, /Fejlesztési Áttekintés/);
  assert.doesNotMatch(src, /Grow With Us · Vállalatfejlesztés/);
  assert.doesNotMatch(src, /FELMÉRÉSEK ÉS FEJLESZTÉSI LEHETŐSÉGEK/);
  // Customer name still comes from the DTO, never hard-coded.
  assert.match(src, /data\.customerName/);
  assert.doesNotMatch(src, /Demo Kft/);
});

test('GROW_JOURNEY_CLARIFIED=PASS — single progression cue, six tabs preserved', () => {
  const src = read(VIEW);
  assert.match(src, /data-testid="grow-journey-hint"/);
  assert.match(src, /Felmérés → működés megértése → fejlesztési lehetőség → kezdeményezés → mérhető eredmény/);
  for (const id of ['attekintes', 'felmeresek', 'folyamatok', 'lehetosegek', 'kezdemenyezesek', 'eredmenyek']) {
    assert.match(src, new RegExp(`id: "${id}"`));
    assert.match(src, new RegExp(`grow-tab-\\$\\{tab\\.id\\}`));
  }
});

test('KPI_LABELS_NORMALIZED=PASS — unambiguous metrics derived from real data', () => {
  const src = read(VIEW);
  for (const label of [
    'Kitöltésre váró felmérés',
    'Befejezett felmérés',
    'Felmért folyamat',
    'Aktív kezdeményezés',
    'Közzétett lehetőség',
    'Mért eredmény',
  ]) {
    assert.ok(src.includes(label), `missing normalized KPI label: ${label}`);
  }
  // Ambiguous bare metrics no longer sit side by side.
  assert.doesNotMatch(src, />FOLYAMATOK</);
  assert.doesNotMatch(src, />FOLYAMATBAN</);
  // Every value still comes from canonical DTO data.
  assert.match(src, /\{uncompletedPacksCount\}/);
  assert.match(src, /\{completedPacksCount\}/);
  assert.match(src, /\{processes\.length\}/);
  assert.match(src, /\{activeInitiativesCount\}/);
  assert.match(src, /\{publishedOpportunitiesCount\}/);
  assert.match(src, /data\?\.opportunities\?\.length/);
  assert.match(src, /\{measuredOutcomes\.length\}/);
});

test('QUICK_SIGNAL_PRESERVED=PASS — lightweight feedback explicitly not a formal assessment', () => {
  const src = read(VIEW);
  assert.match(src, /data-testid="grow-feltaras-section"/);
  assert.match(src, /Gyors működési jelzés/);
  assert.match(src, /Hol érdemes javítani\?/);
  assert.match(src, /Ez egy könnyű, jelzésértékű visszajelzés — nem formális felmérés\./);
  assert.match(src, /SURVEY_CATEGORY_LABELS_HU/);
  assert.match(src, /submitPortalGrowSurvey/);
  assert.match(src, /Korábban beküldött működési visszajelzések/);
});

test('FORMAL_ASSESSMENTS_PRESERVED=PASS — catalogue, runner, result and retake intact', () => {
  const src = read(VIEW);
  assert.match(src, /data-testid="grow-assessments-section"/);
  assert.match(src, /data-testid="grow-assessment-catalogue"/);
  assert.match(src, /data-testid="grow-assessment-runner"/);
  assert.match(src, /data-testid="grow-assessment-result"/);
  assert.match(src, /data-testid="grow-assessment-result-unavailable"/);
  assert.match(src, /Cégfelmérések \/ diagnózisok/);
  assert.match(src, /listPortalGrowAssessments/);
  assert.match(src, /submitPortalGrowAssessment/);
  assert.match(src, /Újra kitöltöm/);
});

test('URL_STATE_PRESERVED=PASS — tab, opportunity and initiative stay URL-backed', () => {
  const src = read(VIEW);
  assert.match(src, /url\.searchParams\.set\("tab", tab\)/);
  assert.match(src, /url\.searchParams\.set\("opportunity", pubId\)/);
  assert.match(src, /url\.searchParams\.delete\("opportunity"\)/);
  assert.match(src, /url\.searchParams\.set\("initiative", initiativeId\)/);
  assert.match(src, /url\.searchParams\.delete\("initiative"\)/);
  assert.match(src, /handlePopState/);
});

test('NO_FAKE_METRICS_ADDED=PASS — no invented score, percentage wording or assumed outcome', () => {
  const src = read(VIEW);
  assert.doesNotMatch(src, /százalék/i);
  assert.doesNotMatch(src, /pontszám/i);
  assert.doesNotMatch(src, /maturityScore|maturityPercent|maturityLevel/i);
  assert.doesNotMatch(src, /ASSUMED/);
  assert.doesNotMatch(src, /fake|mock/i);
  // Outcome basis distinctions remain explicit.
  assert.match(src, /Mért eredmények/);
  assert.match(src, /Számított \/ becsült eredmények/);
});
