/**
 * Official Publications Office CELLAR SPARQL adapter (EUR-Lex source).
 *
 * Only the official endpoint is used:
 *   https://publications.europa.eu/webapi/rdf/sparql
 *
 * Live-verified query semantics (preflight, representative CELEX 32016R0679):
 *  - resolution: cdm:resource_legal_id_celex with FILTER(STR(...) = "...")
 *    (plain-literal equality does NOT match on this endpoint; STR() is required)
 *  - amendments:  cdm:resource_legal_amends_resource_legal   (work -> work)
 *    verified live: 31995L0046 -> 32003R1882
 *  - consolidation: cdm:act_consolidated_consolidates_resource_legal
 *    verified live: 32016R0679 -> 02016R0679-20160504 (dated consolidated CELEX)
 *  - language expressions do NOT duplicate events: the queries bind WORK
 *    resources; related works without a resolvable CELEX fail closed.
 */
import {
  boundedHttpPost,
  type BoundedHttpOptions,
  type HttpPostFn,
} from '../http';
import { CELEX_TOKEN } from '../manifest';
import { eventKeyFor, payloadHashFor } from '../keys';
import type { ObservationEvent } from '../types';
import { SOURCE_NAME } from '../types';

export const CELLAR_SPARQL_ENDPOINT = 'https://publications.europa.eu/webapi/rdf/sparql';
export const CDM_NS = 'http://publications.europa.eu/ontology/cdm#';

export const PROVENANCE_AMENDMENT =
  'CELLAR SPARQL cdm:resource_legal_amends_resource_legal (related work CELEX mandatory)';
export const PROVENANCE_CONSOLIDATION =
  'CELLAR SPARQL cdm:act_consolidated_consolidates_resource_legal (family-filtered dated consolidated CELEX)';

export type SourceErrorCode =
  | 'UNRESOLVABLE_WORK'
  | 'AMBIGUOUS_WORK'
  | 'MALFORMED_RESPONSE'
  | 'UNRESOLVED_RELATED_IDENTITY'
  | 'SOURCE_INCOMPLETE_CONSOLIDATION';

export class SourceError extends Error {
  constructor(
    public readonly code: SourceErrorCode,
    message: string,
    public readonly phase: string,
  ) {
    super(message);
    this.name = 'SourceError';
  }
}

export interface SparqlBinding {
  type: 'uri' | 'literal' | 'bnode';
  value: string;
}

export interface SparqlJsonResult {
  results: { bindings: Array<Record<string, SparqlBinding | undefined>> };
}

export interface EurlexAdapter {
  observe(celex: string): Promise<ObservationEvent[]>;
}

interface AmendmentRow {
  relatedUri: string;
  relatedCelex: string | null;
  pubDate: string | null;
}

interface ConsolidationRow {
  relatedUri: string;
  relatedCelex: string | null;
  consDate: string | null;
  consNumber: string | null;
  consolidates: string[];
}

const SAFE_URI = /^https?:\/\/[^\s<>"']+$/;
const XSD_DATE = /^\d{4}-\d{2}-\d{2}(Z|[+-]\d{2}:\d{2})?$/;

function assertSafeUri(value: string): void {
  if (!SAFE_URI.test(value)) {
    throw new SourceError(
      'MALFORMED_RESPONSE',
      'SPARQL response contained a non-URI resource value',
      'CELLAR',
    );
  }
}

function parseSparqlJson(text: string, phase: string): SparqlJsonResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new SourceError('MALFORMED_RESPONSE', 'SPARQL endpoint returned non-JSON', phase);
  }
  if (
    data === null ||
    typeof data !== 'object' ||
    !('results' in data) ||
    (data as Record<string, unknown>).results === null ||
    typeof (data as Record<string, unknown>).results !== 'object' ||
    !Array.isArray(
      ((data as Record<string, unknown>).results as Record<string, unknown>).bindings,
    )
  ) {
    throw new SourceError(
      'MALFORMED_RESPONSE',
      'SPARQL response missing results.bindings',
      phase,
    );
  }
  return data as SparqlJsonResult;
}

function bindingString(binding: SparqlBinding | undefined): string | null {
  if (!binding || typeof binding.value !== 'string' || binding.value === '') return null;
  return binding.value;
}

function normalizeRelatedCelex(raw: string, phase: string): string {
  const normalized = raw.trim().toUpperCase();
  if (!CELEX_TOKEN.test(normalized)) {
    throw new SourceError(
      'UNRESOLVED_RELATED_IDENTITY',
      `related work CELEX is not a stable base identifier: ${raw}`,
      phase,
    );
  }
  return normalized;
}

export class CellarAdapter implements EurlexAdapter {
  constructor(
    private readonly options: {
      post: HttpPostFn;
      http: BoundedHttpOptions;
      endpoint?: string;
      now?: () => Date;
    },
  ) {}

  private get endpoint(): string {
    return this.options.endpoint ?? CELLAR_SPARQL_ENDPOINT;
  }

  private nowIso(): string {
    return (this.options.now ?? (() => new Date()))().toISOString();
  }

  private async sparql(query: string, phase: string): Promise<SparqlJsonResult> {
    const body = new URLSearchParams({
      query,
      format: 'application/sparql-results+json',
    }).toString();
    const { text } = await boundedHttpPost(
      this.options.http,
      this.options.post,
      this.endpoint,
      body,
    );
    return parseSparqlJson(text, phase);
  }

  async resolveWork(celex: string): Promise<string> {
    const query = [
      'PREFIX cdm: <http://publications.europa.eu/ontology/cdm#>',
      'SELECT DISTINCT ?work WHERE {',
      '  ?work cdm:resource_legal_id_celex ?celex .',
      `  FILTER(STR(?celex) = "${celex}")`,
      '} LIMIT 10',
    ].join('\n');
    const result = await this.sparql(query, 'RESOLVE');
    const works = new Set<string>();
    for (const row of result.results.bindings) {
      const work = bindingString(row.work);
      if (work === null) continue;
      assertSafeUri(work);
      works.add(work);
    }
    if (works.size === 0) {
      throw new SourceError(
        'UNRESOLVABLE_WORK',
        `CELEX ${celex} does not resolve to a legal work`,
        'RESOLVE',
      );
    }
    if (works.size > 1) {
      throw new SourceError(
        'AMBIGUOUS_WORK',
        `CELEX ${celex} resolves to ${works.size} legal works`,
        'RESOLVE',
      );
    }
    return Array.from(works)[0];
  }

  private async queryAmendments(workUri: string): Promise<AmendmentRow[]> {
    const query = [
      'PREFIX cdm: <http://publications.europa.eu/ontology/cdm#>',
      'SELECT DISTINCT ?related ?relatedCelex ?pubDate WHERE {',
      `  ?related cdm:resource_legal_amends_resource_legal <${workUri}> .`,
      '  OPTIONAL { ?related cdm:resource_legal_id_celex ?relatedCelex . }',
      '  OPTIONAL { ?related cdm:work_date_document ?pubDate . }',
      '} LIMIT 500',
    ].join('\n');
    const result = await this.sparql(query, 'AMENDMENT');
    const rows: AmendmentRow[] = [];
    for (const row of result.results.bindings) {
      const relatedUri = bindingString(row.related);
      if (relatedUri === null) continue;
      assertSafeUri(relatedUri);
      rows.push({
        relatedUri,
        relatedCelex: bindingString(row.relatedCelex),
        pubDate: bindingString(row.pubDate),
      });
    }
    return rows;
  }

  private async queryConsolidations(workUri: string): Promise<ConsolidationRow[]> {
    const query = [
      'PREFIX cdm: <http://publications.europa.eu/ontology/cdm#>',
      'SELECT DISTINCT ?related ?relatedCelex ?consDate ?consNumber ?consolidates WHERE {',
      `  ?related cdm:act_consolidated_consolidates_resource_legal <${workUri}> .`,
      '  OPTIONAL { ?related cdm:resource_legal_id_celex ?relatedCelex . }',
      '  OPTIONAL { ?related cdm:act_consolidated_date ?consDate . }',
      '  OPTIONAL { ?related cdm:act_consolidated_number ?consNumber . }',
      '  OPTIONAL { ?related cdm:act_consolidated_consolidates_resource_legal ?consolidates . }',
      '} LIMIT 500',
    ].join('\n');
    const result = await this.sparql(query, 'CONSOLIDATION');
    const byUri = new Map<string, ConsolidationRow>();
    for (const row of result.results.bindings) {
      const relatedUri = bindingString(row.related);
      if (relatedUri === null) continue;
      assertSafeUri(relatedUri);
      const existing = byUri.get(relatedUri) ?? {
        relatedUri,
        relatedCelex: null,
        consDate: null,
        consNumber: null,
        consolidates: [],
      };
      if (existing.relatedCelex === null) existing.relatedCelex = bindingString(row.relatedCelex);
      if (existing.consDate === null) existing.consDate = bindingString(row.consDate);
      if (existing.consNumber === null) existing.consNumber = bindingString(row.consNumber);
      const target = bindingString(row.consolidates);
      if (target !== null) {
        assertSafeUri(target);
        if (!existing.consolidates.includes(target)) existing.consolidates.push(target);
      }
      byUri.set(relatedUri, existing);
    }
    return Array.from(byUri.values());
  }

  private amendmentEvents(celex: string, rows: AmendmentRow[]): ObservationEvent[] {
    const capturedAt = this.nowIso();
    const byUri = new Map<string, { celex: Set<string>; dates: Set<string> }>();
    for (const row of rows) {
      const existing = byUri.get(row.relatedUri) ?? { celex: new Set<string>(), dates: new Set<string>() };
      if (row.relatedCelex !== null) existing.celex.add(row.relatedCelex);
      if (row.pubDate !== null) existing.dates.add(row.pubDate);
      byUri.set(row.relatedUri, existing);
    }
    const events: ObservationEvent[] = [];
    for (const [uri, related] of byUri) {
      if (related.celex.size === 0) {
        throw new SourceError(
          'UNRESOLVED_RELATED_IDENTITY',
          `amending work ${uri} has no resolvable CELEX identifier`,
          'AMENDMENT',
        );
      }
      if (related.celex.size > 1) {
        throw new SourceError(
          'UNRESOLVED_RELATED_IDENTITY',
          `amending work ${uri} has ${related.celex.size} conflicting CELEX identifiers`,
          'AMENDMENT',
        );
      }
      const relatedCelex = normalizeRelatedCelex(Array.from(related.celex)[0], 'AMENDMENT');
      const dates = Array.from(related.dates).filter((d) => XSD_DATE.test(d)).sort();
      const publicationDate = dates.length > 0 ? dates[0] : undefined;
      const base = {
        source: SOURCE_NAME,
        sourceIdentifier: celex,
        eventKind: 'AMENDMENT_PUBLISHED' as const,
        relatedIdentifier: relatedCelex,
        sourceUri: uri,
        capturedAt,
        queryProvenance: PROVENANCE_AMENDMENT,
        publicationDate,
      };
      const eventKey = eventKeyFor(celex, 'AMENDMENT_PUBLISHED', relatedCelex);
      events.push({ ...base, eventKey, payloadHash: payloadHashFor(base) });
    }
    return events;
  }

  private consolidationEvents(
    celex: string,
    workUri: string,
    rows: ConsolidationRow[],
  ): ObservationEvent[] {
    const capturedAt = this.nowIso();
    // Dated consolidated CELEX replaces the leading "3" with "0":
    // 32016R0679 -> 02016R0679-YYYYMMDD. Consolidation numbers drop the "3":
    // 32016R0679 -> 2016R0679/YYYYMMDD_<layer>.
    const familyPrefix = `0${celex.slice(1)}-`;
    const numberPrefix = celex.slice(1);
    const events: ObservationEvent[] = [];
    let inFamilyLayerCount = 0;
    for (const row of rows) {
      const familyCelex = row.relatedCelex !== null && row.relatedCelex.trim().toUpperCase().startsWith(familyPrefix);
      if (familyCelex) {
        const relatedIdentifier = row.relatedCelex!.trim().toUpperCase();
        const dates = row.consDate !== null && XSD_DATE.test(row.consDate) ? [row.consDate] : [];
        const base = {
          source: SOURCE_NAME,
          sourceIdentifier: celex,
          eventKind: 'CONSOLIDATED_VERSION_AVAILABLE' as const,
          relatedIdentifier,
          sourceUri: row.relatedUri,
          capturedAt,
          queryProvenance: PROVENANCE_CONSOLIDATION,
          effectiveDate: dates.length > 0 ? dates[0] : undefined,
        };
        const eventKey = eventKeyFor(celex, 'CONSOLIDATED_VERSION_AVAILABLE', relatedIdentifier);
        events.push({ ...base, eventKey, payloadHash: payloadHashFor(base) });
        continue;
      }
      // No in-family dated CELEX. Layer works carry act_consolidated_number
      // (e.g. 2016R0679/20160504_0000010) and/or directly consolidate the
      // watched work. Layers are representation variants of a consolidated
      // version, NOT additional versions: they never become events (this is
      // what keeps language/layer expressions from producing duplicate legal
      // events).
      const hasInFamilyNumber =
        row.consNumber !== null && row.consNumber.trim().toUpperCase().startsWith(numberPrefix);
      const consolidatesWatched = row.consolidates.includes(workUri);
      if (hasInFamilyNumber || consolidatesWatched) {
        inFamilyLayerCount++;
        continue;
      }
      if (row.consNumber !== null || row.consolidates.length > 0) {
        // Cross-act consolidated layer (CELLAR links repealed acts'
        // consolidations to the repealing act). Deliberately excluded.
        continue;
      }
      throw new SourceError(
        'UNRESOLVED_RELATED_IDENTITY',
        `consolidated work ${row.relatedUri} has neither a CELEX identifier nor a consolidation number`,
        'CONSOLIDATION',
      );
    }
    if (events.length === 0 && inFamilyLayerCount > 0) {
      throw new SourceError(
        'SOURCE_INCOMPLETE_CONSOLIDATION',
        `consolidation layers exist for ${celex} but no dated consolidated CELEX could be resolved`,
        'CONSOLIDATION',
      );
    }
    return events;
  }

  async observe(celex: string): Promise<ObservationEvent[]> {
    const workUri = await this.resolveWork(celex);
    const [amendmentRows, consolidationRows] = await Promise.all([
      this.queryAmendments(workUri),
      this.queryConsolidations(workUri),
    ]);
    const events = [
      ...this.amendmentEvents(celex, amendmentRows),
      ...this.consolidationEvents(celex, workUri, consolidationRows),
    ];
    const byKey = new Map<string, ObservationEvent>();
    for (const event of events) byKey.set(event.eventKey, event);
    return Array.from(byKey.values()).sort((a, b) =>
      a.eventKey < b.eventKey ? -1 : a.eventKey > b.eventKey ? 1 : 0,
    );
  }
}
