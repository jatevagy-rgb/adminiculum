/**
 * Legal clause numbering engine and structural clause operations.
 *
 * Clause numbers (1., 1.1., 1.1.1.) are ALWAYS derived from the document
 * structure — they are never stored as editable text and never serialized.
 * The same computation feeds the on-canvas decorations, the outline panel,
 * the plain-text serializer and the HTML export, so moving/inserting/deleting
 * a clause renumbers everything automatically and consistently.
 *
 * All operations are pure JSON transforms with explicit validity guards
 * (maximum depth, no orphan levels, no illegal jumps).
 */

import {
  childrenOf,
  deepCloneNode,
  EDITOR_LIMITS,
  EditorNode,
  generateClauseId,
  isRecord,
  newClauseNode,
  textOf,
} from './editorModel';

export function clauseIdOf(node: EditorNode): string | null {
  return node.type === 'legalClause' && isRecord(node.attrs) && typeof node.attrs.cid === 'string'
    ? node.attrs.cid
    : null;
}

// ---------------------------------------------------------------------------
// Numbering
// ---------------------------------------------------------------------------

/** Map of clause id → generated number label ("1.", "1.1.", "1.1.1."). */
export function computeClauseNumbers(doc: EditorNode): Map<string, string> {
  const numbers = new Map<string, string>();
  const visit = (nodes: EditorNode[], prefix: number[]): void => {
    let counter = 0;
    for (const node of nodes) {
      if (node.type === 'legalClause') {
        counter += 1;
        const path = [...prefix, counter];
        const cid = clauseIdOf(node);
        if (cid) numbers.set(cid, `${path.join('.')}.`);
        visit(childrenOf(node), path);
      } else {
        // Clauses only number against sibling clauses; other blocks are transparent.
        visit(childrenOf(node), prefix);
      }
    }
  };
  visit(childrenOf(doc), []);
  return numbers;
}

// ---------------------------------------------------------------------------
// Outline
// ---------------------------------------------------------------------------

export interface OutlineItem {
  key: string;
  kind: 'HEADING' | 'CLAUSE';
  level: number;
  number?: string | null;
  title: string;
  clauseId?: string | null;
}

function clauseTitleOf(clause: EditorNode): string {
  const heading = childrenOf(clause).find((child) => child.type === 'clauseHeading');
  if (heading) {
    const headingText = textOf(heading).trim();
    if (headingText) return headingText;
  }
  const firstParagraph = childrenOf(clause).find((child) => child.type === 'paragraph');
  const excerpt = firstParagraph ? textOf(firstParagraph).trim() : '';
  return excerpt.length > 60 ? `${excerpt.slice(0, 59)}…` : excerpt || '(üres pont)';
}

export function extractOutline(doc: EditorNode): OutlineItem[] {
  const numbers = computeClauseNumbers(doc);
  const outline: OutlineItem[] = [];
  let headingIndex = 0;

  const visit = (nodes: EditorNode[], clauseLevel: number): void => {
    for (const node of nodes) {
      if (node.type === 'heading') {
        headingIndex += 1;
        const level = isRecord(node.attrs) && typeof node.attrs.level === 'number' ? node.attrs.level : 1;
        outline.push({
          key: `h-${headingIndex}`,
          kind: 'HEADING',
          level,
          title: textOf(node).trim() || '(cím nélkül)',
        });
      } else if (node.type === 'legalClause') {
        const cid = clauseIdOf(node);
        outline.push({
          key: `c-${cid || headingIndex}`,
          kind: 'CLAUSE',
          level: clauseLevel + 1,
          number: cid ? numbers.get(cid) : null,
          title: clauseTitleOf(node),
          clauseId: cid,
        });
        visit(childrenOf(node), clauseLevel + 1);
        continue;
      }
      visit(childrenOf(node), clauseLevel);
    }
  };
  visit(childrenOf(doc), 0);
  return outline;
}

// ---------------------------------------------------------------------------
// Structural clause operations (pure transforms)
// ---------------------------------------------------------------------------

export interface ClauseOperationResult {
  ok: boolean;
  doc?: EditorNode;
  error?: string;
  /** The clause id to focus after the operation. */
  focusClauseId?: string;
}

interface ClauseLocation {
  parent: EditorNode; // node whose content contains the clause (doc or legalClause)
  siblings: EditorNode[];
  index: number;
  depth: number; // 1 = top level clause
  node: EditorNode;
}

function locateClause(root: EditorNode, cid: string): ClauseLocation | null {
  const visit = (parent: EditorNode, depth: number): ClauseLocation | null => {
    const siblings = childrenOf(parent);
    for (let index = 0; index < siblings.length; index += 1) {
      const node = siblings[index];
      if (node.type === 'legalClause') {
        if (clauseIdOf(node) === cid) {
          return { parent, siblings, index, depth: depth + 1, node };
        }
        const found = visit(node, depth + 1);
        if (found) return found;
      } else if (Array.isArray(node.content)) {
        const found = visit(node, depth);
        if (found) return found;
      }
    }
    return null;
  };
  return visit(root, 0);
}

function clauseSubtreeDepth(node: EditorNode): number {
  let max = 1;
  for (const child of childrenOf(node)) {
    if (child.type === 'legalClause') {
      max = Math.max(max, 1 + clauseSubtreeDepth(child));
    }
  }
  return max;
}

function withFreshClauseIds(node: EditorNode): EditorNode {
  const clone = deepCloneNode(node);
  const visit = (candidate: EditorNode): void => {
    if (candidate.type === 'legalClause') {
      candidate.attrs = { ...(candidate.attrs || {}), cid: generateClauseId() };
    }
    childrenOf(candidate).forEach(visit);
  };
  visit(clone);
  return clone;
}

function run(doc: EditorNode, cid: string, mutate: (location: ClauseLocation, root: EditorNode) => ClauseOperationResult): ClauseOperationResult {
  const root = deepCloneNode(doc);
  const location = locateClause(root, cid);
  if (!location) return { ok: false, error: 'A megadott szerződéses pont nem található.' };
  return mutate(location, root);
}

export function insertClauseBefore(doc: EditorNode, cid: string): ClauseOperationResult {
  return run(doc, cid, (location, root) => {
    const fresh = newClauseNode();
    location.siblings.splice(location.index, 0, fresh);
    return { ok: true, doc: root, focusClauseId: clauseIdOf(fresh) || undefined };
  });
}

export function insertClauseAfter(doc: EditorNode, cid: string): ClauseOperationResult {
  return run(doc, cid, (location, root) => {
    const fresh = newClauseNode();
    location.siblings.splice(location.index + 1, 0, fresh);
    return { ok: true, doc: root, focusClauseId: clauseIdOf(fresh) || undefined };
  });
}

export function addSubclause(doc: EditorNode, cid: string): ClauseOperationResult {
  return run(doc, cid, (location, root) => {
    if (location.depth + 1 > EDITOR_LIMITS.maxClauseDepth) {
      return { ok: false, error: `Legfeljebb ${EDITOR_LIMITS.maxClauseDepth} szintű pont-hierarchia támogatott.` };
    }
    const fresh = newClauseNode();
    location.node.content = [...childrenOf(location.node), fresh];
    return { ok: true, doc: root, focusClauseId: clauseIdOf(fresh) || undefined };
  });
}

function siblingClauseIndexes(siblings: EditorNode[]): number[] {
  return siblings.map((node, index) => (node.type === 'legalClause' ? index : -1)).filter((index) => index >= 0);
}

export function moveClauseUp(doc: EditorNode, cid: string): ClauseOperationResult {
  return run(doc, cid, (location, root) => {
    const clauseIndexes = siblingClauseIndexes(location.siblings);
    const position = clauseIndexes.indexOf(location.index);
    if (position <= 0) return { ok: false, error: 'A pont már az első a saját szintjén.' };
    const targetIndex = clauseIndexes[position - 1];
    const [node] = location.siblings.splice(location.index, 1);
    location.siblings.splice(targetIndex, 0, node);
    return { ok: true, doc: root, focusClauseId: cid };
  });
}

export function moveClauseDown(doc: EditorNode, cid: string): ClauseOperationResult {
  return run(doc, cid, (location, root) => {
    const clauseIndexes = siblingClauseIndexes(location.siblings);
    const position = clauseIndexes.indexOf(location.index);
    if (position < 0 || position >= clauseIndexes.length - 1) {
      return { ok: false, error: 'A pont már az utolsó a saját szintjén.' };
    }
    const targetIndex = clauseIndexes[position + 1];
    const [node] = location.siblings.splice(location.index, 1);
    // After removal the target sibling shifted left by one.
    location.siblings.splice(targetIndex, 0, node);
    return { ok: true, doc: root, focusClauseId: cid };
  });
}

/** Promote: the clause leaves its parent clause and becomes the parent's next sibling. */
export function promoteClause(doc: EditorNode, cid: string): ClauseOperationResult {
  return run(doc, cid, (location, root) => {
    if (location.parent.type !== 'legalClause') {
      return { ok: false, error: 'A pont már a legfelső szinten van.' };
    }
    const parentCid = clauseIdOf(location.parent);
    if (!parentCid) return { ok: false, error: 'A szülő pont azonosítója hiányzik.' };
    const parentLocation = locateClause(root, parentCid);
    if (!parentLocation) return { ok: false, error: 'A szülő pont nem található.' };

    const [node] = location.siblings.splice(location.index, 1);
    parentLocation.siblings.splice(parentLocation.index + 1, 0, node);
    return { ok: true, doc: root, focusClauseId: cid };
  });
}

/** Demote: the clause becomes a subclause of its previous sibling clause. */
export function demoteClause(doc: EditorNode, cid: string): ClauseOperationResult {
  return run(doc, cid, (location, root) => {
    const clauseIndexes = siblingClauseIndexes(location.siblings);
    const position = clauseIndexes.indexOf(location.index);
    if (position <= 0) {
      return { ok: false, error: 'Nincs előtte lévő pont, amely alá besorolható lenne (érvénytelen szintugrás).' };
    }
    const newDepth = location.depth + 1;
    const subtreeDepth = clauseSubtreeDepth(location.node);
    if (newDepth + subtreeDepth - 1 > EDITOR_LIMITS.maxClauseDepth) {
      return { ok: false, error: `Legfeljebb ${EDITOR_LIMITS.maxClauseDepth} szintű pont-hierarchia támogatott.` };
    }
    const previousClause = location.siblings[clauseIndexes[position - 1]];
    const [node] = location.siblings.splice(location.index, 1);
    previousClause.content = [...childrenOf(previousClause), node];
    return { ok: true, doc: root, focusClauseId: cid };
  });
}

export function duplicateClause(doc: EditorNode, cid: string): ClauseOperationResult {
  return run(doc, cid, (location, root) => {
    const copy = withFreshClauseIds(location.node);
    location.siblings.splice(location.index + 1, 0, copy);
    return { ok: true, doc: root, focusClauseId: clauseIdOf(copy) || undefined };
  });
}

export function deleteClause(doc: EditorNode, cid: string): ClauseOperationResult {
  return run(doc, cid, (location, root) => {
    location.siblings.splice(location.index, 1);
    // A document must keep at least one block.
    if (root.type === 'doc' && childrenOf(root).length === 0) {
      root.content = [{ type: 'paragraph' }];
    }
    return { ok: true, doc: root };
  });
}

/** Detects duplicated clause ids (invalid structure, e.g. after unsafe paste). */
export function findDuplicateClauseIds(doc: EditorNode): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  const visit = (node: EditorNode): void => {
    const cid = clauseIdOf(node);
    if (cid) {
      if (seen.has(cid)) duplicates.add(cid);
      seen.add(cid);
    }
    childrenOf(node).forEach(visit);
  };
  visit(doc);
  return [...duplicates];
}

/** Reassigns fresh ids to duplicated clauses (keeps the first occurrence). */
export function repairDuplicateClauseIds(doc: EditorNode): EditorNode {
  const clone = deepCloneNode(doc);
  const seen = new Set<string>();
  const visit = (node: EditorNode): void => {
    if (node.type === 'legalClause' && isRecord(node.attrs) && typeof node.attrs.cid === 'string') {
      if (seen.has(node.attrs.cid)) {
        node.attrs = { ...node.attrs, cid: generateClauseId() };
      }
      seen.add(String(node.attrs.cid));
    }
    childrenOf(node).forEach(visit);
  };
  visit(clone);
  return clone;
}
