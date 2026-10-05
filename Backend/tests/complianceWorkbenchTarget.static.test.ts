import { readFileSync } from 'node:fs';

const source = readFileSync('src/modules/compliance/complianceWorkbenchService.ts', 'utf8');

describe('Compliance workbench missing-fact presentation contract', () => {
  it('provides explicit applicability and fact identity and never falls back to factKey for the title', () => {
    expect(source).toContain("target: { applicabilityId: area.applicabilityId, factKey: fact.factKey }");
    expect(source).toContain("fact.label || 'További vállalati adat szükséges'");
    expect(source).not.toContain('fact.label || fact.factKey');
  });
});
