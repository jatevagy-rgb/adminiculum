import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const source = readFileSync(path.resolve(process.cwd(), 'src/components/compliance-center/LegalSourceImpactPanel.tsx'), 'utf8');

test('legal impact opens an exact document version only after authorized case/client/version resolution', () => {
  const handler = source.slice(source.indexOf('const openVersion ='), source.indexOf('return ('));
  assert.match(handler, /const request = \+\+openRequest\.current/);
  assert.match(handler, /resolveComplianceDocumentUrl\(reference, true/);
  assert.match(handler, /document: getDocumentById, case: getCaseById, versions: getDocumentVersions/);
  assert.match(handler, /if \(request !== openRequest\.current\) return/);
  assert.match(handler, /if \(!url\) \{ setOpenError\(key\); return; \}/);
  assert.match(handler, /router\.push\(url\)/);
  assert.doesNotMatch(source, /href=\{`\/documents\/\$\{encodeURIComponent\(reference\.documentId\)/);
  assert.match(source, /disabled=\{openingReference ===/);
  assert.match(source, /role="alert"/);
});

test('the impact journey does not pretend a projection timestamp is watcher freshness or legal certainty', () => {
  assert.match(source, /Vizsgálati útvonal: jogforrás → érintett követelmény és ügyfél → pontos bizonyíték vagy dokumentumverzió → emberi hatásvizsgálat/);
  assert.match(source, /formatProjectionTime\(impact\.generatedAt\)/);
  assert.match(source, /A külső figyelő utolsó frissítése ebből nem állapítható meg/);
  assert.match(source, /nem állít automatikus meg nem felelést/);
  assert.match(source, /impact\.clients\.find\(\(client\) => client\.clientId === clientControl\.clientId\)\?\.clientName \|\| "Ügyfél neve nincs a kimutatásban"/);
  assert.doesNotMatch(source, /<DataTableCell muted>\{clientControl\.clientId\}<\/DataTableCell>/);
});
