/**
 * GWO-1 — one-time generator for the minimized official reference dictionary.
 *
 * Fetches the official EU Funding & Tenders Portal reference data ONCE,
 * extracts only the status and programme code mappings used by the adapter,
 * and writes a small provenance-backed artifact:
 *
 *   dictionaries/funding-tenders-codes.json
 *
 * Provenance recorded: source URL, capture date, sha256 and byte size of the
 * fetched payload, record count and generator name. CI and tests never fetch
 * reference data; they read the committed artifact.
 *
 * Usage (from services/opportunity-watcher):
 *   node scripts/extract-reference-dictionary.mjs
 */

import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE_URL = 'https://ec.europa.eu/info/funding-tenders/opportunities/data/referenceData/grantsTenders.json';
const OUTPUT_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'dictionaries', 'funding-tenders-codes.json');
const TIMEOUT_MS = 180_000;

/** Documented label -> canonical state mapping. Unmatched labels stay null. */
function stateForLabel(label) {
  const value = String(label || '').toLowerCase();
  if (value.includes('forthcoming')) return 'FORTHCOMING';
  if (value.includes('open')) return 'OPEN';
  if (value.includes('closed')) return 'CLOSED';
  if (value.includes('cancel')) return 'CANCELLED';
  if (value.includes('award')) return 'AWARDED';
  if (value.includes('not announced') || value.includes('planned') || value.includes('upcoming')) return 'NOT_ANNOUNCED';
  return null;
}

function compare(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function sortedRecord(entries) {
  const out = {};
  for (const key of Object.keys(entries).sort(compare)) out[key] = entries[key];
  return out;
}

const response = await fetch(SOURCE_URL, { signal: AbortSignal.timeout(TIMEOUT_MS) });
if (!response.ok) {
  throw new Error(`REFERENCE_DATA_FETCH_FAILED: HTTP ${response.status}`);
}
const buffer = Buffer.from(await response.arrayBuffer());
const sha256 = createHash('sha256').update(buffer).digest('hex');
const parsed = JSON.parse(buffer.toString('utf8'));
const records = parsed?.fundingData?.GrantTenderObj;
if (!Array.isArray(records)) {
  throw new Error('REFERENCE_DATA_SHAPE_UNEXPECTED');
}

const statuses = {};
const programmes = {};
for (const record of records) {
  const status = record?.status;
  if (status && typeof status === 'object' && status.id !== undefined && status.id !== null) {
    const id = String(status.id);
    if (!statuses[id]) {
      const label = String(status.abbreviation ?? status.description ?? '');
      statuses[id] = {
        abbreviation: String(status.abbreviation ?? ''),
        description: String(status.description ?? ''),
        state: stateForLabel(label),
      };
    }
  }
  const programme = record?.frameworkProgramme;
  if (programme && typeof programme === 'object' && programme.id !== undefined && programme.id !== null) {
    const id = String(programme.id);
    if (!programmes[id]) {
      programmes[id] = {
        abbreviation: String(programme.abbreviation ?? ''),
        description: String(programme.description ?? ''),
      };
    }
  }
}

const artifact = {
  schemaVersion: 1,
  provenance: {
    generator: 'scripts/extract-reference-dictionary.mjs',
    generatedAt: new Date().toISOString(),
    sourceName: 'EU Funding & Tenders Portal reference data (grantsTenders.json)',
    sourceUrl: SOURCE_URL,
    capturedAt: new Date().toISOString(),
    sha256,
    bytes: buffer.byteLength,
    records: records.length,
    note:
      'Minimized: only distinct status objects and frameworkProgramme objects are extracted. ' +
      'State mapping is derived from official labels with a documented rule; unmatched labels stay null ' +
      'and render as UNKNOWN at runtime. No other reference content is copied.',
  },
  statuses: sortedRecord(statuses),
  programmes: sortedRecord(programmes),
};

mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
writeFileSync(OUTPUT_PATH, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');

console.log(
  JSON.stringify({
    output: OUTPUT_PATH,
    statuses: Object.keys(statuses).length,
    programmes: Object.keys(programmes).length,
    sha256,
    bytes: buffer.byteLength,
    records: records.length,
  }),
);
