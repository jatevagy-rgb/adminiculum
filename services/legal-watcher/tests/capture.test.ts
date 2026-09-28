/**
 * T21, T22 — durable local state store: roundtrip, restart idempotency,
 * atomic writes, and write failure never advancing the baseline.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createFileStateStore, emptyState, StateError } from '../src/capture';
import { makeEvent } from './helpers';
import type { WatcherState } from '../src/types';

function sampleState(): WatcherState {
  const event = makeEvent('32016R0679', 'AMENDMENT_PUBLISHED', '32003R1882');
  return {
    schemaVersion: 1,
    entries: {
      '32016R0679': {
        firstSeenAt: '2026-09-01T00:00:00.000Z',
        events: { [event.eventKey]: event },
        lastSuccessfulRunId: 'r1',
        lastSuccessfulAt: '2026-09-01T00:00:00.000Z',
      },
    },
  };
}

describe('durable file state store', () => {
  test('T21 state roundtrip survives a store restart (idempotent baseline)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lw-state-'));
    try {
      const store = createFileStateStore(dir);
      expect(store.load()).toEqual(emptyState());
      const state = sampleState();
      store.save(state);
      const reloaded = createFileStateStore(dir).load();
      expect(reloaded).toEqual(state);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('atomic write leaves no temp file behind', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lw-state-'));
    try {
      const store = createFileStateStore(dir);
      store.save(sampleState());
      expect(fs.readdirSync(dir)).toEqual(['state.json']);
      expect(JSON.parse(fs.readFileSync(path.join(dir, 'state.json'), 'utf8')).schemaVersion).toBe(1);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('T22 a state write failure does not advance the baseline', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lw-state-'));
    try {
      const store = createFileStateStore(dir);
      store.save(sampleState());
      const before = fs.readFileSync(path.join(dir, 'state.json'), 'utf8');
      // A blocking FILE where the state directory would be: mkdir fails.
      const blocker = path.join(dir, 'blocked');
      fs.writeFileSync(blocker, 'x', 'utf8');
      const badStore = createFileStateStore(path.join(blocker, 'state'));
      expect(() => badStore.save(sampleState())).toThrow(StateError);
      expect(fs.readFileSync(path.join(dir, 'state.json'), 'utf8')).toBe(before);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('corrupt state file fails closed instead of silently resetting', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lw-state-'));
    try {
      fs.writeFileSync(path.join(dir, 'state.json'), '{not json', 'utf8');
      expect(() => createFileStateStore(dir).load()).toThrow(StateError);
      fs.writeFileSync(path.join(dir, 'state.json'), JSON.stringify({ schemaVersion: 9 }), 'utf8');
      expect(() => createFileStateStore(dir).load()).toThrow(StateError);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
