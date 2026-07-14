/**
 * Safe structured field tokens for the legal-document editor.
 *
 * Explicit allow-list only: no raw object traversal, no expression syntax, no
 * sensitive identifiers by default. Tokens render as distinct chips in the
 * editor and resolve from a minimal, explicitly assembled context. Conversion
 * to static text is an explicit user action and never writes back to case or
 * client data.
 */

import { childrenOf, deepCloneNode, EditorNode, isRecord } from './editorModel';

export interface EditorFieldDefinition {
  id: string;
  label: string;
  source: 'Ügy' | 'Ügyfél' | 'Dokumentum' | 'Rendszer' | 'Kézi';
  /** Manual fields have no automatic resolution and always need human input. */
  manual?: boolean;
}

export const EDITOR_FIELDS: readonly EditorFieldDefinition[] = [
  { id: 'case.displayName', label: 'Ügy megnevezése', source: 'Ügy' },
  { id: 'case.reference', label: 'Ügyszám', source: 'Ügy' },
  { id: 'client.displayName', label: 'Ügyfél neve', source: 'Ügyfél' },
  { id: 'client.role', label: 'Ügyfél szerepe az ügyben', source: 'Ügy' },
  { id: 'lawyer.displayName', label: 'Felelős ügyvéd', source: 'Ügy' },
  { id: 'document.title', label: 'Dokumentum címe', source: 'Dokumentum' },
  { id: 'date.today', label: 'Mai dátum', source: 'Rendszer' },
  { id: 'party.name', label: 'Fél neve (kézi)', source: 'Kézi', manual: true },
  { id: 'party.seat', label: 'Fél székhelye / címe (kézi)', source: 'Kézi', manual: true },
  { id: 'party.representative', label: 'Fél képviselője (kézi)', source: 'Kézi', manual: true },
  { id: 'amount.value', label: 'Pénzösszeg (kézi)', source: 'Kézi', manual: true },
  { id: 'date.custom', label: 'Dátum mező (kézi)', source: 'Kézi', manual: true },
] as const;

const FIELD_INDEX = new Map(EDITOR_FIELDS.map((field) => [field.id, field]));

export function isAllowedFieldId(fieldId: unknown): fieldId is string {
  return typeof fieldId === 'string' && FIELD_INDEX.has(fieldId);
}

export function getFieldDefinition(fieldId: string): EditorFieldDefinition | null {
  return FIELD_INDEX.get(fieldId) || null;
}

/**
 * Minimal resolution context. Assembled explicitly from already-authorized
 * metadata — never a raw case/client object.
 */
export interface FieldResolutionContext {
  caseDisplayName?: string | null;
  caseReference?: string | null;
  clientDisplayName?: string | null;
  clientRole?: string | null;
  lawyerDisplayName?: string | null;
  documentTitle?: string | null;
  today?: Date;
}

export function resolveField(fieldId: string, context: FieldResolutionContext): string | null {
  switch (fieldId) {
    case 'case.displayName':
      return context.caseDisplayName || null;
    case 'case.reference':
      return context.caseReference || null;
    case 'client.displayName':
      return context.clientDisplayName || null;
    case 'client.role':
      return context.clientRole || null;
    case 'lawyer.displayName':
      return context.lawyerDisplayName || null;
    case 'document.title':
      return context.documentTitle || null;
    case 'date.today': {
      const now = context.today || new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      return `${year}. ${month}. ${day}.`;
    }
    default:
      return null; // manual fields and unknown ids never auto-resolve
  }
}

export interface TokenOccurrence {
  fieldId: string;
  label: string;
  resolved: string | null;
}

/** Lists every field token in the document with its resolution state. */
export function listTokenOccurrences(doc: EditorNode, context: FieldResolutionContext): TokenOccurrence[] {
  const occurrences: TokenOccurrence[] = [];
  const visit = (node: EditorNode): void => {
    if (node.type === 'fieldToken' && isRecord(node.attrs) && typeof node.attrs.fieldId === 'string') {
      const fieldId = node.attrs.fieldId;
      const definition = FIELD_INDEX.get(fieldId);
      occurrences.push({
        fieldId,
        label: definition?.label || fieldId,
        resolved: definition ? resolveField(fieldId, context) : null,
      });
    }
    childrenOf(node).forEach(visit);
  };
  visit(doc);
  return occurrences;
}

export function countUnresolvedTokens(doc: EditorNode, context: FieldResolutionContext): number {
  return listTokenOccurrences(doc, context).filter((occurrence) => occurrence.resolved === null).length;
}

/**
 * Explicit, user-confirmed conversion of resolved tokens into static text.
 * Unresolved tokens are left in place. Pure transform — returns a new doc.
 */
export function convertResolvedTokensToStaticText(doc: EditorNode, context: FieldResolutionContext): EditorNode {
  const clone = deepCloneNode(doc);
  const visit = (node: EditorNode): void => {
    if (!Array.isArray(node.content)) return;
    node.content = node.content.map((child) => {
      if (child.type === 'fieldToken' && isRecord(child.attrs) && typeof child.attrs.fieldId === 'string') {
        const resolved = resolveField(child.attrs.fieldId, context);
        if (resolved) {
          return { type: 'text', text: resolved } as EditorNode;
        }
      }
      return child;
    });
    node.content.forEach(visit);
  };
  visit(clone);
  return clone;
}

/** Display text for an in-editor token chip. */
export function tokenDisplayText(fieldId: string, context: FieldResolutionContext): string {
  const resolved = resolveField(fieldId, context);
  if (resolved) return resolved;
  const definition = FIELD_INDEX.get(fieldId);
  return `{{ ${definition?.label || fieldId} }}`;
}
