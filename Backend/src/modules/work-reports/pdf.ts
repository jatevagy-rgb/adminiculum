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
const textPrimary = '#1F2937';
const textSecondary = '#6B7280';
const borderLight = '#E5E7E6';

const OMISSION_NOTE = 'Ez az alap kivitelű kivonat a belső munkaleírásokat nem tartalmazza.';

const detailColumns = [
  { key: 'date', label: 'Dátum', width: 64, align: 'left' as const },
  { key: 'worker', label: 'Munkatárs', width: 152, align: 'left' as const },
  { key: 'type', label: 'Típus', width: 160, align: 'left' as const },
  { key: 'duration', label: 'Időtartam', width: 135, align: 'right' as const },
];

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
  let x = margin;
  doc.fillColor(brandGreen).fontSize(7);
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
): number {
  let y = startY;
  for (const row of rows) {
    const values = rowValues(row, columns);
    const height = Math.max(16, ...values.map(({ column, value }) => doc.heightOfString(value, { width: column.width - 5, align: column.align }))) + 7;
    if (y + height > pageHeight - margin - 60) {
      y = pageFor(y);
    }
    let x = margin;
    doc.fillColor(textPrimary).fontSize(7.5);
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
  doc.fillColor(brandGreen).fontSize(10.5).text(label, margin, y);
  doc.moveTo(margin, y + 15).lineTo(pageWidth - margin, y + 15).strokeColor(brandGreen).lineWidth(0.6).stroke();
  return y + 24;
}

function keyValue(doc: PDFKit.PDFDocument, label: string, value: string, y: number, x: number): number {
  doc.fillColor(textSecondary).fontSize(7.5).text(label.toUpperCase(), x, y, { width: 130 });
  doc.fillColor(textPrimary).fontSize(8.5).text(value || 'Nincs megadva', x + 132, y - 1, { width: pageWidth - margin - x - 132 });
  return y + 15;
}

/** Renders the frozen client-export projection. No live reads, no monetary fields, no internal diagnostics. */
export async function renderClientWorkReportPdf(report: ClientWorkReportExport): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin, info: { Title: 'Ügyfél munkaóra-jelentés', Author: 'Adminiculum' } });
  doc.registerFont('NotoSans', fontPath);
  doc.font('NotoSans');
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const completed = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const caseSummary = report.case;
  const workDateMin = report.rows.length > 0 ? report.rows[0].workDate : null;
  const workDateMax = report.rows.length > 0 ? report.rows[report.rows.length - 1].workDate : null;

  // ── HEADER ────────────────────────────────────────────────────────────────
  let y = margin;
  doc.fillColor(brandGreen).fontSize(18).text('Adminiculum', margin, y);
  y += 26;
  doc.fillColor(textPrimary).fontSize(15).text('ÜGYFÉL MUNKAJELENTÉS', margin, y);
  y += 20;
  doc.fillColor(textSecondary).fontSize(9.5).text('Részletes időkimutatás', margin, y);
  y += 14;
  doc.fillColor(textPrimary).fontSize(9).text(`Ügyfél: ${report.client.name}`, margin, y);
  y += 14;
  const periodLabel = report.period.startDate
    ? `${reportDate(report.period.startDate)} – ${reportDate(report.period.endDate)}`
    : 'Minden időszak';
  doc.text(`Időszak: ${periodLabel}`, margin, y);
  y += 14;
  doc.fillColor(textSecondary).fontSize(7).text(`Készült: ${dateTime(report.generatedAt)}`, margin, y);
  y += 20;

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
  y = keyValue(doc, 'Megrendelő', caseSummary.requesterNames.join(', ') || null, y, margin);
  y = keyValue(doc, 'Kezdeményező szervezeti egység', caseSummary.organizationGroupNames.join(', ') || null, y, margin);
  y = keyValue(doc, 'Szakterület', caseSummary.departmentNames.join(', ') || null, y, margin);
  y += 8;

  // ── TIME SUMMARY ──────────────────────────────────────────────────────────
  y = sectionLabel(doc, 'IDŐÖSSZESÍTŐ', y);
  y = keyValue(doc, 'Összes rögzített idő', formatMinutesHu(caseSummary.recordedMinutes), y, margin);
  y = keyValue(doc, 'Munkanapok', workDateMin ? `${reportDate(workDateMin)} – ${reportDate(workDateMax)}` : null, y, margin);
  y = keyValue(doc, 'Rögzített bejegyzések', String(caseSummary.recordedEntryCount), y, margin);
  y += 8;

  // ── DETAIL ────────────────────────────────────────────────────────────────
  const pageFor = (currentY: number): number => {
    doc.addPage();
    return writeTableHeader(doc, detailColumns, margin);
  };
  y = sectionLabel(doc, 'RÉSZLETES IDŐKIMUTATÁS', y);
  doc.fillColor(textSecondary).fontSize(7.5).text(OMISSION_NOTE, margin, y, { width: pageWidth - margin * 2 });
  y += 12;
  y = writeTableHeader(doc, detailColumns, y);
  if (report.rows.length === 0) {
    doc.fillColor(textSecondary).fontSize(8.5).text('Ehhez az ügyhöz ebben az időszakban nincs rögzített, a jelentésbe sorolható munkaidő.', margin, y + 4, { width: pageWidth - margin * 2 });
    y += 22;
  } else {
    y = writeTable(doc, report.rows, detailColumns, y, pageFor);
  }

  // ── OPTIONAL SAFE MATTER DETAIL ───────────────────────────────────────────
  if (report.safeUpdates.length > 0) {
    y += 8;
    y = sectionLabel(doc, 'ÜGYFÉLNEK KÖZZÉTETT TÁJÉKOZTATÁSOK', y);
    for (const update of report.safeUpdates) {
      if (y + 60 > pageHeight - margin) {
        doc.addPage();
        y = margin;
      }
      doc.fillColor(textPrimary).fontSize(9).text(update.title, margin, y, { width: pageWidth - margin * 2 });
      y += 14;
      doc.fillColor(textSecondary).fontSize(7).text(`${update.categoryLabel}${update.publishedAt ? ` · ${reportDate(update.publishedAt)}` : ''}`, margin, y);
      y += 11;
      doc.fillColor(textPrimary).fontSize(8).text(update.body, margin, y, { width: pageWidth - margin * 2 });
      y = doc.y + 14;
    }
  }

  // ── FOOTER ────────────────────────────────────────────────────────────────
  if (y + 30 > pageHeight - margin) {
    doc.addPage();
    y = margin;
  }
  doc.moveTo(margin, y + 6).lineTo(pageWidth - margin, y + 6).strokeColor(borderLight).stroke();
  doc.fillColor(textSecondary).fontSize(7).text('Ez a dokumentum tájékoztató jellegű munkaidő-kimutatás, nem számla. A belső munkaleírásokat nem tartalmazza.', margin, y + 12, { width: pageWidth - margin * 2 });
  doc.text(`Adminiculum · ${dateTime(report.generatedAt)}`, margin, y + 24);

  doc.end();
  return completed;
}
