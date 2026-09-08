import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  formatMinutes,
  formatNetAmount,
  formatRate,
  groupByOrganizationGroup,
  rateScopeLabel,
  reviewStatusLabel,
} from '../src/lib/billingPreparationPresentation';
import type { BillingItem } from '../src/lib/billingPreparationsApi';

test('presentation formats decimal strings without any money math', () => {
  assert.equal(formatNetAmount('40000.00'), '40 000 Ft');
  assert.equal(formatNetAmount('67500.19'), '67 500,19 Ft');
  assert.equal(formatNetAmount(null), '—');
  assert.equal(formatRate('50000.0000'), '50 000 Ft/óra');
  assert.equal(formatMinutes(95), '1:35');
  assert.equal(reviewStatusLabel.REVIEW_REQUIRED, 'Felülvizsgálat szükséges');
  assert.equal(reviewStatusLabel.NO_RATE, 'Nincs óradíj');
  assert.equal(reviewStatusLabel.STALE, 'Forrás megváltozott');
});

test('rate scope labels cover client default, case override, row override, unresolved', () => {
  const base = { rate: { scope: 'UNRESOLVED', hourlyRate: null }, billing: { rateOverride: null } } as unknown as BillingItem;
  assert.equal(rateScopeLabel(base), 'Nincs óradíj');
  assert.equal(rateScopeLabel({ ...base, rate: { ...base.rate, scope: 'CLIENT' } }), 'Ügyfél alap óradíja');
  assert.equal(rateScopeLabel({ ...base, rate: { ...base.rate, scope: 'CASE' } }), 'Egyedi ügy óradíja');
  assert.equal(rateScopeLabel({ ...base, billing: { ...base.billing, rateOverride: '1' } }), 'Egyedi számlázási óradíj');
});

test('grouping uses the client organization group, never the internal department', () => {
  const item = (group: string | null, dept: string) => ({
    source: { organizationGroup: group ? { id: 'g', name: group } : null, department: { name: dept } },
  }) as unknown as BillingItem;
  const groups = groupByOrganizationGroup([item('HR', 'Jogi'), item(null, 'Pénzügy'), item('HR', 'Jogi')]);
  assert.deepEqual(groups.map((group) => group.name), ['HR', 'Ügyféli egység nélkül']);
  assert.equal(groups[0].items.length, 2);
});

test('workspace surface keeps Hungarian product labels and provenance in row detail', () => {
  const workspace = readFileSync('src/app/clients/[clientId]/szamlazas/[preparationId]/BillingReviewWorkspace.tsx', 'utf8');
  assert.match(workspace, /Számlázás előkészítése/);
  assert.match(workspace, /Kérelmező/);
  assert.match(workspace, /Belső osztály/);
  assert.match(workspace, /Számlázott perc/);
  assert.match(workspace, /Egyedi számlázási óradíj/);
  assert.match(workspace, /Frissítés a forrásokból/);
  assert.match(workspace, /Részletek és módosítás/);
  assert.doesNotMatch(workspace, /organizationGroup|attributionKind.*UI/);

  const dossier = readFileSync('src/app/clients/[clientId]/page.tsx', 'utf8');
  assert.match(dossier, /\/szamlazas/);
  assert.match(dossier, /Számlázás előkészítése/);
});

test('api client sends only billing fields, never source mutations', () => {
  const api = readFileSync('src/lib/billingPreparationsApi.ts', 'utf8');
  assert.match(api, /method: 'PATCH'/);
  assert.match(api, /rateOverride\?: string \| null/);
  assert.doesNotMatch(api, /sourceMinutes|sourceBillable.*=|method: '(PUT|DELETE)'/);
});
