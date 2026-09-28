/**
 * Shared deterministic test helpers. All mocked tests run WITHOUT live CELLAR.
 */
import type { HttpPostFn, HttpStreamResponse } from '../src/http';
import type { ObservationEvent } from '../src/types';
import { SOURCE_NAME } from '../src/types';
import { eventKeyFor, payloadHashFor } from '../src/keys';

export function jsonResponse(text: string, status = 200): HttpStreamResponse {
  return {
    status,
    contentLength: Buffer.byteLength(text, 'utf8'),
    async readText() {
      return text;
    },
  };
}

export interface SparqlValue {
  type: 'uri' | 'literal';
  value: string;
}

export function sparqlJson(
  rows: Array<Record<string, SparqlValue | undefined>>,
): string {
  const bindings = rows.map((row) => {
    const out: Record<string, SparqlValue> = {};
    for (const [key, value] of Object.entries(row)) {
      if (value !== undefined) out[key] = value;
    }
    return out;
  });
  return JSON.stringify({ head: { vars: [] }, results: { bindings } });
}

export function makePost(
  routes: Array<{ bodyContains: string; respond: HttpStreamResponse | Error }>,
): { post: HttpPostFn; calls: string[] } {
  const calls: string[] = [];
  const post: HttpPostFn = async (_url, body, _signal) => {
    calls.push(body);
    const match = routes.find((route) => body.includes(route.bodyContains));
    if (!match) {
      throw new Error(`no route for request body: ${body.slice(0, 200)}`);
    }
    if (match.respond instanceof Error) throw match.respond;
    return match.respond;
  };
  return { post, calls };
}

export function makeEvent(
  watchedCelex: string,
  kind: ObservationEvent['eventKind'],
  relatedCelex: string,
  overrides: Partial<ObservationEvent> = {},
): ObservationEvent {
  const merged: Record<string, unknown> = {
    source: SOURCE_NAME,
    sourceIdentifier: watchedCelex,
    eventKind: kind,
    relatedIdentifier: relatedCelex,
    sourceUri: `http://publications.europa.eu/resource/cellar/test-${relatedCelex}`,
    capturedAt: '2026-09-27T12:00:00.000Z',
    queryProvenance: 'test provenance',
    ...overrides,
  };
  const eventKey = (merged.eventKey as string | undefined) ?? eventKeyFor(watchedCelex, kind, relatedCelex);
  const payloadHash =
    (merged.payloadHash as string | undefined) ?? payloadHashFor(merged as never);
  return { ...merged, eventKey, payloadHash } as ObservationEvent;
}

/** Deterministic run deps: fixed clock + counting UUIDs. */
export function fixedDeps(adapter: unknown, store: unknown) {
  return {
    adapter,
    store,
    logger: {
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
    },
    now: () => new Date('2026-09-27T12:00:00.000Z'),
    uuid: (() => {
      let counter = 0;
      return () => `test-run-${++counter}`;
    })(),
  };
}
