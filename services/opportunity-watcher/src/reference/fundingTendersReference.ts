/**
 * GWO-1 — official Funding & Tenders reference mappings.
 *
 * Every mapping comes from a provenance-backed, committed dictionary
 * artifact (`dictionaries/funding-tenders-codes.json`) generated once from the
 * official EU Funding & Tenders Portal reference data. No mapping is guessed
 * and no reference data is fetched in tests or CI.
 *
 * Unknown source codes stay UNKNOWN and the raw code is preserved by the
 * adapter in bounded source metadata — never interpreted.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { SourceStatus } from '../types.ts';

export interface ReferenceProvenance {
  generator: string;
  generatedAt: string;
  sourceName: string;
  sourceUrl: string;
  capturedAt: string;
  sha256: string;
  bytes: number;
  records: number;
  note: string;
}

export interface StatusDictionaryEntry {
  abbreviation: string;
  description: string;
  /** Mapped canonical status, or null when the official label has no mapping. */
  state: SourceStatus | null;
}

export interface ProgrammeDictionaryEntry {
  abbreviation: string;
  description: string;
}

export interface FundingTendersReferenceData {
  schemaVersion: number;
  provenance: ReferenceProvenance;
  statuses: Record<string, StatusDictionaryEntry>;
  programmes: Record<string, ProgrammeDictionaryEntry>;
}

const DEFAULT_DICTIONARY_PATH = fileURLToPath(
  new URL('../../dictionaries/funding-tenders-codes.json', import.meta.url),
);

export function fundingTendersDictionaryPath(): string {
  return DEFAULT_DICTIONARY_PATH;
}

export function loadFundingTendersReference(dictionaryPath: string = DEFAULT_DICTIONARY_PATH): FundingTendersReferenceData {
  const text = readFileSync(dictionaryPath, 'utf8');
  const parsed = JSON.parse(text) as FundingTendersReferenceData;
  if (!parsed || typeof parsed !== 'object' || parsed.schemaVersion !== 1 || !parsed.provenance || !parsed.statuses || !parsed.programmes) {
    throw new Error('FUNDING_TENDERS_REFERENCE_INVALID');
  }
  return parsed;
}

export interface StatusMapping {
  status: SourceStatus;
  mapped: boolean;
  label: string | null;
}

/**
 * Maps a source-native status code through the official dictionary.
 * Unknown code, or an official label without a canonical state, yields
 * UNKNOWN with `mapped: false`.
 */
export function mapSourceStatus(code: string | null | undefined, reference: FundingTendersReferenceData): StatusMapping {
  if (typeof code !== 'string' || code.trim().length === 0) {
    return { status: 'UNKNOWN', mapped: false, label: null };
  }
  const entry = reference.statuses[code.trim()];
  if (!entry) {
    return { status: 'UNKNOWN', mapped: false, label: null };
  }
  const label = entry.abbreviation || entry.description || null;
  if (entry.state && entry.state !== 'UNKNOWN') {
    return { status: entry.state, mapped: true, label };
  }
  return { status: 'UNKNOWN', mapped: false, label };
}

export interface ProgrammeMapping {
  label: string | null;
  mapped: boolean;
}

export function mapProgramme(code: string | null | undefined, reference: FundingTendersReferenceData): ProgrammeMapping {
  if (typeof code !== 'string' || code.trim().length === 0) {
    return { label: null, mapped: false };
  }
  const entry = reference.programmes[code.trim()];
  if (!entry) {
    return { label: null, mapped: false };
  }
  const label = entry.description || entry.abbreviation || null;
  return { label, mapped: label !== null };
}
