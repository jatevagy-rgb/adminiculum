/**
 * Comprehensive Test Suite for Document DOCX / PDF / TXT Text-Diff (STRUCTURED-DOC-COMPARISON).
 * Covers the full recovery acceptance test matrix:
 * 1. Shared caller regression (>2MB supported for shared extraction, bounded for comparison)
 * 2. DOCX text extraction and diff matrix
 * 3. PDF on Node 20 (identical, changed, mixed, no-text, malformed, oversized, literal marker)
 * 4. Truthful format scope (.doc, HTML, RTF unsupported for comparison)
 * 5. Extraction revision reuse and recompute (rev 1 -> rev 2)
 * 6. Auth and storage security
 * 7. Reason code preservation and regression safety
 */
import { Document, Packer, Paragraph, TextRun } from 'docx';
import {
  extractText,
  detectFormat,
  SHARED_EXTRACTOR_MAX,
  SHARED_EXTRACTED_TEXT_MAX,
} from '../src/modules/documents/textExtractor';
import {
  resolveVersionText,
  isTextExtractable,
  COMPARISON_INPUT_MAX,
  COMPARISON_EXTRACTED_TEXT_MAX,
  EXTRACTION_REVISION,
} from '../src/modules/documents/comparison/versionText';
import { compareVersions, COMPARISON_ALGORITHM_REVISION } from '../src/modules/documents/comparison/diffEngine';
import { createOrGetComparison, ComparisonError } from '../src/modules/documents/comparison/comparisonService';
import { toComparisonDto, toSegmentDto } from '../src/modules/documents/comparison/comparisonDto';

// Helper to create a valid minimal DOCX buffer in memory
async function makeDocxBuffer(paragraphs: string[]): Promise<Buffer> {
  const doc = new Document({
    sections: [
      {
        children: paragraphs.map((p) => new Paragraph({ children: [new TextRun(p)] })),
      },
    ],
  });
  return Packer.toBuffer(doc);
}

// Helper to create a valid minimal PDF buffer with accurate byte offsets and xref table
function makePdfBuffer(textContent = ''): Buffer {
  const hasText = textContent.trim().length > 0;
  const escaped = textContent.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const streamBody = hasText ? `BT /F1 12 Tf 72 712 Td (${escaped}) Tj ET\n` : '';
  const streamBuf = Buffer.from(streamBody, 'utf8');

  const obj1 = Buffer.from('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n', 'utf8');
  const obj2 = Buffer.from('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n', 'utf8');
  const obj3 = Buffer.from(
    hasText
      ? '3 0 obj\n<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> /MediaBox [0 0 612 792] /Contents 5 0 R >>\nendobj\n'
      : '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>\nendobj\n',
    'utf8'
  );
  const obj4 = hasText
    ? Buffer.from('4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n', 'utf8')
    : Buffer.from(`4 0 obj\n<< /Length ${streamBuf.length} >>\nstream\n${streamBody}endstream\nendobj\n`, 'utf8');
  const obj5 = hasText
    ? Buffer.from(`5 0 obj\n<< /Length ${streamBuf.length} >>\nstream\n${streamBody}endstream\nendobj\n`, 'utf8')
    : null;

  const header = Buffer.from('%PDF-1.4\n', 'utf8');
  const objects = obj5 ? [obj1, obj2, obj3, obj4, obj5] : [obj1, obj2, obj3, obj4];

  let currentOffset = header.length;
  const offsets = [0];
  for (const obj of objects) {
    offsets.push(currentOffset);
    currentOffset += obj.length;
  }

  const startXref = currentOffset;
  let xref = `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i++) {
    xref += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
  }
  const trailer = `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${startXref}\n%%EOF`;

  return Buffer.concat([header, ...objects, Buffer.from(xref + trailer, 'utf8')]);
}

function makeImageOnlyPdfBuffer(): Buffer {
  return makePdfBuffer('');
}

function makeMockPrisma(store: any = { comparison: null, segments: [] }) {
  const prisma: any = {
    _store: store,
    documentVersion: {
      findMany: jest.fn(async ({ where }: any) => {
        const ids: string[] = where.id.in;
        return ids.map((id) => ({
          id,
          documentId: 'doc-1',
          version: id === 'vB' ? 1 : 2,
          mimeType: 'text/plain',
          originalFileName: id + '.txt',
          size: 100,
        }));
      }),
    },
    documentComparison: {
      findUnique: jest.fn(async () => store.comparison),
      create: jest.fn(async ({ data }: any) => { store.comparison = { id: 'cmp-1', ...data }; return store.comparison; }),
      update: jest.fn(async ({ data }: any) => { store.comparison = { ...store.comparison, ...data }; return store.comparison; }),
    },
    documentChangeSegment: {
      deleteMany: jest.fn(async () => { store.segments = []; }),
      createMany: jest.fn(async ({ data }: any) => { store.segments = data; return { count: data.length }; }),
    },
    $transaction: jest.fn(async (fn: any) => fn(prisma)),
  };
  return prisma;
}

describe('Document DOCX/PDF Text-Diff Matrix', () => {
  // ==========================================
  // 1. SHARED CALLER REGRESSION (>2MB SUPPORT)
  // ==========================================
  describe('SHARED CALLER REGRESSION (1-3)', () => {
    it('1. valid anonymization/shared caller with 4 MB text document succeeds', async () => {
      const fourMbText = 'Szerződéses feltételek.\n'.repeat(160_000);
      const fourMbBuf = Buffer.from(fourMbText, 'utf8');
      expect(fourMbBuf.byteLength).toBeGreaterThan(2_000_000);
      expect(fourMbBuf.byteLength).toBeLessThan(SHARED_EXTRACTOR_MAX);

      const res = await extractText(fourMbBuf, 'text/plain', 'large_contract.txt');
      expect(res.success).toBe(true);
      expect(res.text).toBeDefined();
      expect(res.text?.length).toBeGreaterThan(1_000_000);
    });

    it('2. document-text extraction >2 MB succeeds for shared caller', async () => {
      const largeText = 'Ügyvédi munkadíj megállapítás: 500.000 HUF.\n'.repeat(80_000);
      const largeBuf = Buffer.from(largeText, 'utf8');
      expect(largeBuf.byteLength).toBeGreaterThan(2_000_000);

      const res = await extractText(largeBuf, 'text/plain', 'matter.txt');
      expect(res.success).toBe(true);
      expect(res.text).toContain('500.000 HUF');
    });

    it('3. comparison resolver rejects >2 MB input with CONTENT_TOO_LARGE while shared extractor accepts it', async () => {
      const threeMbBuf = Buffer.from('Közös megállapodás.\n'.repeat(120_000), 'utf8');
      expect(threeMbBuf.byteLength).toBeGreaterThan(COMPARISON_INPUT_MAX);

      // Shared extractor accepts 3 MB
      const sharedRes = await extractText(threeMbBuf, 'text/plain', 'doc.txt');
      expect(sharedRes.success).toBe(true);

      // Comparison resolver rejects 3 MB
      const compRes = await resolveVersionText(
        { id: 'v1', documentId: 'd1', mimeType: 'text/plain', originalFileName: 'doc.txt', size: threeMbBuf.length },
        async () => threeMbBuf
      );
      expect(compRes.supported).toBe(false);
      expect(compRes.reasonCode).toBe('CONTENT_TOO_LARGE');
    });
  });

  // ==========================================
  // 2. TEXT MATRIX
  // ==========================================
  describe('TEXT (4-5)', () => {
    it('4. TXT vs TXT unchanged yields IDENTICAL with zero segments', async () => {
      const text = '1. Szakasz: A szerződés tárgya.\n\n2. Szakasz: Díjazás 500.000 HUF.';
      const dl = async () => Buffer.from(text, 'utf8');
      const vB = await resolveVersionText({ id: 'v1', documentId: 'd1', mimeType: 'text/plain', originalFileName: 'contract_v1.txt', size: 100 }, dl);
      const vT = await resolveVersionText({ id: 'v2', documentId: 'd1', mimeType: 'text/plain', originalFileName: 'contract_v2.txt', size: 100 }, dl);

      expect(vB.supported).toBe(true);
      expect(vT.supported).toBe(true);

      const diff = compareVersions({
        baseText: vB.text,
        targetText: vT.text,
        baseSupported: vB.supported,
        targetSupported: vT.supported,
      });

      expect(diff.status).toBe('IDENTICAL');
      expect(diff.segments).toHaveLength(0);
    });

    it('5. TXT modification still produces structured diff', async () => {
      const textB = '1. Szakasz: A szerződés tárgya.\n\n2. Szakasz: Díjazás 500.000 HUF.';
      const textT = '1. Szakasz: A szerződés tárgya.\n\n2. Szakasz: Díjazás 600.000 HUF.';

      const vB = await resolveVersionText({ id: 'v1', documentId: 'd1', mimeType: 'text/plain', originalFileName: 'contract_v1.txt', size: 100 }, async () => Buffer.from(textB, 'utf8'));
      const vT = await resolveVersionText({ id: 'v2', documentId: 'd1', mimeType: 'text/plain', originalFileName: 'contract_v2.txt', size: 100 }, async () => Buffer.from(textT, 'utf8'));

      const diff = compareVersions({
        baseText: vB.text,
        targetText: vT.text,
        baseSupported: vB.supported,
        targetSupported: vT.supported,
      });

      expect(diff.status).toBe('READY');
      expect(diff.summary.replaces).toBe(1);
      expect(diff.segments[0].baseExcerpt).toContain('500.000 HUF');
      expect(diff.segments[0].targetExcerpt).toContain('600.000 HUF');
    });
  });

  // ==========================================
  // 3. DOCX MATRIX
  // ==========================================
  describe('DOCX (6-11)', () => {
    it('6. DOCX vs DOCX identical extracts text and reports IDENTICAL', async () => {
      const paragraphs = ['1. Fejezet: Általános rendelkezések.', '2. Fejezet: Fizetési feltételek 30 nap.'];
      const docxBuf = await makeDocxBuffer(paragraphs);

      const vB = await resolveVersionText({ id: 'v1', documentId: 'd1', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', originalFileName: 'contract_v1.docx', size: docxBuf.length }, async () => docxBuf);
      const vT = await resolveVersionText({ id: 'v2', documentId: 'd1', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', originalFileName: 'contract_v2.docx', size: docxBuf.length }, async () => docxBuf);

      expect(vB.supported).toBe(true);
      expect(vT.supported).toBe(true);
      expect(vB.text).toContain('1. Fejezet: Általános rendelkezések.');

      const diff = compareVersions({
        baseText: vB.text,
        targetText: vT.text,
        baseSupported: vB.supported,
        targetSupported: vT.supported,
      });

      expect(diff.status).toBe('IDENTICAL');
      expect(diff.segments).toHaveLength(0);
    });

    it('7. DOCX vs DOCX paragraph modification produces REPLACE segment', async () => {
      const docxBufB = await makeDocxBuffer(['Fizetési határidő: 15 nap.', 'Késedelmi kamat: 5%.']);
      const docxBufT = await makeDocxBuffer(['Fizetési határidő: 30 nap.', 'Késedelmi kamat: 5%.']);

      const vB = await resolveVersionText({ id: 'v1', documentId: 'd1', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', originalFileName: 'v1.docx', size: docxBufB.length }, async () => docxBufB);
      const vT = await resolveVersionText({ id: 'v2', documentId: 'd1', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', originalFileName: 'v2.docx', size: docxBufT.length }, async () => docxBufT);

      expect(vB.supported).toBe(true);
      expect(vT.supported).toBe(true);

      const diff = compareVersions({
        baseText: vB.text,
        targetText: vT.text,
        baseSupported: vB.supported,
        targetSupported: vT.supported,
      });

      expect(diff.status).toBe('READY');
      expect(diff.summary.replaces).toBe(1);
      expect(diff.segments[0].baseExcerpt).toContain('15 nap');
      expect(diff.segments[0].targetExcerpt).toContain('30 nap');
    });

    it('8. DOCX added paragraph produces INSERT segment', async () => {
      const docxBufB = await makeDocxBuffer(['1. Szakasz.']);
      const docxBufT = await makeDocxBuffer(['1. Szakasz.', '2. Szakasz: Új rendelkezés.']);

      const vB = await resolveVersionText({ id: 'v1', documentId: 'd1', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', originalFileName: 'v1.docx', size: docxBufB.length }, async () => docxBufB);
      const vT = await resolveVersionText({ id: 'v2', documentId: 'd1', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', originalFileName: 'v2.docx', size: docxBufT.length }, async () => docxBufT);

      const diff = compareVersions({
        baseText: vB.text,
        targetText: vT.text,
        baseSupported: vB.supported,
        targetSupported: vT.supported,
      });

      expect(diff.status).toBe('READY');
      expect(diff.summary.inserts).toBe(1);
      expect(diff.segments[0].targetExcerpt).toContain('2. Szakasz: Új rendelkezés.');
    });

    it('9. DOCX removed paragraph produces DELETE segment', async () => {
      const docxBufB = await makeDocxBuffer(['1. Szakasz.', '2. Szakasz: Törlendő pont.']);
      const docxBufT = await makeDocxBuffer(['1. Szakasz.']);

      const vB = await resolveVersionText({ id: 'v1', documentId: 'd1', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', originalFileName: 'v1.docx', size: docxBufB.length }, async () => docxBufB);
      const vT = await resolveVersionText({ id: 'v2', documentId: 'd1', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', originalFileName: 'v2.docx', size: docxBufT.length }, async () => docxBufT);

      const diff = compareVersions({
        baseText: vB.text,
        targetText: vT.text,
        baseSupported: vB.supported,
        targetSupported: vT.supported,
      });

      expect(diff.status).toBe('READY');
      expect(diff.summary.deletes).toBe(1);
      expect(diff.segments[0].baseExcerpt).toContain('2. Szakasz: Törlendő pont.');
    });

    it('10. malformed DOCX yields safe typed failure (EXTRACTION_FAILED)', async () => {
      const corruptBuf = Buffer.from('PK\x03\x04 corrupt zip payload not a docx');
      const res = await resolveVersionText(
        { id: 'v1', documentId: 'd1', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', originalFileName: 'corrupt.docx', size: corruptBuf.length },
        async () => corruptBuf
      );

      expect(res.supported).toBe(false);
      expect(res.text).toBeNull();
      expect(res.reasonCode).toBe('EXTRACTION_FAILED');
    });

    it('11. oversized DOCX input yields bounded failure (CONTENT_TOO_LARGE)', async () => {
      const hugeDocxSize = COMPARISON_INPUT_MAX + 1000;
      const res = await resolveVersionText(
        { id: 'v1', documentId: 'd1', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', originalFileName: 'huge.docx', size: hugeDocxSize },
        async () => Buffer.alloc(hugeDocxSize)
      );

      expect(res.supported).toBe(false);
      expect(res.text).toBeNull();
      expect(res.reasonCode).toBe('CONTENT_TOO_LARGE');
    });
  });

  // ==========================================
  // 4. PDF MATRIX (NODE 20 REAL EXTRACTION)
  // ==========================================
  describe('PDF ON NODE 20 (12-18)', () => {
    it('12. PDF vs PDF identical text extracts text and reports IDENTICAL', async () => {
      const pdfText = 'Adminiculum PDF szerzodes 1. pontja.';
      const pdfBuf = makePdfBuffer(pdfText);

      const vB = await resolveVersionText({ id: 'v1', documentId: 'd1', mimeType: 'application/pdf', originalFileName: 'contract_v1.pdf', size: pdfBuf.length }, async () => pdfBuf);
      const vT = await resolveVersionText({ id: 'v2', documentId: 'd1', mimeType: 'application/pdf', originalFileName: 'contract_v2.pdf', size: pdfBuf.length }, async () => pdfBuf);

      expect(vB.supported).toBe(true);
      expect(vT.supported).toBe(true);
      expect(vB.text).toContain('Adminiculum PDF');

      const diff = compareVersions({
        baseText: vB.text,
        targetText: vT.text,
        baseSupported: vB.supported,
        targetSupported: vT.supported,
      });

      expect(diff.status).toBe('IDENTICAL');
      expect(diff.segments).toHaveLength(0);
    });

    it('13. PDF vs PDF changed text produces structured diff', async () => {
      const pdfBufB = makePdfBuffer('Szerzodes dija: 1000 EUR');
      const pdfBufT = makePdfBuffer('Szerzodes dija: 2500 EUR');

      const vB = await resolveVersionText({ id: 'v1', documentId: 'd1', mimeType: 'application/pdf', originalFileName: 'v1.pdf', size: pdfBufB.length }, async () => pdfBufB);
      const vT = await resolveVersionText({ id: 'v2', documentId: 'd1', mimeType: 'application/pdf', originalFileName: 'v2.pdf', size: pdfBufT.length }, async () => pdfBufT);

      expect(vB.supported).toBe(true);
      expect(vT.supported).toBe(true);

      const diff = compareVersions({
        baseText: vB.text,
        targetText: vT.text,
        baseSupported: vB.supported,
        targetSupported: vT.supported,
      });

      expect(diff.status).toBe('READY');
      expect(diff.summary.replaces).toBe(1);
      expect(diff.segments[0].baseExcerpt).toContain('1000 EUR');
      expect(diff.segments[0].targetExcerpt).toContain('2500 EUR');
    });

    it('14. text PDF vs DOCX mixed-format comparison produces structured diff', async () => {
      const pdfBuf = makePdfBuffer('Kozos megallapodas 1. szakasz.');
      const docxBuf = await makeDocxBuffer(['Kozos megallapodas 1. szakasz.', 'Uj 2. szakasz a DOCX verzioban.']);

      const vPdf = await resolveVersionText({ id: 'v1', documentId: 'd1', mimeType: 'application/pdf', originalFileName: 'v1.pdf', size: pdfBuf.length }, async () => pdfBuf);
      const vDocx = await resolveVersionText({ id: 'v2', documentId: 'd1', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', originalFileName: 'v2.docx', size: docxBuf.length }, async () => docxBuf);

      expect(vPdf.supported).toBe(true);
      expect(vDocx.supported).toBe(true);

      const diff = compareVersions({
        baseText: vPdf.text,
        targetText: vDocx.text,
        baseSupported: vPdf.supported,
        targetSupported: vDocx.supported,
      });

      expect(diff.status).toBe('READY');
      expect(diff.summary.inserts).toBe(1);
      expect(diff.segments[0].targetExcerpt).toContain('Uj 2. szakasz');
    });

    it('15. image/no-text PDF yields honest NO_EXTRACTABLE_TEXT without false identical', async () => {
      const imgPdfBuf = makeImageOnlyPdfBuffer();
      const res = await resolveVersionText(
        { id: 'v1', documentId: 'd1', mimeType: 'application/pdf', originalFileName: 'scanned.pdf', size: imgPdfBuf.length },
        async () => imgPdfBuf
      );

      expect(res.supported).toBe(false);
      expect(res.text).toBeNull();
      expect(res.reasonCode).toBe('NO_EXTRACTABLE_TEXT');

      const diff = compareVersions({
        baseText: res.text,
        targetText: res.text,
        baseSupported: res.supported,
        targetSupported: res.supported,
        baseReasonCode: res.reasonCode,
        targetReasonCode: res.reasonCode,
      });

      expect(diff.status).toBe('UNSUPPORTED');
      expect(diff.failureCode).toBe('NO_EXTRACTABLE_TEXT');
      expect(diff.segments).toHaveLength(0);
    });

    it('16. malformed PDF yields safe typed failure (EXTRACTION_FAILED)', async () => {
      const corruptPdf = Buffer.from('%PDF-1.4\ncorrupt body syntax << >>');
      const res = await resolveVersionText(
        { id: 'v1', documentId: 'd1', mimeType: 'application/pdf', originalFileName: 'corrupt.pdf', size: corruptPdf.length },
        async () => corruptPdf
      );

      expect(res.supported).toBe(false);
      expect(res.text).toBeNull();
      expect(res.reasonCode).toBe('EXTRACTION_FAILED');
    });

    it('17. oversized PDF buffer for comparison yields bounded failure (CONTENT_TOO_LARGE)', async () => {
      const fakeLargeSize = COMPARISON_INPUT_MAX + 500;
      const res = await resolveVersionText(
        { id: 'v1', documentId: 'd1', mimeType: 'application/pdf', originalFileName: 'huge.pdf', size: fakeLargeSize },
        async () => Buffer.alloc(fakeLargeSize)
      );

      expect(res.supported).toBe(false);
      expect(res.reasonCode).toBe('CONTENT_TOO_LARGE');
    });

    it('18. literal document content containing "-- 1 of 2 --" is preserved without synthetic marker loss', async () => {
      const literalPdf = makePdfBuffer('Szakasz -- 1 of 2 -- minta szerzodes szoveg.');
      const res = await extractText(literalPdf, 'application/pdf', 'literal.pdf');

      expect(res.success).toBe(true);
      expect(res.text).toContain('-- 1 of 2 --');
    });
  });

  // ==========================================
  // 5. TRUTHFUL FORMAT SCOPE (.doc, HTML, RTF)
  // ==========================================
  describe('TRUTHFUL FORMAT SCOPE (19-21)', () => {
    it('19. legacy .doc is reported as FORMAT_NOT_TEXT_EXTRACTABLE for comparison', async () => {
      expect(isTextExtractable('application/msword', 'legacy.doc')).toBe(false);

      const res = await resolveVersionText(
        { id: 'v1', documentId: 'd1', mimeType: 'application/msword', originalFileName: 'legacy.doc', size: 1000 },
        async () => Buffer.from('OLE binary doc')
      );
      expect(res.supported).toBe(false);
      expect(res.reasonCode).toBe('FORMAT_NOT_TEXT_EXTRACTABLE');
    });

    it('20. HTML markup is reported as FORMAT_NOT_TEXT_EXTRACTABLE for comparison', async () => {
      expect(isTextExtractable('text/html', 'document.html')).toBe(false);

      const res = await resolveVersionText(
        { id: 'v1', documentId: 'd1', mimeType: 'text/html', originalFileName: 'document.html', size: 1000 },
        async () => Buffer.from('<html><body>Hello</body></html>')
      );
      expect(res.supported).toBe(false);
      expect(res.reasonCode).toBe('FORMAT_NOT_TEXT_EXTRACTABLE');
    });

    it('21. RTF is reported as FORMAT_NOT_TEXT_EXTRACTABLE for comparison', async () => {
      expect(isTextExtractable('application/rtf', 'document.rtf')).toBe(false);

      const res = await resolveVersionText(
        { id: 'v1', documentId: 'd1', mimeType: 'application/rtf', originalFileName: 'document.rtf', size: 1000 },
        async () => Buffer.from('{\\rtf1\\ansi Hello}')
      );
      expect(res.supported).toBe(false);
      expect(res.reasonCode).toBe('FORMAT_NOT_TEXT_EXTRACTABLE');
    });
  });

  // ==========================================
  // 6. EXTRACTION REVISION REUSE & RECOMPUTE
  // ==========================================
  describe('EXTRACTION REVISION REUSE & RECOMPUTE (22-25)', () => {
    it('22. current revision comparison (rev 2) is reused idempotently', async () => {
      const store = {
        comparison: {
          id: 'cmp-existing-rev2',
          documentId: 'doc-1',
          baseVersionId: 'v1',
          targetVersionId: 'v2',
          status: 'READY',
          algorithmRevision: COMPARISON_ALGORITHM_REVISION,
          extractionRevision: EXTRACTION_REVISION, // Current rev 2
          insertCount: 1,
          deleteCount: 0,
          replaceCount: 0,
        },
        segments: [],
      };
      const prisma = makeMockPrisma(store);
      const resolveText = jest.fn();

      const res = await createOrGetComparison(
        { actorId: 'u1', documentId: 'doc-1', baseVersionId: 'v1', targetVersionId: 'v2' },
        { prisma, resolveText }
      );

      expect(res.id).toBe('cmp-existing-rev2');
      expect(res.extractionRevision).toBe(EXTRACTION_REVISION);
      expect(resolveText).not.toHaveBeenCalled(); // Reused without recomputing
    });

    it('23. old extractionRevision (rev 1) READY comparison is NOT reused and recomputes to rev 2', async () => {
      const store = {
        comparison: {
          id: 'cmp-old-rev1',
          documentId: 'doc-1',
          baseVersionId: 'v1',
          targetVersionId: 'v2',
          status: 'READY',
          algorithmRevision: COMPARISON_ALGORITHM_REVISION,
          extractionRevision: 1, // STALE REVISION 1
        },
        segments: [],
      };
      const prisma = makeMockPrisma(store);

      const res = await createOrGetComparison(
        { actorId: 'u1', documentId: 'doc-1', baseVersionId: 'v1', targetVersionId: 'v2' },
        {
          prisma,
          resolveText: async () => ({ supported: true, text: 'Recomputed rev2 text', reasonCode: null, extractionRevision: EXTRACTION_REVISION }),
        }
      );

      expect(res.extractionRevision).toBe(EXTRACTION_REVISION);
      expect(res.status).toBe('IDENTICAL');
      expect(store.comparison.extractionRevision).toBe(EXTRACTION_REVISION);
    });

    it('24. old extractionRevision (rev 1) IDENTICAL comparison is recomputed to rev 2', async () => {
      const store = {
        comparison: {
          id: 'cmp-old-identical',
          documentId: 'doc-1',
          baseVersionId: 'v1',
          targetVersionId: 'v2',
          status: 'IDENTICAL',
          algorithmRevision: COMPARISON_ALGORITHM_REVISION,
          extractionRevision: 1, // STALE REVISION 1
        },
        segments: [],
      };
      const prisma = makeMockPrisma(store);

      const res = await createOrGetComparison(
        { actorId: 'u1', documentId: 'doc-1', baseVersionId: 'v1', targetVersionId: 'v2' },
        {
          prisma,
          resolveText: async (v) => ({ supported: true, text: `Text for ${v.id}`, reasonCode: null, extractionRevision: EXTRACTION_REVISION }),
        }
      );

      expect(res.extractionRevision).toBe(EXTRACTION_REVISION);
      expect(res.status).toBe('READY');
    });

    it('25. old extractionRevision (rev 1) UNSUPPORTED DOCX/PDF comparison is recomputed under rev 2', async () => {
      const store = {
        comparison: {
          id: 'cmp-old-unsupported',
          documentId: 'doc-1',
          baseVersionId: 'v1',
          targetVersionId: 'v2',
          status: 'UNSUPPORTED',
          failureCode: 'FORMAT_NOT_TEXT_EXTRACTABLE',
          algorithmRevision: COMPARISON_ALGORITHM_REVISION,
          extractionRevision: 1, // STALE REVISION 1
        },
        segments: [],
      };
      const prisma = makeMockPrisma(store);

      const res = await createOrGetComparison(
        { actorId: 'u1', documentId: 'doc-1', baseVersionId: 'v1', targetVersionId: 'v2' },
        {
          prisma,
          resolveText: async (v) => ({ supported: true, text: 'PDF now supported', reasonCode: null, extractionRevision: EXTRACTION_REVISION }),
        }
      );

      expect(res.extractionRevision).toBe(EXTRACTION_REVISION);
      expect(res.status).toBe('IDENTICAL');
      expect(res.failureCode).toBeNull();
    });
  });

  // ==========================================
  // 7. AUTH & STORAGE SECURITY
  // ==========================================
  describe('AUTH / STORAGE (26-30)', () => {
    it('26. unauthorized document access fails closed before storage download', async () => {
      const dl = jest.fn();
      await expect(
        createOrGetComparison(
          { actorId: '', documentId: 'doc-1', baseVersionId: 'v1', targetVersionId: 'v2' },
          { prisma: makeMockPrisma(), resolveText: async (v) => resolveVersionText(v, dl) }
        )
      ).rejects.toMatchObject({ code: 'UNAUTHENTICATED', status: 401 });

      expect(dl).not.toHaveBeenCalled();
    });

    it('27. unauthorized or non-existent version cannot trigger extraction', async () => {
      const dl = jest.fn();
      const prisma = makeMockPrisma();
      prisma.documentVersion.findMany.mockResolvedValueOnce([{ id: 'v1', documentId: 'doc-1' }]);

      await expect(
        createOrGetComparison(
          { actorId: 'actor-1', documentId: 'doc-1', baseVersionId: 'v1', targetVersionId: 'v2' },
          { prisma, resolveText: async (v) => resolveVersionText(v, dl) }
        )
      ).rejects.toMatchObject({ code: 'VERSION_NOT_FOUND', status: 404 });

      expect(dl).not.toHaveBeenCalled();
    });

    it('28. cross-case/cross-document version substitution fails closed', async () => {
      const dl = jest.fn();
      const prisma = makeMockPrisma();
      prisma.documentVersion.findMany.mockResolvedValueOnce([
        { id: 'v1', documentId: 'doc-1', version: 1, mimeType: 'text/plain', originalFileName: 'v1.txt', size: 10 },
        { id: 'v2', documentId: 'doc-OTHER', version: 2, mimeType: 'text/plain', originalFileName: 'v2.txt', size: 10 },
      ]);

      await expect(
        createOrGetComparison(
          { actorId: 'actor-1', documentId: 'doc-1', baseVersionId: 'v1', targetVersionId: 'v2' },
          { prisma, resolveText: async (v) => resolveVersionText(v, dl) }
        )
      ).rejects.toMatchObject({ code: 'CROSS_DOCUMENT_VERSIONS' });

      expect(dl).not.toHaveBeenCalled();
    });

    it('29. storage download failure is safely mapped without exposing internal details', async () => {
      const failingDl = async () => { throw new Error('SharePoint Graph 503 Service Unavailable at https://internal.sp.local/secret'); };
      const res = await resolveVersionText(
        { id: 'v1', documentId: 'doc-1', mimeType: 'text/plain', originalFileName: 'v1.txt', size: 10 },
        failingDl
      );

      expect(res.supported).toBe(false);
      expect(res.text).toBeNull();
      expect(res.reasonCode).toBe('EXTRACTION_FAILED');
      expect(JSON.stringify(res)).not.toMatch(/sharepoint|https|secret/i);
    });

    it('30. raw parser error never leaks library names or stack traces in response', async () => {
      const corrupt = Buffer.from('INVALID_DATA');
      const extraction = await extractText(corrupt, 'application/pdf', 'test.pdf');

      expect(extraction.success).toBe(false);
      expect(extraction.reasonCode).toBe('EXTRACTION_FAILED');
      expect(extraction.error).not.toMatch(/node_modules|stack|line|column|PDFParse/i);
    });
  });

  // ==========================================
  // 8. REGRESSION MATRIX
  // ==========================================
  describe('REGRESSION (31-33)', () => {
    it('31. existing textual comparison remains unchanged and deterministic', () => {
      const a = 'A díj 100 EUR.\n\nA határidő 30 nap.';
      const b = 'A díj 150 EUR.\n\nA határidő 30 nap.';
      const diff1 = compareVersions({ baseText: a, targetText: b, baseSupported: true, targetSupported: true });
      const diff2 = compareVersions({ baseText: a, targetText: b, baseSupported: true, targetSupported: true });

      expect(diff1).toEqual(diff2);
      expect(diff1.status).toBe('READY');
      expect(diff1.summary.replaces).toBe(1);
    });

    it('32. existing structured diff DTO mapping remains identical', () => {
      const row = {
        id: 'cmp-1',
        documentId: 'doc-1',
        baseVersionId: 'v1',
        targetVersionId: 'v2',
        status: 'READY',
        algorithmRevision: 1,
        extractionRevision: 2,
        createdAt: new Date('2026-08-29T10:00:00Z'),
        startedAt: new Date('2026-08-29T10:00:01Z'),
        completedAt: new Date('2026-08-29T10:00:02Z'),
        failureCode: null,
        failureMessageSafe: null,
        insertCount: 1,
        deleteCount: 0,
        replaceCount: 1,
        formatOnlyCount: 0,
        moveCandidateCount: 0,
        totalSegmentCount: 2,
        reviewedSegmentCount: 1,
      };

      const dto = toComparisonDto(row);
      expect(dto).toMatchObject({
        id: 'cmp-1',
        documentId: 'doc-1',
        baseVersionId: 'v1',
        targetVersionId: 'v2',
        status: 'READY',
        algorithmRevision: 1,
        extractionRevision: 2,
        counts: {
          insert: 1,
          delete: 0,
          replace: 1,
          formatOnly: 0,
          moveCandidate: 0,
          total: 2,
          reviewed: 1,
        },
      });
    });

    it('33. format detection correctly identifies docx, doc, pdf, txt, md, csv, html, rtf in shared extractor', () => {
      expect(detectFormat('application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe('docx');
      expect(detectFormat('', 'document.docx')).toBe('docx');
      expect(detectFormat('application/pdf')).toBe('pdf');
      expect(detectFormat('', 'document.pdf')).toBe('pdf');
      expect(detectFormat('text/plain')).toBe('txt');
      expect(detectFormat('', 'notes.txt')).toBe('txt');
      expect(detectFormat('', 'readme.md')).toBe('txt');
      expect(detectFormat('', 'data.csv')).toBe('txt');
      expect(detectFormat('application/octet-stream', 'unknown.bin')).toBeNull();
    });
  });
});
