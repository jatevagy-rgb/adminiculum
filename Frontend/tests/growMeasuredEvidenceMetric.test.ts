import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { evidenceBasisCategory, type GrowEvidenceItem, type GrowSourceBasis } from '../src/lib/growApi';

const evidence = (sourceBasis: GrowSourceBasis | null) => ({
  sourceBasis, kind: 'INTERNAL_MEASUREMENT', evidenceType: 'INTERNAL_MEASUREMENT',
  origin: 'CLIENT_INTERNAL', strength: 'STRONG',
}) as GrowEvidenceItem;

test('zero measured out of eight linked sources remains zero, even with legacy measurement labels', () => {
  const sources = [
    evidence('DECLARED'), evidence('DECLARED'), evidence('ESTIMATED'), evidence('DERIVED'),
    evidence('EXTERNAL'), evidence('EXTERNAL'), evidence(null), evidence('ESTIMATED'),
  ];
  const measured = sources.filter((item) => evidenceBasisCategory(item) === 'MEASURED_COMPANY').length;
  assert.equal(`${measured} / ${sources.length}`, '0 / 8');
  assert.equal(evidenceBasisCategory(evidence(null)), 'UNKNOWN_COMPANY');
  assert.equal(evidenceBasisCategory({ ...evidence('MEASURED'), origin: 'ONLINE_VERIFIED' }), 'RESEARCH');
  assert.equal(evidenceBasisCategory({ ...evidence('MEASURED'), origin: null }), 'UNKNOWN_COMPANY');
  const withMeasurement = [...sources, evidence('MEASURED')];
  assert.equal(`${withMeasurement.filter((item) => evidenceBasisCategory(item) === 'MEASURED_COMPANY').length} / ${withMeasurement.length}`, '1 / 9');
});

test('opportunity detail uses existing source basis counts and labels numerator/denominator truthfully', () => {
  const source = readFileSync(path.resolve(process.cwd(), 'src/components/clients/GrowJourney.tsx'), 'utf8');
  assert.match(source, /for \(const item of detail\?\.evidence \?\? \[\]\) counts\[evidenceBasisCategory\(item\)\] \+= 1/);
  const metric = source.slice(source.indexOf('data-testid="grow-measured-evidence-metric"'), source.indexOf('<ul className="mt-2 space-y-1.5 text-xs text-[#1b382b]">'));
  assert.match(metric, /\{evidenceCategoryCounts\.MEASURED_COMPANY\} \/ \{detail\.evidence\.length\}/);
  for (const category of ['DECLARED_COMPANY', 'ESTIMATED_COMPANY', 'DERIVED_COMPANY', 'RESEARCH', 'UNKNOWN_COMPANY']) {
    assert.match(metric, new RegExp(`evidenceCategoryCounts\\.${category}`));
  }
  assert.match(metric, /Ténylegesen elért eredmény ebből az arányból nem következik/);
  assert.match(metric, /Milyen bizonyíték hiányzik, és hogyan mérhető/);
  assert.match(metric, /Csak a ténylegesen kapcsolt, mért forrásalapú bizonyíték emeli ezt a számlálót/);
  assert.doesNotMatch(metric, /ROI|megtérülési százalék|bizonyossági pontszám/);
});
