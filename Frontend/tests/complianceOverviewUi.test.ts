import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8');

describe('7C-A compliance overview foundation (structural)', () => {
  const component = () => read('src/components/clients/compliance/ComplianceOverview.tsx');

  it('exposes the requested reusable presentation components', () => {
    const src = component();
    for (const name of ['ComplianceOverviewPanel', 'ComplianceAttentionSummary', 'ComplianceRequirementGroup', 'ComplianceFindingRow', 'ComplianceState']) {
      assert.match(src, new RegExp(`export function ${name}`));
    }
  });

  it('keeps pre-corpus authority framing and wording explicit', () => {
    const src = component();
    assert.match(src, /Belső értékelési megállapítások; nem igazolt jogi kötelezettségek/);
    assert.match(src, /Belső értékelés szerint releváns/);
    assert.doesNotMatch(src, /cikk|joghatóság|jurisdiction|citation|sourceVersion|reviewStatus/i);
  });

  it('keeps empty and unavailable states distinct', () => {
    const src = component();
    assert.match(src, /state === "empty"/);
    assert.match(src, /state="unavailable"/);
    assert.match(src, /role="alert"/);
    assert.match(src, /Nincs megjeleníthető belső értékelési megállapítás/);
  });

  it('groups by requirement while retaining independent scope rows', () => {
    const src = component();
    assert.match(src, /requirementKey/);
    assert.match(src, /scopeType/);
    assert.match(src, /subjectLabel/);
    assert.match(src, /külön vizsgált hatókör/);
    assert.doesNotMatch(src, /factSubjectId/);
  });

  it('does not let DOES_NOT_APPLY dominate attention', () => {
    const src = component();
    assert.match(src, /getComplianceAttentionFindings/);
    assert.match(src, /getComplianceFindingStatus\(finding\) !== "DOES_NOT_APPLY"/);
    assert.match(src, /Nem releváns/);
    assert.match(src, /text-\[var\(--adm-text-muted\)\]/);
  });

  it('keeps the read-only overview separate from the 7B proposal surface', () => {
    const src = component();
    assert.match(src, /ComplianceProposalPanel/);
    assert.match(src, /Megerősítés/);
  });

  it('is registered and used by both company-level surfaces', () => {
    assert.equal(existsSync(path.join(root, 'src/components/clients/compliance/ComplianceOverview.tsx')), true);
    assert.match(read('src/components/clients/ClientCompanyWorkspace.tsx'), /ComplianceOverviewPanel/);
    assert.match(read('src/components/clients/ClientCompanyFoundation.tsx'), /ComplianceOverviewPanel/);
  });
});
