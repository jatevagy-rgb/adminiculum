/**
 * T05, T10, T11 + adapter domain behavior against mocked CELLAR responses.
 * Uses the exact live-verified predicate semantics:
 *  - resolution: cdm:resource_legal_id_celex + FILTER(STR(...))
 *  - amendment:  cdm:resource_legal_amends_resource_legal
 *  - consolidation: cdm:act_consolidated_consolidates_resource_legal
 */
import { CellarAdapter } from '../src/adapters/eurlex';
import { makePost, sparqlJson } from './helpers';

const FIXED_NOW = '2026-09-27T12:00:00.000Z';

function adapterWith(routes: Parameters<typeof makePost>[0]) {
  const { post, calls } = makePost(routes);
  const adapter = new CellarAdapter({
    post,
    http: {
      timeoutMs: 1000,
      retries: 0,
      backoffMs: 500,
      backoffFactor: 2,
      maxBytes: 1024 * 1024,
      deadlineMs: 5000,
    },
    now: () => new Date(FIXED_NOW),
  });
  return { adapter, calls };
}

const WORK_GDPR = 'http://publications.europa.eu/resource/cellar/3e485e15-11bd-11e6-ba9a-01aa75ed71a1';

describe('CELLAR adapter', () => {
  test('T05 valid adapter response builds both event kinds', async () => {
    const { adapter } = adapterWith([
      {
        bodyContains: 'FILTER%28STR%28',
        respond: {
          status: 200,
          contentLength: null,
          async readText() {
            return sparqlJson([{ work: { type: 'uri', value: WORK_GDPR } }]);
          },
        },
      },
      {
        bodyContains: 'resource_legal_amends_resource_legal',
        respond: {
          status: 200,
          contentLength: null,
          async readText() {
            return sparqlJson([
              {
                related: { type: 'uri', value: 'http://publications.europa.eu/resource/cellar/102e48a9-478f-4fee-8b8d-ef9068ea3936' },
                relatedCelex: { type: 'literal', value: '32003R1882' },
                pubDate: { type: 'literal', value: '2003-09-26' },
              },
            ]);
          },
        },
      },
      {
        bodyContains: 'act_consolidated_consolidates_resource_legal',
        respond: {
          status: 200,
          contentLength: null,
          async readText() {
            return sparqlJson([
              {
                related: { type: 'uri', value: 'http://publications.europa.eu/resource/cellar/5f2552c2-cc45-11e6-ad7c-01aa75ed71a1' },
                relatedCelex: { type: 'literal', value: '02016R0679-20160504' },
                consDate: { type: 'literal', value: '2016-05-04' },
              },
            ]);
          },
        },
      },
    ]);
    const events = await adapter.observe('32016R0679');
    expect(events).toHaveLength(2);
    const kinds = events.map((e) => e.eventKind).sort();
    expect(kinds).toEqual(['AMENDMENT_PUBLISHED', 'CONSOLIDATED_VERSION_AVAILABLE']);
    const amendment = events.find((e) => e.eventKind === 'AMENDMENT_PUBLISHED');
    expect(amendment).toBeDefined();
    expect(amendment!.relatedIdentifier).toBe('32003R1882');
    expect(amendment!.publicationDate).toBe('2003-09-26');
    expect(amendment!.eventKey).toMatch(/^[0-9a-f]{64}$/);
    const consolidation = events.find((e) => e.eventKind === 'CONSOLIDATED_VERSION_AVAILABLE');
    expect(consolidation!.relatedIdentifier).toBe('02016R0679-20160504');
    expect(consolidation!.effectiveDate).toBe('2016-05-04');
    expect(events[0].capturedAt).toBe(FIXED_NOW);
  });

  test('T10 malformed SPARQL response fails closed', async () => {
    const { adapter } = adapterWith([
      {
        bodyContains: 'FILTER%28STR%28',
        respond: {
          status: 200,
          contentLength: null,
          async readText() {
            return '<html>not sparql json</html>';
          },
        },
      },
    ]);
    await expect(adapter.observe('32016R0679')).rejects.toMatchObject({
      code: 'MALFORMED_RESPONSE',
    });
  });

  test('T11 unresolved related-work identity fails closed', async () => {
    const { adapter } = adapterWith([
      {
        bodyContains: 'FILTER%28STR%28',
        respond: {
          status: 200,
          contentLength: null,
          async readText() {
            return sparqlJson([{ work: { type: 'uri', value: WORK_GDPR } }]);
          },
        },
      },
      {
        bodyContains: 'resource_legal_amends_resource_legal',
        respond: {
          status: 200,
          contentLength: null,
          async readText() {
            return sparqlJson([
              { related: { type: 'uri', value: 'http://publications.europa.eu/resource/cellar/unknown' } },
            ]);
          },
        },
      },
      {
        bodyContains: 'act_consolidated_consolidates_resource_legal',
        respond: {
          status: 200,
          contentLength: null,
          async readText() {
            return sparqlJson([]);
          },
        },
      },
    ]);
    await expect(adapter.observe('32016R0679')).rejects.toMatchObject({
      code: 'UNRESOLVED_RELATED_IDENTITY',
      phase: 'AMENDMENT',
    });
  });

  test('unresolvable watched CELEX fails closed', async () => {
    const { adapter } = adapterWith([
      {
        bodyContains: 'FILTER%28STR%28',
        respond: {
          status: 200,
          contentLength: null,
          async readText() {
            return sparqlJson([]);
          },
        },
      },
    ]);
    await expect(adapter.observe('32016R0679')).rejects.toMatchObject({
      code: 'UNRESOLVABLE_WORK',
    });
  });

  test('ambiguous watched CELEX fails closed', async () => {
    const { adapter } = adapterWith([
      {
        bodyContains: 'FILTER%28STR%28',
        respond: {
          status: 200,
          contentLength: null,
          async readText() {
            return sparqlJson([
              { work: { type: 'uri', value: 'http://publications.europa.eu/resource/cellar/a' } },
              { work: { type: 'uri', value: 'http://publications.europa.eu/resource/cellar/b' } },
            ]);
          },
        },
      },
    ]);
    await expect(adapter.observe('32016R0679')).rejects.toMatchObject({
      code: 'AMBIGUOUS_WORK',
    });
  });

  test('cross-act consolidated links are excluded by the CELEX-family filter', async () => {
    const { adapter } = adapterWith([
      {
        bodyContains: 'FILTER%28STR%28',
        respond: {
          status: 200,
          contentLength: null,
          async readText() {
            return sparqlJson([{ work: { type: 'uri', value: WORK_GDPR } }]);
          },
        },
      },
      {
        bodyContains: 'resource_legal_amends_resource_legal',
        respond: {
          status: 200,
          contentLength: null,
          async readText() {
            return sparqlJson([]);
          },
        },
      },
      {
        bodyContains: 'act_consolidated_consolidates_resource_legal',
        respond: {
          status: 200,
          contentLength: null,
          async readText() {
            return sparqlJson([
              // Live-verified quirk: a 95/46 consolidation also links GDPR.
              {
                related: { type: 'uri', value: 'http://publications.europa.eu/resource/cellar/335ef9fc-250a-4dfa-a76d-5583b689e91e' },
                relatedCelex: { type: 'literal', value: '01995L0046-20180525' },
                consDate: { type: 'literal', value: '2018-05-25' },
                consNumber: { type: 'literal', value: '1995L0046/20180525' },
              },
              {
                related: { type: 'uri', value: 'http://publications.europa.eu/resource/cellar/5f2552c2-cc45-11e6-ad7c-01aa75ed71a1' },
                relatedCelex: { type: 'literal', value: '02016R0679-20160504' },
                consDate: { type: 'literal', value: '2016-05-04' },
              },
            ]);
          },
        },
      },
    ]);
    const events = await adapter.observe('32016R0679');
    expect(events).toHaveLength(1);
    expect(events[0].relatedIdentifier).toBe('02016R0679-20160504');
  });

  test('consolidation layers do not become duplicate events', async () => {
    const { adapter } = adapterWith([
      {
        bodyContains: 'FILTER%28STR%28',
        respond: {
          status: 200,
          contentLength: null,
          async readText() {
            return sparqlJson([{ work: { type: 'uri', value: WORK_GDPR } }]);
          },
        },
      },
      {
        bodyContains: 'resource_legal_amends_resource_legal',
        respond: {
          status: 200,
          contentLength: null,
          async readText() {
            return sparqlJson([]);
          },
        },
      },
      {
        bodyContains: 'act_consolidated_consolidates_resource_legal',
        respond: {
          status: 200,
          contentLength: null,
          async readText() {
            return sparqlJson([
              {
                related: { type: 'uri', value: 'http://publications.europa.eu/resource/cellar/5f2552c2-cc45-11e6-ad7c-01aa75ed71a1' },
                relatedCelex: { type: 'literal', value: '02016R0679-20160504' },
                consDate: { type: 'literal', value: '2016-05-04' },
              },
              {
                related: { type: 'uri', value: 'http://publications.europa.eu/resource/cellar/69c567aa-0ce3-4ba7-b13d-7142a9225a3c' },
                consNumber: { type: 'literal', value: '2016R0679/20160504_0000020' },
              },
            ]);
          },
        },
      },
    ]);
    const events = await adapter.observe('32016R0679');
    expect(events).toHaveLength(1);
    expect(events[0].relatedIdentifier).toBe('02016R0679-20160504');
  });

  test('in-family layers without a dated consolidated CELEX fail closed', async () => {
    const { adapter } = adapterWith([
      {
        bodyContains: 'FILTER%28STR%28',
        respond: {
          status: 200,
          contentLength: null,
          async readText() {
            return sparqlJson([{ work: { type: 'uri', value: WORK_GDPR } }]);
          },
        },
      },
      {
        bodyContains: 'resource_legal_amends_resource_legal',
        respond: {
          status: 200,
          contentLength: null,
          async readText() {
            return sparqlJson([]);
          },
        },
      },
      {
        bodyContains: 'act_consolidated_consolidates_resource_legal',
        respond: {
          status: 200,
          contentLength: null,
          async readText() {
            return sparqlJson([
              {
                related: { type: 'uri', value: 'http://publications.europa.eu/resource/cellar/69c567aa-0ce3-4ba7-b13d-7142a9225a3c' },
                consNumber: { type: 'literal', value: '2016R0679/20160504_0000020' },
              },
            ]);
          },
        },
      },
    ]);
    await expect(adapter.observe('32016R0679')).rejects.toMatchObject({
      code: 'SOURCE_INCOMPLETE_CONSOLIDATION',
    });
  });

  test('layer identified only by its consolidation target is not an extra event', async () => {
    const { adapter } = adapterWith([
      {
        bodyContains: 'FILTER%28STR%28',
        respond: {
          status: 200,
          contentLength: null,
          async readText() {
            return sparqlJson([{ work: { type: 'uri', value: WORK_GDPR } }]);
          },
        },
      },
      {
        bodyContains: 'resource_legal_amends_resource_legal',
        respond: {
          status: 200,
          contentLength: null,
          async readText() {
            return sparqlJson([]);
          },
        },
      },
      {
        bodyContains: 'act_consolidated_consolidates_resource_legal',
        respond: {
          status: 200,
          contentLength: null,
          async readText() {
            return sparqlJson([
              {
                related: { type: 'uri', value: 'http://publications.europa.eu/resource/cellar/5f2552c2-cc45-11e6-ad7c-01aa75ed71a1' },
                relatedCelex: { type: 'literal', value: '02016R0679-20160504' },
              },
              // Live shape: a layer with neither CELEX nor number, identified
              // only by consolidating the watched work directly.
              {
                related: { type: 'uri', value: 'http://publications.europa.eu/resource/cellar/424e72d0-9c7b-11eb-b85c-01aa75ed71a1' },
                consDate: { type: 'literal', value: '2016-05-04' },
                consolidates: { type: 'uri', value: WORK_GDPR },
              },
            ]);
          },
        },
      },
    ]);
    const events = await adapter.observe('32016R0679');
    expect(events).toHaveLength(1);
    expect(events[0].relatedIdentifier).toBe('02016R0679-20160504');
  });

  test('related work with no CELEX, no number and no target fails closed', async () => {
    const { adapter } = adapterWith([
      {
        bodyContains: 'FILTER%28STR%28',
        respond: {
          status: 200,
          contentLength: null,
          async readText() {
            return sparqlJson([{ work: { type: 'uri', value: WORK_GDPR } }]);
          },
        },
      },
      {
        bodyContains: 'resource_legal_amends_resource_legal',
        respond: {
          status: 200,
          contentLength: null,
          async readText() {
            return sparqlJson([]);
          },
        },
      },
      {
        bodyContains: 'act_consolidated_consolidates_resource_legal',
        respond: {
          status: 200,
          contentLength: null,
          async readText() {
            return sparqlJson([
              {
                related: { type: 'uri', value: 'http://publications.europa.eu/resource/cellar/00000000-0000-0000-0000-000000000000' },
              },
            ]);
          },
        },
      },
    ]);
    await expect(adapter.observe('32016R0679')).rejects.toMatchObject({
      code: 'UNRESOLVED_RELATED_IDENTITY',
      phase: 'CONSOLIDATION',
    });
  });

  test('cross-act layer without number but consolidating another act is skipped', async () => {
    const { adapter } = adapterWith([
      {
        bodyContains: 'FILTER%28STR%28',
        respond: {
          status: 200,
          contentLength: null,
          async readText() {
            return sparqlJson([{ work: { type: 'uri', value: WORK_GDPR } }]);
          },
        },
      },
      {
        bodyContains: 'resource_legal_amends_resource_legal',
        respond: {
          status: 200,
          contentLength: null,
          async readText() {
            return sparqlJson([]);
          },
        },
      },
      {
        bodyContains: 'act_consolidated_consolidates_resource_legal',
        respond: {
          status: 200,
          contentLength: null,
          async readText() {
            return sparqlJson([
              {
                related: { type: 'uri', value: 'http://publications.europa.eu/resource/cellar/5f2552c2-cc45-11e6-ad7c-01aa75ed71a1' },
                relatedCelex: { type: 'literal', value: '02016R0679-20160504' },
              },
              {
                related: { type: 'uri', value: 'http://publications.europa.eu/resource/cellar/335ef9fc-250a-4dfa-a76d-5583b689e91e' },
                consolidates: { type: 'uri', value: 'http://publications.europa.eu/resource/cellar/775a4724-2086-4a06-9213-1a4e6489053b' },
              },
            ]);
          },
        },
      },
    ]);
    const events = await adapter.observe('32016R0679');
    expect(events).toHaveLength(1);
    expect(events[0].relatedIdentifier).toBe('02016R0679-20160504');
  });
});
