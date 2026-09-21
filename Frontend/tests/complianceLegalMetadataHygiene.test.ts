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
  locator: null,
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
    rows: [baseRow(), caseRow, canonicalRefRow, warningRow],
  }],
};

const RAW_IDENTIFIERS = [
  'LEGAL|SID=',
  'CASE|SID=',
  'LEGAL|REF=',
  'LEGAL|ELI=',
  'LEGAL|CELEX=',
  'AUTHORITY|DEC=',
  'la_baa4796f2169',
  'ca_760eedf30941',
  '32016R0679',
  'ANCHOR_KEY_UNRESOLVED',
  'RELATION_TYPE_SOURCE_LABEL',
];

test('REPRODUCTION: the normal workforce card does not render raw parser/anchor identifiers', async () => {
  const text = textOf(rerender(await mount(ALL)));
  for (const raw of RAW_IDENTIFIERS) {
    assert.ok(!text.includes(raw), `raw technical identifier must not be rendered in the normal card: ${raw}`);
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
