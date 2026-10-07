import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { resolveComplianceDocumentUrl } from '../src/lib/complianceDocumentNavigation';

const member = {
  clientId: 'client-a', clientName: 'Client A', documentId: 'doc-a',
  documentVersionId: 'version-v2', version: 2, isCurrent: false,
};
const reads = {
  document: async () => ({ id: 'doc-a', caseId: 'case-a' }),
  case: async () => ({ id: 'case-a', clientId: 'client-a' }),
  versions: async () => ({ documentId: 'doc-a', versions: [
    { id: 'version-v1', documentId: 'doc-a', versionNumber: 1 },
    { id: 'version-v2', documentId: 'doc-a', versionNumber: 2 },
  ] }),
};

test('workforce inventory opens the authorized exact historical version', async () => {
  assert.equal(await resolveComplianceDocumentUrl(member, true, reads),
    '/cases/case-a/documents?documentId=doc-a&versionId=version-v2');
});

test('document action reaches the current-version route without guessing another version', async () => {
  let versionReads = 0;
  assert.equal(await resolveComplianceDocumentUrl(member, false, {
    ...reads, versions: async () => { versionReads++; throw new Error('must not fetch a version for the current route'); },
  }), '/cases/case-a/documents?documentId=doc-a');
  assert.equal(versionReads, 0);
});

test('unrelated document, case, client and version can never produce a navigable URL', async () => {
  assert.equal(await resolveComplianceDocumentUrl(member, true, { ...reads, document: async () => ({ id: 'doc-b', caseId: 'case-a' }) }), null);
  assert.equal(await resolveComplianceDocumentUrl(member, true, { ...reads, case: async () => ({ id: 'case-b', clientId: 'client-a' }) }), null);
  assert.equal(await resolveComplianceDocumentUrl(member, true, { ...reads, case: async () => ({ id: 'case-a', clientId: 'client-b' }) }), null);
  assert.equal(await resolveComplianceDocumentUrl(member, true, { ...reads, versions: async () => ({ documentId: 'doc-a', versions: [
    { id: 'version-v2', documentId: 'doc-b', versionNumber: 2 },
  ] }) }), null);
  assert.equal(await resolveComplianceDocumentUrl(member, true, { ...reads, versions: async () => ({ documentId: 'doc-a', versions: [
    { id: 'version-v2', documentId: 'doc-a', versionNumber: 3 },
  ] }) }), null);
  assert.equal(await resolveComplianceDocumentUrl(member, true, { ...reads, versions: async () => ({ documentId: 'doc-b', versions: [
    { id: 'version-v2', documentId: 'doc-a', versionNumber: 2 },
  ] }) }), null);
});

test('denied reads do not fall back to a different client or document', async () => {
  await assert.rejects(resolveComplianceDocumentUrl(member, true, {
    ...reads, document: async () => { throw new Error('403 denied'); },
  }), /403 denied/);
  assert.equal(await resolveComplianceDocumentUrl(member, true, { ...reads, document: async () => null }), null);
});

test('inventory action navigates only after authorized resolution and rejects late selection', () => {
  const source = readFileSync(path.resolve(process.cwd(), 'src/components/compliance-center/ComplianceCenter.tsx'), 'utf8');
  const handler = source.slice(source.indexOf('const openMember ='), source.indexOf('const selectedSource ='));
  assert.match(handler, /const request = \+\+openRequest\.current/);
  assert.match(handler, /resolveComplianceDocumentUrl\(member, exactVersion/);
  assert.match(handler, /document: getDocumentById/);
  assert.match(handler, /case: getCaseById/);
  assert.match(handler, /versions: getDocumentVersions/);
  assert.match(handler, /if \(request !== openRequest\.current\) return/);
  assert.match(handler, /if \(!url\) \{[\s\S]*?return;[\s\S]*?\}[\s\S]*?router\.push\(url\)/);
  assert.match(source, /role="alert"/);
  assert.match(source, /aria-label=\{`Pontos v\$\{member\.version\} verzió megnyitása:/);
  assert.match(source, /aria-label=\{`Dokumentum megnyitása:/);
  assert.doesNotMatch(source, /\/documents\/\$\{member\.documentId\}/);
});
