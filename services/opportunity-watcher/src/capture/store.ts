/**
 * GWO-1 — service-local capture store.
 *
 * Simplest transparent persistence: one JSON file keyed by
 * `source|sourceIdentifier`. Stores only the last normalized state
 * (contentHash, lastObservedAt, bounded opportunity snapshot) needed for
 * deterministic NEW / UPDATED / UNCHANGED classification. No Prisma, no
 * database-URL environment variable, no Adminiculum database, no historical
 * warehouse.
 *
 * State dir resolution: OPPORTUNITY_WATCHER_STATE_DIR env var, else
 * `<service-root>/.state` (gitignored).
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NormalizedExternalOpportunity } from '../types.ts';
import { compareCodePoints } from '../hash/contentHash.ts';

export interface CaptureRecord {
  contentHash: string;
  lastObservedAt: string;
  opportunity: NormalizedExternalOpportunity;
}

export interface CaptureStateFile {
  schemaVersion: 1;
  updatedAt: string | null;
  records: Record<string, CaptureRecord>;
}

export const CAPTURE_SCHEMA_VERSION = 1 as const;

export function captureKey(source: string, sourceIdentifier: string): string {
  return `${source}|${sourceIdentifier}`;
}

export function defaultStateDir(): string {
  const override = process.env['OPPORTUNITY_WATCHER_STATE_DIR'];
  if (override && override.trim().length > 0) {
    return override;
  }
  return join(dirname(fileURLToPath(import.meta.url)), '..', '..', '.state');
}

export class CaptureStore {
  private readonly filePath: string;
  private state: CaptureStateFile;

  constructor(stateDir: string = defaultStateDir(), fileName = 'capture.json') {
    this.filePath = join(stateDir, fileName);
    this.state = this.load();
  }

  private load(): CaptureStateFile {
    if (!existsSync(this.filePath)) {
      return { schemaVersion: CAPTURE_SCHEMA_VERSION, updatedAt: null, records: {} };
    }
    const text = readFileSync(this.filePath, 'utf8');
    if (text.trim().length === 0) {
      return { schemaVersion: CAPTURE_SCHEMA_VERSION, updatedAt: null, records: {} };
    }
    const parsed = JSON.parse(text) as CaptureStateFile;
    if (!parsed || typeof parsed !== 'object' || parsed.schemaVersion !== CAPTURE_SCHEMA_VERSION || typeof parsed.records !== 'object' || parsed.records === null) {
      throw new Error('CAPTURE_STORE_INVALID');
    }
    return parsed;
  }

  get(key: string): CaptureRecord | null {
    return this.state.records[key] ?? null;
  }

  all(): CaptureRecord[] {
    return Object.entries(this.state.records)
      .sort(([a], [b]) => compareCodePoints(a, b))
      .map(([, record]) => record);
  }

  upsert(opportunity: NormalizedExternalOpportunity): CaptureRecord {
    const key = captureKey(opportunity.source, opportunity.sourceIdentifier);
    const record: CaptureRecord = {
      contentHash: opportunity.contentHash,
      lastObservedAt: opportunity.observedAt,
      opportunity,
    };
    this.state.records[key] = record;
    return record;
  }

  /** Atomic-enough write: temp file + rename; deterministic key order. */
  save(updatedAt: string): void {
    this.state.updatedAt = updatedAt;
    const sorted: Record<string, CaptureRecord> = {};
    for (const key of Object.keys(this.state.records).sort(compareCodePoints)) {
      const record = this.state.records[key];
      if (record) sorted[key] = record;
    }
    const payload: CaptureStateFile = {
      schemaVersion: CAPTURE_SCHEMA_VERSION,
      updatedAt,
      records: sorted,
    };
    mkdirSync(dirname(this.filePath), { recursive: true });
    const tempPath = `${this.filePath}.tmp`;
    writeFileSync(tempPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    renameSync(tempPath, this.filePath);
  }
}
