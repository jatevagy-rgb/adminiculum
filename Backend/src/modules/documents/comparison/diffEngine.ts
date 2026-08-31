/**
 * Deterministic structured comparison engine (STRUCTURED-DOC-COMPARISON-1).
 *
 * Compares the authoritative extracted text of two immutable DocumentVersion
 * records and produces a stable, reproducible list of change segments. It is a
 * pure function of its inputs — no I/O, no clock, no randomness — so the same
 * (base, target) always yields byte-identical output for a given algorithm
 * revision. That reproducibility is what lets a comparison be persisted once and
 * trusted, and what makes the whole engine unit-testable in isolation.
 *
 * Scope: plain extracted text at paragraph granularity. It never fabricates
 * layout coordinates and never claims a formatting difference it cannot see; for
 * text it can only truthfully report FORMAT_ONLY when two paragraphs differ
 * solely in whitespace. Movement is only ever reported as a *candidate*.
 */

/** Bump when the algorithm changes in a way that alters output for equal input. */
export const COMPARISON_ALGORITHM_REVISION = 1;

/** Guards against pathological runtime and memory on adversarial inputs. */
export const MAX_INPUT_CHARS = 400_000;
export const MAX_PARAGRAPHS = 4_000;
/** LCS is O(n·m); reject rather than hang if the paragraph matrix is too large. */
export const MAX_LCS_CELLS = 8_000_000;

export type ChangeType = 'INSERT' | 'DELETE' | 'REPLACE' | 'MOVE_CANDIDATE' | 'FORMAT_ONLY';

export interface ChangeSegment {
  sequence: number;
  changeType: ChangeType;
  /** Character offsets into the normalized base text (null for pure inserts). */
  baseStart: number | null;
  baseEnd: number | null;
  /** Character offsets into the normalized target text (null for pure deletes). */
  targetStart: number | null;
  targetEnd: number | null;
  baseExcerpt: string | null;
  targetExcerpt: string | null;
  /** Compact surrounding context used for display and stable anchoring. */
  normalizedContext: string;
  /** 0..1 — high for exact structural edits, lower for heuristic guesses. */
  confidence: number;
}

export type ComparisonStatusResult = 'READY' | 'IDENTICAL' | 'UNSUPPORTED' | 'FAILED';

export interface ComparisonResult {
  algorithmRevision: number;
  status: ComparisonStatusResult;
  failureCode: string | null;
  segments: ChangeSegment[];
  summary: {
    inserts: number;
    deletes: number;
    replaces: number;
    moveCandidates: number;
    formatOnly: number;
    total: number;
  };
}

export interface ComparisonInput {
  /** Authoritative extracted text; null when no reliable extraction exists. */
  baseText: string | null;
  targetText: string | null;
  /** Whether each side has authoritative text (PDF/DOCX without extraction → false). */
  baseSupported?: boolean;
  targetSupported?: boolean;
  baseReasonCode?: string | null;
  targetReasonCode?: string | null;
}

const EXCERPT_MAX = 600;
const CONTEXT_MAX = 160;

/** Normalize line endings and trailing whitespace without destroying paragraph structure. */
export function normalizeText(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')       // CRLF / CR → LF
    .replace(/[ \t]+\n/g, '\n')    // strip trailing spaces on each line
    .replace(/\n{3,}/g, '\n\n')    // collapse runs of blank lines to one boundary
    .replace(/\s+$/g, '');         // drop trailing whitespace at end of document
}

interface Paragraph { text: string; start: number; end: number }

/** Split normalized text into paragraphs, keeping traceable char offsets. */
function paragraphs(normalized: string): Paragraph[] {
  if (normalized.length === 0) return [];
  const out: Paragraph[] = [];
  const re = /\n{2,}/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(normalized)) !== null) {
    const text = normalized.slice(last, m.index);
    if (text.trim().length > 0) out.push({ text, start: last, end: m.index });
    last = m.index + m[0].length;
  }
  const tail = normalized.slice(last);
  if (tail.trim().length > 0) out.push({ text: tail, start: last, end: normalized.length });
  return out;
}

const collapseWs = (s: string) => s.replace(/\s+/g, ' ').trim();
const excerpt = (s: string) => (s.length > EXCERPT_MAX ? s.slice(0, EXCERPT_MAX) + '…' : s);
const context = (s: string) => {
  const c = collapseWs(s);
  return c.length > CONTEXT_MAX ? c.slice(0, CONTEXT_MAX) + '…' : c;
};

/** Longest common subsequence over paragraph identity (whitespace-insensitive). */
function lcsOps(a: Paragraph[], b: Paragraph[]): Array<{ op: 'equal' | 'del' | 'ins'; ai?: number; bi?: number }> {
  const n = a.length;
  const m = b.length;
  const key = (p: Paragraph) => collapseWs(p.text);
  const ak = a.map(key);
  const bk = b.map(key);
  // DP table (n+1)×(m+1). Guarded by MAX_LCS_CELLS at the call site.
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = ak[i] === bk[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const ops: Array<{ op: 'equal' | 'del' | 'ins'; ai?: number; bi?: number }> = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (ak[i] === bk[j]) { ops.push({ op: 'equal', ai: i, bi: j }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { ops.push({ op: 'del', ai: i }); i++; }
    else { ops.push({ op: 'ins', bi: j }); j++; }
  }
  while (i < n) { ops.push({ op: 'del', ai: i }); i++; }
  while (j < m) { ops.push({ op: 'ins', bi: j }); j++; }
  return ops;
}

/**
 * Compare two extracted texts and return a deterministic segment list.
 * Never throws for ordinary input; oversized or unsupported input yields an
 * explicit non-READY status rather than a fabricated diff.
 */
export function compareVersions(input: ComparisonInput): ComparisonResult {
  const empty = { inserts: 0, deletes: 0, replaces: 0, moveCandidates: 0, formatOnly: 0, total: 0 };
  const done = (status: ComparisonStatusResult, segments: ChangeSegment[], failureCode: string | null = null): ComparisonResult => ({
    algorithmRevision: COMPARISON_ALGORITHM_REVISION,
    status,
    failureCode,
    segments,
    summary: segments.reduce((acc, s) => {
      if (s.changeType === 'INSERT') acc.inserts++;
      else if (s.changeType === 'DELETE') acc.deletes++;
      else if (s.changeType === 'REPLACE') acc.replaces++;
      else if (s.changeType === 'MOVE_CANDIDATE') acc.moveCandidates++;
      else if (s.changeType === 'FORMAT_ONLY') acc.formatOnly++;
      acc.total++;
      return acc;
    }, { ...empty }),
  });

  // Unsupported extraction: never fabricate a diff.
  if (input.baseSupported === false || input.targetSupported === false ||
      input.baseText == null || input.targetText == null) {
    const failureCode = input.baseReasonCode || input.targetReasonCode || 'EXTRACTION_UNAVAILABLE';
    return done('UNSUPPORTED', [], failureCode);
  }

  if (input.baseText.length > MAX_INPUT_CHARS || input.targetText.length > MAX_INPUT_CHARS) {
    return done('FAILED', [], 'INPUT_TOO_LARGE');
  }

  const base = normalizeText(input.baseText);
  const target = normalizeText(input.targetText);
  if (base === target) return done('IDENTICAL', []);

  const aPara = paragraphs(base);
  const bPara = paragraphs(target);
  if (aPara.length > MAX_PARAGRAPHS || bPara.length > MAX_PARAGRAPHS) {
    return done('FAILED', [], 'TOO_MANY_PARAGRAPHS');
  }
  if ((aPara.length + 1) * (bPara.length + 1) > MAX_LCS_CELLS) {
    return done('FAILED', [], 'COMPARISON_TOO_COMPLEX');
  }

  const ops = lcsOps(aPara, bPara);

  type Run = { dels: number[]; inss: number[] };
  // First pass: gather all del/ins keys so a paragraph deleted here and inserted
  // verbatim there can be flagged a movement *candidate* (never a certain move).
  const delKeys = new Map<string, number>();
  const insKeys = new Map<string, number>();
  for (const o of ops) {
    if (o.op === 'del') { const k = collapseWs(aPara[o.ai!].text); delKeys.set(k, (delKeys.get(k) || 0) + 1); }
    else if (o.op === 'ins') { const k = collapseWs(bPara[o.bi!].text); insKeys.set(k, (insKeys.get(k) || 0) + 1); }
  }
  const isMoveCandidate = (key: string) => (delKeys.get(key) || 0) > 0 && (insKeys.get(key) || 0) > 0;

  const segments: ChangeSegment[] = [];
  let seq = 0;

  // Emit one coalesced run: adjacent delete+insert reads as one REPLACE.
  const emitRun = (r: Run) => {
    const pairs = Math.min(r.dels.length, r.inss.length);
    for (let k = 0; k < pairs; k++) {
      const d = aPara[r.dels[k]];
      const t = bPara[r.inss[k]];
      const moveCand = isMoveCandidate(collapseWs(d.text)) || isMoveCandidate(collapseWs(t.text));
      segments.push({
        sequence: seq++,
        changeType: moveCand ? 'MOVE_CANDIDATE' : 'REPLACE',
        baseStart: d.start, baseEnd: d.end,
        targetStart: t.start, targetEnd: t.end,
        baseExcerpt: excerpt(d.text), targetExcerpt: excerpt(t.text),
        normalizedContext: context(t.text || d.text),
        confidence: moveCand ? 0.5 : 0.9,
      });
    }
    for (let k = pairs; k < r.dels.length; k++) {
      const d = aPara[r.dels[k]];
      const moveCand = isMoveCandidate(collapseWs(d.text));
      segments.push({
        sequence: seq++,
        changeType: moveCand ? 'MOVE_CANDIDATE' : 'DELETE',
        baseStart: d.start, baseEnd: d.end, targetStart: null, targetEnd: null,
        baseExcerpt: excerpt(d.text), targetExcerpt: null,
        normalizedContext: context(d.text), confidence: moveCand ? 0.5 : 0.95,
      });
    }
    for (let k = pairs; k < r.inss.length; k++) {
      const t = bPara[r.inss[k]];
      const moveCand = isMoveCandidate(collapseWs(t.text));
      segments.push({
        sequence: seq++,
        changeType: moveCand ? 'MOVE_CANDIDATE' : 'INSERT',
        baseStart: null, baseEnd: null, targetStart: t.start, targetEnd: t.end,
        baseExcerpt: null, targetExcerpt: excerpt(t.text),
        normalizedContext: context(t.text), confidence: moveCand ? 0.5 : 0.95,
      });
    }
  };

  // Second pass: walk in order, flushing runs at each equal. Equal pairs whose
  // raw text differs are whitespace-only, so they surface as FORMAT_ONLY — the
  // one formatting difference plain text can be trusted to report.
  let cur: Run | null = null;
  for (const o of ops) {
    if (o.op === 'equal') {
      if (cur) { emitRun(cur); cur = null; }
      const d = aPara[o.ai!];
      const t = bPara[o.bi!];
      if (d.text !== t.text) {
        segments.push({
          sequence: seq++,
          changeType: 'FORMAT_ONLY',
          baseStart: d.start, baseEnd: d.end, targetStart: t.start, targetEnd: t.end,
          baseExcerpt: excerpt(d.text), targetExcerpt: excerpt(t.text),
          normalizedContext: context(t.text), confidence: 0.99,
        });
      }
      continue;
    }
    if (!cur) cur = { dels: [], inss: [] };
    if (o.op === 'del') cur.dels.push(o.ai!);
    else cur.inss.push(o.bi!);
  }
  if (cur) emitRun(cur);

  return done('READY', segments);
}
