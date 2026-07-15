/**
 * Pure clause-numbering and structural-operation tests for the professional
 * editor (DOCUMENT-EDITOR-PRO-CONTRACT-WORKBENCH-1). The logic lives in
 * framework-free Frontend modules and is imported directly — a single source
 * of truth for canvas decorations, outline, plain text and HTML export.
 */

import {
  computeClauseNumbers,
  extractOutline,
  insertClauseBefore,
  insertClauseAfter,
  addSubclause,
  moveClauseUp,
  moveClauseDown,
  promoteClause,
  demoteClause,
  duplicateClause,
  deleteClause,
  findDuplicateClauseIds,
  repairDuplicateClauseIds,
  clauseIdOf,
} from '../../Frontend/src/lib/editor/clauseNumbering';
import { EditorNode, newClauseNode } from '../../Frontend/src/lib/editor/editorModel';
import { editorDocToPlainText } from '../../Frontend/src/lib/editor/plainTextExport';

function clause(cid: string, title: string, children: EditorNode[] = []): EditorNode {
  return {
    type: 'legalClause',
    attrs: { cid },
    content: [
      { type: 'clauseHeading', content: [{ type: 'text', text: title }] },
      { type: 'paragraph', content: [{ type: 'text', text: `${title} törzsszöveg.` }] },
      ...children,
    ],
  };
}

function sampleDoc(): EditorNode {
  return {
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Megbízási szerződés' }] },
      clause('c-one', 'Tárgy'),
      clause('c-two', 'Díjazás', [clause('c-two-one', 'Alapdíj'), clause('c-two-two', 'Költségek', [clause('c-deep', 'Utazás')])]),
      clause('c-three', 'Vegyes rendelkezések'),
    ],
  };
}

describe('clause numbering', () => {
  it('derives 1. / 1.1. / 1.1.1. numbering from structure', () => {
    const numbers = computeClauseNumbers(sampleDoc());
    expect(numbers.get('c-one')).toBe('1.');
    expect(numbers.get('c-two')).toBe('2.');
    expect(numbers.get('c-two-one')).toBe('2.1.');
    expect(numbers.get('c-two-two')).toBe('2.2.');
    expect(numbers.get('c-deep')).toBe('2.2.1.');
    expect(numbers.get('c-three')).toBe('3.');
  });

  it('renumbers automatically after insert before/after', () => {
    const before = insertClauseBefore(sampleDoc(), 'c-two');
    expect(before.ok).toBe(true);
    const numbersBefore = computeClauseNumbers(before.doc!);
    expect(numbersBefore.get('c-two')).toBe('3.');
    expect(numbersBefore.get('c-three')).toBe('4.');
    expect(numbersBefore.get(before.focusClauseId!)).toBe('2.');

    const after = insertClauseAfter(sampleDoc(), 'c-two');
    const numbersAfter = computeClauseNumbers(after.doc!);
    expect(numbersAfter.get(after.focusClauseId!)).toBe('3.');
    expect(numbersAfter.get('c-three')).toBe('4.');
  });

  it('renumbers automatically after delete', () => {
    const result = deleteClause(sampleDoc(), 'c-one');
    expect(result.ok).toBe(true);
    const numbers = computeClauseNumbers(result.doc!);
    expect(numbers.get('c-two')).toBe('1.');
    expect(numbers.get('c-two-two')).toBe('1.2.');
    expect(numbers.get('c-three')).toBe('2.');
    expect(numbers.has('c-one')).toBe(false);
  });

  it('moves a clause up/down among clause siblings only', () => {
    const down = moveClauseDown(sampleDoc(), 'c-one');
    expect(down.ok).toBe(true);
    const numbers = computeClauseNumbers(down.doc!);
    expect(numbers.get('c-two')).toBe('1.');
    expect(numbers.get('c-one')).toBe('2.');

    const upAtTop = moveClauseUp(sampleDoc(), 'c-one');
    expect(upAtTop.ok).toBe(false);
    const downAtBottom = moveClauseDown(sampleDoc(), 'c-three');
    expect(downAtBottom.ok).toBe(false);
  });

  it('promotes a subclause to its parent level after the parent', () => {
    const result = promoteClause(sampleDoc(), 'c-two-one');
    expect(result.ok).toBe(true);
    const numbers = computeClauseNumbers(result.doc!);
    expect(numbers.get('c-two')).toBe('2.');
    expect(numbers.get('c-two-one')).toBe('3.');
    expect(numbers.get('c-three')).toBe('4.');
  });

  it('rejects promoting a top-level clause', () => {
    const result = promoteClause(sampleDoc(), 'c-one');
    expect(result.ok).toBe(false);
  });

  it('demotes a clause under its previous sibling and rejects illegal jumps', () => {
    const result = demoteClause(sampleDoc(), 'c-three');
    expect(result.ok).toBe(true);
    const numbers = computeClauseNumbers(result.doc!);
    expect(numbers.get('c-three')).toBe('2.3.');

    // First clause has no previous sibling → orphan level would be created.
    const orphan = demoteClause(sampleDoc(), 'c-one');
    expect(orphan.ok).toBe(false);
  });

  it('enforces the maximum clause depth on demote and subclause creation', () => {
    // c-deep is at level 3 — a subclause would be level 4.
    const sub = addSubclause(sampleDoc(), 'c-deep');
    expect(sub.ok).toBe(false);

    // Demoting c-two-two (which contains c-deep) under c-two-one would push
    // c-deep to level 4 — must be rejected.
    const demote = demoteClause(sampleDoc(), 'c-two-two');
    expect(demote.ok).toBe(false);
  });

  it('duplicates a clause subtree with fresh stable ids', () => {
    const result = duplicateClause(sampleDoc(), 'c-two');
    expect(result.ok).toBe(true);
    expect(findDuplicateClauseIds(result.doc!)).toEqual([]);
    const numbers = computeClauseNumbers(result.doc!);
    expect(numbers.get('c-two')).toBe('2.');
    expect(numbers.get(result.focusClauseId!)).toBe('3.');
    expect(numbers.get('c-three')).toBe('4.');
  });

  it('detects and repairs duplicated clause ids', () => {
    const doc = sampleDoc();
    (doc.content as EditorNode[]).push(clause('c-one', 'Másolat'));
    expect(findDuplicateClauseIds(doc)).toEqual(['c-one']);
    const repaired = repairDuplicateClauseIds(doc);
    expect(findDuplicateClauseIds(repaired)).toEqual([]);
  });

  it('reports a helpful error for a missing clause', () => {
    const result = moveClauseUp(sampleDoc(), 'c-missing');
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });
});

describe('outline extraction', () => {
  it('produces heading and clause entries with generated numbers', () => {
    const outline = extractOutline(sampleDoc());
    expect(outline[0]).toMatchObject({ kind: 'HEADING', title: 'Megbízási szerződés' });
    const clauseTwoOne = outline.find((item) => item.clauseId === 'c-two-one');
    expect(clauseTwoOne).toMatchObject({ kind: 'CLAUSE', number: '2.1.', title: 'Alapdíj', level: 2 });
    const keys = outline.map((item) => item.key);
    expect(new Set(keys).size).toBe(keys.length); // no duplicate ids
  });
});

describe('plain-text serialization', () => {
  it('includes generated numbering without storing it in the document', () => {
    const doc = sampleDoc();
    const plain = editorDocToPlainText(doc);
    expect(plain).toContain('2.2.1. Utazás');
    expect(plain).toContain('3. Vegyes rendelkezések');
    // The numbering never exists in the serialized JSON content itself.
    expect(JSON.stringify(doc)).not.toContain('2.2.1');
  });

  it('renders a) and (i) markers for styled ordered lists', () => {
    const doc: EditorNode = {
      type: 'doc',
      content: [
        {
          type: 'orderedList',
          attrs: { start: 1, listStyle: 'lower-alpha' },
          content: [
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'első' }] }] },
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'második' }] }] },
          ],
        },
        {
          type: 'orderedList',
          attrs: { start: 1, listStyle: 'lower-roman' },
          content: [
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'római' }] }] },
          ],
        },
      ],
    };
    const plain = editorDocToPlainText(doc);
    expect(plain).toContain('a) első');
    expect(plain).toContain('b) második');
    expect(plain).toContain('(i) római');
  });

  it('newClauseNode produces a clause that numbering understands', () => {
    const doc: EditorNode = { type: 'doc', content: [newClauseNode('cfresh1', 'Új pont')] };
    expect(computeClauseNumbers(doc).get('cfresh1')).toBe('1.');
    expect(clauseIdOf((doc.content as EditorNode[])[0])).toBe('cfresh1');
  });
});
