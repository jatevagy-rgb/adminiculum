/**
 * Professional editor content model — DOCUMENT-EDITOR-PRO-CONTRACT-WORKBENCH-1
 *
 * Framework-free (no Tiptap import) type definitions, allow-lists and limits
 * for the internal legal-document editor. This module is the single source of
 * truth consumed by the schema validator, the clause-numbering engine, the
 * plain-text/HTML exporters, the Tiptap extension layer, and the Node-side
 * unit tests. Keep it dependency-free.
 */

export type EditorMark = {
  type: string;
  attrs?: Record<string, unknown>;
};

export type EditorNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: EditorNode[];
  marks?: EditorMark[];
  text?: string;
};

// ---------------------------------------------------------------------------
// Allowed vocabulary (strict allow-list; anything else is rejected)
// ---------------------------------------------------------------------------

export const ALLOWED_NODE_TYPES = [
  'doc',
  'paragraph',
  'heading',
  'text',
  'hardBreak',
  'bulletList',
  'orderedList',
  'listItem',
  'blockquote',
  'horizontalRule',
  'table',
  'tableRow',
  'tableCell',
  'tableHeader',
  'legalClause',
  'clauseHeading',
  'pageBreak',
  'fieldToken',
] as const;

export const ALLOWED_MARK_TYPES = ['bold', 'italic', 'underline', 'strike', 'link'] as const;

export const ORDERED_LIST_STYLES = ['decimal', 'lower-alpha', 'lower-roman'] as const;
export type OrderedListStyle = (typeof ORDERED_LIST_STYLES)[number];

export const ALLOWED_LINK_PROTOCOLS = ['http:', 'https:', 'mailto:'] as const;

/** Stable clause identifier pattern (generated, never user-typed). */
export const CLAUSE_ID_PATTERN = /^c[A-Za-z0-9_-]{3,40}$/;

// ---------------------------------------------------------------------------
// Hard limits (validated server-independently; the editor is session-only)
// ---------------------------------------------------------------------------

export const EDITOR_LIMITS = {
  maxDepth: 24,
  maxNodes: 20000,
  maxTotalTextLength: 400000,
  maxSerializedBytes: 2_000_000,
  maxTableRows: 60,
  maxTableCols: 12,
  maxClauseDepth: 3,
  maxHeadingLevel: 3,
} as const;

// ---------------------------------------------------------------------------
// Helpers shared by validator / numbering / exporters
// ---------------------------------------------------------------------------

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function childrenOf(node: EditorNode): EditorNode[] {
  return Array.isArray(node.content) ? node.content : [];
}

export function textOf(node: EditorNode): string {
  if (node.type === 'text') return node.text || '';
  return childrenOf(node).map(textOf).join('');
}

let cidCounter = 0;

/** Generates a stable clause identifier. Deterministic option for tests. */
export function generateClauseId(random: () => number = Math.random): string {
  cidCounter += 1;
  const suffix = Math.floor(random() * 0xffffff)
    .toString(36)
    .padStart(4, '0');
  return `c${Date.now().toString(36)}${suffix}${cidCounter.toString(36)}`;
}

export function deepCloneNode<T extends EditorNode>(node: T): T {
  return JSON.parse(JSON.stringify(node)) as T;
}

export function emptyParagraph(): EditorNode {
  return { type: 'paragraph' };
}

export function newClauseNode(cid?: string, title?: string): EditorNode {
  return {
    type: 'legalClause',
    attrs: { cid: cid || generateClauseId() },
    content: [
      ...(title
        ? [{ type: 'clauseHeading', content: [{ type: 'text', text: title }] } as EditorNode]
        : []),
      emptyParagraph(),
    ],
  };
}

export function emptyEditorDocument(): EditorNode {
  return { type: 'doc', content: [emptyParagraph()] };
}
