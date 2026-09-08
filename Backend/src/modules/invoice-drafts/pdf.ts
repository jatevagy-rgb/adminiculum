import PDFDocument from 'pdfkit';
import { InvoiceDraft, InvoiceDraftLine, Prisma } from '@prisma/client';
import fs from 'node:fs';
import path from 'node:path';

type DraftWithLines = InvoiceDraft & { lines: InvoiceDraftLine[] };

// The billing-prep build step copies this redistributable font next to the
// compiled billing-preparations module; resolve it relative to this module.
const fontPath = path.join(__dirname, '..', 'billing-preparations', 'assets', 'NotoSans-Variable.ttf');
const pageWidth = 595.28;
const pageHeight = 841.89;
const margin = 42;
const lineColumns = [
  { key: 'description', label: 'Megnevezés', width: 150, align: 'left' },
  { key: 'quantity', label: 'Mennyiség', width: 52, align: 'right' },
  { key: 'unit', label: 'Egység', width: 34, align: 'center' },
  { key: 'netUnitPrice', label: 'Nettó egységár', width: 62, align: 'right' },
  { key: 'netAmount', label: 'Nettó', width: 58, align: 'right' },
  { key: 'vat', label: 'ÁFA', width: 44, align: 'right' },
  { key: 'vatAmount', label: 'ÁFA összege', width: 53, align: 'right' },
  { key: 'grossAmount', label: 'Bruttó', width: 58, align: 'right' },
] as const;
const annexColumns = [
  { key: 'date', label: 'Dátum', width: 55, align: 'left' },
  { key: 'case', label: 'Ügy', width: 78, align: 'left' },
  { key: 'work', label: 'Munka', width: 158, align: 'left' },
  { key: 'worker', label: 'Közreműködő', width: 80, align: 'left' },
  { key: 'minutes', label: 'Idő', width: 38, align: 'right' },
  { key: 'rate', label: 'Óradíj', width: 54, align: 'right' },
  { key: 'net', label: 'Nettó', width: 48, align: 'right' },
] as const;

function date(value: Date | null): string {
  return value ? `${value.toISOString().slice(0, 10).replaceAll('-', '.')}.` : '—';
}

function minutes(value: number): string {
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
}

/** Display-only decimal formatting; amounts were persisted by billing review + VAT calc. */
function huf(value: Prisma.Decimal | null): string {
  if (value === null) return '—';
  const [whole, fraction = '00'] = value.toFixed(2).split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return fraction === '00' ? `${grouped} Ft` : `${grouped},${fraction} Ft`;
}

function vatLabel(line: InvoiceDraftLine): string {
  switch (line.vatTreatment) {
    case 'TAX_EXEMPT': return 'Mentes';
    case 'REVERSE_CHARGE': return 'Fordított';
    case 'OUT_OF_SCOPE': return 'Kívül';
    default: return line.vatRate !== null ? `${line.vatRate.toString()}%` : '—';
  }
}

function vatTreatmentLabel(treatment: InvoiceDraft['vatTreatment']): string | null {
  switch (treatment) {
    case 'TAX_EXEMPT': return 'ÁFA: mentes az adó alól';
    case 'REVERSE_CHARGE': return 'ÁFA: fordított adózás';
    case 'OUT_OF_SCOPE': return 'ÁFA: az adótörvény hatályán kívül';
    default: return null;
  }
}

function writePartyBlock(doc: PDFKit.PDFDocument, title: string, lines: (string | null)[], x: number, y: number, width: number): number {
  doc.fillColor('#193557').fontSize(8).text(title, x, y, { width });
  let cy = y + 13;
  doc.fillColor('#1a1a1a').fontSize(8.5);
  for (const line of lines.filter((l): l is string => !!l?.trim())) {
    doc.text(line, x, cy, { width });
    cy += doc.heightOfString(line, { width }) + 2;
  }
  return cy;
}

function writeTableHeader(doc: PDFKit.PDFDocument, columns: readonly { key: string; label: string; width: number; align: string }[], y: number): number {
  let x = margin;
  doc.fillColor('#193557').fontSize(7);
  for (const column of columns) {
    doc.text(column.label, x, y, { width: column.width - 4, align: column.align as 'left' | 'right' | 'center' });
    x += column.width;
  }
  doc.moveTo(margin, y + 11).lineTo(pageWidth - margin, y + 11).strokeColor('#b8c4d1').stroke();
  return y + 16;
}

function writeRow(doc: PDFKit.PDFDocument, columns: readonly { key: string; label: string; width: number; align: string }[], values: Record<string, string>, y: number): number {
  const height = Math.max(14, ...columns.map((column) => doc.heightOfString(values[column.key] ?? '—', { width: column.width - 6, align: column.align as 'left' | 'right' | 'center' }))) + 5;
  let x = margin;
  doc.fillColor('#1a1a1a').fontSize(7);
  for (const column of columns) {
    doc.text(values[column.key] ?? '—', x, y, { width: column.width - 6, align: column.align as 'left' | 'right' | 'center' });
    x += column.width;
  }
  y += height;
  doc.moveTo(margin, y - 3).lineTo(pageWidth - margin, y - 3).strokeColor('#e0e5ea').stroke();
  return y;
}

/**
 * Render the T6A invoice-draft PDF. The face carries NO invoice number, no
 * issuance metadata and the compulsory SZÁMLATERVEZET / NEM SZÁMLA markings.
 * Work detail is relegated to an "Elszámolási melléklet" annex on page 2+.
 */
export async function renderInvoiceDraftPdf(draft: DraftWithLines): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin, info: { Title: 'Számlatervezet — nem számla', Author: 'Adminiculum' } });
  doc.registerFont('NotoSans', fontPath);
  doc.font('NotoSans');
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const completed = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  // --- Header: optional configured logo, then the compulsory draft markings.
  let y = margin;
  if (draft.issuerLogoPath) {
    const logoPath = path.resolve(draft.issuerLogoPath);
    if (fs.existsSync(logoPath)) {
      try { doc.image(logoPath, margin, y, { fit: [110, 54] }); } catch { /* logo must never break the draft */ }
    }
  }
  doc.fillColor('#193557').fontSize(20).text('SZÁMLATERVEZET', margin, y + 58, { align: 'center' });
  doc.fillColor('#8c1d18').fontSize(13).text('NEM SZÁMLA', margin, y + 84, { align: 'center' });
  doc.fillColor('#454545').fontSize(7.5).text('Ez a dokumentum számlatervezet — nem minősül kiállított számlának.', margin, y + 102, { align: 'center' });
  y += 122;

  // --- Szállító / Vevő blocks
  const half = (pageWidth - margin * 2 - 20) / 2;
  const issuerLines = [
    draft.issuerLegalName,
    draft.issuerAddress,
    draft.issuerTaxNumber ? `Adószám: ${draft.issuerTaxNumber}` : null,
    draft.issuerEuVatNumber ? `Közösségi adószám: ${draft.issuerEuVatNumber}` : null,
    draft.issuerRegistrationNumber ? `Cégjegyzékszám: ${draft.issuerRegistrationNumber}` : null,
    draft.issuerBankName ? `Bank: ${draft.issuerBankName}` : null,
    draft.issuerBankAccountNumber ? `Bankszámlaszám: ${draft.issuerBankAccountNumber}` : null,
    draft.issuerEmail, draft.issuerPhone,
  ];
  const customerLines = [
    draft.customerName,
    draft.customerAddress,
    draft.customerTaxNumber ? `Adószám: ${draft.customerTaxNumber}` : null,
    draft.customerVatNumber ? `Közösségi adószám: ${draft.customerVatNumber}` : null,
  ];
  const y0 = writePartyBlock(doc, 'SZÁLLÍTÓ', issuerLines, margin, y, half);
  const y1 = writePartyBlock(doc, 'VEVŐ', customerLines, margin + half + 20, y, half);
  y = Math.max(y0, y1) + 12;

  // --- Meta row
  const meta: [string, string][] = [
    ['Tervezet kelte', date(draft.draftDate)],
    ['Teljesítés dátuma', date(draft.performanceDate)],
    ['Fizetési határidő', date(draft.paymentDueDate)],
    ['Fizetési mód', draft.paymentMethod ?? '—'],
    ['Pénznem', draft.currency],
  ];
  doc.fontSize(7.5);
  const metaWidth = (pageWidth - margin * 2) / meta.length;
  meta.forEach(([label], i) => doc.fillColor('#777777').text(label, margin + i * metaWidth, y, { width: metaWidth - 6 }));
  meta.forEach(([, value], i) => doc.fillColor('#1a1a1a').text(value, margin + i * metaWidth, y + 11, { width: metaWidth - 6 }));
  y += 32;

  // --- Line table
  y = writeTableHeader(doc, lineColumns, y);
  for (const line of draft.lines) {
    const values = {
      description: line.description,
      quantity: line.quantity.isInteger() ? line.quantity.toFixed(0) : line.quantity.toString(),
      unit: line.unit,
      netUnitPrice: huf(line.netUnitPrice),
      netAmount: huf(line.netAmount),
      vat: vatLabel(line),
      vatAmount: huf(line.vatAmount),
      grossAmount: huf(line.grossAmount),
    };
    const height = Math.max(14, ...lineColumns.map((c) => doc.heightOfString(values[c.key as keyof typeof values], { width: c.width - 6 }))) + 5;
    if (y + height > pageHeight - margin - 70) {
      doc.addPage();
      y = writeTableHeader(doc, lineColumns, margin);
    }
    y = writeRow(doc, lineColumns, values, y);
  }

  // --- Totals (recomputed for display from persisted Decimal line amounts)
  const net = draft.lines.reduce((s, l) => s.plus(l.netAmount), new Prisma.Decimal(0));
  const vat = draft.lines.reduce((s, l) => s.plus(l.vatAmount), new Prisma.Decimal(0));
  const gross = draft.lines.reduce((s, l) => s.plus(l.grossAmount), new Prisma.Decimal(0));
  if (y + 60 > pageHeight - margin) {
    doc.addPage();
    y = margin;
  }
  y += 8;
  const totalsX = pageWidth - margin - 190;
  doc.fillColor('#454545').fontSize(8.5);
  doc.text('Nettó összesen:', totalsX, y, { width: 110 });
  doc.fillColor('#1a1a1a').text(huf(net), totalsX + 112, y, { width: 78, align: 'right' });
  doc.fillColor('#454545').text('ÁFA összesen:', totalsX, y + 14, { width: 110 });
  doc.fillColor('#1a1a1a').text(huf(vat), totalsX + 112, y + 14, { width: 78, align: 'right' });
  doc.moveTo(totalsX, y + 28).lineTo(pageWidth - margin, y + 28).strokeColor('#193557').stroke();
  doc.fillColor('#193557').fontSize(10).text('Bruttó végösszeg:', totalsX, y + 33, { width: 110 });
  doc.text(huf(gross), totalsX + 112, y + 33, { width: 78, align: 'right' });
  y += 58;

  const treatmentLabel = vatTreatmentLabel(draft.vatTreatment);
  if (treatmentLabel) {
    doc.fillColor('#454545').fontSize(8).text(treatmentLabel, margin, y, { width: pageWidth - margin * 2 });
    y += 12;
  }
  if (draft.note) {
    doc.fillColor('#454545').fontSize(8).text(`Megjegyzés: ${draft.note}`, margin, y, { width: pageWidth - margin * 2 });
  }

  // --- Work-detail annex (Elszámolási melléklet)
  doc.addPage();
  let ay = margin;
  doc.fillColor('#193557').fontSize(11).text('ELSZÁMOLÁSI MELLÉKLET', margin, ay);
  doc.fillColor('#777777').fontSize(7).text('A számlatervezet részletes munkaidő-melléklete — nem része a számla adattartalmának.', margin, ay + 16);
  ay = writeTableHeader(doc, annexColumns, ay + 30);
  for (const line of draft.lines) {
    const values = {
      date: date(line.sourceWorkDate),
      case: [line.caseNumber, line.caseTitle].filter(Boolean).join(' — ') || '—',
      work: line.description,
      worker: line.workerName ?? '—',
      minutes: minutes(line.billingMinutes),
      rate: huf(line.hourlyRate),
      net: huf(line.netAmount),
    };
    const height = Math.max(14, ...annexColumns.map((c) => doc.heightOfString(values[c.key as keyof typeof values], { width: c.width - 6 }))) + 5;
    if (ay + height > pageHeight - margin - 30) {
      doc.addPage();
      ay = writeTableHeader(doc, annexColumns, margin);
    }
    ay = writeRow(doc, annexColumns, values, ay);
  }

  doc.end();
  return completed;
}
