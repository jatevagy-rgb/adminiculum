/**
 * Strict allow-list validation tests for the professional editor content
 * schema. Tiptap using JSON is not a reason to accept arbitrary JSON.
 */

import { validateEditorDocument } from '../../Frontend/src/lib/editor/editorSchemaValidator';
import { EDITOR_LIMITS, EditorNode } from '../../Frontend/src/lib/editor/editorModel';

function doc(...content: EditorNode[]): EditorNode {
  return { type: 'doc', content };
}

function para(text: string): EditorNode {
  return { type: 'paragraph', content: [{ type: 'text', text }] };
}

describe('editor schema validator', () => {
  it('accepts a representative valid legal document', () => {
    const valid = doc(
      { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Szerződés' }] },
      {
        type: 'legalClause',
        attrs: { cid: 'cabc1' },
        content: [
          { type: 'clauseHeading', content: [{ type: 'text', text: 'Tárgy' }] },
          para('A felek megállapodnak.'),
          {
            type: 'legalClause',
            attrs: { cid: 'cabc2' },
            content: [para('Alpont.')],
          },
        ],
      },
      {
        type: 'table',
        content: [
          {
            type: 'tableRow',
            content: [
              { type: 'tableHeader', attrs: { colspan: 1, rowspan: 1 }, content: [para('Fejléc')] },
              { type: 'tableCell', attrs: { colspan: 1, rowspan: 1 }, content: [para('Cella')] },
            ],
          },
        ],
      },
      { type: 'pageBreak' },
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Ügyfél: ' },
          { type: 'fieldToken', attrs: { fieldId: 'client.displayName' } },
          {
            type: 'text',
            text: 'link',
            marks: [{ type: 'link', attrs: { href: 'https://example.com' } }],
          },
        ],
      }
    );

    const result = validateEditorDocument(valid);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('rejects unknown node types', () => {
    const result = validateEditorDocument(doc({ type: 'iframeEmbed' } as unknown as EditorNode));
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toContain('unknown node type');
  });

  it('rejects unknown marks and mark attributes', () => {
    const unknownMark = doc({
      type: 'paragraph',
      content: [{ type: 'text', text: 'x', marks: [{ type: 'fontColor' }] }],
    });
    expect(validateEditorDocument(unknownMark).ok).toBe(false);

    const boldWithAttrs = doc({
      type: 'paragraph',
      content: [{ type: 'text', text: 'x', marks: [{ type: 'bold', attrs: { style: 'color:red' } }] }],
    });
    expect(validateEditorDocument(boldWithAttrs).ok).toBe(false);
  });

  it('rejects javascript: and data: links', () => {
    for (const href of ['javascript:alert(1)', 'data:text/html;base64,PHNjcmlwdD4=', 'vbscript:msgbox']) {
      const result = validateEditorDocument(
        doc({ type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'link', attrs: { href } }] }] })
      );
      expect(result.ok).toBe(false);
    }
  });

  it('rejects arbitrary/unknown attributes', () => {
    const result = validateEditorDocument(
      doc({ type: 'paragraph', attrs: { onclick: 'alert(1)' }, content: [{ type: 'text', text: 'x' }] } as unknown as EditorNode)
    );
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toContain('not allowed');
  });

  it('rejects structurally illegal placement', () => {
    // table row directly in doc
    expect(validateEditorDocument(doc({ type: 'tableRow', content: [] })).ok).toBe(false);
    // clauseHeading outside a clause
    expect(validateEditorDocument(doc({ type: 'clauseHeading', content: [{ type: 'text', text: 'x' }] })).ok).toBe(false);
    // nested doc
    expect(validateEditorDocument(doc(doc())).ok).toBe(false);
  });

  it('rejects clause nesting beyond the maximum depth', () => {
    let clause: EditorNode = { type: 'legalClause', attrs: { cid: 'cdeep4' }, content: [para('mély')] };
    for (let level = 3; level >= 1; level -= 1) {
      clause = { type: 'legalClause', attrs: { cid: `cdeep${level}` }, content: [para('szint'), clause] };
    }
    const result = validateEditorDocument(doc(clause));
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toContain('clause nesting');
  });

  it('rejects a clause without a valid cid and unknown field tokens', () => {
    expect(validateEditorDocument(doc({ type: 'legalClause', content: [para('x')] })).ok).toBe(false);
    expect(
      validateEditorDocument(doc({ type: 'legalClause', attrs: { cid: 'not a cid!' }, content: [para('x')] })).ok
    ).toBe(false);
    expect(
      validateEditorDocument(doc({ type: 'paragraph', content: [{ type: 'fieldToken', attrs: { fieldId: 'client.taxNumber' } }] })).ok
    ).toBe(false);
  });

  it('rejects oversized tables', () => {
    const wideRow: EditorNode = {
      type: 'tableRow',
      content: Array.from({ length: EDITOR_LIMITS.maxTableCols + 1 }, () => ({
        type: 'tableCell',
        attrs: { colspan: 1, rowspan: 1 },
        content: [para('c')],
      })),
    };
    expect(validateEditorDocument(doc({ type: 'table', content: [wideRow] })).ok).toBe(false);

    const tallTable: EditorNode = {
      type: 'table',
      content: Array.from({ length: EDITOR_LIMITS.maxTableRows + 1 }, () => ({
        type: 'tableRow',
        content: [{ type: 'tableCell', attrs: { colspan: 1, rowspan: 1 }, content: [para('r')] }],
      })),
    };
    expect(validateEditorDocument(doc(tallTable)).ok).toBe(false);
  });

  it('rejects excessive node counts and text length', () => {
    const manyNodes = doc(...Array.from({ length: EDITOR_LIMITS.maxNodes }, () => para('x')));
    expect(validateEditorDocument(manyNodes).ok).toBe(false);

    const hugeText = doc(para('a'.repeat(EDITOR_LIMITS.maxTotalTextLength + 1)));
    const result = validateEditorDocument(hugeText);
    expect(result.ok).toBe(false);
  });

  it('rejects atoms with content and non-text nodes carrying text', () => {
    expect(validateEditorDocument(doc({ type: 'pageBreak', content: [para('x')] })).ok).toBe(false);
    expect(validateEditorDocument(doc({ type: 'paragraph', text: 'raw' } as unknown as EditorNode)).ok).toBe(false);
  });

  it('rejects unknown node object properties (no HTML smuggling)', () => {
    const result = validateEditorDocument(
      doc({ type: 'paragraph', innerHTML: '<script>alert(1)</script>' } as unknown as EditorNode)
    );
    expect(result.ok).toBe(false);
  });

  it('keeps error output bounded', () => {
    const bad = doc(...Array.from({ length: 100 }, () => ({ type: 'unknownNode' }) as unknown as EditorNode));
    const result = validateEditorDocument(bad);
    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeLessThanOrEqual(30);
  });
});
