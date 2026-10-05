import fs from 'node:fs';
import path from 'node:path';

const backendRoot = path.resolve(__dirname, '..');
const script = fs.readFileSync(path.join(backendRoot, 'scripts/demo-kft-reset.mjs'), 'utf8');

// Section 13 (document metadata + versions) sits between the section comments.
const sectionStart = script.indexOf('// 13. Document metadata');
const sectionEnd = script.indexOf('// 14. Review + round + review point.');
const section = script.slice(sectionStart, sectionEnd);

describe('Demo Kft version-integrity invariant (UX-06)', () => {
  it('contains the document metadata + version section', () => {
    expect(sectionStart).toBeGreaterThanOrEqual(0);
    expect(sectionEnd).toBeGreaterThan(sectionStart);
  });

  it('synchronizes parent current-version metadata with the canonical v2', () => {
    expect(section).toContain('currentVersion: 2');
    expect(section).toContain('currentVersionInt: 2');
    expect(section).toContain("version: '2'");
  });

  it('marks version 2 canonical (isCurrent) and version 1 historical', () => {
    expect(section).toContain('version: 2');
    expect(section).toContain('isCurrent: true');
    expect(section).toContain('version: 1');
    expect(section).toContain('isCurrent: false');
  });
});
