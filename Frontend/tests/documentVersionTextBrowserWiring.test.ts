/**
 * Browser-wiring proof for exact-version DOCX/PDF text (DOCUMENT-CONTENT-PIPELINE-1
 * browser integration). No DOM harness exists in this repo, so the EXECUTABLE
 * proof runs the real production decision modules the Document Workspace uses:
 *
 *   - resolveVersionTextPlan           (which text channel the reader selects)
 *   - resolveVersionTextLoadOutcome    (exact version text vs truthful unavailable)
 *   - isVersionScopedTextPlan          (which channels may feed anchors)
 *   - findReaderMatchOffsets + buildReaderHighlightSegmentsInRange  (search)
 *   - buildTextAnchor                  (version-true TEXT_RANGE offsets)
 *
 * and additionally string-asserts the actual page wiring (the VERSION_TEXT branch
 * must fetch the exact version and must never fall back to the document-level
 * preview). Mandated liability fixture:
 *   V1: A szolgáltató felelőssége korlátlan.
 *   V2: A szolgáltató teljes felelőssége a nettó éves díj összegére korlátozott.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { isVersionScopedTextPlan, resolveVersionTextPlan } from '../src/lib/documents/versionTextPlan';
import { resolveVersionTextLoadOutcome } from '../src/lib/documents/versionTextAvailability';
import {
  buildReaderHighlightSegmentsInRange,
  findReaderMatchOffsets,
} from '../src/lib/documents/readerSearch';
import { buildTextAnchor } from '../src/lib/annotations/annotationAnchors';
import { TEXT_RENDERER_VERSION } from '../src/lib/annotations/annotationCapabilities';

const V1_TEXT = 'A szolgáltató felelőssége korlátlan.';
const V2_TEXT = 'A szolgáltató teljes felelőssége a nettó éves díj összegére korlátozott.';
const V1_SENTENCE = 'A szolgáltató felelőssége korlátlan.';
const V2_SENTENCE = 'A szolgáltató teljes felelőssége a nettó éves díj összegére korlátozott.';

const page = () => readFileSync(
  path.resolve(process.cwd(), 'src/app/cases/[caseId]/documents/page.tsx'),
  'utf8',
);

type VersionFixture = {
  id: string;
  documentId: string;
  fileType: 'DOCX' | 'PDF';
  isCurrent: boolean;
  text: string;
};

const V1: VersionFixture = { id: 'version-v1', documentId: 'doc-1', fileType: 'DOCX', isCurrent: false, text: V1_TEXT };
const V2: VersionFixture = { id: 'version-v2', documentId: 'doc-1', fileType: 'DOCX', isCurrent: true, text: V2_TEXT };

/** Exact-version text API contract: HTTP 200 carrying only THIS version's text. */
function makeVersionTextApi(versions: VersionFixture[]) {
  const calls: string[] = [];
  const api = async (documentId: string, versionId: string) => {
    calls.push(`${documentId}:${versionId}`);
    const version = versions.find((candidate) => candidate.id === versionId && candidate.documentId === documentId);
    if (!version) {
      // The endpoint answers 404 for a version that is not in the document.
      throw Object.assign(new Error('not found'), { status: 404, code: 'DOCUMENT_VERSION_NOT_FOUND' });
    }
    return {
      documentId,
      versionId: version.id,
      versionNumber: version.isCurrent ? 2 : 1,
      source: 'UPLOADED' as const,
      text: version.text,
    };
  };
  return { api, calls };
}

/** Mirrors the page effect: only version-scoped plans issue a fetch. */
async function resolveReaderText(
  version: VersionFixture,
  selectedDocumentId: string,
  versions: VersionFixture[],
  api: (documentId: string, versionId: string) => Promise<{ text: string }>,
) {
  const plan = resolveVersionTextPlan({
    hasSelectedVersion: true,
    fileType: version.fileType,
    versionIsCurrent: version.isCurrent,
    versionBelongsToSelectedDocument:
      version.documentId === selectedDocumentId && versions.some((v) => v.id === version.id),
    documentIsUploaded: true,
  });
  assert.equal(plan, 'VERSION_TEXT');
  assert.equal(isVersionScopedTextPlan(plan), true);
  const result = await api(selectedDocumentId, version.id);
  return resolveVersionTextLoadOutcome(result);
}

test('historical v1 and current v2 DOCX both resolve through the exact version text API', () => {
  assert.equal(
    resolveVersionTextPlan({
      hasSelectedVersion: true, fileType: 'DOCX', versionIsCurrent: false,
      versionBelongsToSelectedDocument: true, documentIsUploaded: true,
    }),
    'VERSION_TEXT',
  );
  assert.equal(
    resolveVersionTextPlan({
      hasSelectedVersion: true, fileType: 'DOCX', versionIsCurrent: true,
      versionBelongsToSelectedDocument: true, documentIsUploaded: true,
    }),
    'VERSION_TEXT',
  );
});

test('select v1 shows the v1 sentence and never the v2 sentence', async () => {
  const { api, calls } = makeVersionTextApi([V1, V2]);
  const outcome = await resolveReaderText(V1, 'doc-1', [V1, V2], api);
  assert.equal(outcome.text, V1_TEXT);
  assert.ok(outcome.text.includes(V1_SENTENCE));
  assert.ok(!outcome.text.includes(V2_SENTENCE));
  assert.deepEqual(calls, ['doc-1:version-v1']);
});

test('select v2 shows the v2 sentence and never the v1 sentence', async () => {
  const { api, calls } = makeVersionTextApi([V1, V2]);
  const outcome = await resolveReaderText(V2, 'doc-1', [V1, V2], api);
  assert.equal(outcome.text, V2_TEXT);
  assert.ok(outcome.text.includes(V2_SENTENCE));
  assert.ok(!outcome.text.includes(V1_SENTENCE));
  assert.deepEqual(calls, ['doc-1:version-v2']);
});

test('reloading the v1 URL resolves the exact v1 text again (no latest substitution)', async () => {
  const { api, calls } = makeVersionTextApi([V1, V2]);
  const first = await resolveReaderText(V1, 'doc-1', [V1, V2], api);
  const reloaded = await resolveReaderText(V1, 'doc-1', [V1, V2], api);
  assert.equal(first.text, V1_TEXT);
  assert.equal(reloaded.text, V1_TEXT);
  assert.ok(!reloaded.text.includes('korlátozott'));
  assert.deepEqual(calls, ['doc-1:version-v1', 'doc-1:version-v1']);
});

test('document switch: an unreconciled v1 selection never fetches (no stale flash)', async () => {
  const plan = resolveVersionTextPlan({
    hasSelectedVersion: true,
    fileType: 'DOCX',
    versionIsCurrent: false,
    // versions list still holds doc A while doc B is selected
    versionBelongsToSelectedDocument: false,
    documentIsUploaded: true,
  });
  assert.equal(plan, 'NONE');
  assert.equal(isVersionScopedTextPlan(plan), false);
});

test('search runs on the exact displayed v1 text and never on v2 text', async () => {
  const { api } = makeVersionTextApi([V1, V2]);
  const v1 = await resolveReaderText(V1, 'doc-1', [V1, V2], api);
  const v2 = await resolveReaderText(V2, 'doc-1', [V1, V2], api);

  const query = 'korlátlan';
  const v1Offsets = findReaderMatchOffsets(v1.text, query);
  const v2Offsets = findReaderMatchOffsets(v2.text, query);
  assert.equal(v1Offsets.length, 1);
  assert.equal(v2Offsets.length, 0);

  // Rejoining highlighted segments returns the exact displayed text byte-for-byte.
  const segments = buildReaderHighlightSegmentsInRange(v1.text as string, 0, (v1.text as string).length, v1Offsets, query.length);
  assert.equal(segments.map((segment) => segment.text).join(''), V1_TEXT);
  assert.deepEqual(segments.filter((s) => s.matchIndex !== null).map((s) => s.text), ['korlátlan']);

  // The v2-specific phrase is never found in v1's searched text.
  assert.equal(findReaderMatchOffsets(v1.text, 'nettó éves díj összegére').length, 0);
});

test('TEXT_RANGE anchor offsets are version-true to the selected version', async () => {
  const { api } = makeVersionTextApi([V1, V2]);
  const v1 = await resolveReaderText(V1, 'doc-1', [V1, V2], api);
  const v2 = await resolveReaderText(V2, 'doc-1', [V1, V2], api);

  const anchor = buildTextAnchor({
    rawSelection: 'korlátlan',
    versionText: v1.text,
    rendererVersion: TEXT_RENDERER_VERSION,
  });
  assert.equal(anchor.ok, true);
  if (!anchor.ok) return;
  assert.equal(
    (v1.text as string).slice(anchor.anchor.startOffset as number, anchor.anchor.endOffset as number),
    'korlátlan',
  );
  assert.equal(anchor.anchor.selectedText, 'korlátlan');

  // The same selection does not exist in v2 — the anchor is refused, never
  // silently retargeted at another version's offsets.
  const crossVersion = buildTextAnchor({
    rawSelection: 'korlátlan',
    versionText: v2.text,
    rendererVersion: TEXT_RENDERER_VERSION,
  });
  assert.deepEqual(crossVersion, { ok: false, reason: 'NOT_FOUND_IN_VERSION' });
});

test('an unavailable exact version yields a truthful state, never another version text', async () => {
  const outcome = resolveVersionTextLoadOutcome({
    text: '',
    unavailableReason: 'A verzió nem tartalmaz géppel kinyerhető szöveget.',
  });
  assert.equal(outcome.text, null);
  assert.equal(outcome.unavailableReason, 'A verzió nem tartalmaz géppel kinyerhető szöveget.');
  assert.ok(!String(outcome.unavailableReason).includes('reasonCode'));
});

test('page wiring: VERSION_TEXT fetches the exact version and never the document preview', () => {
  const source = page();
  assert.match(source, /getDocumentVersionText\(selectedVersionDocumentId, selectedVersionStableId\)/);
  assert.match(source, /versionTextPlan === 'VERSION_TEXT'/);
  // The last version-text channel is the only thing that feeds versionText.
  const versionTextAssignments: string[] = source.match(/setVersionText\([^)]*\)/g) || [];
  assert.ok(versionTextAssignments.includes('setVersionText(text)'));
  assert.ok(versionTextAssignments.includes('setVersionText(outcome.text)'));
  assert.ok(!versionTextAssignments.some((assignment) => assignment.includes('documentTextPreview')));
  assert.ok(!source.includes('setVersionText(documentTextPreview)'));
  assert.ok(!source.includes('setVersionText(result.text)'));
});
