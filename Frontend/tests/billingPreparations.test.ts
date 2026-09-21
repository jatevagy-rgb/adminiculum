import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  formatBudapestDateTime,
  formatMinutes,
  formatNetAmount,
  formatRate,
  groupByOrganizationGroup,
  groupPreparationsByPeriod,
  rateScopeLabel,
  reviewStatusLabel,
} from '../src/lib/billingPreparationPresentation';
import type { BillingItem, BillingPreparationSummary } from '../src/lib/billingPreparationsApi';

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
  // the generic adjustment reason must not claim to satisfy the separate
  // rate-override reason requirement
  assert.match(workspace, /Igazolás \/ indoklás \(időcsökkentésnél kötelező\)/);
  assert.match(workspace, /Egyedi óradíj indoklása \(külön kötelező\)/);

  const dossier = readFileSync('src/app/clients/[clientId]/page.tsx', 'utf8');
  assert.match(dossier, /\/szamlazas/);
  assert.match(dossier, /Számlázás előkészítése/);
});

test('summary refreshes from the authoritative workspace after every row mutation', () => {
  const workspace = readFileSync('src/app/clients/[clientId]/szamlazas/[preparationId]/BillingReviewWorkspace.tsx', 'utf8');
  // rows re-fetch the server workspace (which re-derives the summary) after
  // patch AND resync instead of keeping a client-side stale summary
  assert.match(workspace, /await patchBillingItem\(preparationId, item\.id, patch\);\s*\n\s*await onChanged\(\);/);
  assert.match(workspace, /await resyncBillingItem\(preparationId, item\.id\);\s*\n\s*await onChanged\(\);/);
  assert.match(workspace, /onChanged=\{load\}/);
  // money is never recomputed in the frontend: no arithmetic on netAmount fields
  const api = readFileSync('src/lib/billingPreparationsApi.ts', 'utf8');
  const presentation = readFileSync('src/lib/billingPreparationPresentation.ts', 'utf8');
  for (const source of [workspace, api, presentation]) {
    assert.doesNotMatch(source, /netAmount\s*[+*\/-]|Number\(.*netAmount|parseFloat\(.*netAmount|parseInt\(.*netAmount/);
    assert.doesNotMatch(source, /includedNetAmount\s*[+*\/-]|\.reduce\(/);
  }
});

test('api client sends only billing fields, never source mutations', () => {
  const api = readFileSync('src/lib/billingPreparationsApi.ts', 'utf8');
  assert.match(api, /method: 'PATCH'/);
  assert.match(api, /rateOverride\?: string \| null/);
  assert.doesNotMatch(api, /sourceMinutes|sourceBillable.*=|method: '(PUT|DELETE)'/);
});

function summary(overrides: Partial<BillingPreparationSummary>): BillingPreparationSummary {
  return {
    id: 'prep',
    clientId: 'client',
    clientName: 'Teszt Ügyfél Kft.',
    periodStart: '2026-08-01',
    periodEnd: '2026-08-31',
    currency: 'HUF',
    calculationPolicyVersion: 'PER_ENTRY_MINUTES_X_RATE_HALF_UP_2DP_V1',
    status: 'CLOSED',
    createdAt: '2026-09-01T08:00:00.000Z',
    createdById: 'user-1',
    closedAt: '2026-09-02T08:00:00.000Z',
    closedById: 'user-1',
    itemCount: 2,
    includedMinutes: 120,
    includedNetAmount: '50000.00',
    ...overrides,
  };
}

test('audit timestamps render in Hungarian Budapest form without locale drift', () => {
  assert.equal(formatBudapestDateTime('2026-09-20T12:35:00.000Z'), '2026. 09. 20. 14:35'); // CEST
  assert.equal(formatBudapestDateTime('2026-01-15T00:05:00.000Z'), '2026. 01. 15. 01:05'); // CET
  assert.equal(formatBudapestDateTime(null), '—');
  assert.equal(formatBudapestDateTime('not-a-date'), '—');
});

test('same-period preparations are grouped: one open current, every closed snapshot kept as history', () => {
  const currentOpen = summary({ id: 'open-1', status: 'OPEN', closedAt: null, closedById: null, createdAt: '2026-09-10T08:00:00.000Z' });
  const olderClosed = summary({ id: 'closed-old', closedAt: '2026-09-05T08:00:00.000Z' });
  const newerClosed = summary({ id: 'closed-new', closedAt: '2026-09-08T08:00:00.000Z' });
  const otherPeriod = summary({ id: 'other-period', periodStart: '2026-07-01', periodEnd: '2026-07-31' });

  const groups = groupPreparationsByPeriod([olderClosed, currentOpen, newerClosed, otherPeriod]);
  assert.equal(groups.length, 2);
  assert.deepEqual([groups[0].periodStart, groups[0].periodEnd], ['2026-08-01', '2026-08-31']);
  assert.equal(groups[0].current?.id, 'open-1');
  assert.deepEqual(groups[0].history.map((prep) => prep.id), ['closed-new', 'closed-old']);
  assert.equal(groups[1].current, null);
  assert.deepEqual(groups[1].history.map((prep) => prep.id), ['other-period']);

  // No record is collapsed away: every input id stays reachable exactly once.
  const seen: string[] = [];
  for (const group of groups) {
    if (group.current) seen.push(group.current.id);
    for (const prep of group.history) seen.push(prep.id);
  }
  assert.deepEqual(seen.slice().sort(), ['closed-new', 'closed-old', 'open-1', 'other-period']);
});

test('history surface groups by period, labels closed snapshots and links every preparation id', () => {
  const page = readFileSync('src/app/clients/[clientId]/szamlazas/SzamlazasPageContent.tsx', 'utf8');
  assert.match(page, /groupPreparationsByPeriod\(preparations\)/);
  assert.match(page, /Korábbi lezárt változatok/);
  assert.match(page, /Jelenlegi nyitott előkészítés/);
  assert.match(page, /Nincs nyitott előkészítés/);
  // each rendered row links to its own preparation id
  assert.match(page, /href=\{`\/clients\/\$\{encodeURIComponent\(clientId\)\}\/szamlazas\/\$\{encodeURIComponent\(prep\.id\)\}`\}/);
  assert.match(page, /formatBudapestDateTime\(prep\.createdAt\)/);
  assert.match(page, /formatBudapestDateTime\(prep\.closedAt\)/);
});
