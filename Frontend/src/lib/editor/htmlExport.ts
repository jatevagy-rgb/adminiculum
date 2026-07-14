/**
 * Sanitized standalone HTML export.
 *
 * The exporter walks the validated editor JSON and emits escaped, self-
 * contained HTML with a minimal inline stylesheet: no scripts, no external
 * resources, no application classes, no internal identifiers. Clause numbers
 * are generated from the shared numbering engine at export time.
 */

import { clauseIdOf, computeClauseNumbers } from './clauseNumbering';
import { childrenOf, EditorNode, isRecord } from './editorModel';
import { FieldResolutionContext, tokenDisplayText } from './fieldTokens';
import { orderedListMarker } from './plainTextExport';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderMarks(text: string, marks: EditorNode['marks']): string {
  let html = text;
  for (const mark of marks || []) {
    if (mark.type === 'bold') html = `<strong>${html}</strong>`;
    else if (mark.type === 'italic') html = `<em>${html}</em>`;
    else if (mark.type === 'underline') html = `<u>${html}</u>`;
    else if (mark.type === 'strike') html = `<s>${html}</s>`;
    else if (mark.type === 'link' && isRecord(mark.attrs) && typeof mark.attrs.href === 'string') {
      const href = mark.attrs.href;
      const lower = href.trim().toLowerCase();
      if (lower.startsWith('http:') || lower.startsWith('https:') || lower.startsWith('mailto:')) {
        html = `<a href="${escapeHtml(href)}" rel="noopener noreferrer">${html}</a>`;
      }
    }
  }
  return html;
}

const EXPORT_STYLE = `
  body { font-family: Georgia, 'Times New Roman', serif; font-size: 12pt; line-height: 1.5; color: #1a1a1a; max-width: 17cm; margin: 2cm auto; }
  h1 { font-size: 16pt; text-align: center; } h2 { font-size: 14pt; } h3 { font-size: 12.5pt; }
  table { border-collapse: collapse; width: 100%; margin: 0.6em 0; }
  td, th { border: 1px solid #444; padding: 4pt 6pt; vertical-align: top; text-align: left; }
  blockquote { margin: 0.6em 0 0.6em 1.5em; font-style: italic; }
  .clause { margin: 0.5em 0 0.5em 0; }
  .clause .clause { margin-left: 1.4em; }
  .clause-no { font-weight: 700; margin-right: 0.4em; }
  .clause-title { font-weight: 700; }
  .page-break { page-break-after: always; border: 0; }
  .unresolved-token { background: #f3e8c8; padding: 0 2px; }
  @page { size: A4; margin: 20mm; }
`;

export function editorDocToStandaloneHtml(
  doc: EditorNode,
  options: { title?: string; context?: FieldResolutionContext } = {}
): string {
  const context = options.context || {};
  const numbers = computeClauseNumbers(doc);

  const renderInline = (node: EditorNode): string => {
    if (node.type === 'text') return renderMarks(escapeHtml(node.text || ''), node.marks);
    if (node.type === 'hardBreak') return '<br />';
    if (node.type === 'fieldToken' && isRecord(node.attrs) && typeof node.attrs.fieldId === 'string') {
      const display = tokenDisplayText(node.attrs.fieldId, context);
      const unresolved = display.startsWith('{{');
      return unresolved
        ? `<span class="unresolved-token">${escapeHtml(display)}</span>`
        : escapeHtml(display);
    }
    return childrenOf(node).map(renderInline).join('');
  };

  const renderBlocks = (nodes: EditorNode[]): string =>
    nodes
      .map((node): string => {
        switch (node.type) {
          case 'paragraph':
            return `<p>${renderInline(node) || '&nbsp;'}</p>`;
          case 'heading': {
            const level = isRecord(node.attrs) && typeof node.attrs.level === 'number' ? node.attrs.level : 1;
            const safeLevel = Math.min(Math.max(level, 1), 3);
            return `<h${safeLevel}>${renderInline(node)}</h${safeLevel}>`;
          }
          case 'legalClause': {
            const cid = clauseIdOf(node);
            const number = (cid && numbers.get(cid)) || '';
            const inner = childrenOf(node);
            const headingNode = inner.find((child) => child.type === 'clauseHeading') || null;
            const headingHtml = headingNode
              ? `<p><span class="clause-no">${escapeHtml(number)}</span><span class="clause-title">${renderInline(headingNode)}</span></p>`
              : `<p><span class="clause-no">${escapeHtml(number)}</span></p>`;
            return `<div class="clause">${headingHtml}${renderBlocks(inner.filter((child) => child !== headingNode))}</div>`;
          }
          case 'bulletList':
            return `<ul>${childrenOf(node)
              .map((item) => `<li>${renderBlocks(childrenOf(item))}</li>`)
              .join('')}</ul>`;
          case 'orderedList': {
            const style = isRecord(node.attrs) && typeof node.attrs.listStyle === 'string' ? String(node.attrs.listStyle) : 'decimal';
            const start = isRecord(node.attrs) && typeof node.attrs.start === 'number' ? node.attrs.start : 1;
            // Emit explicit markers so exported numbering matches the canvas.
            return `<ul style="list-style:none;padding-left:1.2em">${childrenOf(node)
              .map(
                (item, index) =>
                  `<li><span class="clause-no">${escapeHtml(orderedListMarker(style, start + index))}</span>${renderBlocks(childrenOf(item))}</li>`
              )
              .join('')}</ul>`;
          }
          case 'blockquote':
            return `<blockquote>${renderBlocks(childrenOf(node))}</blockquote>`;
          case 'table':
            return `<table>${childrenOf(node)
              .map(
                (row) =>
                  `<tr>${childrenOf(row)
                    .map((cell) => {
                      const tag = cell.type === 'tableHeader' ? 'th' : 'td';
                      const colspan = isRecord(cell.attrs) && typeof cell.attrs.colspan === 'number' && cell.attrs.colspan > 1 ? ` colspan="${cell.attrs.colspan}"` : '';
                      const rowspan = isRecord(cell.attrs) && typeof cell.attrs.rowspan === 'number' && cell.attrs.rowspan > 1 ? ` rowspan="${cell.attrs.rowspan}"` : '';
                      return `<${tag}${colspan}${rowspan}>${renderBlocks(childrenOf(cell))}</${tag}>`;
                    })
                    .join('')}</tr>`
              )
              .join('')}</table>`;
          case 'horizontalRule':
            return '<hr />';
          case 'pageBreak':
            return '<hr class="page-break" />';
          default:
            return renderBlocks(childrenOf(node));
        }
      })
      .join('\n');

  const title = escapeHtml(options.title || 'Dokumentum');
  return [
    '<!DOCTYPE html>',
    '<html lang="hu">',
    '<head>',
    '<meta charset="utf-8" />',
    `<title>${title}</title>`,
    `<style>${EXPORT_STYLE}</style>`,
    '</head>',
    '<body>',
    renderBlocks(childrenOf(doc)),
    '</body>',
    '</html>',
  ].join('\n');
}
