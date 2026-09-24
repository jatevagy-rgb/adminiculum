/**
 * CUSTOMER GROW — canonical information architecture convergence.
 *
 * Proves the ORGANIZATION Grow surface is an operational operating-improvement
 * system, not an assessment-first questionnaire product:
 *  - a compact operational header (no warm editorial hero, no journey hint),
 *  - the six canonical customer tabs,
 *  - deterministic legacy tab mapping,
 *  - inputs (assessments/survey) demoted into "Teendők",
 *  - URL-backed opportunity/initiative state preserved.
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

test('HERO_CONVERGED=PASS — compact operational header, no questionnaire hero', () => {
  const src = read(VIEW);
  assert.match(src, /OperationalPageHeader/);
  assert.match(src, /Működésfejlesztés/);
  assert.match(src, /Grow with us/);
  assert.match(
    src,
    /Áttekintés a működéséről, a közösen azonosított fejlesztési irányokról, a folyamatban lévő kezdeményezésekről és azok eredményeiről\./,
  );
  assert.match(src, /data\.customerName/);
  // The old assessment-first hero and the assessment journey mental model are gone.
  assert.doesNotMatch(src, /Felmérések és fejlesztési lehetőségek/);
  assert.doesNotMatch(src, /grow-journey-hint/);
  assert.doesNotMatch(src, /Felmérés → működés megértése/);
  assert.doesNotMatch(src, /Demo Kft/);
});

test('CUSTOMER_IA=PASS — six canonical customer tabs with canonical ids', () => {
  const src = read(VIEW);
  assert.match(src, /export type GrowTab/);
  const tabs: Array<[string, string]> = [
    ['attekintes', 'Áttekintés'],
    ['teendok', 'Teendők'],
    ['fejlesztesi-iranyok', 'Fejlesztési irányok'],
    ['kezdemenyezesek', 'Kezdeményezések'],
    ['eredmenyek', 'Eredmények'],
    ['mukodes', 'Működés'],
  ];
  for (const [id, label] of tabs) {
    assert.match(src, new RegExp(`id: "${id}"`), `missing tab id ${id}`);
    assert.ok(src.includes(`label: "${label}"`), `missing tab label ${label}`);
    assert.match(src, new RegExp(`activeTab === "${id}"`), `missing tab body ${id}`);
  }
  assert.match(src, /grow-tab-\$\{tab\.id\}/);
  // Assessment is NOT a primary navigation destination.
  assert.doesNotMatch(src, /label: "Felmérések"/);
});

test('LEGACY_TAB_MAPPING=PASS — old bookmarks resolve deterministically', () => {
  const src = read(VIEW);
  assert.match(src, /export function resolveGrowTab/);
  assert.match(src, /felmeresek: "teendok"/);
  assert.match(src, /folyamatok: "mukodes"/);
  assert.match(src, /lehetosegek: "fejlesztesi-iranyok"/);
  // Canonical ids resolve to themselves.
  assert.match(src, /attekintes: "attekintes"/);
  assert.match(src, /kezdemenyezesek: "kezdemenyezesek"/);
  assert.match(src, /eredmenyek: "eredmenyek"/);
  // Legacy link normalisation keeps Back/Forward/reload truthful.
  assert.match(src, /window\.history\.replaceState/);
  assert.match(src, /url\.searchParams\.set\("tab", tab\)/);
});

test('OVERVIEW_NOT_ASSESSMENT_FIRST=PASS — operational summaries lead', () => {
  const src = read(VIEW);
  assert.match(src, /data-testid="grow-overview-tab"/);
  for (const label of ['Nyitott teendők', 'Fejlesztési irányok', 'Aktív kezdeményezések', 'Rögzített eredmények']) {
    assert.ok(src.includes(label), `missing overview summary: ${label}`);
  }
  // The survey/assessment input channel does not appear on Overview.
  assert.doesNotMatch(src, /label: "Felmérések"/);
});

test('INPUT_CHANNEL_FRAMING=PASS — inputs are framed as requests for information', () => {
  const src = read(VIEW);
  assert.match(src, /Adatot kérünk Öntől/);
  assert.match(src, /Felmérési csomagok/);
  assert.match(src, /Nyitott teendők/);
  assert.match(src, /A felmérések a vállalat által megadott válaszokat és működési megfigyeléseket rendszerezik/);
});

test('URL_STATE_PRESERVED=PASS — tab, opportunity and initiative stay URL-backed', () => {
  const src = read(VIEW);
  assert.match(src, /url\.searchParams\.set\("tab", tab\)/);
  assert.match(src, /url\.searchParams\.set\("opportunity", pubId\)/);
  assert.match(src, /url\.searchParams\.delete\("opportunity"\)/);
  assert.match(src, /url\.searchParams\.set\("initiative", initiativeId\)/);
  assert.match(src, /url\.searchParams\.delete\("initiative"\)/);
  assert.match(src, /window\.addEventListener\("popstate"/);
  assert.match(src, /handlePopState/);
});

test('NO_FAKE_METRICS_ADDED=PASS — no invented score, percentage wording or assumed outcome', () => {
  const src = read(VIEW);
  assert.doesNotMatch(src, /százalék/i);
  assert.doesNotMatch(src, /pontszám/i);
  assert.doesNotMatch(src, /maturityScore|maturityPercent|maturityLevel/i);
  assert.doesNotMatch(src, /ASSUMED/);
  // Outcome basis distinctions remain explicit.
  assert.match(src, /Mért eredmények/);
  assert.match(src, /Számított \/ becsült eredmények/);
});

test('DESIGN_SYSTEM_CONVERGED=PASS — canonical primitives, zero new raw hex', () => {
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
    assert.ok(src.includes(primitive), `missing canonical primitive usage: ${primitive}`);
  }
  // No raw hex, no warm stone mini-theme, no marketing radius/gradient hero.
  assert.doesNotMatch(src, /#[0-9a-fA-F]{3,8}\b/);
  assert.doesNotMatch(src, /stone-/);
  assert.doesNotMatch(src, /rounded-(?:2xl|3xl)/);
  assert.doesNotMatch(src, /bg-gradient-to/);
});
