/**
 * Deterministic event identity.
 *
 * An event is identified ONLY by (source, watched CELEX, kind, related CELEX).
 * Result row order can never change an event key. The payload hash adds
 * non-identity metadata so a metadata correction under the same key is
 * detectable as METADATA_CHANGED — never as a new legal event.
 */
import { createHash } from 'node:crypto';
import type { EventKind, ObservationEvent } from './types';
import { SOURCE_NAME } from './types';

export function sha256Hex(parts: string[]): string {
  return createHash('sha256').update(parts.join('|'), 'utf8').digest('hex');
}

export function eventKeyFor(
  watchedCelex: string,
  eventKind: EventKind,
  relatedCelex: string,
): string {
  return sha256Hex([SOURCE_NAME, watchedCelex, eventKind, relatedCelex]);
}

export function payloadHashFor(
  event: Omit<ObservationEvent, 'payloadHash' | 'eventKey'>,
): string {
  return sha256Hex([
    event.source,
    event.sourceIdentifier,
    event.eventKind,
    event.relatedIdentifier,
    event.sourceUri,
    event.publicationDate ?? '',
    event.effectiveDate ?? '',
  ]);
}
