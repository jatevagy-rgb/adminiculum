import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isVersionScopedTextPlan, resolveVersionTextPlan } from '../src/lib/documents/versionTextPlan';

const currentUploaded = {
  hasSelectedVersion: true,
  versionIsCurrent: true,
  versionBelongsToSelectedDocument: true,
  documentIsUploaded: true,
};

// A. TXT — current and non-current — keeps the version-specific blob path.
test('current TXT version keeps the version-specific blob path', () => {
  assert.equal(resolveVersionTextPlan({ ...currentUploaded, fileType: 'TXT' }), 'VERSION_BLOB');
});

test('non-current TXT version still uses its own stored bytes', () => {
  assert.equal(
    resolveVersionTextPlan({ ...currentUploaded, versionIsCurrent: false, fileType: 'TXT' }),
    'VERSION_BLOB',
  );
});

// B. DOCX/PDF — current AND historical — use the exact version-text API.
test('current DOCX version uses the exact version-text endpoint', () => {
  assert.equal(resolveVersionTextPlan({ ...currentUploaded, fileType: 'DOCX' }), 'VERSION_TEXT');
});

test('current PDF version uses the exact version-text endpoint', () => {
  assert.equal(resolveVersionTextPlan({ ...currentUploaded, fileType: 'PDF' }), 'VERSION_TEXT');
});

test('historical DOCX/PDF versions are version-scoped too — no document-level substitution', () => {
  for (const fileType of ['DOCX', 'PDF']) {
    assert.equal(
      resolveVersionTextPlan({ ...currentUploaded, versionIsCurrent: false, fileType }),
      'VERSION_TEXT',
    );
  }
});

test('version-scoped plans are explicitly identifiable', () => {
  assert.equal(isVersionScopedTextPlan('VERSION_TEXT'), true);
  assert.equal(isVersionScopedTextPlan('VERSION_BLOB'), true);
  assert.equal(isVersionScopedTextPlan('DOCUMENT_TEXT'), false);
  assert.equal(isVersionScopedTextPlan('NONE'), false);
});

// C. Non-version / non-extractable formats keep the legacy read-only preview
// only while they are the document's CURRENT version.
test('other current non-extractable file types keep the document-level preview', () => {
  assert.equal(resolveVersionTextPlan({ ...currentUploaded, fileType: 'FILE' }), 'DOCUMENT_TEXT');
  assert.equal(resolveVersionTextPlan({ ...currentUploaded, fileType: null }), 'DOCUMENT_TEXT');
});

test('non-current non-extractable versions stay at truthful NONE', () => {
  for (const fileType of ['FILE', null]) {
    assert.equal(
      resolveVersionTextPlan({ ...currentUploaded, versionIsCurrent: false, fileType }),
      'NONE',
    );
  }
});

// D. Only version-scoped plans can ever feed versionText anchors:
// DOCUMENT_TEXT is a separate display channel.
test('document-level text plan exists only for the current version', () => {
  const states = [
    { ...currentUploaded, versionBelongsToSelectedDocument: false },
    { ...currentUploaded, documentIsUploaded: false },
    { ...currentUploaded, hasSelectedVersion: false },
  ];
  for (const state of states) {
    assert.equal(resolveVersionTextPlan({ ...state, fileType: 'DOCX' }), 'NONE');
    assert.equal(resolveVersionTextPlan({ ...state, fileType: 'PDF' }), 'NONE');
  }
});

// E. Document switch: a version that has not reconciled to the selected
// document must not trigger any fetch — including the TXT blob and version-text
// paths, whose stored content would otherwise render the old document's text.
test('unreconciled version during a document switch yields NONE for every format', () => {
  for (const fileType of ['TXT', 'DOCX', 'PDF']) {
    assert.equal(
      resolveVersionTextPlan({
        hasSelectedVersion: true,
        fileType,
        versionIsCurrent: true,
        versionBelongsToSelectedDocument: false,
        documentIsUploaded: true,
      }),
      'NONE',
    );
  }
});

test('no selected version yields NONE', () => {
  assert.equal(
    resolveVersionTextPlan({ ...currentUploaded, hasSelectedVersion: false, fileType: 'DOCX' }),
    'NONE',
  );
});

test('non-uploaded document types never use the version/doc text channels', () => {
  assert.equal(
    resolveVersionTextPlan({ ...currentUploaded, documentIsUploaded: false, fileType: 'DOCX' }),
    'NONE',
  );
});
