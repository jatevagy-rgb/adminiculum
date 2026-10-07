import { readFileSync } from 'node:fs';
import path from 'node:path';

describe('read-only compliance portfolio date truth', () => {
  it('never treats a finding creation date as its due date', () => {
    const source = readFileSync(path.join(process.cwd(), 'src/modules/compliance/complianceCenterService.ts'), 'utf8');
    const section = source.slice(source.indexOf('const reviewWork: OfficeReviewWorkItem[]'), source.indexOf('const clientList ='));
    expect(section).toMatch(/\.\.\.findings\.map\(\(finding\) => \(\{[\s\S]*?dueAt: null/);
    expect(section).not.toContain('finding.createdAt');
    expect(section).toMatch(/\.\.\.staleEvidence\.map\(\(evidence\) => \(\{[\s\S]*?dueAt: evidence\.validUntil/);
    expect(section).toMatch(/\.\.\.controlsDue\.map\(\(control\) => \(\{[\s\S]*?dueAt: control\.nextReviewAt/);
  });
});
