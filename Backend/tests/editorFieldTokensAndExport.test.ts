/**
 * Field-token allow-list, insertion presets and export-truthfulness tests for
 * the professional editor.
 */

import {
  convertResolvedTokensToStaticText,
  countUnresolvedTokens,
  EDITOR_FIELDS,
  FieldResolutionContext,
  isAllowedFieldId,
  listTokenOccurrences,
  resolveField,
  tokenDisplayText,
} from '../../Frontend/src/lib/editor/fieldTokens';
import { INSERTION_PRESETS } from '../../Frontend/src/lib/editor/insertionPresets';
import { validateEditorDocument } from '../../Frontend/src/lib/editor/editorSchemaValidator';
import { editorDocToStandaloneHtml } from '../../Frontend/src/lib/editor/htmlExport';
import { computeDocumentStats } from '../../Frontend/src/lib/editor/plainTextExport';
import { EditorNode } from '../../Frontend/src/lib/editor/editorModel';

const context: FieldResolutionContext = {
  caseDisplayName: 'Teszt Kft. - Megbízás',
  caseReference: 'CASE-2026-042',
  clientDisplayName: 'Teszt Kft.',
  clientRole: 'MEGBÍZÓ',
  lawyerDisplayName: 'Dr. Példa Ügyvéd',
  documentTitle: 'Megbízási szerződés',
  today: new Date('2026-07-14T10:00:00.000Z'),
};

function docWithTokens(...fieldIds: string[]): EditorNode {
  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: fieldIds.map((fieldId) => ({ type: 'fieldToken', attrs: { fieldId } })),
      },
    ],
  };
}

describe('field token allow-list', () => {
  it('accepts only explicitly allowed field ids', () => {
    expect(isAllowedFieldId('client.displayName')).toBe(true);
    expect(isAllowedFieldId('client.taxNumber')).toBe(false);
    expect(isAllowedFieldId('client.notes')).toBe(false);
    expect(isAllowedFieldId('__proto__')).toBe(false);
    expect(isAllowedFieldId('client.displayName.constructor')).toBe(false);
  });

  it('contains no sensitive identifier fields by default', () => {
    const ids = EDITOR_FIELDS.map((field) => field.id).join(' ');
    for (const forbidden of ['taxNumber', 'registration', 'address', 'notes', 'email', 'phone', 'workspaceText']) {
      expect(ids).not.toContain(forbidden);
    }
  });

  it('resolves supported fields from the explicit context only (no object traversal)', () => {
    expect(resolveField('client.displayName', context)).toBe('Teszt Kft.');
    expect(resolveField('case.reference', context)).toBe('CASE-2026-042');
    expect(resolveField('date.today', context)).toBe('2026. 07. 14.');
    // Manual fields never auto-resolve.
    expect(resolveField('party.name', context)).toBeNull();
    expect(resolveField('amount.value', context)).toBeNull();
  });

  it('lists occurrences and counts unresolved tokens', () => {
    const doc = docWithTokens('client.displayName', 'party.name', 'date.today');
    const occurrences = listTokenOccurrences(doc, context);
    expect(occurrences).toHaveLength(3);
    expect(countUnresolvedTokens(doc, context)).toBe(1);
    expect(countUnresolvedTokens(doc, {})).toBe(3 - 1); // date.today still resolves without context
  });

  it('converts only resolved tokens to static text (explicit action, pure transform)', () => {
    const doc = docWithTokens('client.displayName', 'party.name');
    const converted = convertResolvedTokensToStaticText(doc, context);
    const paragraph = (converted.content as EditorNode[])[0];
    const kinds = (paragraph.content as EditorNode[]).map((node) => node.type);
    expect(kinds).toEqual(['text', 'fieldToken']);
    // Original doc untouched.
    expect(((doc.content as EditorNode[])[0].content as EditorNode[])[0].type).toBe('fieldToken');
  });

  it('renders unresolved tokens as visible placeholders', () => {
    expect(tokenDisplayText('party.name', context)).toBe('{{ Fél neve (kézi) }}');
    expect(tokenDisplayText('client.displayName', context)).toBe('Teszt Kft.');
  });
});

describe('insertion presets', () => {
  it('every preset produces validator-clean structured content', () => {
    for (const preset of INSERTION_PRESETS) {
      const doc: EditorNode = { type: 'doc', content: preset.build() };
      const result = validateEditorDocument(doc);
      expect(`${preset.id}:${result.errors.join('; ')}`).toBe(`${preset.id}:`);
    }
  });

  it('signature block contains signature lines but no signature image or e-signature reference', () => {
    const signature = INSERTION_PRESETS.find((preset) => preset.id === 'signature-2')!;
    const serialized = JSON.stringify(signature.build());
    expect(serialized).toContain('____');
    expect(serialized.toLowerCase()).not.toContain('img');
    expect(serialized.toLowerCase()).not.toContain('docusign');
    expect(serialized.toLowerCase()).not.toContain('signature-image');
  });
});

describe('standalone HTML export', () => {
  const exportDoc: EditorNode = {
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Szerződés <teszt>' }] },
      {
        type: 'legalClause',
        attrs: { cid: 'cexp1' },
        content: [
          { type: 'clauseHeading', content: [{ type: 'text', text: 'Tárgy' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'Tartalom & még valami.' }] },
        ],
      },
      { type: 'pageBreak' },
      {
        type: 'paragraph',
        content: [
          { type: 'fieldToken', attrs: { fieldId: 'client.displayName' } },
          { type: 'fieldToken', attrs: { fieldId: 'party.name' } },
        ],
      },
    ],
  };

  it('emits escaped, self-contained HTML with generated clause numbers', () => {
    const html = editorDocToStandaloneHtml(exportDoc, { title: 'Teszt export', context });
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('Szerződés &lt;teszt&gt;');
    expect(html).toContain('<span class="clause-no">1.</span>');
    expect(html).toContain('Tartalom &amp; még valami.');
    expect(html).toContain('page-break');
    expect(html).toContain('Teszt Kft.');
    expect(html).toContain('{{ Fél neve (kézi) }}'); // unresolved stays visible
  });

  it('contains no scripts, no internal ids, no application markup', () => {
    const html = editorDocToStandaloneHtml(exportDoc, { title: 'Teszt', context });
    expect(html).not.toContain('<script');
    expect(html).not.toContain('cexp1'); // clause ids are internal only
    expect(html).not.toContain('data-clause');
    expect(html).not.toContain('localhost');
  });
});

describe('document statistics', () => {
  it('counts words, paragraphs, clauses and labels pages as approximate', () => {
    const doc: EditorNode = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'egy kettő három' }] },
        { type: 'legalClause', attrs: { cid: 'cstat1' }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'négy öt' }] }] },
        { type: 'pageBreak' },
        { type: 'paragraph', content: [{ type: 'text', text: 'hat' }] },
      ],
    };
    const stats = computeDocumentStats(doc);
    expect(stats.words).toBe(6);
    expect(stats.paragraphs).toBe(3);
    expect(stats.clauses).toBe(1);
    expect(stats.approximatePages).toBe(2); // explicit page break implies a second page
  });
});
