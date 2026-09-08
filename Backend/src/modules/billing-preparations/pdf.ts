import PDFDocument from 'pdfkit';
import { BillingPreparation, BillingPreparationItem, Prisma } from '@prisma/client';
import path from 'node:path';

type PreparationWithItems = BillingPreparation & {
  client: { name: string } | null;
  items: BillingPreparationItem[];
};

export type BillingPreparationPdfSummary = {
  includedMinutes: number;
  includedNetAmount: string;
};

// The build script copies this redistributable asset next to the compiled module.
const fontPath = path.join(__dirname, 'assets', 'NotoSans-Variable.ttf');
const pageWidth = 595.28;
const pageHeight = 841.89;
const margin = 42;
const tableColumns = [
  { key: 'date', label: 'Dátum', width: 55 },
  { key: 'case', label: 'Ügy', width: 70 },
  { key: 'work', label: 'Munka', width: 166 },
  { key: 'worker', label: 'Közreműködő', width: 80 },
  { key: 'minutes', label: 'Idő', width: 38 },
  { key: 'rate', label: 'Óradíj', width: 54 },
  { key: 'net', label: 'Nettó', width: 48 },
] as const;

function date(value: Date): string {
  return `${value.toISOString().slice(0, 10).replaceAll('-', '.')}.`;
}

function minutes(value: number): string {
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
}

/** Decimal string formatting only; all amounts have already been persisted by billing review. */
function huf(value: Prisma.Decimal | null): string {
  if (value === null) return '—';
  const [whole, fraction = '00'] = value.toFixed(2).split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return fraction === '00' ? `${grouped} Ft` : `${grouped},${fraction} Ft`;
}

function itemWork(item: BillingPreparationItem): string {
  return item.invoiceDescription?.trim() || item.sourceDescription?.trim() || item.sourceWorkType;
}

function itemCase(item: BillingPreparationItem): string {
  return [item.caseNumber, item.caseTitle].filter(Boolean).join(' — ') || '—';
}

function writeHeader(doc: PDFKit.PDFDocument, preparation: PreparationWithItems): number {
  let y = margin;
  doc.fillColor('#193557').fontSize(18).text('Adminiculum', margin, y);
  y += 30;
  doc.fontSize(15).fillColor('#1a1a1a').text('SZÁMLÁZÁSI ÖSSZESÍTŐ', margin, y);
  y += 31;
  doc.fontSize(9).fillColor('#454545');
  doc.text(`Ügyfél: ${preparation.client?.name ?? '—'}`, margin, y);
  y += 15;
  doc.text(`Elszámolási időszak: ${date(preparation.periodStart)} – ${date(preparation.periodEnd)}`, margin, y);
  y += 15;
  doc.text(`Pénznem: ${preparation.currency}    Státusz: Lezárt`, margin, y);
  y += 15;
  doc.fillColor('#777777').fontSize(7).text(`Előkészítés azonosítója: ${preparation.id}`, margin, y);
  return y + 22;
}

function writeTableHeader(doc: PDFKit.PDFDocument, y: number): number {
  let x = margin;
  doc.fillColor('#193557').fontSize(7);
  for (const column of tableColumns) {
    doc.text(column.label, x, y, { width: column.width, align: column.key === 'work' || column.key === 'case' || column.key === 'worker' ? 'left' : 'right' });
    x += column.width;
  }
  doc.moveTo(margin, y + 11).lineTo(pageWidth - margin, y + 11).strokeColor('#b8c4d1').stroke();
  return y + 16;
}

function newTablePage(doc: PDFKit.PDFDocument, preparation: PreparationWithItems): number {
  doc.addPage();
  return writeTableHeader(doc, writeHeader(doc, preparation));
}

/** Generate a customer-facing PDF from already-persisted billing snapshots only. */
export async function renderBillingPreparationPdf(preparation: PreparationWithItems, summary: BillingPreparationPdfSummary): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin, info: { Title: 'Számlázási összesítő', Author: 'Adminiculum' } });
  doc.registerFont('NotoSans', fontPath);
  doc.font('NotoSans');
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const completed = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  let y = writeTableHeader(doc, writeHeader(doc, preparation));
  for (const item of preparation.items.filter((row) => row.included)) {
    const values = {
      date: date(item.sourceWorkDate),
      case: itemCase(item),
      work: itemWork(item),
      worker: item.workerName ?? '—',
      minutes: minutes(item.billingMinutes),
      rate: huf(item.rateOverride ?? item.hourlyRate),
      net: huf(item.netAmount),
    };
    const height = Math.max(18, ...tableColumns.map((column) => doc.heightOfString(values[column.key], { width: column.width - 5, align: column.key === 'work' || column.key === 'case' || column.key === 'worker' ? 'left' : 'right' }))) + 7;
    if (y + height > pageHeight - margin - 65) y = newTablePage(doc, preparation);
    let x = margin;
    doc.fillColor('#1a1a1a').fontSize(7);
    for (const column of tableColumns) {
      doc.text(values[column.key], x, y, { width: column.width - 5, align: column.key === 'work' || column.key === 'case' || column.key === 'worker' ? 'left' : 'right' });
      x += column.width;
    }
    y += height;
    doc.moveTo(margin, y - 3).lineTo(pageWidth - margin, y - 3).strokeColor('#e0e5ea').stroke();
  }

  if (y + 48 > pageHeight - margin) {
    doc.addPage();
    y = margin;
  }
  doc.fillColor('#193557').fontSize(10);
  doc.text(`Összes számlázandó idő: ${minutes(summary.includedMinutes)} óra`, margin, y + 8);
  doc.text(`Összes nettó: ${huf(new Prisma.Decimal(summary.includedNetAmount))}`, margin, y + 24);
  doc.end();
  return completed;
}
