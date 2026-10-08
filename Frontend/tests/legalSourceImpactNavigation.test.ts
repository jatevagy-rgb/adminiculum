import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createRaceHarness, deferred, flatten, settle } from './helpers/asyncRaceHarness';

const source = readFileSync(path.resolve(process.cwd(), 'src/components/compliance-center/LegalSourceImpactPanel.tsx'), 'utf8');

test('legal impact opens an exact document version only after authorized case/client/version resolution', () => {
  const handlerStart = source.indexOf('const openVersion =');
  const handler = source.slice(handlerStart, source.indexOf('\n  return (', handlerStart));
  assert.match(handler, /const request = \+\+openRequest\.current/);
  assert.match(handler, /resolveComplianceDocumentUrl\(reference, true/);
  assert.match(handler, /document: getDocumentById, case: getCaseById, versions: getDocumentVersions/);
  assert.match(handler, /if \(request !== openRequest\.current\) return/);
  assert.match(source, /return \(\) => \{ openRequest\.current \+= 1; \}/);
  assert.match(handler, /if \(!url\) \{ setOpenError\(key\); return; \}/);
  assert.match(handler, /router\.push\(url\)/);
  assert.doesNotMatch(source, /href=\{`\/documents\/\$\{encodeURIComponent\(reference\.documentId\)/);
  assert.match(source, /disabled=\{openingReference ===/);
  assert.match(source, /role="alert"/);
});

const impact = (versionId: string) => ({
  generatedAt: '2026-10-07T12:00:00Z', subject: null, review: { reviewRequired: false },
  documentReferenceImpact: { references: [{ documentId: 'doc', documentVersionId: versionId, version: 2,
    documentName: 'Dokumentum', clientId: 'client', clientName: 'Ügyfél', clauseRef: 'A', clauseTitle: null, isCurrent: false }] },
  requirementImpact: { derivable: false, citations: [] },
  controlImpact: { derivable: false, controlDefinitions: [], clientControls: [] },
  applicabilityImpact: { applicabilities: [] }, clients: [],
});

test('unmount and source switch invalidate an in-flight exact-version navigation', async () => {
  const pushes: string[] = [];
  const pending = [deferred<string>(), deferred<string>(), deferred<string>()];
  let reads = 0;
  const harness = () => createRaceHarness('src/components/compliance-center/LegalSourceImpactPanel.tsx', 'LegalSourceImpactView', {
    'next/link': { default: 'a' },
    'next/navigation': { useRouter: () => ({ push: (url: string) => pushes.push(url) }) },
    '@/lib/api': { getCaseById() {}, getDocumentById() {}, getDocumentVersions() {} },
    '@/lib/complianceDocumentNavigation': { resolveComplianceDocumentUrl: () => pending[reads++].promise },
    '@/lib/complianceIntelligenceApi': { complianceIntelligenceApi: {} },
    '@/components/ui': { DataTable: 'table', DataTableBody: 'tbody', DataTableCell: 'td', DataTableHead: 'thead', DataTableHeaderCell: 'th', DataTableRow: 'tr' },
    '@/components/adminiculum/ui': { AdminBadge: 'span', AdminButton: 'button', AdminSectionHeader: 'header' },
    '@/components/adminiculum/OperationalPrimitives': { SafePanelError: 'div' },
  });
  const click = (h: ReturnType<typeof harness>, projection: ReturnType<typeof impact>) => {
    const tree = h.render({ impact: projection });
    h.effects();
    const button = flatten(tree).find((node) => node.type === 'button' && node.props?.['aria-label']?.includes('pontos v2'));
    assert.ok(button);
    button.props.onClick();
  };

  const unmounted = harness();
  click(unmounted, impact('v1'));
  unmounted.unmount();
  pending[0].resolve('/cases/case/documents?documentId=doc&versionId=v1');
  await settle();
  assert.deepEqual(pushes, []);

  const switched = harness();
  click(switched, impact('v2'));
  switched.render({ impact: impact('v3') }); switched.effects();
  pending[1].resolve('/cases/case/documents?documentId=doc&versionId=v2');
  await settle();
  assert.deepEqual(pushes, []);
  click(switched, impact('v3'));
  pending[2].resolve('/cases/case/documents?documentId=doc&versionId=v3');
  await settle();
  assert.deepEqual(pushes, ['/cases/case/documents?documentId=doc&versionId=v3']);
});

test('the impact journey does not pretend a projection timestamp is watcher freshness or legal certainty', () => {
  assert.match(source, /Vizsgálati útvonal: jogforrás → érintett követelmény és ügyfél → pontos bizonyíték vagy dokumentumverzió → emberi hatásvizsgálat/);
  assert.match(source, /formatProjectionTime\(impact\.generatedAt\)/);
  assert.match(source, /A külső figyelő utolsó frissítése ebből nem állapítható meg/);
  assert.match(source, /nem állít automatikus meg nem felelést/);
  assert.match(source, /impact\.clients\.find\(\(client\) => client\.clientId === clientControl\.clientId\)\?\.clientName \|\| "Ügyfél neve nincs a kimutatásban"/);
  assert.doesNotMatch(source, /<DataTableCell muted>\{clientControl\.clientId\}<\/DataTableCell>/);
});
