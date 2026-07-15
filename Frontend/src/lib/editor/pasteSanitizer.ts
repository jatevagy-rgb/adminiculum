/**
 * Word-paste sanitization for the legal-document editor.
 *
 * Defense-in-depth: this string-level sanitizer removes scripts, styles,
 * Word/Office XML, event handlers, unsafe URLs, fonts, colors and classes
 * BEFORE the HTML reaches Tiptap. The hard boundary remains the Tiptap schema
 * (only allow-listed nodes/marks parse at all) plus the strict JSON validator.
 *
 * No claim of perfect DOCX fidelity is made: paragraphs, headings, basic
 * formatting, lists and bounded tables are preserved; everything else is
 * dropped deliberately.
 */

const BLOCK_STRIP_PATTERNS: RegExp[] = [
  /<script\b[\s\S]*?<\/script\s*>/gi,
  /<style\b[\s\S]*?<\/style\s*>/gi,
  /<title\b[\s\S]*?<\/title\s*>/gi,
  /<xml\b[\s\S]*?<\/xml\s*>/gi,
  /<iframe\b[\s\S]*?(<\/iframe\s*>|\/>)/gi,
  /<object\b[\s\S]*?(<\/object\s*>|\/>)/gi,
  /<embed\b[^>]*\/?>/gi,
  /<form\b[\s\S]*?<\/form\s*>/gi,
  /<input\b[^>]*\/?>/gi,
  /<meta\b[^>]*\/?>/gi,
  /<link\b[^>]*\/?>/gi,
  /<!--[\s\S]*?-->/g, // includes Word conditional comments <!--[if ...]>...<![endif]-->
  /<\/?[a-z]+:[a-z0-9]+\b[^>]*>/gi, // namespaced Office tags: <o:p>, <w:sdt>, <m:...>
  /<img\b[^>]*\/?>/gi, // no safe image upload path exists — images are dropped
];

const UNWRAP_TAGS = ['span', 'font', 'div', 'o:p', 'center', 'article', 'section'];

/** Attributes allowed to survive on any tag (everything else is stripped). */
const KEEP_ATTR_PATTERN = /^(colspan|rowspan|href|start)$/i;

function stripDisallowedAttributes(tagBody: string): string {
  // tagBody: "td colspan=\"2\" style=..." (without <>)
  const tagNameMatch = tagBody.match(/^\/?\s*([a-zA-Z0-9]+)/);
  if (!tagNameMatch) return tagBody;
  const tagName = tagNameMatch[1];

  const attrs: string[] = [];
  const attrPattern = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/g;
  let match: RegExpExecArray | null;
  while ((match = attrPattern.exec(tagBody)) !== null) {
    const name = match[1];
    const rawValue = match[2].replace(/^["']|["']$/g, '');
    if (/^on/i.test(name)) continue; // event handlers never survive
    if (!KEEP_ATTR_PATTERN.test(name)) continue;
    if (name.toLowerCase() === 'href') {
      const value = rawValue.trim().toLowerCase();
      if (value.startsWith('javascript:') || value.startsWith('data:') || value.startsWith('vbscript:') || value.startsWith('file:')) {
        continue; // unsafe protocol → link becomes plain text
      }
    }
    attrs.push(`${name}="${rawValue.replace(/"/g, '&quot;')}"`);
  }
  return attrs.length > 0 ? `${tagName} ${attrs.join(' ')}` : tagName;
}

export function sanitizeExternalHtml(input: string): string {
  if (!input) return '';
  let html = input;

  for (const pattern of BLOCK_STRIP_PATTERNS) {
    html = html.replace(pattern, '');
  }

  // Unwrap purely presentational containers while keeping their content.
  for (const tag of UNWRAP_TAGS) {
    const open = new RegExp(`<${tag}\\b[^>]*>`, 'gi');
    const close = new RegExp(`</${tag}\\s*>`, 'gi');
    html = html.replace(open, '').replace(close, '');
  }

  // Strip disallowed attributes from every remaining tag.
  html = html.replace(/<(\/?[^>]+?)\/?>(?!\s*<\/script)/g, (full, body: string) => {
    if (body.startsWith('/')) {
      const cleaned = body.replace(/^\/\s*/, '').match(/^([a-zA-Z0-9]+)/);
      return cleaned ? `</${cleaned[1]}>` : '';
    }
    const selfClosing = /\/\s*$/.test(body) || /^(br|hr)\b/i.test(body);
    const cleanedBody = stripDisallowedAttributes(body.replace(/\/\s*$/, ''));
    return `<${cleanedBody}${selfClosing ? ' /' : ''}>`;
  });

  // Word list paragraphs (MsoListParagraph) already lost their class — leave
  // them as paragraphs; genuine <ol>/<ul>/<li> structures survive.

  // Normalize whitespace artifacts without destroying meaningful non-breaking
  // spaces inside legal references (e.g. "2013. évi V. törvény").
  html = html
    .replace(/\r\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/(&nbsp;){2,}/gi, '&nbsp;');

  return html.trim();
}

/** "Beillesztés formázás nélkül": HTML → plain paragraphs. */
export function externalHtmlToPlainText(input: string): string {
  const sanitized = sanitizeExternalHtml(input)
    .replace(/<(br|\/p|\/h[1-6]|\/li|\/tr)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/g, "'");
  return sanitized
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line, index, lines) => line.length > 0 || (index > 0 && lines[index - 1].length > 0))
    .join('\n')
    .trim();
}
