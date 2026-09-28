/**
 * Manifest (schema v1) acquisition + CELEX demand extraction.
 *
 * FILE mode (default) consumes an EXPORTED snapshot of the Adminiculum
 * monitoring manifest and never calls any backend endpoint.
 *
 * BACKEND mode (explicit, `LEGAL_WATCHER_MANIFEST_MODE=BACKEND`) reads the
 * dedicated app-only endpoint
 * GET /api/v1/compliance-intelligence/watcher-monitoring-manifest with the
 * same app-only Bearer token used by W2 delivery. The response is the existing
 * monitoring manifest schema v1 with NO wrapper; there is no local-file
 * fallback. Neither mode needs customer/case/document identity.
 *
 * PRIVACY GUARD: only the known manifest fields are read. Any unexpected
 * field — top level or per source — is dropped, counted by name, and never
 * propagated into watcher state or output.
 */
import * as fs from 'node:fs';
import {
  boundedHttpGet,
  HttpError,
  type BoundedHttpOptions,
  type HttpGetFn,
} from './http';
import { TokenProviderError, type AccessTokenProvider } from './tokenProvider';
import type { ManifestCounts } from './types';

export const MANIFEST_SCHEMA_VERSION = 1;

/** Locked remote manifest contract path (app-only GET, schema v1, no wrapper). */
export const REMOTE_MANIFEST_ENDPOINT_PATH =
  '/api/v1/compliance-intelligence/watcher-monitoring-manifest';

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

export interface RemoteManifestOptions {
  /** Backend base URL; the fixed manifest path is appended. */
  endpoint: string;
  tokenProvider: AccessTokenProvider;
  get: HttpGetFn;
  http: BoundedHttpOptions;
}

/**
 * BACKEND manifest acquisition (explicit manifest mode only).
 *
 * GET <endpoint>/api/v1/compliance-intelligence/watcher-monitoring-manifest
 * with `Authorization: Bearer <app-only token>` and no request body. The
 * response flows through the same parseManifestJson/validateManifest pipeline
 * as a FILE snapshot; every failure path throws ManifestError and there is no
 * local-file fallback.
 */
export async function loadManifestFromBackend(
  options: RemoteManifestOptions,
): Promise<ValidatedManifest> {
  const endpoint = options.endpoint.replace(/\/+$/, '');
  const url = `${endpoint}${REMOTE_MANIFEST_ENDPOINT_PATH}`;
  let token: string;
  try {
    token = await options.tokenProvider.getAccessToken();
  } catch (err) {
    const code = err instanceof TokenProviderError ? err.code : 'TOKEN_ERROR';
    throw new ManifestError(`remote manifest token request failed (${code})`);
  }
  if (typeof token !== 'string' || token === '') {
    throw new ManifestError('remote manifest token request returned an empty token');
  }
  let response: { status: number; text: string };
  try {
    response = await boundedHttpGet(options.http, options.get, url, {
      authorization: `Bearer ${token}`,
      accept: 'application/json',
    });
  } catch (err) {
    if (err instanceof HttpError) {
      const status = err.statusCode === undefined ? '' : ` HTTP ${err.statusCode}`;
      throw new ManifestError(
        `remote manifest fetch failed (${err.code}${status}): ${err.message}`,
      );
    }
    throw new ManifestError(
      `remote manifest fetch failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (response.status !== 200) {
    throw new ManifestError(`remote manifest fetch failed: unexpected HTTP ${response.status}`);
  }
  return validateManifest(parseManifestJson(response.text));
}
