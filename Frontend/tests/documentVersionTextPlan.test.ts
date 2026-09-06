import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveVersionTextPlan } from '../src/lib/documents/versionTextPlan';

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

// B + C. Current non-TXT uploaded document -> document-level extracted text preview.
test('current DOCX version uses the document-level text endpoint', () => {
  assert.equal(resolveVersionTextPlan({ ...currentUploaded, fileType: 'DOCX' }), 'DOCUMENT_TEXT');
});

test('current PDF version uses the document-level text endpoint', () => {
  assert.equal(resolveVersionTextPlan({ ...currentUploaded, fileType: 'PDF' }), 'DOCUMENT_TEXT');
});

test('other current non-TXT file types also use the document-level text endpoint', () => {
  assert.equal(resolveVersionTextPlan({ ...currentUploaded, fileType: 'FILE' }), 'DOCUMENT_TEXT');
  assert.equal(resolveVersionTextPlan({ ...currentUploaded, fileType: null }), 'DOCUMENT_TEXT');
});

// D. Non-current non-TXT — document-level current text is never substituted.
test('non-current DOCX/PDF stays at truthful NONE — no document-level substitution', () => {
  for (const fileType of ['DOCX', 'PDF', 'FILE']) {
    assert.equal(
      resolveVersionTextPlan({ ...currentUploaded, versionIsCurrent: false, fileType }),
      'NONE',
    );
  }
});

// E. Only VERSION_BLOB (TXT) can ever feed version-scoped text anchors:
// DOCUMENT_TEXT is a separate display channel that never reaches versionText.
test('document-level text plan exists only for the current version', () => {
  const states = [
    { ...currentUploaded, versionIsCurrent: false },
    { ...currentUploaded, versionBelongsToSelectedDocument: false },
    { ...currentUploaded, documentIsUploaded: false },
    { ...currentUploaded, hasSelectedVersion: false },
  ];
  for (const state of states) {
    assert.equal(resolveVersionTextPlan({ ...state, fileType: 'DOCX' }), 'NONE');
    assert.equal(resolveVersionTextPlan({ ...state, fileType: 'PDF' }), 'NONE');
  }
});

// F. Document switch: a version that has not reconciled to the selected
// document must not trigger document-level text for the new document.
test('unreconciled version during a document switch yields NONE', () => {
  assert.equal(
    resolveVersionTextPlan({
      hasSelectedVersion: true,
      fileType: 'DOCX',
      versionIsCurrent: true,
      versionBelongsToSelectedDocument: false,
      documentIsUploaded: true,
    }),
    'NONE',
  );
});

test('no selected version yields NONE', () => {
  assert.equal(
    resolveVersionTextPlan({ ...currentUploaded, hasSelectedVersion: false, fileType: 'DOCX' }),
    'NONE',
  );
});

test('non-uploaded document types never use the document-level preview', () => {
  assert.equal(
    resolveVersionTextPlan({ ...currentUploaded, documentIsUploaded: false, fileType: 'DOCX' }),
    'NONE',
  );
});
