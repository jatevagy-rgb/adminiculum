/**
 * CONTRACT DATE EXTRACTION — deterministic candidate extractor.
 *
 * Pure function over exact-version text. NO external AI call, NO second text
 * pipeline: the caller supplies text resolved by the canonical version-content
 * pipeline (resolveVersionText), so this module never touches storage.
 *
 * The scan is keyword-window based over Hungarian date patterns. Every output
 * carries the supporting excerpt (with its offsets in the source text) and a
 * normalized excerpt hash used for dedupe and the confirm-time staleness guard.
 *
 * This is explicitly NOT an AI scorer: no confidence value is fabricated.
 */
import { CONTRACT_DATE_TYPE_LABELS, type ContractDateType } from './registry';

export interface ExtractedDateCandidate {
  dateType: ContractDateType;
  /** Normalized to UTC noon so timezone shifts cannot flip the calendar day. */
  proposedDate: Date;
  sourceExcerpt: string;
  excerptStartOffset: number;
  excerptEndOffset: number;
  excerptHash: string;
}

/** Keyword windows anchored at a detected date. Longer first so the most
 *  specific meaning wins when several patterns overlap one date. */
const DATE_TYPE_KEYWORDS: Array<{ type: ContractDateType; pattern: RegExp }> = [
  { type: 'PAYMENT_DUE', pattern: /fizet(?:ési|ési)?\s+határid(?:ő|ői|ője)|esedékess(?:ég|égi)|esedékes|fizetendő|fizetés\s+határideje|határidő(?:n)?\s+(?:a\s+)?fizetésre/ig },
  { type: 'MILESTONE', pattern: /mérföldkő|részhatáridő|teljesítési\s+határidő|határidő\s+(?:a\s+)?teljesítésre|teljesítés\s+határideje|átadási\s+határidő|részteljesítés/ig },
  { type: 'NOTICE', pattern: /felmondási\s+(?:idő|határidő)|felmondás|rendes\s+felmondás|értesítési\s+határidő|tájékoztatási\s+határidő|felmondás\s+határideje/ig },
  { type: 'EFFECTIVE', pattern: /hatálybalépés|hatályba\s+lép|hatályba\s+léptet|lép\s+hatályba|hatályos\s*(?:ság)?\s*kezdete|hatályba\s+lépés\s+napja|hatályosság\s+kezdete/ig },
  { type: 'EXPIRY', pattern: /lejárat|lejár(?:at)?\b|megszűnik|megszűnése|hatályosság(?:a)?\s+(?:megszűnése|vége)|érvényessége?\s+(?:lejár|megszűnik)|hatályos[^.]{0,60}?\b-ig/ig },
];

const KEYWORD_WINDOW = 160; // chars of text examined before a date token
const EXCERPT_WINDOW = 120; // chars of excerpt captured around the date token
const MAX_CANDIDATES_PER_TEXT = 40;

/** Normalize whitespace for stable hashing and containment checks. */
export function normalizeExcerptText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** Short stable hash (FNV-1a, hex) of a normalized string. */
export function excerptHashOf(text: string): string {
  const value = normalizeExcerptText(text);
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

interface DateToken {
  raw: string;
  /** JS Date for the matched token (day precision). */
  date: Date;
  start: number;
  end: number;
}

const HUNGARIAN_MONTHS = [
  'január', 'február', 'március', 'április', 'május', 'június',
  'július', 'augusztus', 'szeptember', 'október', 'november', 'december',
];

const DATE_PATTERNS: Array<{
  regex: RegExp;
  /** Convert a matched token into (year, month1based, day) or null. */
  parse: (match: RegExpExecArray) => [number, number, number] | null;
}> = [
  // 2024. 05. 12. | 2024.05.12.
  {
    regex: /\b(20\d{2})\.\s*(\d{1,2})\.\s*(\d{1,2})\./g,
    parse: (m) => [Number(m[1]), Number(m[2]), Number(m[3])],
  },
  // 2024. május 12. | 2024. május 12
  {
    regex: /\b(20\d{2})\.\s*(január|február|március|április|május|június|július|augusztus|szeptember|október|november|december)\.?\s+(\d{1,2})\.?/gi,
    parse: (m) => [Number(m[1]), HUNGARIAN_MONTHS.indexOf(m[2].toLowerCase()) + 1, Number(m[3])],
  },
  // 2024. 05. 12. in "12. 05. 2024." Hungarian day-first order
  {
    regex: /\b(\d{1,2})\.\s*(\d{1,2})\.\s*(20\d{2})\./g,
    parse: (m) => [Number(m[3]), Number(m[2]), Number(m[1])],
  },
  // ISO-like 2024-05-12 (rarely in contracts, but harmless)
  {
    regex: /\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/g,
    parse: (m) => [Number(m[1]), Number(m[2]), Number(m[3])],
  },
];

function utcNoon(year: number, month: number, day: number): Date | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const candidate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));
  // Reject calendar-rollover dates (e.g. Feb 30 -> Mar 2).
  if (candidate.getUTCMonth() !== month - 1 || candidate.getUTCDate() !== day) return null;
  return candidate;
}

/** Normalize two dates to the same UTC-midnight key for dedupe. */
function dayKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

/**
 * Scan exact-version text for keyword-supported contract dates. Deterministic
 * and bounded: at most MAX_CANDIDATES_PER_TEXT candidates, each with a
 * deduplicated (type, day) identity. Purely additive — never mutates anything.
 */
export function extractContractDateCandidates(text: string): ExtractedDateCandidate[] {
  const source = typeof text === 'string' ? text : '';
  const candidates: ExtractedDateCandidate[] = [];
  const seen = new Set<string>();
  const takenRanges: Array<{ start: number; end: number }> = [];

  if (!source.trim()) return candidates;

  for (const datePattern of DATE_PATTERNS) {
    datePattern.regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = datePattern.regex.exec(source)) !== null && candidates.length < MAX_CANDIDATES_PER_TEXT) {
      const parsed = datePattern.parse(match);
      if (!parsed) continue;
      const proposedDate = utcNoon(parsed[0], parsed[1], parsed[2]);
      if (!proposedDate) continue;
      if (proposedDate.getUTCFullYear() < 1990 || proposedDate.getUTCFullYear() > 2100) continue;

      const tokenStart = match.index;
      const tokenEnd = tokenStart + match[0].length;

      // Skip tokens already covered by a previous (higher-priority) pattern.
      if (takenRanges.some((range) => tokenStart < range.end && tokenEnd > range.start)) continue;

      const windowStart = Math.max(0, tokenStart - KEYWORD_WINDOW);
      const windowEnd = Math.min(source.length, tokenEnd + KEYWORD_WINDOW);
      const windowText = source.slice(windowStart, windowEnd);
      const tokenCenterInWindow = tokenStart - windowStart;

      // Closest keyword match to the date token wins; ties break by the
      // registry's priority order. This keeps nearby dates with distinct
      // meanings (e.g. "fizetési határidő ... lejárat ...") classified by the
      // keyword actually governing them instead of the first one in the window.
      let dateType: ContractDateType | null = null;
      let bestDistance = Number.POSITIVE_INFINITY;
      let bestPriority = Number.POSITIVE_INFINITY;
      for (let priority = 0; priority < DATE_TYPE_KEYWORDS.length; priority += 1) {
        const keyword = DATE_TYPE_KEYWORDS[priority];
        keyword.pattern.lastIndex = 0;
        let keywordMatch: RegExpExecArray | null;
        while ((keywordMatch = keyword.pattern.exec(windowText)) !== null) {
          const keywordCenter = keywordMatch.index + keywordMatch[0].length / 2;
          const distance = Math.abs(keywordCenter - tokenCenterInWindow);
          if (distance < bestDistance || (distance === bestDistance && priority < bestPriority)) {
            bestDistance = distance;
            bestPriority = priority;
            dateType = keyword.type;
          }
        }
      }
      if (!dateType) continue;

      const excerptStart = Math.max(0, tokenStart - Math.floor(EXCERPT_WINDOW * 0.6));
      const excerptEnd = Math.min(source.length, tokenEnd + Math.floor(EXCERPT_WINDOW * 0.4));
      const excerpt = source.slice(excerptStart, excerptEnd).trim();

      const identity = `${dateType}|${dayKey(proposedDate)}`;
      if (seen.has(identity)) continue;
      seen.add(identity);

      takenRanges.push({ start: tokenStart, end: tokenEnd });
      candidates.push({
        dateType,
        proposedDate,
        sourceExcerpt: excerpt,
        excerptStartOffset: excerptStart,
        excerptEndOffset: excerptEnd,
        excerptHash: excerptHashOf(excerpt),
      });
    }
  }

  return candidates.slice(0, MAX_CANDIDATES_PER_TEXT);
}

/** The dateType → proposedDate pair is canonicalized at noon UTC so the DTO is
 *  timezone-stable. */
export function candidateDateLabel(candidate: { dateType: ContractDateType; proposedDate: Date }): string {
  return `${CONTRACT_DATE_TYPE_LABELS[candidate.dateType]}: ${candidate.proposedDate.toISOString().slice(0, 10)}`;
}
