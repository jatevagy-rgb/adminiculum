/**
 * Tiptap extensions for the professional legal-document editor.
 *
 * The custom nodes mirror the strict allow-listed content model in
 * `@/lib/editor/editorModel` exactly — anything the validator rejects cannot
 * be produced here, and anything pasted that is outside the schema simply does
 * not parse. Clause numbers are rendered through decorations derived from the
 * document structure; they are never part of the stored content.
 */

import { Extension, Node, mergeAttributes } from '@tiptap/core';
import { OrderedList } from '@tiptap/extension-ordered-list';
import { Plugin, PluginKey, Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as PmNode } from '@tiptap/pm/model';
import { generateClauseId } from '@/lib/editor/editorModel';
import { getFieldDefinition } from '@/lib/editor/fieldTokens';

// ---------------------------------------------------------------------------
// Clause heading (optional bold title line inside a clause)
// ---------------------------------------------------------------------------

export const ClauseHeading = Node.create({
  name: 'clauseHeading',
  content: 'inline*',
  defining: true,
  parseHTML() {
    return [{ tag: 'div[data-clause-heading]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-clause-heading': '', class: 'clause-heading' }), 0];
  },
});

// ---------------------------------------------------------------------------
// Legal clause — nested numbered structure (1., 1.1., 1.1.1.)
// ---------------------------------------------------------------------------

export const LegalClause = Node.create({
  name: 'legalClause',
  group: 'block',
  content: 'clauseHeading? (paragraph | bulletList | orderedList | blockquote | table)+ legalClause*',
  defining: true,
  addAttributes() {
    return {
      cid: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-cid'),
        renderHTML: (attributes) => (attributes.cid ? { 'data-cid': attributes.cid } : {}),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-legal-clause]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-legal-clause': '', class: 'legal-clause' }), 0];
  },
});

// ---------------------------------------------------------------------------
// Clause id integrity — assigns fresh stable ids to new/duplicated clauses
// (e.g. when Enter splits a clause and copies its attributes).
// ---------------------------------------------------------------------------

export const ClauseIdIntegrity = Extension.create({
  name: 'clauseIdIntegrity',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('clauseIdIntegrity'),
        appendTransaction: (transactions, _oldState, newState): Transaction | null => {
          if (!transactions.some((transaction) => transaction.docChanged)) return null;
          const seen = new Set<string>();
          let tr: Transaction | null = null;
          newState.doc.descendants((node, pos) => {
            if (node.type.name !== 'legalClause') return true;
            const cid = typeof node.attrs.cid === 'string' ? node.attrs.cid : null;
            if (!cid || seen.has(cid)) {
              tr = tr || newState.tr;
              tr.setNodeMarkup(pos, undefined, { ...node.attrs, cid: generateClauseId() });
            } else {
              seen.add(cid);
            }
            return true;
          });
          return tr;
        },
      }),
    ];
  },
});

// ---------------------------------------------------------------------------
// Clause number decorations — numbering derived from structure on every
// transaction; rendered via a data attribute + CSS, never stored in content.
// ---------------------------------------------------------------------------

function buildClauseNumberDecorations(doc: PmNode): DecorationSet {
  const decorations: Decoration[] = [];
  const walk = (node: PmNode, basePos: number, prefix: number[]): void => {
    let counter = 0;
    node.forEach((child, offset) => {
      const childPos = basePos + offset;
      if (child.type.name === 'legalClause') {
        counter += 1;
        const path = [...prefix, counter];
        decorations.push(
          Decoration.node(childPos, childPos + child.nodeSize, {
            'data-clause-no': `${path.join('.')}.`,
            'data-clause-level': String(path.length),
          })
        );
        walk(child, childPos + 1, path);
      } else if (child.childCount > 0) {
        walk(child, childPos + 1, prefix);
      }
    });
  };
  walk(doc, 0, []);
  return DecorationSet.create(doc, decorations);
}

export const ClauseNumberDecorations = Extension.create({
  name: 'clauseNumberDecorations',
  addProseMirrorPlugins() {
    const key = new PluginKey<DecorationSet>('clauseNumberDecorations');
    return [
      new Plugin<DecorationSet>({
        key,
        state: {
          init: (_config, state) => buildClauseNumberDecorations(state.doc),
          apply: (tr, previous) => (tr.docChanged ? buildClauseNumberDecorations(tr.doc) : previous),
        },
        props: {
          decorations(state) {
            return key.getState(state);
          },
        },
      }),
    ];
  },
});

// ---------------------------------------------------------------------------
// Page break — explicit atom node (continuous A4 canvas, honest pagination)
// ---------------------------------------------------------------------------

export const PageBreak = Node.create({
  name: 'pageBreak',
  group: 'block',
  atom: true,
  selectable: true,
  parseHTML() {
    return [{ tag: 'div[data-page-break]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-page-break': '', class: 'page-break-node' })];
  },
});

// ---------------------------------------------------------------------------
// Field token — inline atom chip from the explicit field allow-list
// ---------------------------------------------------------------------------

export const FieldToken = Node.create({
  name: 'fieldToken',
  group: 'inline',
  inline: true,
  atom: true,
  addAttributes() {
    return {
      fieldId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-field-id'),
        renderHTML: (attributes) => (attributes.fieldId ? { 'data-field-id': attributes.fieldId } : {}),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'span[data-field-token]' }];
  },
  renderHTML({ node, HTMLAttributes }) {
    const definition = typeof node.attrs.fieldId === 'string' ? getFieldDefinition(node.attrs.fieldId) : null;
    const label = definition?.label || String(node.attrs.fieldId || 'mező');
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-field-token': '',
        class: 'field-token',
        title: definition ? `${label} (${definition.source})` : label,
      }),
      `{{ ${label} }}`,
    ];
  },
});

// ---------------------------------------------------------------------------
// Ordered list with legal marker styles (1. / a) / (i))
// ---------------------------------------------------------------------------

export const OrderedListStyled = OrderedList.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      listStyle: {
        default: 'decimal',
        parseHTML: (element) => element.getAttribute('data-list-style') || 'decimal',
        renderHTML: (attributes) =>
          attributes.listStyle && attributes.listStyle !== 'decimal' ? { 'data-list-style': attributes.listStyle } : {},
      },
    };
  },
});

// ---------------------------------------------------------------------------
// Search highlight — decoration-based find; state is ephemeral UI state
// ---------------------------------------------------------------------------

export interface SearchQueryState {
  query: string;
  caseSensitive: boolean;
  wholeWord: boolean;
  activeIndex: number;
}

export interface SearchMatch {
  from: number;
  to: number;
}

export function findSearchMatches(doc: PmNode, state: Pick<SearchQueryState, 'query' | 'caseSensitive' | 'wholeWord'>): SearchMatch[] {
  const matches: SearchMatch[] = [];
  const query = state.caseSensitive ? state.query : state.query.toLowerCase();
  if (!query) return matches;

  const isWordChar = (character: string | undefined): boolean => Boolean(character && /[\p{L}\p{N}_]/u.test(character));

  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return true;
    const haystack = state.caseSensitive ? node.text : node.text.toLowerCase();
    let index = haystack.indexOf(query);
    while (index !== -1) {
      const beforeChar = node.text[index - 1];
      const afterChar = node.text[index + query.length];
      const wordOk = !state.wholeWord || (!isWordChar(beforeChar) && !isWordChar(afterChar));
      if (wordOk) {
        matches.push({ from: pos + index, to: pos + index + query.length });
      }
      index = haystack.indexOf(query, index + Math.max(query.length, 1));
    }
    return true;
  });
  return matches;
}

const searchPluginKey = new PluginKey<DecorationSet>('editorSearchHighlight');

export const SearchHighlight = Extension.create<Record<string, never>, { current: SearchQueryState }>({
  name: 'editorSearchHighlight',
  addStorage() {
    return { current: { query: '', caseSensitive: false, wholeWord: false, activeIndex: 0 } };
  },
  addProseMirrorPlugins() {
    const storage = this.storage;
    const build = (doc: PmNode): DecorationSet => {
      const { query, caseSensitive, wholeWord, activeIndex } = storage.current;
      if (!query) return DecorationSet.empty;
      const matches = findSearchMatches(doc, { query, caseSensitive, wholeWord });
      return DecorationSet.create(
        doc,
        matches.map((match, index) =>
          Decoration.inline(match.from, match.to, {
            class: index === activeIndex ? 'search-hit search-hit-active' : 'search-hit',
          })
        )
      );
    };
    return [
      new Plugin<DecorationSet>({
        key: searchPluginKey,
        state: {
          init: (_config, state) => build(state.doc),
          apply: (tr, previous) => (tr.docChanged || tr.getMeta(searchPluginKey) ? build(tr.doc) : previous),
        },
        props: {
          decorations(state) {
            return searchPluginKey.getState(state);
          },
        },
      }),
    ];
  },
});

export const SEARCH_PLUGIN_KEY = searchPluginKey;

/** Typed accessor for the search extension's editor storage. */
export function getSearchStorage(editor: { storage: unknown }): { current: SearchQueryState } {
  return (editor.storage as Record<string, { current: SearchQueryState }>).editorSearchHighlight;
}
