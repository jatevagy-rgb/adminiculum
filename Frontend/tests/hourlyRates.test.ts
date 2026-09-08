import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { formatHourlyRate, rateSourceLabel } from '../src/lib/hourlyRatePresentation';
import type { EffectiveRate } from '../src/lib/hourlyRatesApi';

test('decimal-string presentation preserves precision without calculating money', () => {
  assert.equal(formatHourlyRate('45000.0000'), '45 000 Ft/óra');
  assert.equal(formatHourlyRate('999999999999999.9999'), '999 999 999 999 999,9999 Ft/óra');
  assert.equal(formatHourlyRate(null), 'Nincs beállított óradíj');
  assert.equal(rateSourceLabel({ scope: 'CASE' } as EffectiveRate), 'Egyedi ügy óradíja');
  assert.equal(rateSourceLabel({ scope: 'CLIENT' } as EffectiveRate), 'Ügyfél alap óradíja');
  assert.equal(rateSourceLabel({ scope: 'UNRESOLVED' } as EffectiveRate), 'Nincs alkalmazható óradíj');
});
test('compact controls preserve backend rate contracts, schedules and scope switching guards', () => {
  const source = readFileSync('src/components/billing/HourlyRateCard.tsx', 'utf8');
  assert.match(source, /\['ADMIN', 'PARTNER'\]\.includes\(user.role\)/);
  assert.match(source, /if \(!active\) return/);
  assert.match(source, /key=\{`\$\{scope.clientId\}:\$\{scope.caseId/);
  assert.match(source, /rateSourceLabel\(data.effective\)/);
  assert.match(source, /data.next.date/);
  assert.match(source, /data.next.effective.hourlyRate/);
  assert.match(source, /edit\('EXPLICIT_RATE'\)/);
  assert.match(source, /edit\('INHERIT_CLIENT'\)/);
  assert.match(source, /mode === 'INHERIT_CLIENT' \? null : amount/);
  assert.match(source, /appendHourlyRate\(\{ clientId, caseId \}/);
  assert.match(source, /data.history.map/);
  const api = readFileSync('src/lib/hourlyRatesApi.ts', 'utf8');
  assert.match(api, /encodeURIComponent\(scope.clientId\)/);
  assert.match(api, /encodeURIComponent\(scope.caseId\)/);
  assert.match(api, /method: 'POST'/);
  assert.doesNotMatch(api, /method: '(PUT|PATCH|DELETE)'/);
});
test('existing dossier/case navigation and hours-only summary remain connected', () => {
  const dossier = readFileSync('src/app/clients/[clientId]/page.tsx', 'utf8');
  const cases = readFileSync('src/components/cases/CaseWorkspaceOverview.tsx', 'utf8');
  assert.match(dossier, /<HourlyRateCard clientId=\{clientId\}/);
  assert.match(dossier, /ClientHouseStylePanel/);
  assert.match(dossier, /\/time-entries\?clientId=/);
  assert.match(cases, /<HourlyRateCard clientId=\{c.client.id\} caseId=\{caseId\}/);
  assert.match(cases, /<CaseTimeBillingSummary/);
  assert.match(cases, /\/time-entries\?caseId=/);
});
