/**
 * Exported manifest snapshot (schema v1) loader + CELEX demand extraction.
 *
 * W1 consumes an EXPORTED snapshot of the Adminiculum monitoring manifest
 * (GET /api/v1/compliance-intelligence/monitoring-manifest, schema version 1).
 * The watcher NEVER calls the production endpoint (workforce-authenticated)
 * and never needs customer/case/document identity.
 *
 * PRIVACY GUARD: only the known manifest fields are read. Any unexpected
 * field — top level or per source — is dropped, counted by name, and never
 * propagated into watcher state or output.
 */
import * as fs from 'node:fs';
import type { ManifestCounts } from './types';

export const MANIFEST_SCHEMA_VERSION = 1;

/** Same strict C3A token shape the backend uses (legalSourceBinding.ts). */
export const CELEX_TOKEN = /^3[0-9]{4}[A-Z][0-9]{4}$/;

const TOP_LEVEL_ALLOWED = ['schemaVersion', 'generatedAt', 'sources', 'unresolvedSummary'];
const SOURCE_ALLOWED = ['identifierFamily', 'sourceIdentifier', 'locators', 'referenceCount'];

export class ManifestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ManifestError';
  }
}

export interface ManifestSourceV1 {
  identifierFamily: string;
  sourceIdentifier: string;
  referenceCount: number;
}

export interface DroppedField {
  path: string;
  field: string;
}

export interface ValidatedManifest {
  schemaVersion: number;
  sources: ManifestSourceV1[];
  droppedFields: DroppedField[];
}

export function parseManifestJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new ManifestError('manifest is not valid JSON');
  }
}

export function validateManifest(raw: unknown): ValidatedManifest {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ManifestError('manifest root must be a JSON object');
  }
  const obj = raw as Record<string, unknown>;
  if (obj.schemaVersion !== MANIFEST_SCHEMA_VERSION) {
    throw new ManifestError(
      `unsupported manifest schemaVersion: ${String(obj.schemaVersion)} (expected ${MANIFEST_SCHEMA_VERSION})`,
    );
  }
  if (!Array.isArray(obj.sources)) {
    throw new ManifestError('manifest sources must be an array');
  }

  const droppedFields: DroppedField[] = [];
  for (const key of Object.keys(obj).filter((k) => !TOP_LEVEL_ALLOWED.includes(k)).sort()) {
    droppedFields.push({ path: `manifest.${key}`, field: key });
  }

  const sources: ManifestSourceV1[] = obj.sources.map((entry, index) => {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new ManifestError(`manifest sources[${index}] must be an object`);
    }
    const source = entry as Record<string, unknown>;
    for (const key of Object.keys(source).filter((k) => !SOURCE_ALLOWED.includes(k)).sort()) {
      droppedFields.push({ path: `manifest.sources[${index}].${key}`, field: key });
    }
    if (typeof source.identifierFamily !== 'string' || typeof source.sourceIdentifier !== 'string') {
      throw new ManifestError(
        `manifest sources[${index}] must have string identifierFamily and sourceIdentifier`,
      );
    }
    const referenceCount =
      typeof source.referenceCount === 'number' && Number.isFinite(source.referenceCount)
        ? Math.max(0, source.referenceCount)
        : 0;
    return {
      identifierFamily: source.identifierFamily,
      sourceIdentifier: source.sourceIdentifier,
      referenceCount,
    };
  });

  return { schemaVersion: obj.schemaVersion as number, sources, droppedFields };
}

export interface CelexDemand {
  counts: ManifestCounts;
  /** Canonical uppercase CELEX identifiers, deduplicated and sorted. */
  distinctCelex: string[];
}

export function extractCelexDemand(
  manifest: ValidatedManifest,
  onDropped?: (path: string) => void,
): CelexDemand {
  const distinct = new Set<string>();
  const droppedNames = new Set<string>();
  let celexReferenceCount = 0;
  let nonCelexSkipped = 0;
  let invalidCelexCount = 0;

  for (const dropped of manifest.droppedFields) {
    droppedNames.add(dropped.field);
    onDropped?.(dropped.path);
  }

  for (const source of manifest.sources) {
    if (source.identifierFamily === 'CELEX') {
      celexReferenceCount += source.referenceCount;
      const normalized = source.sourceIdentifier.trim().toUpperCase();
      if (CELEX_TOKEN.test(normalized)) {
        distinct.add(normalized);
      } else {
        invalidCelexCount++;
      }
      continue;
    }
    // TV and any other family: counted and skipped. Never queried, never stored.
    nonCelexSkipped++;
  }

  const counts: ManifestCounts = {
    manifestSourceCount: manifest.sources.length,
    celexReferenceCount,
    distinctCelexCount: distinct.size,
    nonCelexSkipped,
    invalidCelexCount,
    droppedIdentityFields: Array.from(droppedNames).sort(),
  };
  return { counts, distinctCelex: Array.from(distinct).sort() };
}

export function loadManifestFile(path: string): ValidatedManifest {
  let text: string;
  try {
    text = fs.readFileSync(path, 'utf8');
  } catch {
    throw new ManifestError(`cannot read manifest file: ${path}`);
  }
  return validateManifest(parseManifestJson(text));
}
