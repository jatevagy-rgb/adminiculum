/**
 * Watcher-owned durable LOCAL file state store (W1 only).
 *
 * - no production deployment in W1
 * - no repository-supported watcher database exists
 * - state is never committed to git (service-local .gitignore)
 *
 * Stored: watched CELEX + deterministic event keys + minimal event metadata
 * (hashes, URIs, dates, provenance, timestamps). NOT stored: legal text,
 * HTML bodies, full legislation, customer/case/document data, tokens,
 * credentials.
 *
 * Writes are atomic: temp file -> fsync -> rename. A failed write never
 * replaces a valid baseline (the previous state.json stays intact).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { WatcherState } from './types';
import { STATE_SCHEMA_VERSION } from './types';

export class StateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StateError';
  }
}

export interface StateStore {
  load(): WatcherState;
  save(state: WatcherState): void;
}

export function emptyState(): WatcherState {
  return { schemaVersion: STATE_SCHEMA_VERSION, entries: {} };
}

function isWatcherState(raw: unknown): raw is WatcherState {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return false;
  const obj = raw as Record<string, unknown>;
  return obj.schemaVersion === STATE_SCHEMA_VERSION && obj.entries !== null && typeof obj.entries === 'object';
}

export function createFileStateStore(stateDir: string): StateStore {
  const filePath = path.join(stateDir, 'state.json');
  const tmpPath = path.join(stateDir, 'state.json.tmp');

  function load(): WatcherState {
    let text: string;
    try {
      text = fs.readFileSync(filePath, 'utf8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return emptyState();
      throw new StateError(`cannot read state file: ${filePath}`);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new StateError(`state file is not valid JSON: ${filePath}`);
    }
    if (!isWatcherState(parsed)) {
      throw new StateError(`state file has unsupported shape: ${filePath}`);
    }
    return parsed;
  }

  function save(state: WatcherState): void {
    try {
      fs.mkdirSync(stateDir, { recursive: true });
      fs.writeFileSync(tmpPath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
      const fd = fs.openSync(tmpPath, 'r+');
      try {
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
      fs.renameSync(tmpPath, filePath);
    } catch (err) {
      throw new StateError(
        `state write failed (baseline NOT advanced): ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return { load, save };
}
