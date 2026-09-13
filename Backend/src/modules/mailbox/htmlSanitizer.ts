/**
 * UNIVERSAL MAILBOX — untrusted email HTML sanitization (conservative, pure).
 *
 * No sanitizer dependency exists in the repository, so this is a deliberately
 * conservative, tag-allowlist pass: unknown tags are dropped, all attributes
 * are dropped except a vetted `href` scheme on anchors, scripts/styles/frames
 * are removed, and a plain-text fallback is always available.
 *
 * NOTE: a regex/manual pass is not a substitute for a vetted HTML sanitizer.
 * This reduces exposure and is unit-tested; adopting a maintained library
 * remains recommended before rendering rich HTML at scale.
 */

const DROP_WITH_CONTENT = /<(script|style|iframe|object|embed|svg|math|template|noscript|form)\b[\s\S]*?<\/\1\s*>/gi;
const DROP_SELF = /<(script|style|iframe|object|embed|svg|math|template|noscript|form|link|meta|base|input|button)\b[^>]*>/gi;
const COMMENT = /<!--[\s\S]*?-->/g;

const ALLOWED_TAGS = new Set(['b', 'i', 'u', 'strong', 'em', 'p', 'br', 'ul', 'ol', 'li', 'blockquote', 'a', 'span', 'div']);
const VOID_TAGS = new Set(['br']);

export function sanitizeUrl(url: string): string | null {
  const value = String(url ?? '').trim();
  if (!value) return null;
  if (/^(https?:|mailto:)/i.test(value)) return value;
  // javascript:, data:, vbscript:, relative and unknown schemes are rejected.
  return null;
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function sanitizeEmailHtml(html: unknown): string {
  let s = String(html ?? '');
  if (!s) return '';
  s = s.replace(COMMENT, '');
  s = s.replace(DROP_WITH_CONTENT, '');
  s = s.replace(DROP_SELF, '');
  s = s.replace(/<\/?([a-zA-Z0-9]+)((?:[^>"']|"[^"]*"|'[^']*')*)>/g, (_match, tag: string, attrs: string, offset: number, full: string) => {
    const name = String(tag).toLowerCase();
    if (!ALLOWED_TAGS.has(name)) return '';
    const isClose = full[offset + 1] === '/';
    if (isClose) return VOID_TAGS.has(name) ? '' : `</${name}>`;
    if (VOID_TAGS.has(name)) return `<${name}>`;
    if (name === 'a') {
      const hrefMatch = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attrs);
      const candidate = hrefMatch ? (hrefMatch[1] ?? hrefMatch[2] ?? hrefMatch[3] ?? '') : '';
      const safe = sanitizeUrl(candidate);
      return safe
        ? `<a href="${escapeAttr(safe)}" target="_blank" rel="noopener noreferrer nofollow">`
        : '<a>';
    }
    return `<${name}>`;
  });
  return s;
}

/** Always-safe plain-text fallback derived from untrusted HTML. */
export function toPlainText(html: unknown): string {
  let s = String(html ?? '');
  if (!s) return '';
  s = s.replace(COMMENT, '');
  s = s.replace(DROP_WITH_CONTENT, ' ');
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n');
  s = s.replace(/<[^>]+>/g, '');
  s = s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'");
  return s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
