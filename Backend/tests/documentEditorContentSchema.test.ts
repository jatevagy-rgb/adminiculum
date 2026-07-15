import {
  getSerializedEditorContentByteSize,
  validateStoredEditorContentEnvelope,
  validateTiptapDocument,
} from '../src/modules/documentEditor/contentSchema';

const documentId = 'doc-1';

function validDoc() {
  return {
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Szerződés' }] },
      {
        type: 'legalClause',
        attrs: { cid: 'cRoot1', level: 1 },
        content: [
          { type: 'clauseHeading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Általános rendelkezések' }] },
          { type: 'paragraph', content: [{ type: 'fieldToken', attrs: { fieldId: 'case.reference' } }] },
        ],
      },
      {
        type: 'table',
        content: [
          {
            type: 'tableRow',
            content: [
              { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Mező' }] }] },
              { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Érték' }] }] },
            ],
          },
        ],
      },
      { type: 'pageBreak' },
    ],
  };
}

function validEnvelope(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    documentId,
    format: 'TIPTAP_JSON',
    content: validDoc(),
    metadata: {
      createdAt: '2026-07-14T08:00:00.000Z',
      createdByUserId: 'user-1',
      editorVersion: 'document-editor-pro-1',
    },
    ...overrides,
  };
}

describe('document editor content schema validator', () => {
  it('accepts a valid Tiptap envelope with clauses, field tokens, table and page break', () => {
    const envelope = validEnvelope();
    const result = validateStoredEditorContentEnvelope(envelope, {
      documentId,
      serializedByteSize: getSerializedEditorContentByteSize(envelope),
    });
    expect(result).toEqual({ valid: true, errors: [] });
  });

  it.each([
    ['unknown node', { type: 'doc', content: [{ type: 'iframe' }] }],
    ['unknown mark', { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'script' }] }] }] }],
    ['unknown attribute', { type: 'doc', content: [{ type: 'paragraph', attrs: { style: 'color:red' } }] }],
    ['unsafe link', { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }] }] }] }],
    ['data url', { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'link', attrs: { href: 'data:text/html;base64,PHNjcmlwdA==' } }] }] }] }],
    ['base64 payload', { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'data:image/png;base64,AAAA' }] }] }],
    ['bad field token', { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'fieldToken', attrs: { fieldId: 'client.secret' } }] }] }],
    ['malformed table', { type: 'doc', content: [{ type: 'table', content: [{ type: 'paragraph' }] }] }],
  ])('rejects %s', (_name, doc) => {
    const result = validateTiptapDocument(doc);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('rejects duplicate legal clause ids', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'legalClause', attrs: { cid: 'cDup1', level: 1 } },
        { type: 'legalClause', attrs: { cid: 'cDup1', level: 1 } },
      ],
    };
    const result = validateTiptapDocument(doc);
    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.message.includes('Duplicate'))).toBe(true);
  });

  it('rejects excessive depth and oversized serialized payloads without returning content', () => {
    let deep: any = { type: 'paragraph' };
    for (let i = 0; i < 30; i += 1) deep = { type: 'paragraph', content: [deep] };
    expect(validateTiptapDocument({ type: 'doc', content: [deep] }).valid).toBe(false);

    const oversized = validateStoredEditorContentEnvelope(validEnvelope(), {
      documentId,
      serializedByteSize: 2_000_001,
    });
    expect(oversized.valid).toBe(false);
    expect(JSON.stringify(oversized)).not.toContain('Szerződés');
  });

  it('rejects document id mismatch and prototype-related keys', () => {
    expect(validateStoredEditorContentEnvelope(validEnvelope({ documentId: 'other-doc' }), { documentId }).valid).toBe(false);
    expect(validateStoredEditorContentEnvelope({ ...validEnvelope(), constructor: { poisoned: true } }, { documentId }).valid).toBe(false);
  });
});
