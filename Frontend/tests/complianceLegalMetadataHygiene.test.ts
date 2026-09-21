import { test } from 'node:test';
import assert from 'node:assert/strict';
import { componentHarness, flatten, textOf, tick } from './helpers/componentHarness';

/**
 * Workforce Compliance UI — raw legal/parser metadata hygiene.
 *
 * The internal legal matrix is rendered inline in the NORMAL workforce
 * compliance document card (ComplianceDocumentsSection -> ComplianceClauseAnchorPanel).
 * A lawyer reading that card must see readable legal references only: the raw
 * parser/anchor keys and implementation-formatted CELEX codes are internal
 * machine identity, not legal content.
 *
 * These tests pin BOTH halves of the contract:
 *  - raw machine identifiers are NOT rendered in the normal card;
 *  - the same values remain in the read model, so internal lookup/search and the
 *    canonical monitoring traceability are unchanged.
 */

const change = (node: any, value: string) => node.props.onChange({ target: { value } });

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
});

const canonicalRefRow = baseRow({
  id: 'row-ref',
  clauseRef: '10.1.',
  clauseTitle: 'Adatfeldolgozasi megallapodas',
  anchorDisplay: 'Figyelesi hivatkozas',
  anchorStableId: 'la_tv_2013_5_6_59_2',
  anchorKey: 'LEGAL|REF=TV/2013/5/6:59/2',
  canonicalReference: 'TV/2013/5/6:59/2',
  eli: null,
  celex: null,
  locator: '5/2/b',
});

const warningRow = baseRow({
  id: 'row-3',
  clauseRef: '2.1.',
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
  ingestWarnings: ['ANCHOR_KEY_UNRESOLVED', 'RELATION_TYPE_SOURCE_LABEL:NAIH'],
});

/** A resolved binding whose registry entry carries no readable title/citation. */
const celexFallbackRow = baseRow({
  id: 'row-fallback',
  clauseRef: '3.1.',
  anchorDisplay: 'Figyelt jogforras',
  eli: null,
  celex: '32019R1234',
  locator: null,
  rationale: null,
  legalSourceBindingStatus: 'RESOLVED',
  canonicalLegalSourceVersionId: 'canonical-version-fallback',
  canonicalCitation: null,
  canonicalTitle: null,
  bindingOrigin: 'READ_TIME_EXACT_CELEX',
  bindingReason: 'EXACT_CELEX_MATCH:32019R1234',
});

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

const rerender = (h: any) => h.render({ clientId: 'client-1', documentId: 'document-1' });
const rows = (tree: any) => flatten(tree).filter((node) => node.props?.['data-testid'] === 'clause-anchor-row');
const clauseInput = (tree: any) => flatten(tree).find((node) => node.type === 'input' && node.props?.placeholder);

const ALL = {
  documentId: 'document-1',
  versions: [{
    documentVersionId: 'version-1',
    version: 1,
    isCurrent: true,
    rows: [baseRow(), caseRow, canonicalRefRow, warningRow, celexFallbackRow],
  }],
};

/**
 * Mission rule 5 — values the NORMAL workforce card must never expose:
 * machine enums, raw parser/anchor identity, raw parser warnings, the internal
 * `EU-<celex>` fallback identity and `key=value` locator implementation syntax.
 */
const FORBIDDEN_NORMAL_UI_TOKENS = [
  // Machine enums (document-authored relation tokens).
  'MANDATORY_BASIS',
  'INTERPRETATION',
  'ENFORCEMENT_BENCHMARK',
  // Raw parser / anchor identity.
  'LEGAL|SID=',
  'CASE|SID=',
  'LEGAL|REF=',
  'LEGAL|ELI=',
  'LEGAL|CELEX=',
  'AUTHORITY|DEC=',
  'la_baa4796f2169',
  'ca_760eedf30941',
  // Raw parser warnings.
  'ANCHOR_KEY_UNRESOLVED',
  'RELATION_TYPE_SOURCE_LABEL',
  // Raw CELEX codes and the internal EU-<celex> fallback identity.
  '32016R0679',
  '32019R1234',
  'EU-32016R0679',
  'EU-32019R1234',
  // Locator implementation syntax.
  'art=28',
  'par=3',
  'paras=41-45',
  'paras=217-241',
];

test('REPRODUCTION: the normal workforce card does not render machine enums, parser identity, warnings or fallback keys', async () => {
  const text = textOf(rerender(await mount(ALL)));
  for (const raw of FORBIDDEN_NORMAL_UI_TOKENS) {
    assert.ok(!text.includes(raw), `raw technical value must not be rendered in the normal card: ${raw}`);
  }
});

test('human-readable legal references stay visible', async () => {
  const text = textOf(rerender(await mount(ALL)));
  assert.match(text, /GDPR 28\. cikk \(3\)/, 'the human legal citation must remain');
  assert.match(text, /http:\/\/data\.europa\.eu\/eli\/reg\/2016\/679\/oj/, 'the official ELI link must remain');
  assert.match(text, /EU:C:2023:949/, 'the ECLI citation must remain');
  assert.match(text, /C-683\/21/, 'the case number must remain');
  assert.match(text, /NAIH-19-18\/2024/, 'the authority decision must remain');
  assert.match(text, /TV\/2013\/5\/6:59\/2/, 'the canonical legal reference must remain');
  assert.match(text, /Adatfeldolgozasi megallapodas/, 'the clause title must remain');
});

test('machine enums and locators are presented in readable Hungarian form', async () => {
  const text = textOf(rerender(await mount(ALL)));
  // Relation tokens become readable labels (badge and filter options).
  assert.match(text, /Kötelező jogalap/, 'MANDATORY_BASIS must render as a readable label');
  assert.match(text, /Értelmezés/, 'INTERPRETATION must render as a readable label');
  assert.match(text, /Hatósági gyakorlat mércéje/, 'ENFORCEMENT_BENCHMARK must render as a readable label');
  // The documented art/par locator becomes a human citation.
  assert.match(text, /28\. cikk \(3\) bekezdés/, 'art=28;par=3 must render as a human citation');
  // A plain locator without implementation syntax is preserved as-is.
  assert.match(text, /5\/2\/b/, 'a plain locator stays visible');
});

test('a resolved binding without a readable identity is omitted, not replaced by the EU-<celex> key', async () => {
  const tree = rerender(await mount({
    documentId: 'document-1',
    versions: [{
      documentVersionId: 'version-1',
      version: 1,
      isCurrent: true,
      rows: [
        celexFallbackRow,
        { ...celexFallbackRow, id: 'row-labelled', canonicalTitle: 'Teszt rendelet', canonicalCitation: 'Regulation (EU) 2019/1234' },
      ],
    }],
  }));
  const text = textOf(tree);
  const compact = text.replace(/\s+/g, ' ');

  // The readable binding is shown.
  assert.match(compact, /Kanónikus forrás: Teszt rendelet · Regulation \(EU\) 2019\/1234/);
  // The identity-less binding contributes no leaked fallback key at all.
  assert.ok(!text.includes('EU-32019R1234'), 'the internal EU-<celex> fallback must never be rendered');
  assert.equal(compact.match(/Kanónikus forrás:/g)?.length, 1, 'only the readable binding line is shown');
});

test('the hidden machine identity stays available to internal search', async () => {
  const h = await mount(ALL);

  // Raw CELEX remains a searchable internal lookup value, even though it is not rendered.
  let tree = rerender(h);
  change(clauseInput(tree), '32016R0679');
  tree = rerender(h);
  assert.equal(rows(tree).length, 1, 'CELEX must still resolve the row through internal search');

  // The raw anchor key stays searchable too.
  change(clauseInput(tree), 'LEGAL|REF=TV/2013/5/6:59/2');
  tree = rerender(h);
  assert.equal(rows(tree).length, 1, 'the raw anchor key must still resolve the row through internal search');

  change(clauseInput(tree), 'CASE|SID=ca_760eedf30941');
  tree = rerender(h);
  assert.equal(rows(tree).length, 1, 'a case anchor key must still resolve the row through internal search');
});
