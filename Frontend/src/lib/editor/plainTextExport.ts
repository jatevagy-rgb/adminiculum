/**
 * Plain-text serialization and document statistics for the legal editor.
 *
 * Clause numbers come from the shared numbering engine, so plain-text copy and
 * TXT export always show the same generated numbering that the canvas renders,
 * without the numbers ever being stored in the document content.
 */

import { computeClauseNumbers, clauseIdOf } from './clauseNumbering';
import { childrenOf, EditorNode, isRecord, textOf } from './editorModel';
import { FieldResolutionContext, tokenDisplayText } from './fieldTokens';

const PAGE_BREAK_MARKER = '───── Oldaltörés ─────';

function toLowerAlpha(index: number): string {
  let label = '';
  let value = index;
  while (value > 0) {
    const remainder = (value - 1) % 26;
    label = String.fromCharCode(97 + remainder) + label;
    value = Math.floor((value - 1) / 26);
  }
  return label;
}

const ROMAN_PAIRS: Array<[number, string]> = [
  [1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'],
  [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i'],
];

function toLowerRoman(index: number): string {
  let value = index;
  let label = '';
  for (const [amount, numeral] of ROMAN_PAIRS) {
    while (value >= amount) {
      label += numeral;
      value -= amount;
    }
  }
  return label;
}

export function orderedListMarker(style: string | undefined, index: number): string {
  if (style === 'lower-alpha') return `${toLowerAlpha(index)})`;
  if (style === 'lower-roman') return `(${toLowerRoman(index)})`;
  return `${index}.`;
}

function inlineText(node: EditorNode, context: FieldResolutionContext): string {
  if (node.type === 'text') return node.text || '';
  if (node.type === 'hardBreak') return '\n';
  if (node.type === 'fieldToken' && isRecord(node.attrs) && typeof node.attrs.fieldId === 'string') {
    return tokenDisplayText(node.attrs.fieldId, context);
  }
  return childrenOf(node).map((child) => inlineText(child, context)).join('');
}

export function editorDocToPlainText(doc: EditorNode, context: FieldResolutionContext = {}): string {
  const numbers = computeClauseNumbers(doc);
  const lines: string[] = [];

  const renderBlocks = (nodes: EditorNode[], indent: string): void => {
    for (const node of nodes) {
      switch (node.type) {
        case 'heading':
        case 'paragraph':
        case 'clauseHeading': {
          const text = inlineText(node, context).trim();
          if (text) lines.push(indent + text);
          break;
        }
        case 'legalClause': {
          const cid = clauseIdOf(node);
          const number = (cid && numbers.get(cid)) || '';
          const inner = childrenOf(node);
          const headingNode = inner.find((child) => child.type === 'clauseHeading');
          const headingText = headingNode ? inlineText(headingNode, context).trim() : '';
          if (headingText) {
            lines.push(`${indent}${number} ${headingText}`.trim());
          } else {
            lines.push(`${indent}${number}`.trim());
          }
          renderBlocks(inner.filter((child) => child !== headingNode), `${indent}  `);
          break;
        }
        case 'bulletList': {
          childrenOf(node).forEach((item) => {
            const itemBlocks = childrenOf(item);
            const first = itemBlocks[0] ? inlineText(itemBlocks[0], context).trim() : '';
            lines.push(`${indent}– ${first}`);
            renderBlocks(itemBlocks.slice(1), `${indent}  `);
          });
          break;
        }
        case 'orderedList': {
          const style = isRecord(node.attrs) && typeof node.attrs.listStyle === 'string' ? node.attrs.listStyle : 'decimal';
          const start = isRecord(node.attrs) && typeof node.attrs.start === 'number' ? node.attrs.start : 1;
          childrenOf(node).forEach((item, itemIndex) => {
            const itemBlocks = childrenOf(item);
            const first = itemBlocks[0] ? inlineText(itemBlocks[0], context).trim() : '';
            lines.push(`${indent}${orderedListMarker(style, start + itemIndex)} ${first}`);
            renderBlocks(itemBlocks.slice(1), `${indent}  `);
          });
          break;
        }
        case 'blockquote':
          renderBlocks(childrenOf(node), `${indent}> `);
          break;
        case 'table': {
          childrenOf(node).forEach((row) => {
            const cells = childrenOf(row).map((cell) => inlineText(cell, context).replace(/\n/g, ' ').trim());
            lines.push(indent + cells.join('\t'));
          });
          break;
        }
        case 'horizontalRule':
          lines.push(`${indent}――――――――――`);
          break;
        case 'pageBreak':
          lines.push(indent + PAGE_BREAK_MARKER);
          break;
        default:
          renderBlocks(childrenOf(node), indent);
      }
    }
  };

  renderBlocks(childrenOf(doc), '');
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------

export interface EditorDocumentStats {
  words: number;
  characters: number;
  paragraphs: number;
  clauses: number;
  /** Explicitly approximate: derived from character count, not real page flow. */
  approximatePages: number;
}

const APPROX_CHARS_PER_PAGE = 2600;

export function computeDocumentStats(doc: EditorNode): EditorDocumentStats {
  let paragraphs = 0;
  let clauses = 0;
  let pageBreaks = 0;
  const textSegments: string[] = [];

  const visit = (node: EditorNode): void => {
    if (node.type === 'paragraph' || node.type === 'heading' || node.type === 'clauseHeading') {
      if (node.type !== 'clauseHeading') paragraphs += 1;
      // Blocks are separate word boundaries — never concatenated.
      textSegments.push(textOf(node));
      return;
    }
    if (node.type === 'legalClause') clauses += 1;
    if (node.type === 'pageBreak') pageBreaks += 1;
    childrenOf(node).forEach(visit);
  };
  visit(doc);

  const characters = textSegments.reduce((sum, segment) => sum + segment.length, 0);
  const words = textSegments.reduce((sum, segment) => sum + segment.split(/\s+/).filter(Boolean).length, 0);
  const approximatePages = Math.max(1, Math.max(Math.ceil(characters / APPROX_CHARS_PER_PAGE), pageBreaks + 1));

  return {
    words,
    characters,
    paragraphs,
    clauses,
    approximatePages,
  };
}
