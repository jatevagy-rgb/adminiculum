import assert from 'node:assert/strict';
import test from 'node:test';
import { makeBaselineRow, baselineUnit, MANUAL_STARTER_PACK_STEPS, STARTER_PACK_REGISTRIES } from '../src/lib/manualStarterPack';

test('missing baseline stays missing but explicit zero remains recorded', () => {
  assert.equal(makeBaselineRow('Email triázs', 'MEASURED', ''), null);
  assert.equal(makeBaselineRow('Email triázs', 'MEASURED', '-1'), null);
  assert.equal(makeBaselineRow('Email triázs', 'MEASURED', 'Infinity'), null);
  assert.equal(makeBaselineRow('Email triázs', 'MEASURED', '0')?.value, 0);
});
test('estimated labour, elapsed waiting and review rounds have distinct bases/units', () => {
  assert.equal(makeBaselineRow('Senior ellenőrzés', 'ESTIMATED', '30')?.basis, 'ESTIMATED');
  assert.equal(baselineUnit('Ügyfélre várakozás'), 'ELAPSED_MINUTES');
  assert.equal(baselineUnit('Ellenőrzési körök'), 'COUNT');
  assert.equal(makeBaselineRow('Ellenőrzési körök', 'MEASURED', '1.5'), null);
  assert.equal(makeBaselineRow('Unknown', 'MEASURED', '1'), null);
});
test('generic runbook keeps first outcome and separate publication after baseline', () => {
  assert.equal(MANUAL_STARTER_PACK_STEPS.length, 12);
  assert.match(MANUAL_STARTER_PACK_STEPS[9], /alapfelmérés/);
  assert.match(MANUAL_STARTER_PACK_STEPS[11], /Külön/);
  assert.equal(STARTER_PACK_REGISTRIES.length, 8);
});
