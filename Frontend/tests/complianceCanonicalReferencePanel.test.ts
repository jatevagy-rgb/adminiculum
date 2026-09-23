import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { componentHarness, flatten, textOf, tick } from './helpers/componentHarness';

/**
 * C4A — internal canonical legal reference presentation.
 *
 * A row anchored through a canonical hyperlink target exposes the derived
 * `canonicalReference` on the INTERNAL panel as "Figyelési azonosító", and its
 * unresolved C3A state is NOT described as a malformed CELEX identifier. The raw
 * parser key (`LEGAL|REF=...`) and the implementation CELEX code are internal
 * machine identity and are not rendered; CELEX rows keep their readable source
 * presentation. Nothing about the canonical reference may appear on a customer
 * portal surface.
 */

const frontendRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const srcRoot = path.join(frontendRoot, 'src');

const tvRow = {
  id: 'row-tv',
  documentVersionId: 'version-1',
  clauseRef: '5.2.',
  clauseTitle: 'Eker. tv. 5. § (2) b)',
  clauseStableId: 'cl_tv',
  relationType: 'MANDATORY_BASIS',
  anchorType: 'LEGAL',
  anchorDisplay: 'Eker. tv. 5. § (2) b) pont',
  anchorStableId: null,
  anchorKey: 'LEGAL|REF=TV/2001/108/5/2/b',
  canonicalReference: 'TV/2001/108/5/2/b',
  eli: null,
  celex: null,
  locator: '5/2/b',
  ecli: null,
  caseId: null,
  caseLocator: null,
  decisionId: null,
  authorityLocator: null,
  sourceUrl: null,
  rationale: 'Az Eker. tv. hivatkozott rendelkezese.',
  ingestWarnings: [],
  rowDigest: 'b'.repeat(64),
  ingestedAt: '2026-09-16T06:00:00.000Z',
  legalSourceBindingStatus: 'UNRESOLVED',
  bindingReason: 'NO_CELEX',
};

const celexRow = {
  ...tvRow,
  id: 'row-celex',
  clauseRef: '1.1.',
  clauseTitle: 'Clause 1.1.',
  clauseStableId: 'cl_aa86615708d5',
  anchorType: 'LEGAL',
  anchorDisplay: 'GDPR 28. cikk (3)',
  anchorStableId: 'la_baa4796f2169',
  anchorKey: 'LEGAL|SID=la_baa4796f2169',
  canonicalReference: null,
  eli: 'http://data.europa.eu/eli/reg/2016/679/oj',
  celex: '32016R0679',
  locator: 'art=28;par=3',
  legalSourceBindingStatus: 'RESOLVED',
  canonicalCitation: 'CELEX 32016R0679',
  canonicalTitle: 'GDPR',
  bindingOrigin: 'READ_TIME_EXACT_CELEX',
  bindingReason: 'EXACT_CELEX_MATCH:32016R0679',
};

function harness(model: any) {
  return componentHarness('src/components/clients/compliance/ComplianceClauseAnchorPanel.tsx', 'ComplianceClauseAnchorPanel', {
    '@/lib/complianceIntelligenceApi': {
      complianceIntelligenceApi: { clauseAnchors: async () => model },
    },
  });
}

async function mount(model: any) {
  const h = harness(model);
  const props = { clientId: 'client-1', documentId: 'document-1' };
  h.render(props);
  h.effects();
  await tick();
  await tick();
  h.render(props);
  h.effects();
  return h;
}

const model = {
  documentId: 'document-1',
  versions: [{ documentVersionId: 'version-1', version: 1, isCurrent: true, rows: [tvRow, celexRow] }],
};

test('C4A: shows the canonical reference as Figyelési azonosító for a hyperlink-anchored row', async () => {
  const h = await mount(model);
  const tree = h.render({ clientId: 'client-1', documentId: 'document-1' });
  const text = textOf(tree);
  assert.match(text, /Figyelési azonosító/);
  assert.match(text, /TV\/2001\/108\/5\/2\/b/);
  // The raw parser key is internal identity: kept in the read model, never rendered.
  assert.doesNotMatch(text, /LEGAL\|REF=TV\/2001\/108\/5\/2\/b/);
});

test('C4A: does not present a TV reference as a malformed CELEX identifier', async () => {
  const h = await mount(model);
  const tree = h.render({ clientId: 'client-1', documentId: 'document-1' });
  const text = textOf(tree);
  assert.doesNotMatch(text, /nincs CELEX azonosító/);
  assert.match(text, /TV-hivatkozás; C3A CELEX-kötés nem alkalmazható/);
});

test('C4A: CELEX row presentation is unchanged', async () => {
  const h = await mount(model);
  const tree = h.render({ clientId: 'client-1', documentId: 'document-1' });
  const text = textOf(tree);
  assert.match(text, /32016R0679/);
  assert.match(text, /GDPR/);
  assert.match(text, /CELEX egyezés, nem tárolt/);
  // The CELEX row carries no canonical reference label of its own.
  const tvLabelCount = (text.match(/Figyelési azonosító/g) ?? []).length;
  assert.equal(tvLabelCount, 1);
});

test('C4A: an empty anchor-key row is still reported as unresolved', async () => {
  const h = await mount({
    documentId: 'document-1',
    versions: [
      {
        documentVersionId: 'version-1',
        version: 1,
        isCurrent: true,
        rows: [{ ...tvRow, anchorKey: null, canonicalReference: null, ingestWarnings: ['ANCHOR_KEY_UNRESOLVED'] }],
      },
    ],
  });
  const tree = h.render({ clientId: 'client-1', documentId: 'document-1' });
  const unresolved = flatten(tree).find((node: any) => node.props?.['data-testid'] === 'anchor-key-unresolved');
  assert.ok(unresolved, 'unresolved anchor-key state must stay visible');
  assert.match(textOf(tree), /Nincs stabil hivatkozás-azonosító/);
});

test('C4A: no canonical legal reference leaks into a customer portal surface', () => {
  const portalRoot = path.join(srcRoot, 'components', 'client-portal');
  const portalApp = path.join(srcRoot, 'app', 'portal');
  const files: string[] = [];
  const walk = (dir: string) => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry);
      try {
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.(ts|tsx)$/.test(entry)) files.push(full);
      } catch {
        /* ignore */
      }
    }
  };
  walk(portalRoot);
  walk(portalApp);
  assert.ok(files.length > 0, 'portal surfaces must exist');
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /canonicalReference/, `${file} must not expose canonicalReference`);
    assert.doesNotMatch(source, /ref\.adminiculum\.hu/, `${file} must not expose the machine transport host`);
  }
});
