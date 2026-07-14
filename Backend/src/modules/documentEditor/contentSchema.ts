const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export const EDITOR_CONTENT_FORMAT = 'TIPTAP_JSON' as const;
export const EDITOR_CONTENT_SCHEMA_VERSION = 1 as const;

export const EDITOR_CONTENT_LIMITS = {
  maxDepth: 24,
  maxNodes: 20_000,
  maxTotalTextLength: 400_000,
  maxSerializedBytes: 2_000_000,
  maxTableRows: 60,
  maxTableCols: 12,
  maxClauseDepth: 3,
  maxHeadingLevel: 3,
  maxValidationErrors: 25,
  maxMetadataEditorVersionLength: 80,
} as const;

export const EDITOR_ALLOWED_NODE_TYPES = [
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

export const EDITOR_ALLOWED_MARK_TYPES = ['bold', 'italic', 'underline', 'strike', 'link'] as const;

const ALLOWED_FIELD_IDS = new Set([
  'case.displayName',
  'case.reference',
  'client.displayName',
  'client.role',
  'lawyer.displayName',
  'document.title',
  'date.today',
  'party.name',
  'party.seat',
  'party.representative',
  'amount.value',
  'date.custom',
]);

const NODE_ATTRS: Record<string, readonly string[]> = {
  doc: [],
  paragraph: [],
  heading: ['level'],
  text: [],
  hardBreak: [],
  bulletList: [],
  orderedList: ['start'],
  listItem: [],
  blockquote: [],
  horizontalRule: [],
  table: [],
  tableRow: [],
  tableCell: ['colspan', 'rowspan', 'colwidth'],
  tableHeader: ['colspan', 'rowspan', 'colwidth'],
  legalClause: ['cid', 'level'],
  clauseHeading: ['level'],
  pageBreak: [],
  fieldToken: ['fieldId'],
};

const MARK_ATTRS: Record<string, readonly string[]> = {
  bold: [],
  italic: [],
  underline: [],
  strike: [],
  link: ['href', 'target', 'rel', 'class'],
};

export type EditorContentValidationCode =
  | 'EDITOR_CONTENT_INVALID'
  | 'EDITOR_CONTENT_TOO_LARGE'
  | 'EDITOR_CONTENT_UNSAFE_KEY'
  | 'EDITOR_CONTENT_UNSAFE_LINK'
  | 'EDITOR_CONTENT_LIMIT_EXCEEDED'
  | 'EDITOR_CONTENT_SCHEMA_MISMATCH';

export interface EditorContentValidationError {
  code: EditorContentValidationCode;
  path: string;
  message: string;
}

export interface EditorContentValidationResult {
  valid: boolean;
  errors: EditorContentValidationError[];
}

export interface TiptapDocumentDto {
  type: 'doc';
  attrs?: Record<string, unknown>;
  content?: EditorNodeDto[];
}

export interface EditorNodeDto {
  type: string;
  attrs?: Record<string, unknown>;
  content?: EditorNodeDto[];
  marks?: EditorMarkDto[];
  text?: string;
}

export interface EditorMarkDto {
  type: string;
  attrs?: Record<string, unknown>;
}

export interface StoredEditorContentEnvelope {
  schemaVersion: 1;
  documentId: string;
  format: typeof EDITOR_CONTENT_FORMAT;
  content: TiptapDocumentDto;
  metadata: {
    createdAt: string;
    createdByUserId: string;
    editorVersion: string;
  };
}

interface ValidationState {
  errors: EditorContentValidationError[];
  nodeCount: number;
  textLength: number;
  seenClauseIds: Set<string>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasForbiddenKey(value: unknown): boolean {
  if (!isRecord(value) && !Array.isArray(value)) return false;
  const entries = Array.isArray(value) ? value.entries() : Object.entries(value);
  for (const entry of entries as Iterable<[string | number, unknown]>) {
    const key = String(entry[0]);
    const child = entry[1];
    if (FORBIDDEN_KEYS.has(key)) return true;
    if (hasForbiddenKey(child)) return true;
  }
  return false;
}

function addError(state: ValidationState, code: EditorContentValidationCode, path: string, message: string): void {
  if (state.errors.length >= EDITOR_CONTENT_LIMITS.maxValidationErrors) return;
  state.errors.push({ code, path, message });
}

function validateExactKeys(
  state: ValidationState,
  record: Record<string, unknown>,
  allowed: readonly string[],
  path: string
): void {
  for (const key of Object.keys(record)) {
    if (!allowed.includes(key)) {
      addError(state, 'EDITOR_CONTENT_INVALID', `${path}.${key}`, 'Unknown attribute is not allowed.');
    }
  }
}

function validateLinkHref(state: ValidationState, href: unknown, path: string): void {
  if (typeof href !== 'string' || href.length > 2048) {
    addError(state, 'EDITOR_CONTENT_INVALID', path, 'Link href must be a bounded string.');
    return;
  }
  let parsed: URL;
  try {
    parsed = new URL(href, 'https://adminiculum.local');
  } catch {
    addError(state, 'EDITOR_CONTENT_UNSAFE_LINK', path, 'Malformed link href.');
    return;
  }
  const protocol = parsed.protocol.replace(':', '').toLowerCase();
  if (!['http', 'https', 'mailto'].includes(protocol)) {
    addError(state, 'EDITOR_CONTENT_UNSAFE_LINK', path, 'Only http, https and mailto links are allowed.');
  }
  if (/^\s*(javascript|data|vbscript):/i.test(href)) {
    addError(state, 'EDITOR_CONTENT_UNSAFE_LINK', path, 'Executable or data URLs are not allowed.');
  }
}

function looksLikeEmbeddedPayload(text: string): boolean {
  return /data:[^\s]+;base64,/i.test(text) || /<\s*(script|iframe|object|embed)\b/i.test(text);
}

function validateMarks(state: ValidationState, marks: unknown, path: string): void {
  if (marks === undefined) return;
  if (!Array.isArray(marks)) {
    addError(state, 'EDITOR_CONTENT_INVALID', path, 'Marks must be an array.');
    return;
  }
  marks.forEach((mark, index) => {
    const markPath = `${path}[${index}]`;
    if (!isRecord(mark) || typeof mark.type !== 'string') {
      addError(state, 'EDITOR_CONTENT_INVALID', markPath, 'Mark must be an object with a type.');
      return;
    }
    if (!EDITOR_ALLOWED_MARK_TYPES.includes(mark.type as never)) {
      addError(state, 'EDITOR_CONTENT_INVALID', `${markPath}.type`, 'Unknown mark type is not allowed.');
      return;
    }
    const attrs = mark.attrs;
    if (attrs !== undefined) {
      if (!isRecord(attrs)) {
        addError(state, 'EDITOR_CONTENT_INVALID', `${markPath}.attrs`, 'Mark attrs must be an object.');
      } else {
        validateExactKeys(state, attrs, MARK_ATTRS[mark.type] || [], `${markPath}.attrs`);
        if (mark.type === 'link') validateLinkHref(state, attrs.href, `${markPath}.attrs.href`);
      }
    }
  });
}

function validateNumericAttr(
  state: ValidationState,
  attrs: Record<string, unknown>,
  key: string,
  path: string,
  min: number,
  max: number
): void {
  const value = attrs[key];
  if (value === undefined) return;
  if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) {
    addError(state, 'EDITOR_CONTENT_INVALID', `${path}.${key}`, `${key} must be an integer between ${min} and ${max}.`);
  }
}

function validateNode(node: unknown, state: ValidationState, path: string, depth: number, clauseDepth: number): void {
  if (depth > EDITOR_CONTENT_LIMITS.maxDepth) {
    addError(state, 'EDITOR_CONTENT_LIMIT_EXCEEDED', path, 'Maximum document depth exceeded.');
    return;
  }
  if (!isRecord(node) || typeof node.type !== 'string') {
    addError(state, 'EDITOR_CONTENT_INVALID', path, 'Node must be an object with a type.');
    return;
  }
  state.nodeCount += 1;
  if (state.nodeCount > EDITOR_CONTENT_LIMITS.maxNodes) {
    addError(state, 'EDITOR_CONTENT_LIMIT_EXCEEDED', path, 'Maximum node count exceeded.');
    return;
  }

  const nodeType = node.type;
  if (!EDITOR_ALLOWED_NODE_TYPES.includes(nodeType as never)) {
    addError(state, 'EDITOR_CONTENT_INVALID', `${path}.type`, 'Unknown node type is not allowed.');
    return;
  }

  const attrs = node.attrs;
  if (attrs !== undefined) {
    if (!isRecord(attrs)) {
      addError(state, 'EDITOR_CONTENT_INVALID', `${path}.attrs`, 'Node attrs must be an object.');
    } else {
      validateExactKeys(state, attrs, NODE_ATTRS[nodeType] || [], `${path}.attrs`);
      if (nodeType === 'heading' || nodeType === 'clauseHeading') {
        validateNumericAttr(state, attrs, 'level', `${path}.attrs`, 1, EDITOR_CONTENT_LIMITS.maxHeadingLevel);
      }
      if (nodeType === 'orderedList') validateNumericAttr(state, attrs, 'start', `${path}.attrs`, 1, 9999);
      if (nodeType === 'legalClause') {
        const cid = attrs.cid;
        if (typeof cid !== 'string' || !/^c[A-Za-z0-9_-]{3,40}$/.test(cid)) {
          addError(state, 'EDITOR_CONTENT_INVALID', `${path}.attrs.cid`, 'Legal clause cid is malformed.');
        } else if (state.seenClauseIds.has(cid)) {
          addError(state, 'EDITOR_CONTENT_INVALID', `${path}.attrs.cid`, 'Duplicate legal clause cid is not allowed.');
        } else {
          state.seenClauseIds.add(cid);
        }
        validateNumericAttr(state, attrs, 'level', `${path}.attrs`, 1, EDITOR_CONTENT_LIMITS.maxClauseDepth);
      }
      if (nodeType === 'fieldToken') {
        if (typeof attrs.fieldId !== 'string' || !ALLOWED_FIELD_IDS.has(attrs.fieldId)) {
          addError(state, 'EDITOR_CONTENT_INVALID', `${path}.attrs.fieldId`, 'Field token id is not in the allow-list.');
        }
      }
      if (nodeType === 'tableCell' || nodeType === 'tableHeader') {
        validateNumericAttr(state, attrs, 'colspan', `${path}.attrs`, 1, EDITOR_CONTENT_LIMITS.maxTableCols);
        validateNumericAttr(state, attrs, 'rowspan', `${path}.attrs`, 1, EDITOR_CONTENT_LIMITS.maxTableRows);
      }
    }
  }

  if (nodeType === 'text') {
    if (typeof node.text !== 'string') {
      addError(state, 'EDITOR_CONTENT_INVALID', `${path}.text`, 'Text node requires text.');
    } else {
      state.textLength += node.text.length;
      if (state.textLength > EDITOR_CONTENT_LIMITS.maxTotalTextLength) {
        addError(state, 'EDITOR_CONTENT_LIMIT_EXCEEDED', `${path}.text`, 'Maximum text length exceeded.');
      }
      if (looksLikeEmbeddedPayload(node.text)) {
        addError(state, 'EDITOR_CONTENT_INVALID', `${path}.text`, 'Embedded HTML or base64 payloads are not allowed.');
      }
    }
  } else if (node.text !== undefined) {
    addError(state, 'EDITOR_CONTENT_INVALID', `${path}.text`, 'Only text nodes may contain text.');
  }

  validateMarks(state, node.marks, `${path}.marks`);

  const nextClauseDepth = nodeType === 'legalClause' ? clauseDepth + 1 : clauseDepth;
  if (nextClauseDepth > EDITOR_CONTENT_LIMITS.maxClauseDepth) {
    addError(state, 'EDITOR_CONTENT_LIMIT_EXCEEDED', path, 'Maximum legal clause nesting exceeded.');
  }

  const content = node.content;
  if (content !== undefined) {
    if (!Array.isArray(content)) {
      addError(state, 'EDITOR_CONTENT_INVALID', `${path}.content`, 'Node content must be an array.');
      return;
    }
    if (nodeType === 'table') {
      if (content.length === 0 || content.length > EDITOR_CONTENT_LIMITS.maxTableRows) {
        addError(state, 'EDITOR_CONTENT_INVALID', `${path}.content`, 'Table row count is invalid.');
      }
      content.forEach((row, rowIndex) => {
        if (!isRecord(row) || row.type !== 'tableRow' || !Array.isArray(row.content) || row.content.length === 0 || row.content.length > EDITOR_CONTENT_LIMITS.maxTableCols) {
          addError(state, 'EDITOR_CONTENT_INVALID', `${path}.content[${rowIndex}]`, 'Malformed table row.');
        }
      });
    }
    content.forEach((child, index) => validateNode(child, state, `${path}.content[${index}]`, depth + 1, nextClauseDepth));
  }
}

function emptyResult(): ValidationState {
  return { errors: [], nodeCount: 0, textLength: 0, seenClauseIds: new Set() };
}

export function validateTiptapDocument(input: unknown): EditorContentValidationResult {
  const state = emptyResult();
  if (hasForbiddenKey(input)) {
    addError(state, 'EDITOR_CONTENT_UNSAFE_KEY', '$', 'Prototype-related keys are not allowed.');
    return { valid: false, errors: state.errors };
  }
  validateNode(input, state, '$', 0, 0);
  if (isRecord(input) && input.type !== 'doc') {
    addError(state, 'EDITOR_CONTENT_SCHEMA_MISMATCH', '$.type', 'Root node must be doc.');
  }
  return { valid: state.errors.length === 0, errors: state.errors };
}

export function validateStoredEditorContentEnvelope(
  input: unknown,
  options: { documentId: string; serializedByteSize?: number }
): EditorContentValidationResult {
  const state = emptyResult();
  if (typeof options.serializedByteSize === 'number' && options.serializedByteSize > EDITOR_CONTENT_LIMITS.maxSerializedBytes) {
    addError(state, 'EDITOR_CONTENT_TOO_LARGE', '$', 'Serialized editor content is too large.');
    return { valid: false, errors: state.errors };
  }
  if (hasForbiddenKey(input)) {
    addError(state, 'EDITOR_CONTENT_UNSAFE_KEY', '$', 'Prototype-related keys are not allowed.');
    return { valid: false, errors: state.errors };
  }
  if (!isRecord(input)) {
    addError(state, 'EDITOR_CONTENT_INVALID', '$', 'Envelope must be an object.');
    return { valid: false, errors: state.errors };
  }
  for (const key of Object.keys(input)) {
    if (!['schemaVersion', 'documentId', 'format', 'content', 'metadata'].includes(key)) {
      addError(state, 'EDITOR_CONTENT_INVALID', `$.${key}`, 'Unknown envelope key is not allowed.');
    }
  }
  if (input.schemaVersion !== EDITOR_CONTENT_SCHEMA_VERSION) {
    addError(state, 'EDITOR_CONTENT_SCHEMA_MISMATCH', '$.schemaVersion', 'Unsupported editor content schema version.');
  }
  if (input.documentId !== options.documentId) {
    addError(state, 'EDITOR_CONTENT_SCHEMA_MISMATCH', '$.documentId', 'Envelope documentId must match the route documentId.');
  }
  if (input.format !== EDITOR_CONTENT_FORMAT) {
    addError(state, 'EDITOR_CONTENT_SCHEMA_MISMATCH', '$.format', 'Envelope format must be TIPTAP_JSON.');
  }
  if (!isRecord(input.metadata)) {
    addError(state, 'EDITOR_CONTENT_INVALID', '$.metadata', 'Metadata must be an object.');
  } else {
    for (const key of Object.keys(input.metadata)) {
      if (!['createdAt', 'createdByUserId', 'editorVersion'].includes(key)) {
        addError(state, 'EDITOR_CONTENT_INVALID', `$.metadata.${key}`, 'Unknown metadata key is not allowed.');
      }
    }
    if (typeof input.metadata.createdAt !== 'string' || Number.isNaN(Date.parse(input.metadata.createdAt))) {
      addError(state, 'EDITOR_CONTENT_INVALID', '$.metadata.createdAt', 'createdAt must be an ISO date string.');
    }
    if (typeof input.metadata.createdByUserId !== 'string' || !input.metadata.createdByUserId.trim()) {
      addError(state, 'EDITOR_CONTENT_INVALID', '$.metadata.createdByUserId', 'createdByUserId is required.');
    }
    if (typeof input.metadata.editorVersion !== 'string' || !input.metadata.editorVersion.trim() || input.metadata.editorVersion.length > EDITOR_CONTENT_LIMITS.maxMetadataEditorVersionLength) {
      addError(state, 'EDITOR_CONTENT_INVALID', '$.metadata.editorVersion', 'editorVersion must be a bounded string.');
    }
  }

  const contentResult = validateTiptapDocument(input.content);
  state.errors.push(...contentResult.errors.slice(0, Math.max(0, EDITOR_CONTENT_LIMITS.maxValidationErrors - state.errors.length)));
  return { valid: state.errors.length === 0, errors: state.errors };
}

export function getSerializedEditorContentByteSize(input: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(input), 'utf8');
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}
