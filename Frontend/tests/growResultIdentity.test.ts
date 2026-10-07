import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { formatGrowCompletion } from '../src/lib/growResultIdentity';

test('completion time is stable in the stated customer timezone and invalid values stay unknown', () => {
  assert.match(formatGrowCompletion('2026-10-07T10:11:12Z'), /12:11:12/);
  assert.match(formatGrowCompletion('2026-01-07T10:11:12Z'), /11:11:12/);
  assert.equal(formatGrowCompletion('invalid'), 'Befejezés ideje nem ismert');
});

test('all customer Grow result headers show type, branch/process, version and exact completion time without internal IDs', () => {
  const adaptive = readFileSync(path.resolve(process.cwd(), 'src/components/client-portal/GrowAdaptiveJourney.tsx'), 'utf8');
  const portal = readFileSync(path.resolve(process.cwd(), 'src/components/client-portal/OrgGrowView.tsx'), 'utf8');
  const portalV3 = readFileSync(path.resolve(process.cwd(), 'src/components/client-portal-v3/grow/PortalGrowV3.tsx'), 'utf8');
  assert.match(adaptive, /data-testid="grow-v2-result-identity"/);
  assert.match(adaptive, /Felmérés: \{result\.titleHu\}.*Kérdéssor v\{result\.packVersion\}/);
  assert.match(adaptive, /Téma vagy folyamat: \{processName \|\| result\.titleHu\}/);
  assert.match(adaptive, /<time dateTime=\{result\.completedAt\}>\{formatGrowCompletion\(result\.completedAt\)\}<\/time>/);
  assert.match(portal, /data-testid="grow-assessment-result-identity"/);
  assert.match(portal, /Felmérés: \{assessmentResult\.titleHu\}.*Kérdéssor v\{assessmentResult\.packVersion\}/);
  assert.match(portal, /Folyamat: \{assessmentResultScope\.processName\}/);
  assert.match(portal, /<time dateTime=\{assessmentResult\.completedAt\}>\{formatGrowCompletion\(assessmentResult\.completedAt\)\}<\/time>/);
  assert.match(portalV3, /data-testid="grow-assessment-result-identity"/);
  assert.match(portalV3, /Kérdéssor v\{assessmentResult\.packVersion\}/);
  assert.match(portalV3, /<time dateTime=\{assessmentResult\.completedAt\}>\{formatGrowCompletion\(assessmentResult\.completedAt\)\}<\/time>/);
  for (const source of [adaptive, portal, portalV3]) {
    assert.doesNotMatch(source, /Eredményazonosító:|runId\}|researchRunId\}/);
  }
});
