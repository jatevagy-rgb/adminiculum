/**
 * Editor assembly and bridge helpers between the Tiptap editor instance and
 * the pure content model (`@/lib/editor/*`). The extension set matches the
 * strict schema allow-list exactly: code/code-block are disabled, headings are
 * limited to three levels, links are restricted, and the custom legal nodes
 * are registered alongside bounded tables.
 */

import type { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { TableCell, TableHeader, TableRow, Table } from '@tiptap/extension-table';
import type { AnyExtension } from '@tiptap/core';
import { EDITOR_LIMITS, EditorNode } from '@/lib/editor/editorModel';
import { ClauseOperationResult } from '@/lib/editor/clauseNumbering';
import { sanitizeExternalHtml } from '@/lib/editor/pasteSanitizer';
import {
  ClauseHeading,
  ClauseIdIntegrity,
  ClauseNumberDecorations,
  FieldToken,
  LegalClause,
  OrderedListStyled,
  PageBreak,
  SearchHighlight,
} from './extensions';

export function buildEditorExtensions(): AnyExtension[] {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      // Outside the allow-listed legal schema:
      code: false,
      codeBlock: false,
      // Registered separately with legal marker styles:
      orderedList: false,
      link: {
        openOnClick: false,
        autolink: false,
        linkOnPaste: true,
        protocols: ['http', 'https', 'mailto'],
      },
    }),
    OrderedListStyled,
    Table.configure({ resizable: false, HTMLAttributes: { class: 'editor-table' } }),
    TableRow,
    TableHeader,
    TableCell,
    ClauseHeading,
    LegalClause,
    ClauseIdIntegrity,
    ClauseNumberDecorations,
    PageBreak,
    FieldToken,
    SearchHighlight,
  ];
}

/**
 * Paste handling: external HTML runs through the Word sanitizer before the
 * schema-based parse. Internal copy/paste (ProseMirror slice) is untouched, so
 * legal structure is preserved inside the editor.
 */
export function transformPastedExternalHtml(html: string): string {
  return sanitizeExternalHtml(html);
}

/** Locates a clause node position by its stable id. */
export function findClausePosition(editor: Editor, clauseId: string): { pos: number; size: number } | null {
  let found: { pos: number; size: number } | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (found) return false;
    if (node.type.name === 'legalClause' && node.attrs.cid === clauseId) {
      found = { pos, size: node.nodeSize };
      return false;
    }
    return true;
  });
  return found;
}

/** Scrolls the canvas to a clause and places the cursor inside it. */
export function focusClause(editor: Editor, clauseId: string): boolean {
  const location = findClausePosition(editor, clauseId);
  if (!location) return false;
  editor
    .chain()
    .focus()
    .setTextSelection(Math.min(location.pos + 2, editor.state.doc.content.size))
    .scrollIntoView()
    .run();
  return true;
}

/**
 * Applies a pure clause-operation result (from `@/lib/editor/clauseNumbering`)
 * to the live editor. The operations are structural, so the content is
 * replaced wholesale and the affected clause is refocused.
 */
export function applyClauseOperation(editor: Editor, result: ClauseOperationResult): { ok: boolean; error?: string } {
  if (!result.ok || !result.doc) {
    return { ok: false, error: result.error || 'A művelet nem hajtható végre.' };
  }
  editor.commands.setContent(result.doc as never, { emitUpdate: true });
  if (result.focusClauseId) {
    focusClause(editor, result.focusClauseId);
  }
  return { ok: true };
}

/** The clause (if any) containing the current selection. */
export function currentClauseId(editor: Editor): string | null {
  const { $from } = editor.state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.type.name === 'legalClause' && typeof node.attrs.cid === 'string') {
      return node.attrs.cid;
    }
  }
  return null;
}

/** Inserts structured preset content (already schema-conform) at the cursor. */
export function insertPresetContent(editor: Editor, nodes: EditorNode[]): void {
  editor.chain().focus().insertContent(nodes as never).run();
}

/** Guard: current document size against the shared limits (for status display). */
export function isDocumentOversized(doc: EditorNode): boolean {
  try {
    return JSON.stringify(doc).length > EDITOR_LIMITS.maxSerializedBytes;
  } catch {
    return true;
  }
}
