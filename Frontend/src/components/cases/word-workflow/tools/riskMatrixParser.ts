"use client";

export interface RiskMatrixRow {
  id: string;
  risk: string;
  severity: string;
  probability: string;
  clause: string;
  mitigation: string;
}

export const SEVERITY_OPTIONS = [
  "Alacsony",
  "Közepes",
  "Magas",
  "Kritikus",
] as const;

export const PROBABILITY_OPTIONS = [
  "Alacsony",
  "Közepes",
  "Magas",
  "Biztos",
] as const;

function normalizeSeverity(val: string): string {
  const clean = val.trim();
  const lower = clean.toLowerCase();
  if (lower.includes("alacsony") || lower === "low") return "Alacsony";
  if (lower.includes("közepes") || lower === "kozepes" || lower === "medium") return "Közepes";
  if (lower.includes("magas") || lower === "high") return "Magas";
  if (lower.includes("kritikus") || lower === "critical") return "Kritikus";
  return clean || "Közepes";
}

function normalizeProbability(val: string): string {
  const clean = val.trim();
  const lower = clean.toLowerCase();
  if (lower.includes("alacsony") || lower === "low") return "Alacsony";
  if (lower.includes("közepes") || lower === "kozepes" || lower === "medium") return "Közepes";
  if (lower.includes("magas") || lower === "high") return "Magas";
  if (lower.includes("biztos") || lower.includes("certain") || lower.includes("fennáll")) return "Biztos";
  return clean || "Közepes";
}

export interface ParseResult {
  rows: RiskMatrixRow[];
  malformedLines: string[];
  recognizedFormat: "markdown" | "tsv" | "unknown";
}

function generateId(): string {
  return "risk-" + Math.random().toString(36).substring(2, 9) + "-" + Date.now().toString(36);
}

function splitMarkdownRow(line: string): string[] {
  const cells: string[] = [];
  let cell = "";
  for (let i = 0; i < line.length; i++) {
    if (line[i] === "\\" && line[i + 1] === "|") {
      cell += "|";
      i++;
    } else if (line[i] === "|") {
      cells.push(cell.trim());
      cell = "";
    } else {
      cell += line[i];
    }
  }
  cells.push(cell.trim());
  if (line.startsWith("|")) cells.shift();
  if (line.endsWith("|")) cells.pop();
  return cells;
}

/**
 * Safely parses TSV or Markdown table text into structured risk rows.
 * Preserves unrecognized lines in `malformedLines` so users do not lose data.
 */
export function parseRiskMatrixInput(input: string): ParseResult {
  const lines = input
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    return { rows: [], malformedLines: [], recognizedFormat: "unknown" };
  }

  const isMarkdown = lines.some((l) => l.includes("|"));
  const isTsv = !isMarkdown && lines.some((l) => l.includes("\t"));

  if (!isMarkdown && !isTsv) {
    return {
      rows: [],
      malformedLines: lines,
      recognizedFormat: "unknown",
    };
  }

  const rows: RiskMatrixRow[] = [];
  const malformedLines: string[] = [];

  // Determine column mapping from header row if present
  let colIndexRisk = 0;
  let colIndexSeverity = 1;
  let colIndexProbability = 2;
  let colIndexClause = 3;
  let colIndexMitigation = 4;

  let startIndex = 0;

  const firstLineCells = isMarkdown
    ? splitMarkdownRow(lines[0])
    : lines[0].split("\t").map((c) => c.trim());

  // Check if first row is a header
  const isHeader = firstLineCells.some((c) => {
    const l = c.toLowerCase();
    return (
      l.includes("kockázat") ||
      l.includes("risk") ||
      l.includes("súlyosság") ||
      l.includes("severity") ||
      l.includes("valószínűség") ||
      l.includes("probability") ||
      l.includes("érintett") ||
      l.includes("kezelés")
    );
  });

  if (isHeader) {
    firstLineCells.forEach((cell, idx) => {
      const lower = cell.toLowerCase();
      if (lower.includes("kockázat") || lower.includes("risk")) colIndexRisk = idx;
      else if (lower.includes("súlyosság") || lower.includes("severity")) colIndexSeverity = idx;
      else if (lower.includes("valószínűség") || lower.includes("probability")) colIndexProbability = idx;
      else if (lower.includes("pont") || lower.includes("clause") || lower.includes("érintett")) colIndexClause = idx;
      else if (lower.includes("kezelés") || lower.includes("mitigation") || lower.includes("javaslat")) colIndexMitigation = idx;
    });
    startIndex = 1;

    // In markdown, skip delimiter row like |---|---|
    if (isMarkdown && lines.length > 1 && /^\|?[- :|]+\|?$/.test(lines[1])) {
      startIndex = 2;
    }
  }

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i];

    // Skip markdown divider lines if encountered
    if (isMarkdown && /^\|?[- :|]+\|?$/.test(line)) {
      continue;
    }

    let cells: string[] = [];
    if (isMarkdown) {
      cells = splitMarkdownRow(line);
    } else {
      cells = line.split("\t").map((c) => c.trim());
    }

    if ((isMarkdown && !line.includes("|")) || cells.length < 2) {
      malformedLines.push(line);
      continue;
    }

    const risk = (cells[colIndexRisk] || cells[0] || "").trim();
    if (!risk) {
      malformedLines.push(line);
      continue;
    }

    const severity = normalizeSeverity(cells[colIndexSeverity] || "");
    const probability = normalizeProbability(cells[colIndexProbability] || "");
    const clause = (cells[colIndexClause] || "").trim();
    const mitigation = (cells[colIndexMitigation] || "").trim();

    rows.push({
      id: generateId(),
      risk,
      severity,
      probability,
      clause,
      mitigation,
    });
  }

  return {
    rows,
    malformedLines,
    recognizedFormat: isMarkdown ? "markdown" : "tsv",
  };
}

/**
 * Serializes risk matrix rows into Markdown table.
 */
export function serializeToMarkdownTable(rows: RiskMatrixRow[]): string {
  if (!rows || rows.length === 0) return "";
  const header = "| Kockázat | Súlyosság | Valószínűség | Érintett pont | Javasolt kezelés |";
  const divider = "|---|---|---|---|---|";
  const body = rows.map((r) => {
    const risk = r.risk.replace(/\|/g, "\\|").replace(/\n/g, " ");
    const sev = r.severity.replace(/\|/g, "\\|");
    const prob = r.probability.replace(/\|/g, "\\|");
    const clause = r.clause.replace(/\|/g, "\\|").replace(/\n/g, " ");
    const mit = r.mitigation.replace(/\|/g, "\\|").replace(/\n/g, " ");
    return `| ${risk} | ${sev} | ${prob} | ${clause} | ${mit} |`;
  });
  return [header, divider, ...body].join("\n");
}

/**
 * Serializes risk matrix rows into TSV.
 */
export function serializeToTsv(rows: RiskMatrixRow[]): string {
  if (!rows || rows.length === 0) return "";
  const header = ["Kockázat", "Súlyosság", "Valószínűség", "Érintett pont", "Javasolt kezelés"].join("\t");
  const body = rows.map((r) => {
    const risk = r.risk.replace(/\t/g, " ").replace(/\n/g, " ");
    const sev = r.severity.replace(/\t/g, " ");
    const prob = r.probability.replace(/\t/g, " ");
    const clause = r.clause.replace(/\t/g, " ").replace(/\n/g, " ");
    const mit = r.mitigation.replace(/\t/g, " ").replace(/\n/g, " ");
    return [risk, sev, prob, clause, mit].join("\t");
  });
  return [header, ...body].join("\n");
}
