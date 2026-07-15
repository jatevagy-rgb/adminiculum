/**
 * Strict allow-list validator for editor content JSON.
 *
 * Tiptap using JSON is not a reason to accept arbitrary JSON: every node type,
 * mark type and attribute must be explicitly allowed here. Unknown anything is
 * rejected. The validator is pure and framework-free so it runs identically in
 * the browser (before export/print and after paste) and in Node unit tests.
 */

import {
  ALLOWED_LINK_PROTOCOLS,
  ALLOWED_MARK_TYPES,
  ALLOWED_NODE_TYPES,
  CLAUSE_ID_PATTERN,
  EDITOR_LIMITS,
  EditorNode,
  isRecord,
  ORDERED_LIST_STYLES,
} from './editorModel';
import { isAllowedFieldId } from './fieldTokens';

export interface EditorValidationResult {
  ok: boolean;
  errors: string[];
}

const NODE_TYPE_SET = new Set<string>(ALLOWED_NODE_TYPES);
const MARK_TYPE_SET = new Set<string>(ALLOWED_MARK_TYPES);

/** Content rules: which children each node may contain. */
const CHILD_RULES: Record<string, Set<string> | null> = {
  doc: new Set(['paragraph', 'heading', 'bulletList', 'orderedList', 'blockquote', 'horizontalRule', 'table', 'legalClause', 'pageBreak']),
  paragraph: new Set(['text', 'hardBreak', 'fieldToken']),
  heading: new Set(['text', 'hardBreak', 'fieldToken']),
  clauseHeading: new Set(['text', 'hardBreak', 'fieldToken']),
  blockquote: new Set(['paragraph']),
  bulletList: new Set(['listItem']),
  orderedList: new Set(['listItem']),
  listItem: new Set(['paragraph', 'bulletList', 'orderedList']),
  table: new Set(['tableRow']),
  tableRow: new Set(['tableCell', 'tableHeader']),
  tableCell: new Set(['paragraph', 'bulletList', 'orderedList']),
  tableHeader: new Set(['paragraph', 'bulletList', 'orderedList']),
  legalClause: new Set(['clauseHeading', 'paragraph', 'bulletList', 'orderedList', 'blockquote', 'table', 'legalClause']),
  // atoms / leaves:
  text: null,
  hardBreak: null,
  horizontalRule: null,
  pageBreak: null,
  fieldToken: null,
};

/** Attribute allow-list per node type; validator functions return an error string or null. */
type AttrCheck = (value: unknown) => string | null;

const intBetween = (min: number, max: number): AttrCheck => (value) =>
  typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
    ? null
    : `must be an integer in [${min}, ${max}]`;

const NODE_ATTRS: Record<string, Record<string, AttrCheck>> = {
  heading: { level: intBetween(1, EDITOR_LIMITS.maxHeadingLevel) },
  orderedList: {
    start: intBetween(1, 9999),
    listStyle: (value) =>
      typeof value === 'string' && (ORDERED_LIST_STYLES as readonly string[]).includes(value)
        ? null
        : `must be one of ${ORDERED_LIST_STYLES.join(', ')}`,
    // Tiptap's ordered list may serialize a "type" attr; accept the safe list markers only.
    type: (value) =>
      value == null || (typeof value === 'string' && ['1', 'a', 'i', 'A', 'I'].includes(value)) ? null : 'unsupported list type',
  },
  tableCell: {
    colspan: intBetween(1, EDITOR_LIMITS.maxTableCols),
    rowspan: intBetween(1, EDITOR_LIMITS.maxTableRows),
    colwidth: (value) =>
      value == null || (Array.isArray(value) && value.every((entry) => typeof entry === 'number' && entry > 0 && entry < 4000))
        ? null
        : 'invalid colwidth',
  },
  tableHeader: {
    colspan: intBetween(1, EDITOR_LIMITS.maxTableCols),
    rowspan: intBetween(1, EDITOR_LIMITS.maxTableRows),
    colwidth: (value) =>
      value == null || (Array.isArray(value) && value.every((entry) => typeof entry === 'number' && entry > 0 && entry < 4000))
        ? null
        : 'invalid colwidth',
  },
  legalClause: {
    cid: (value) => (typeof value === 'string' && CLAUSE_ID_PATTERN.test(value) ? null : 'invalid clause identifier'),
  },
  fieldToken: {
    fieldId: (value) => (typeof value === 'string' && isAllowedFieldId(value) ? null : 'unknown field token'),
  },
};

function validateLinkAttrs(attrs: Record<string, unknown>, errors: string[], path: string): void {
  const href = attrs.href;
  if (typeof href !== 'string' || !href) {
    errors.push(`${path}: link mark requires an href`);
    return;
  }
  let protocol = '';
  try {
    protocol = new URL(href, 'https://placeholder.invalid').protocol;
    // Relative URLs resolve against the placeholder base; treat them as https.
    if (!/^[a-z][a-z0-9+.-]*:/i.test(href)) protocol = 'https:';
  } catch {
    errors.push(`${path}: link href is not a valid URL`);
    return;
  }
  if (!(ALLOWED_LINK_PROTOCOLS as readonly string[]).includes(protocol)) {
    errors.push(`${path}: link protocol ${protocol} is not allowed`);
  }
  for (const key of Object.keys(attrs)) {
    if (key === 'href') continue;
    if (key === 'target') {
      if (attrs.target != null && attrs.target !== '_blank') errors.push(`${path}: unsupported link target`);
      continue;
    }
    if (key === 'rel' || key === 'class') continue; // serializer-managed, re-emitted safely
    errors.push(`${path}: unknown link attribute "${key}"`);
  }
}

interface WalkState {
  nodeCount: number;
  textLength: number;
  errors: string[];
}

function walk(node: unknown, depth: number, parentType: string | null, clauseDepth: number, state: WalkState, path: string): void {
  if (state.errors.length > 25) return; // bounded error output

  if (!isRecord(node)) {
    state.errors.push(`${path}: node must be an object`);
    return;
  }

  const type = node.type;
  if (typeof type !== 'string' || !NODE_TYPE_SET.has(type)) {
    state.errors.push(`${path}: unknown node type "${String(type)}"`);
    return;
  }

  state.nodeCount += 1;
  if (state.nodeCount > EDITOR_LIMITS.maxNodes) {
    state.errors.push(`document exceeds the maximum of ${EDITOR_LIMITS.maxNodes} nodes`);
    return;
  }
  if (depth > EDITOR_LIMITS.maxDepth) {
    state.errors.push(`${path}: nesting exceeds the maximum depth of ${EDITOR_LIMITS.maxDepth}`);
    return;
  }

  // Structural placement
  if (type === 'doc' && parentType !== null) {
    state.errors.push(`${path}: doc node must be the root`);
    return;
  }
  if (type !== 'doc' && parentType === null) {
    state.errors.push(`${path}: root node must be "doc"`);
    return;
  }
  if (parentType) {
    const allowedChildren = CHILD_RULES[parentType];
    if (!allowedChildren || !allowedChildren.has(type)) {
      state.errors.push(`${path}: node "${type}" is not allowed inside "${parentType}"`);
      return;
    }
  }

  // Clause depth
  let nextClauseDepth = clauseDepth;
  if (type === 'legalClause') {
    nextClauseDepth = clauseDepth + 1;
    if (nextClauseDepth > EDITOR_LIMITS.maxClauseDepth) {
      state.errors.push(`${path}: clause nesting exceeds ${EDITOR_LIMITS.maxClauseDepth} levels`);
      return;
    }
  }

  // Unknown top-level keys on the node object
  for (const key of Object.keys(node)) {
    if (!['type', 'attrs', 'content', 'marks', 'text'].includes(key)) {
      state.errors.push(`${path}: unknown node property "${key}"`);
    }
  }

  // Attributes
  const attrs = node.attrs;
  if (attrs !== undefined) {
    if (!isRecord(attrs)) {
      state.errors.push(`${path}: attrs must be an object`);
      return;
    }
    const allowedAttrs = NODE_ATTRS[type] || {};
    for (const [key, value] of Object.entries(attrs)) {
      const check = allowedAttrs[key];
      if (!check) {
        state.errors.push(`${path}: attribute "${key}" is not allowed on "${type}"`);
        continue;
      }
      if (value != null) {
        const attrError = check(value);
        if (attrError) state.errors.push(`${path}: attribute "${key}" ${attrError}`);
      }
    }
  }
  if (type === 'legalClause' && (!isRecord(attrs) || typeof attrs.cid !== 'string')) {
    state.errors.push(`${path}: legalClause requires a cid attribute`);
  }
  if (type === 'fieldToken' && (!isRecord(attrs) || typeof attrs.fieldId !== 'string')) {
    state.errors.push(`${path}: fieldToken requires a fieldId attribute`);
  }

  // Text
  if (type === 'text') {
    if (typeof node.text !== 'string' || node.text.length === 0) {
      state.errors.push(`${path}: text node requires non-empty text`);
      return;
    }
    state.textLength += node.text.length;
    if (state.textLength > EDITOR_LIMITS.maxTotalTextLength) {
      state.errors.push(`document exceeds the maximum text length of ${EDITOR_LIMITS.maxTotalTextLength} characters`);
      return;
    }
  } else if (node.text !== undefined) {
    state.errors.push(`${path}: only text nodes may carry text`);
  }

  // Marks
  if (node.marks !== undefined) {
    if (type !== 'text') {
      state.errors.push(`${path}: marks are only allowed on text nodes`);
    } else if (!Array.isArray(node.marks)) {
      state.errors.push(`${path}: marks must be an array`);
    } else {
      for (const mark of node.marks) {
        if (!isRecord(mark) || typeof mark.type !== 'string' || !MARK_TYPE_SET.has(mark.type)) {
          state.errors.push(`${path}: unknown mark "${isRecord(mark) ? String(mark.type) : typeof mark}"`);
          continue;
        }
        if (mark.type === 'link') {
          if (!isRecord(mark.attrs)) {
            state.errors.push(`${path}: link mark requires attrs`);
          } else {
            validateLinkAttrs(mark.attrs, state.errors, path);
          }
        } else if (mark.attrs !== undefined && isRecord(mark.attrs) && Object.keys(mark.attrs).length > 0) {
          state.errors.push(`${path}: mark "${mark.type}" must not carry attributes`);
        }
      }
    }
  }

  // Children
  const content = node.content;
  if (content !== undefined) {
    if (CHILD_RULES[type] === null) {
      state.errors.push(`${path}: node "${type}" must not have content`);
      return;
    }
    if (!Array.isArray(content)) {
      state.errors.push(`${path}: content must be an array`);
      return;
    }
    if (type === 'table' && content.length > EDITOR_LIMITS.maxTableRows) {
      state.errors.push(`${path}: table exceeds ${EDITOR_LIMITS.maxTableRows} rows`);
      return;
    }
    if (type === 'tableRow' && content.length > EDITOR_LIMITS.maxTableCols) {
      state.errors.push(`${path}: table row exceeds ${EDITOR_LIMITS.maxTableCols} columns`);
      return;
    }
    content.forEach((child, index) => walk(child, depth + 1, type, nextClauseDepth, state, `${path}.${type}[${index}]`));
  }
}

export function validateEditorDocument(input: unknown): EditorValidationResult {
  const state: WalkState = { nodeCount: 0, textLength: 0, errors: [] };

  let serialized = '';
  try {
    serialized = JSON.stringify(input);
  } catch {
    return { ok: false, errors: ['document is not serializable JSON'] };
  }
  if (!serialized || serialized.length > EDITOR_LIMITS.maxSerializedBytes) {
    return { ok: false, errors: [`document exceeds the maximum serialized size of ${EDITOR_LIMITS.maxSerializedBytes} bytes`] };
  }

  walk(input, 0, null, 0, state, 'doc');
  return { ok: state.errors.length === 0, errors: state.errors };
}

/** Node-type sanity export for tests/static guards. */
export const EDITOR_CHILD_RULES = CHILD_RULES;

// Re-export the document type for consumers of the validator.
export type { EditorNode };
