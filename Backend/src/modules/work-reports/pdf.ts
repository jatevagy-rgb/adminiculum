// ============================================================================
// WORK REPORTS — rate-free client work-report PDF renderer.
// ============================================================================
//
// Renders the explicit client-export projection (ClientWorkReportExport). The
// projection carries no rate, amount, VAT, or billing fields, no ambiguous or
// excluded row details, no internal diagnostic aggregates and no raw
// TimeEntry descriptions, and this renderer prints none of them. The output is
// deterministic for a given report snapshot: no randomness, no live source
// reads, fixed row ordering (workDate, timeEntryId).
//
// The LAW FIRM is the issuer of the report; Adminiculum is only the software
// used to prepare it (footer + Creator metadata). The renderer refuses to run
// without the essential issuer identity (name, address, tax number) instead of
// silently printing Adminiculum as the issuer.
// ============================================================================

import PDFDocument from 'pdfkit';
import path from 'node:path';
import type { ClientWorkReportExport, ClientWorkReportExportRow } from './types';

// Same redistributable font the billing-prep build step copies next to the
// compiled billing-preparations module; resolve it relative to this module.
const fontPath = path.join(__dirname, '..', 'billing-preparations', 'assets', 'NotoSans-Variable.ttf');
const pageWidth = 595.28;
const pageHeight = 841.89;
const margin = 42;
const brandGreen = '#0F3D32';
const terracotta = '#B85C4B';
const terracottaSoft = '#F1D7D1';
const tableHeaderFill = '#EDF2F0';
const textPrimary = '#1F2937';
const textSecondary = '#6B7280';
const borderLight = '#E5E7E6';

const OMISSION_NOTE = 'Ez az alap kivitelű kivonat a belső munkaleírásokat nem tartalmazza.';
const FOOTER_DISCLAIMER = 'Ez a dokumentum tájékoztató jellegű munkaidő-kimutatás, nem számla. A belső munkaleírásokat nem tartalmazza.';

const detailColumns = [
  { key: 'date', label: 'Dátum', width: 64, align: 'left' as const },
  { key: 'worker', label: 'Munkatárs', width: 152, align: 'left' as const },
  { key: 'type', label: 'Típus', width: 160, align: 'left' as const },
  { key: 'duration', label: 'Időtartam', width: 135, align: 'right' as const },
];

const LABEL_WIDTH = 130;
const LABEL_GAP = 132;

function reportDate(value: string | null): string {
  return value ? `${value.replaceAll('-', '.')}.` : '—';
}

function dateTime(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.toISOString().slice(0, 16).replace('T', ' ').replaceAll('-', '.')}.`;
}

/** Minutes → "X ó Y p" (e.g. "1 ó 30 p", "45 p"). */
export function formatMinutesHu(minutes: number): string {
  const safe = Math.max(0, Math.floor(minutes || 0));
  const hours = Math.floor(safe / 60);
  const rest = safe % 60;
  if (hours === 0) return `${rest} p`;
  return rest === 0 ? `${hours} ó` : `${hours} ó ${rest} p`;
}

function rowValues(row: ClientWorkReportExportRow, columns: typeof detailColumns) {
  const values: Record<string, string> = {
    date: reportDate(row.workDate),
    worker: row.workerName || 'Nincs megadva',
    type: row.workTypeLabel,
    duration: formatMinutesHu(row.minutes),
  };
  return columns.map((column) => ({ column, value: values[column.key] ?? '—' }));
}

function writeTableHeader(doc: PDFKit.PDFDocument, columns: typeof detailColumns, y: number): number {
  doc.font('NotoSans').fontSize(7).fillColor(brandGreen);
  // Subtle table-header fill: measured from the same font/size the labels use.
  const headerHeight = Math.max(...columns.map((column) => doc.heightOfString(column.label, { width: column.width })));
  doc.rect(margin, y - 3, pageWidth - margin * 2, headerHeight + 8).fill(tableHeaderFill);
  doc.font('NotoSans').fontSize(7).fillColor(brandGreen);
  let x = margin;
  for (const column of columns) {
    doc.text(column.label, x, y, { width: column.width, align: column.align });
    x += column.width;
  }
  doc.moveTo(margin, y + 11).lineTo(pageWidth - margin, y + 11).strokeColor(borderLight).stroke();
  return y + 16;
}

function writeTable(
  doc: PDFKit.PDFDocument,
  rows: ClientWorkReportExportRow[],
  columns: typeof detailColumns,
  startY: number,
  pageFor: (y: number) => number,
  finalRowReserve: number,
): number {
  let y = startY;
  for (const [index, row] of rows.entries()) {
    const values = rowValues(row, columns);
    // Measure with the exact font and size used to draw the cells.
    doc.font('NotoSans').fontSize(7.5);
    const height = Math.max(16, ...values.map(({ column, value }) => doc.heightOfString(value, { width: column.width - 5, align: column.align }))) + 7;
    const reserve = index === rows.length - 1 ? Math.max(60, finalRowReserve) : 60;
    if (y + height > pageHeight - margin - reserve) {
      y = pageFor(y);
      doc.font('NotoSans').fontSize(7.5);
    }
    let x = margin;
    doc.fillColor(textPrimary);
    for (const { column, value } of values) {
      doc.text(value, x, y, { width: column.width - 5, align: column.align });
      x += column.width;
    }
    y += height;
    doc.moveTo(margin, y - 3).lineTo(pageWidth - margin, y - 3).strokeColor(borderLight).stroke();
  }
  return y;
}

function sectionLabel(doc: PDFKit.PDFDocument, label: string, y: number): number {
  if (y + 42 > pageHeight - margin) {
    doc.addPage();
    y = margin;
  }
  doc.font('NotoSans').fillColor(brandGreen).fontSize(10.5).text(label, margin, y);
  doc.moveTo(margin, y + 15).lineTo(pageWidth - margin, y + 15).strokeColor(brandGreen).lineWidth(0.6).stroke();
  return y + 24;
}

/** Measures label/value heights with the exact fonts, sizes and widths used to
 * draw the row. Used by both the plain metadata rows and the summary panel. */
function keyValueMetrics(doc: PDFKit.PDFDocument, label: string, value: string, x: number, right = pageWidth - margin): { rowHeight: number } {
  const valueWidth = right - x - LABEL_GAP;
  doc.font('NotoSans').fontSize(7.5);
  const labelHeight = doc.heightOfString(label.toUpperCase(), { width: LABEL_WIDTH });
  doc.fontSize(8.5);
  const valueHeight = doc.heightOfString(value || 'Nincs megadva', { width: valueWidth });
  return { rowHeight: Math.max(labelHeight, valueHeight) + 5 };
}

function drawKeyValue(doc: PDFKit.PDFDocument, label: string, value: string, y: number, x: number, right = pageWidth - margin): number {
  const { rowHeight } = keyValueMetrics(doc, label, value, x, right);
  doc.fillColor(textSecondary).fontSize(7.5).text(label.toUpperCase(), x, y, { width: LABEL_WIDTH });
  doc.fillColor(textPrimary).fontSize(8.5).text(value || 'Nincs megadva', x + LABEL_GAP, y - 1, { width: right - x - LABEL_GAP });
  return rowHeight;
}

/** Label/value metadata row: the advance is the measured max(label, value)
 * height plus spacing, so wrapped values never overlap the next row. */
function keyValue(doc: PDFKit.PDFDocument, label: string, value: string, y: number, x: number): number {
  const { rowHeight } = keyValueMetrics(doc, label, value, x);
  if (y + rowHeight > pageHeight - margin - 60) {
    doc.addPage();
    y = margin;
  }
  drawKeyValue(doc, label, value, y, x);
  return y + rowHeight;
}

/** Very pale terracotta time-summary panel with a narrow terracotta left edge.
 * The panel is measured as a whole and moved to a fresh page when it would not
 * fit, so its background never straddles two pages. */
function drawTimeSummaryPanel(
  doc: PDFKit.PDFDocument,
  rows: Array<[string, string]>,
  y: number,
): number {
  doc.font('NotoSans');
  const inset = 12; // Clears the 3pt stripe and leaves equal space at the right edge.
  const contentX = margin + inset;
  const contentRight = pageWidth - margin - inset;
  const metrics = rows.map(([label, value]) => keyValueMetrics(doc, label, value, contentX, contentRight));
  const padTop = 8;
  const padBottom = 10;
  const panelHeight = metrics.reduce((sum, metric) => sum + metric.rowHeight, 0) + padTop + padBottom;
  if (y + panelHeight > pageHeight - margin) {
    doc.addPage();
    y = margin;
  }
  doc.rect(margin, y, pageWidth - margin * 2, panelHeight).fill(terracottaSoft);
  doc.rect(margin, y, 3, panelHeight).fill(terracotta);
  let rowY = y + padTop;
  rows.forEach(([label, value], index) => {
    drawKeyValue(doc, label, value, rowY, contentX, contentRight);
    rowY += metrics[index].rowHeight;
  });
  return y + panelHeight + 10;
}

/** Renders the frozen client-export projection. No live reads, no monetary fields, no internal diagnostics. */
export async function renderClientWorkReportPdf(report: ClientWorkReportExport): Promise<Buffer> {
  const issuer = report.issuer;
  if (!issuer || !issuer.legalName?.trim() || !issuer.address?.trim() || !issuer.taxNumber?.trim()) {
    const error: Error & { code?: string } = new Error('A kiállító (neve, címe, adószáma) hiányos, ezért a PDF nem készíthető el.');
    error.code = 'WORK_REPORT_ISSUER_CONFIGURATION_REQUIRED';
    throw error;
  }

  const doc = new PDFDocument({
    size: 'A4',
    margin,
    info: { Title: 'Ügyfél munkaóra-jelentés', Author: issuer.legalName.trim(), Creator: 'Adminiculum' },
  });
  doc.registerFont('NotoSans', fontPath);
  doc.font('NotoSans');
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const completed = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  const footerSystemLine = `Készült az Adminiculum rendszerében · ${dateTime(report.generatedAt)}`;
  doc.font('NotoSans').fontSize(7);
  const disclaimerHeight = doc.heightOfString(FOOTER_DISCLAIMER, { width: pageWidth - margin * 2 });
  const systemLineHeight = doc.heightOfString(footerSystemLine, { width: pageWidth - margin * 2 });
  const footerHeight = 12 + disclaimerHeight + 4 + systemLineHeight;

  const caseSummary = report.case;
  const workDateMin = report.rows.length > 0 ? report.rows[0].workDate : null;
  const workDateMax = report.rows.length > 0 ? report.rows[report.rows.length - 1].workDate : null;

  // ── HEADER — the law firm is the issuer ───────────────────────────────────
  let y = margin;
  const contentWidth = pageWidth - margin * 2;
  doc.fillColor(textPrimary).fontSize(15);
  const issuerNameHeight = doc.heightOfString(issuer.legalName.trim(), { width: contentWidth });
  doc.text(issuer.legalName.trim(), margin, y, { width: contentWidth });
  y += issuerNameHeight + 4;

  doc.fillColor(textSecondary).fontSize(7.5);
  const addressLine = `${issuer.address.trim()} · Adószám: ${issuer.taxNumber.trim()}`;
  const addressLineHeight = doc.heightOfString(addressLine, { width: contentWidth });
  doc.text(addressLine, margin, y, { width: contentWidth });
  y += addressLineHeight + 2;

  const contactLine = [issuer.email?.trim() || null, issuer.phone?.trim() || null].filter(Boolean).join(' · ');
  if (contactLine) {
    const contactHeight = doc.heightOfString(contactLine, { width: contentWidth });
    doc.text(contactLine, margin, y, { width: contentWidth });
    y += contactHeight + 2;
  }
  y += 8;

  // Thin green header rule with a short terracotta end segment.
  const ruleY = y;
  const ruleBreak = pageWidth - margin - 48;
  doc.moveTo(margin, ruleY).lineTo(ruleBreak, ruleY).strokeColor(brandGreen).lineWidth(0.8).stroke();
  doc.moveTo(ruleBreak, ruleY).lineTo(pageWidth - margin, ruleY).strokeColor(terracotta).lineWidth(0.8).stroke();
  y += 14;

  doc.fillColor(brandGreen).fontSize(13);
  const titleHeight = doc.heightOfString('MUNKAÓRA-KIMUTATÁS', { width: contentWidth });
  doc.text('MUNKAÓRA-KIMUTATÁS', margin, y, { width: contentWidth });
  y += titleHeight + 8;

  doc.fillColor(textPrimary).fontSize(9);
  const periodLabel = report.period.startDate
    ? `${reportDate(report.period.startDate)} – ${reportDate(report.period.endDate)}`
    : 'Minden időszak';
  for (const line of [`Ügyfél: ${report.client.name}`, `Időszak: ${periodLabel}`, `Ügyszám: ${caseSummary.caseNumber}`]) {
    const lineHeight = doc.heightOfString(line, { width: contentWidth });
    doc.text(line, margin, y, { width: contentWidth });
    y += lineHeight + 3;
  }
  y += 3;
  doc.fillColor(textSecondary).fontSize(7);
  const generatedHeight = doc.heightOfString(`Készült: ${dateTime(report.generatedAt)}`, { width: contentWidth });
  doc.text(`Készült: ${dateTime(report.generatedAt)}`, margin, y, { width: contentWidth });
  y += generatedHeight + 16;

  // ── CASE SUMMARY ──────────────────────────────────────────────────────────
  y = sectionLabel(doc, 'ÜGYÖSSZEFOGLALÓ', y);
  y = keyValue(doc, 'Ügyszám', caseSummary.caseNumber, y, margin);
  y = keyValue(doc, 'Ügy címe', caseSummary.caseTitle, y, margin);
  y = keyValue(doc, 'Ügytárgy', caseSummary.matter?.title ?? null, y, margin);
  y = keyValue(doc, 'Állapot', caseSummary.caseStatusLabel, y, margin);
  if (caseSummary.completedAt) {
    y = keyValue(doc, 'Lezárás dátuma', reportDate(caseSummary.completedAt), y, margin);
  }
  y = keyValue(doc, 'Felelős ügyvéd', caseSummary.responsibleLawyerName ?? null, y, margin);
  y = keyValue(doc, 'Ügygazda az ügyfélnél', report.owner?.name ?? null, y, margin);
  y = keyValue(doc, 'Szervezeti egység az ügyfélnél', report.owner?.organizationGroupName ?? null, y, margin);
  // Megrendelő = the confirmed client organization, never the first requester.
  y = keyValue(doc, 'Megrendelő', report.client.name, y, margin);
  y = keyValue(doc, 'Kezdeményező', caseSummary.requesterNames.join(', ') || null, y, margin);
  y = keyValue(doc, 'Kezdeményező szervezeti egység', caseSummary.organizationGroupNames.join(', ') || null, y, margin);
  y = keyValue(doc, 'Szakterület', caseSummary.departmentNames.join(', ') || null, y, margin);
  y += 8;

  // ── TIME SUMMARY ──────────────────────────────────────────────────────────
  y = sectionLabel(doc, 'IDŐÖSSZESÍTŐ', y);
  y = drawTimeSummaryPanel(doc, [
    ['Összes rögzített idő', formatMinutesHu(caseSummary.recordedMinutes)],
    ['Munkanapok', workDateMin ? `${reportDate(workDateMin)} – ${reportDate(workDateMax)}` : 'Nincs megadva'],
    ['Rögzített bejegyzések', String(caseSummary.recordedEntryCount)],
  ], y);
  y += 8;

  // ── DETAIL ────────────────────────────────────────────────────────────────
  const pageFor = (currentY: number): number => {
    doc.addPage();
    return writeTableHeader(doc, detailColumns, margin);
  };
  y = sectionLabel(doc, 'RÉSZLETES IDŐKIMUTATÁS', y);
  doc.fillColor(textSecondary).fontSize(7.5);
  const noteHeight = doc.heightOfString(OMISSION_NOTE, { width: pageWidth - margin * 2 });
  doc.text(OMISSION_NOTE, margin, y, { width: pageWidth - margin * 2 });
  y += noteHeight + 6;
  y = writeTableHeader(doc, detailColumns, y);
  if (report.rows.length === 0) {
    doc.fillColor(textSecondary).fontSize(8.5).text('Ehhez az ügyhöz ebben az időszakban nincs rögzített, a jelentésbe sorolható munkaidő.', margin, y + 4, { width: pageWidth - margin * 2 });
    y += 22;
  } else {
    y = writeTable(doc, report.rows, detailColumns, y, pageFor, report.safeUpdates.length === 0 ? footerHeight : 0);
  }

  // ── OPTIONAL SAFE MATTER DETAIL ───────────────────────────────────────────
  if (report.safeUpdates.length > 0) {
    y += 8;
    const firstUpdate = report.safeUpdates[0];
    doc.font('NotoSans').fontSize(9);
    const firstTitleHeight = doc.heightOfString(firstUpdate.title, { width: pageWidth - margin * 2 });
    doc.fontSize(8);
    const firstBodyHeight = doc.heightOfString(firstUpdate.body, { width: pageWidth - margin * 2 });
    const firstBlockHeight = firstTitleHeight + 2 + 11 + firstBodyHeight + 14;
    const firstFooter = report.safeUpdates.length === 1 ? footerHeight : 0;
    if (y + 24 + firstBlockHeight + firstFooter > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
    y = sectionLabel(doc, 'ÜGYFÉLNEK KÖZZÉTETT TÁJÉKOZTATÁSOK', y);
    for (const [index, update] of report.safeUpdates.entries()) {
      // Measure the whole block with the fonts/sizes used to draw it.
      doc.font('NotoSans').fontSize(9);
      const titleHeight = doc.heightOfString(update.title, { width: pageWidth - margin * 2 });
      doc.fontSize(8);
      const bodyHeight = doc.heightOfString(update.body, { width: pageWidth - margin * 2 });
      const blockHeight = titleHeight + 2 + 11 + bodyHeight + 14;
      const trailingFooter = index === report.safeUpdates.length - 1 ? footerHeight : 0;
      if (y + blockHeight + trailingFooter > pageHeight - margin && y > margin) {
        doc.addPage();
        y = margin;
      }
      doc.fillColor(textPrimary).fontSize(9).text(update.title, margin, y, { width: pageWidth - margin * 2 });
      y += titleHeight + 2;
      doc.fillColor(textSecondary).fontSize(7).text(`${update.categoryLabel}${update.publishedAt ? ` · ${reportDate(update.publishedAt)}` : ''}`, margin, y);
      y += 11;
      doc.fillColor(textPrimary).fontSize(8).text(update.body, margin, y, { width: pageWidth - margin * 2 });
      y += bodyHeight + 14;
    }
  }

  // ── FOOTER ────────────────────────────────────────────────────────────────
  doc.font('NotoSans').fontSize(7).fillColor(textSecondary);
  if (y + footerHeight > pageHeight - margin) {
    doc.addPage();
    y = margin;
  }
  doc.moveTo(margin, y + 6).lineTo(pageWidth - margin, y + 6).strokeColor(borderLight).stroke();
  doc.text(FOOTER_DISCLAIMER, margin, y + 12, { width: pageWidth - margin * 2 });
  doc.text(footerSystemLine, margin, y + 12 + disclaimerHeight + 4, { width: pageWidth - margin * 2 });

  doc.end();
  return completed;
}
