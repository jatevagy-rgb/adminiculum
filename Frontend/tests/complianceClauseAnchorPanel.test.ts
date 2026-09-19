import { test } from 'node:test';
import assert from 'node:assert/strict';
import { componentHarness, flatten, textOf, tick } from './helpers/componentHarness';

/**
 * CDI-1 internal compliance workspace — structured legal matrix panel.
 *
 * The panel is a READ-ONLY internal projection of document-authored machine
 * provenance. These tests pin: the fields an internal lawyer needs, the four
 * filters, per-version provenance, truthful links only, honest empty states, and
 * the absence of any legal conclusion or AI wording.
 */

const change = (node: any, value: string) => node.props.onChange({ target: { value } });
const toggle = (node: any, checked: boolean) => node.props.onChange({ target: { checked } });

const baseRow = (overrides: any = {}) => ({
  id: 'row-1',
  documentVersionId: 'version-1',
  clauseRef: '1.1.',
  clauseTitle: 'Clause 1.1.',
  clauseStableId: 'cl_aa86615708d5',
  relationType: 'MANDATORY_BASIS',
  anchorType: 'LEGAL',
  anchorDisplay: 'GDPR 28. cikk (3)',
  anchorStableId: 'la_baa4796f2169',
  anchorKey: 'LEGAL|SID=la_baa4796f2169',
  eli: 'http://data.europa.eu/eli/reg/2016/679/oj',
  celex: '32016R0679',
  locator: 'art=28;par=3',
  ecli: null,
  caseId: null,
  caseLocator: null,
  decisionId: null,
  authorityLocator: null,
  sourceUrl: null,
  rationale: 'A szerzodeses pont es a jogszabalyi hely kapcsolata.',
  ingestWarnings: [],
  rowDigest: 'a'.repeat(64),
  ingestedAt: '2026-09-16T06:00:00.000Z',
  ...overrides,
});

const caseRow = baseRow({
  id: 'row-2',
  clauseRef: '1.2.',
  clauseTitle: null,
  relationType: 'INTERPRETATION',
  anchorType: 'CASE',
  anchorDisplay: 'C-683/21',
  anchorStableId: 'ca_760eedf30941',
  anchorKey: 'CASE|SID=ca_760eedf30941',
  eli: null,
  celex: null,
  locator: null,
  ecli: 'EU:C:2023:949',
  caseId: 'C-683/21',
  caseLocator: 'paras=41-45',
  rationale: null,
});

const authorityRow = baseRow({
  id: 'row-3',
  clauseRef: '2.1.',
  clauseTitle: null,
  relationType: 'ENFORCEMENT_BENCHMARK',
  anchorType: 'AUTHORITY',
  anchorDisplay: 'NAIH-19-18/2024',
  anchorStableId: 'aa_cc9e2556d71f',
  anchorKey: null,
  eli: null,
  celex: null,
  locator: null,
  decisionId: 'NAIH-19-18/2024',
  authorityLocator: 'paras=217-241',
  sourceUrl: 'https://naih.hu/hatarozatok-vegzesek?download=1427',
  rationale: 'A hatosagi dontes indokolasa.',
  ingestWarnings: ['ANCHOR_KEY_UNRESOLVED', 'RELATION_TYPE_SOURCE_LABEL:NAIH'],
});

function harness(model: any, fail = false) {
  return componentHarness('src/components/clients/compliance/ComplianceClauseAnchorPanel.tsx', 'ComplianceClauseAnchorPanel', {
    '@/lib/complianceIntelligenceApi': {
      complianceIntelligenceApi: {
        clauseAnchors: async () => {
          if (fail) throw new Error('unavailable');
          return model;
        },
      },
    },
  });
}

async function mount(model: any, fail = false) {
  const h = harness(model, fail);
  const props = { clientId: 'client-1', documentId: 'document-1' };
  h.render(props);
  h.effects();
  await tick();
  await tick();
  h.render(props);
  h.effects();
  return h;
}

const rerender = (h: any) => h.render({ clientId: 'client-1', documentId: 'document-1' });
const byTestId = (tree: any, id: string) => flatten(tree).find((node) => node.props?.['data-testid'] === id);
const rows = (tree: any) => flatten(tree).filter((node) => node.props?.['data-testid'] === 'clause-anchor-row');
const selectWithOption = (tree: any, value: string) =>
  flatten(tree).find((node) => node.type === 'select' && flatten(node).some((child) => child.type === 'option' && child.props?.value === value));
const clauseInput = (tree: any) => flatten(tree).find((node) => node.type === 'input' && node.props?.placeholder);
const unresolvedCheckbox = (tree: any) => flatten(tree).find((node) => node.type === 'input' && node.props?.type === 'checkbox');

const canonicalRefRow = baseRow({
  id: 'row-ref',
  clauseRef: '10.1.',
  clauseTitle: 'Adatfeldolgozasi megallapodas',
  relationType: 'MANDATORY_BASIS',
  anchorType: 'LEGAL',
  anchorDisplay: 'Figyelesi hivatkozas',
  anchorStableId: 'la_tv_2013_5_6_59_2',
  anchorKey: 'LEGAL|REF=TV/2013/5/6:59/2',
  canonicalReference: 'TV/2013/5/6:59/2',
  eli: null,
  celex: null,
  locator: null,
  rationale: null,
});

const LEGAL_ONLY = { documentId: 'document-1', versions: [{ documentVersionId: 'version-1', version: 1, isCurrent: true, rows: [baseRow()] }] };

test('renders each relation with clause, relation type, anchor type and machine metadata', async () => {
  const h = await mount({ documentId: 'document-1', versions: [{ documentVersionId: 'version-1', version: 1, isCurrent: true, rows: [baseRow(), caseRow] }] });
  const tree = rerender(h);
  const text = textOf(tree);

  assert.equal(rows(tree).length, 2);
  assert.match(text, /1\.1\./);
  assert.match(text, /MANDATORY_BASIS/);
  assert.match(text, /INTERPRETATION/);
  assert.match(text, /GDPR 28\. cikk \(3\)/);
  assert.match(text, /http:\/\/data\.europa\.eu\/eli\/reg\/2016\/679\/oj/);
  assert.match(text, /32016R0679/);
  assert.match(text, /art=28;par=3/);
  assert.match(text, /EU:C:2023:949/);
  assert.match(text, /paras=41-45/);
  assert.match(text, /LEGAL\|SID=la_baa4796f2169/);
  assert.match(text, /A szerzodeses pont es a jogszabalyi hely kapcsolata\./);
  // Anchor source kinds are labelled truthfully.
  assert.match(text, /Jogszabály/);
  assert.match(text, /Bírósági döntés/);
});

test('shows DocumentVersion provenance and lets an older version be inspected', async () => {
  const h = await mount({
    documentId: 'document-1',
    versions: [
      { documentVersionId: 'version-2', version: 2, isCurrent: true, rows: [baseRow({ id: 'a', documentVersionId: 'version-2' })] },
      { documentVersionId: 'version-1', version: 1, isCurrent: false, rows: [baseRow({ id: 'b', documentVersionId: 'version-1' }), { ...caseRow, id: 'c', documentVersionId: 'version-1' }] },
    ],
  });
  let tree = rerender(h);
  // The current version with provenance is the default.
  assert.match(textOf(byTestId(tree, 'clause-anchor-counts')), /Megjelenítve: 1 \/ 1 tétel/);
  assert.match(textOf(tree), /v2 · 1 tétel · aktuális/);

  change(selectWithOption(tree, 'version-1'), 'version-1');
  tree = rerender(h);
  assert.match(textOf(byTestId(tree, 'clause-anchor-counts')), /Megjelenítve: 2 \/ 2 tétel/);
  assert.equal(rows(tree).length, 2);
  // The immutability statement is present for the internal reader.
  assert.match(textOf(tree), /nem íródnak át/);
});

test('filters by clause text, relation type, anchor type and unresolved state', async () => {
  const h = await mount({ documentId: 'document-1', versions: [{ documentVersionId: 'version-1', version: 1, isCurrent: true, rows: [baseRow(), caseRow, authorityRow] }] });
  let tree = rerender(h);
  assert.equal(rows(tree).length, 3);
  assert.match(textOf(byTestId(tree, 'clause-anchor-counts')), /Megjelenítve: 3 \/ 3 tétel · Azonosító nélkül: 1 · Feldolgozási jelzéssel: 1/);

  change(clauseInput(tree), '1.2');
  tree = rerender(h);
  assert.equal(rows(tree).length, 1);
  assert.match(textOf(tree), /C-683\/21/);

  change(clauseInput(tree), '');
  change(selectWithOption(tree, 'MANDATORY_BASIS'), 'MANDATORY_BASIS');
  tree = rerender(h);
  assert.equal(rows(tree).length, 1);
  assert.match(textOf(tree), /GDPR 28\. cikk \(3\)/);

  change(selectWithOption(tree, 'MANDATORY_BASIS'), '');
  change(selectWithOption(tree, 'AUTHORITY'), 'AUTHORITY');
  tree = rerender(h);
  assert.equal(rows(tree).length, 1);
  assert.match(textOf(tree), /NAIH-19-18\/2024/);

  change(selectWithOption(tree, 'AUTHORITY'), '');
  toggle(unresolvedCheckbox(tree), true);
  tree = rerender(h);
  assert.equal(rows(tree).length, 1);
  assert.match(textOf(byTestId(tree, 'clause-anchor-counts')), /Megjelenítve: 1 \/ 3 tétel/);
  // A row without a stable identity is reported as an internal state, not hidden.
  assert.ok(byTestId(tree, 'anchor-key-unresolved'));
  assert.match(textOf(byTestId(tree, 'anchor-key-unresolved')), /Nincs stabil hivatkozás-azonosító/);

  toggle(unresolvedCheckbox(rerender(h)), false);
  tree = rerender(h);
  assert.equal(rows(tree).length, 3);
});

test('links only absolute http values and never fabricates a source link', async () => {
  const h = await mount({
    documentId: 'document-1',
    versions: [
      {
        documentVersionId: 'version-1',
        version: 1,
        isCurrent: true,
        rows: [
          baseRow(),
          caseRow,
          authorityRow,
          // A machine identifier that is NOT a URL must never become a link.
          baseRow({ id: 'row-4', clauseRef: '3.1.', eli: 'ELI-HIVATKOZAS-NEM-URL', sourceUrl: 'nem-url-forras' }),
        ],
      },
    ],
  });
  const tree = rerender(h);
  const hrefs = flatten(tree).filter((node) => node.type === 'a').map((node) => node.props.href);

  assert.deepEqual(
    [...hrefs].sort(),
    ['http://data.europa.eu/eli/reg/2016/679/oj', 'https://naih.hu/hatarozatok-vegzesek?download=1427'].sort(),
  );
  // No URL is synthesised from CELEX / ECLI / decision identifiers.
  for (const href of hrefs) {
    assert.ok(!href.includes('32016R0679'), 'CELEX must not be turned into a URL');
    assert.ok(!href.includes('EU:C:2023:949'), 'ECLI must not be turned into a URL');
    assert.ok(!href.includes('NAIH-19-18/2024'), 'decision id must not be turned into a URL');
  }
  // The non-URL values are still shown, as text.
  const text = textOf(tree);
  assert.match(text, /ELI-HIVATKOZAS-NEM-URL/);
  assert.match(text, /nem-url-forras/);
});

test('surfaces internal processing warnings and an honest empty state', async () => {
  const h = await mount({ documentId: 'document-1', versions: [{ documentVersionId: 'version-1', version: 1, isCurrent: true, rows: [authorityRow] }] });
  const tree = rerender(h);
  const warnings = byTestId(tree, 'clause-anchor-warnings');
  assert.ok(warnings, 'internal warnings must be visible to the internal reader');
  assert.match(textOf(warnings), /ANCHOR_KEY_UNRESOLVED/);
  assert.match(textOf(warnings), /RELATION_TYPE_SOURCE_LABEL:NAIH/);

  const empty = await mount({ documentId: 'document-1', versions: [] });
  const emptyTree = rerender(empty);
  assert.ok(byTestId(emptyTree, 'clause-anchor-empty'));
  assert.match(textOf(emptyTree), /nincs kinyert jogi hivatkozás-mátrix/i);
  assert.match(textOf(emptyTree), /csak szövegként megadott hivatkozásokat tartalmazó dokumentumokból nem készül mátrix/i);
});

test('reports a bounded load failure with a retry affordance', async () => {
  const h = await mount(null, true);
  const tree = rerender(h);
  const alert = flatten(tree).find((node) => node.props?.role === 'alert');
  assert.ok(alert, 'a load failure must be reported honestly');
  assert.match(textOf(alert), /jelenleg nem tölthető be/);
  assert.ok(flatten(alert).find((node) => node.type === 'button' && textOf(node).includes('Újrapróbálás')));
});

test('surfaces the canonical source binding truthfully, or says it is unresolved', async () => {
  const h = await mount({
    documentId: 'document-1',
    versions: [
      {
        documentVersionId: 'version-1',
        version: 1,
        isCurrent: true,
        rows: [
          baseRow({
            id: 'bind-1',
            clauseRef: '4.1.',
            legalSourceBindingStatus: 'RESOLVED',
            canonicalLegalSourceVersionId: 'canonical-version-1',
            canonicalCitation: 'Regulation (EU) 2016/679',
            canonicalTitle: 'GDPR',
            bindingOrigin: 'PERSISTED_AT_INGEST',
            bindingReason: 'PERSISTED_BINDING',
          }),
          baseRow({
            id: 'bind-2',
            clauseRef: '4.2.',
            celex: '32019R1234',
            eli: null,
            legalSourceBindingStatus: 'RESOLVED',
            canonicalLegalSourceVersionId: 'canonical-version-2',
            canonicalCitation: null,
            canonicalTitle: null,
            bindingOrigin: 'READ_TIME_EXACT_CELEX',
            bindingReason: 'EXACT_CELEX_MATCH:32019R1234',
          }),
          baseRow({
            id: 'bind-3',
            clauseRef: '4.3.',
            anchorKey: null,
            legalSourceBindingStatus: 'UNRESOLVED',
            bindingReason: 'AMBIGUOUS_BINDABLE_VERSION',
          }),
          baseRow({
            id: 'bind-4',
            clauseRef: '4.4.',
            celex: null,
            eli: null,
            legalSourceBindingStatus: 'UNRESOLVED',
            bindingReason: 'NO_CELEX',
          }),
        ],
      },
    ],
  });
  const tree = rerender(h);
  const text = textOf(tree);
  const compact = text.replace(/\s+/g, ' ');
  const bindings = flatten(tree).filter((node) => node.props?.['data-testid'] === 'clause-anchor-binding');

  // A resolved binding shows the canonical identity the registry actually has.
  assert.match(compact, /Kanónikus forrás: GDPR · Regulation \(EU\) 2016\/679/);
  assert.match(compact, /verzió feldolgozásakor rögzítve/);
  // With no canonical label stored, the truthful CELEX-derived source key is shown
  // instead of an invented legal name, and it says the match was not persisted.
  assert.match(compact, /EU-32019R1234/);
  assert.match(compact, /CELEX egyezés, nem tárolt/);
  assert.equal(bindings.length, 2);
  // Unresolved stays unresolved, with a neutral reason.
  assert.match(compact, /Kanónikus forrás: nincs egyedi találat — több egyedi találat, ezért nem oldható fel/);
  assert.match(compact, /Kanónikus forrás: nincs egyedi találat — nincs CELEX azonosító/);
});

test('states provenance without any legal conclusion or AI wording', async () => {
  const h = await mount({
    documentId: 'document-1',
    versions: [{ documentVersionId: 'version-1', version: 1, isCurrent: true, rows: [baseRow(), caseRow, authorityRow] }],
  });
  const text = textOf(rerender(h));

  // The panel states what it is: document-authored provenance, not an assessment.
  assert.match(text, /Ez nem jogi értékelés\./);

  for (const forbidden of [
    'megfelelőnek minősül',
    'nem felel meg',
    'nem megfelelő',
    'elavult',
    'hatályát vesztette',
    'jogsért',
    'jogszabályváltozás',
    'változott a jogszabály',
    'kockázati pontszám',
    'AI ',
    'AI-',
    'javasolt módosítás',
  ]) {
    assert.ok(!text.includes(forbidden), `the internal matrix must not state "${forbidden}"`);
  }
});

test('a single row renders only the metadata it actually transports', async () => {
  const h = await mount(LEGAL_ONLY);
  const text = textOf(rerender(h));
  assert.match(text, /A szerzodeses pont es a jogszabalyi hely kapcsolata\./);
  // Absent machine metadata is not invented for a legal anchor row.
  assert.ok(!text.includes('ECLI'), 'an absent ECLI must not be rendered');
  assert.ok(!text.includes('Ügyszám'), 'an absent case number must not be rendered');
  assert.ok(!text.includes('Döntés azonosítója'), 'an absent decision id must not be rendered');
});

const ALL_ROWS = { documentId: 'document-1', versions: [{ documentVersionId: 'version-1', version: 1, isCurrent: true, rows: [baseRow(), caseRow, authorityRow, canonicalRefRow] }] };
const toggleButton = (tree: any) => flatten(tree).find((node) => node.props?.['data-testid'] === 'clause-anchor-toggle');
const searchFor = (h: any, query: string) => {
  change(clauseInput(rerender(h)), query);
  return rerender(h);
};

test('searches the free-text haystack across the meaningful row fields, not only clause text', async () => {
  const h = await mount(ALL_ROWS);

  // Clause reference and clause title keep working.
  let tree = searchFor(h, '10.1.');
  assert.equal(rows(tree).length, 1, 'clauseRef search must still find the clause');
  assert.match(textOf(tree), /Figyelesi hivatkozas/);
  tree = searchFor(h, 'Adatfeldolgozasi megallapodas');
  assert.equal(rows(tree).length, 1, 'clauseTitle must be searchable');

  // A displayed value that is not the clause reference or title must be searchable too.
  tree = searchFor(h, 'TV/2013/5/6:59/2');
  assert.equal(rows(tree).length, 1, 'canonicalReference (Figyelési azonosító) must be searchable');
  assert.match(textOf(tree), /10\.1\./);

  tree = searchFor(h, 'LEGAL|REF=TV/2013/5/6:59/2');
  assert.equal(rows(tree).length, 1, 'anchorKey (Stabil hivatkozás-azonosító) must be searchable');

  tree = searchFor(h, 'T/2013/5/6:59/2');
  assert.equal(rows(tree).length, 1, 'the Peter transport alias T/... must match the canonical TV/... row');

  tree = searchFor(h, 'Figyelesi hivatkozas');
  assert.equal(rows(tree).length, 1, 'anchorDisplay must be searchable');

  tree = searchFor(h, 'GDPR 28');
  assert.equal(rows(tree).length, 1, 'anchorDisplay text must be searchable');

  tree = searchFor(h, 'data.europa.eu');
  assert.equal(rows(tree).length, 1, 'ELI must be searchable');

  tree = searchFor(h, '32016R0679');
  assert.equal(rows(tree).length, 1, 'CELEX must be searchable');

  tree = searchFor(h, 'art=28');
  assert.equal(rows(tree).length, 1, 'locator must be searchable');

  tree = searchFor(h, 'EU:C:2023:949');
  assert.equal(rows(tree).length, 1, 'ECLI must be searchable');

  tree = searchFor(h, 'paras=217');
  assert.equal(rows(tree).length, 1, 'authorityLocator must be searchable');

  tree = searchFor(h, 'NAIH-19-18/2024');
  assert.equal(rows(tree).length, 1, 'decisionId must be searchable');

  tree = searchFor(h, 'naih.hu');
  assert.equal(rows(tree).length, 1, 'sourceUrl must be searchable');

  tree = searchFor(h, 'jogszabalyi hely kapcsolata');
  assert.equal(rows(tree).length, 1, 'rationale must be searchable');

  // An unrelated query finds nothing instead of everything.
  tree = searchFor(h, 'nincs-ilyen-ertekesor');
  assert.equal(rows(tree).length, 0);
});

test('free-text search composes with the dedicated filters', async () => {
  const h = await mount(ALL_ROWS);

  let tree = searchFor(h, 'TV/2013/5/6:59/2');
  change(selectWithOption(tree, 'INTERPRETATION'), 'INTERPRETATION');
  tree = rerender(h);
  assert.equal(rows(tree).length, 0, 'search AND relationType must both apply');

  change(selectWithOption(tree, 'INTERPRETATION'), '');
  change(selectWithOption(tree, 'MANDATORY_BASIS'), 'MANDATORY_BASIS');
  tree = rerender(h);
  assert.equal(rows(tree).length, 1, 'search AND a matching relationType must keep the row');

  change(selectWithOption(tree, 'MANDATORY_BASIS'), '');
  change(selectWithOption(tree, 'CASE'), 'CASE');
  tree = rerender(h);
  assert.equal(rows(tree).length, 0, 'search AND a non-matching anchorType must drop the row');

  change(selectWithOption(tree, 'CASE'), '');
  toggle(unresolvedCheckbox(tree), true);
  tree = rerender(h);
  assert.equal(rows(tree).length, 0, 'search AND unresolvedOnly must both apply');
  assert.ok(byTestId(tree, 'anchor-key-unresolved') === undefined);
});

test('collapses and reopens the matrix while preserving search, filters and version', async () => {
  const h = await mount(ALL_ROWS);
  let tree = rerender(h);

  change(clauseInput(tree), 'TV/2013/5/6:59/2');
  tree = rerender(h);
  change(selectWithOption(tree, 'MANDATORY_BASIS'), 'MANDATORY_BASIS');
  tree = rerender(h);
  assert.equal(rows(tree).length, 1);

  const collapse = toggleButton(tree);
  assert.ok(collapse, 'a collapse/expand control must be offered for a long matrix');
  assert.equal(collapse.props['aria-expanded'], true);
  assert.equal(textOf(collapse), 'Mátrix összecsukása');

  collapse.props.onClick();
  tree = rerender(h);
  assert.equal(rows(tree).length, 0, 'collapsed matrix must not render every row');
  // The summary stays so it is obvious a matrix exists, with current/total context.
  assert.match(textOf(byTestId(tree, 'clause-anchor-counts')), /Megjelenítve: 1 \/ 4 tétel/);
  const reopen = toggleButton(tree);
  assert.equal(reopen.props['aria-expanded'], false);
  assert.equal(textOf(reopen), 'Mátrix megnyitása');

  reopen.props.onClick();
  tree = rerender(h);
  assert.equal(rows(tree).length, 1, 'reopening must restore the same filtered state');
  assert.match(textOf(byTestId(tree, 'clause-anchor-counts')), /Megjelenítve: 1 \/ 4 tétel/);
  // The search box still holds the query and the relation filter is unchanged.
  assert.equal(clauseInput(tree).props.value, 'TV/2013/5/6:59/2');
  const relationSelect = flatten(tree).find((node) => node.type === 'select' && node.props?.value === 'MANDATORY_BASIS');
  assert.ok(relationSelect, 'the relationType selection must survive collapse/expand');
});

test('keeps the version selector and unresolved notice working after a search', async () => {
  const h = await mount({
    documentId: 'document-1',
    versions: [
      { documentVersionId: 'version-2', version: 2, isCurrent: true, rows: [baseRow({ id: 'v2', documentVersionId: 'version-2' })] },
      { documentVersionId: 'version-1', version: 1, isCurrent: false, rows: [{ ...caseRow, id: 'v1a', documentVersionId: 'version-1' }, { ...authorityRow, id: 'v1b', documentVersionId: 'version-1' }] },
    ],
  });
  let tree = rerender(h);
  change(selectWithOption(tree, 'version-1'), 'version-1');
  tree = rerender(h);
  assert.equal(rows(tree).length, 2);

  change(clauseInput(tree), 'NAIH-19-18/2024');
  tree = rerender(h);
  assert.equal(rows(tree).length, 1);
  toggle(unresolvedCheckbox(tree), true);
  tree = rerender(h);
  assert.equal(rows(tree).length, 1);
  assert.ok(byTestId(tree, 'anchor-key-unresolved'), 'the unresolved notice must remain visible');
});
