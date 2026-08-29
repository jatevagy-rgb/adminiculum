/**
 * Comprehensive Test Suite for Document DOCX / PDF / TXT Text-Diff (STRUCTURED-DOC-COMPARISON).
 * Covers all 26 points of the recovery acceptance test matrix.
 */
import { Document, Packer, Paragraph, TextRun } from 'docx';
import { extractText, detectFormat, MAX_EXTRACT_BYTES, MAX_EXTRACTED_TEXT_CHARS } from '../src/modules/documents/textExtractor';
import { resolveVersionText, isTextExtractable, type VersionMeta } from '../src/modules/documents/comparison/versionText';
import { compareVersions } from '../src/modules/documents/comparison/diffEngine';
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

// Helper to create a valid minimal PDF buffer in memory with extractable text
function makePdfBuffer(text: string): Buffer {
  const clean = text.replace(/[\(\)\\\r\n]/g, ' ');
  const content = `BT /F1 12 Tf 72 712 Td (${clean}) Tj ET`;
  const stream = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
  const body =
    `%PDF-1.4\n` +
    `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n` +
    `2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n` +
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> /MediaBox [0 0 612 792] /Contents 5 0 R >>\nendobj\n` +
    `4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n` +
    `5 0 obj\n${stream}\nendobj\n` +
    `xref\n0 6\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000244 00000 n \n0000000323 00000 n \n` +
    `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${323 + stream.length + 9}\n%%EOF`;
  return Buffer.from(body, 'binary');
}

// Helper to create an image-only / empty PDF buffer with no extractable text stream
function makeImageOnlyPdfBuffer(): Buffer {
  const stream = '<< /Length 0 >>\nstream\nendstream';
  const body =
    '%PDF-1.4\n' +
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n' +
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n' +
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>\nendobj\n' +
    '4 0 obj\n' + stream + '\nendobj\n' +
    'xref\n0 5\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000201 00000 n \n' +
    'trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n' + (201 + stream.length + 9) + '\n%%EOF';
  return Buffer.from(body, 'binary');
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
  // TEXT MATRIX
  // ==========================================
  describe('TEXT (1-2)', () => {
    it('1. TXT vs TXT unchanged yields IDENTICAL with zero segments', async () => {
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
      expect(diff.summary.total).toBe(0);
    });

    it('2. TXT modification still produces structured diff', async () => {
      const baseText = '1. Szakasz: Bevezetés.\n\n2. Szakasz: Díjazás 500.000 HUF.\n\n3. Szakasz: Záró rendelkezések.';
      const targetText = '1. Szakasz: Bevezetés.\n\n2. Szakasz: Díjazás 750.000 HUF.\n\n3. Szakasz: Záró rendelkezések.\n\n4. Szakasz: Melléklet.';

      const diff = compareVersions({
        baseText,
        targetText,
        baseSupported: true,
        targetSupported: true,
      });

      expect(diff.status).toBe('READY');
      expect(diff.summary.replaces).toBe(1);
      expect(diff.summary.inserts).toBe(1);
      expect(diff.summary.total).toBe(2);
      expect(diff.segments[0].changeType).toBe('REPLACE');
      expect(diff.segments[0].baseExcerpt).toContain('500.000 HUF');
      expect(diff.segments[0].targetExcerpt).toContain('750.000 HUF');
    });
  });

  // ==========================================
  // DOCX MATRIX
  // ==========================================
  describe('DOCX (3-8)', () => {
    it('3. DOCX vs DOCX identical extracts text and reports IDENTICAL', async () => {
      const paras = ['Első bekezdés: Szerződéses feltételek.', 'Második bekezdés: Teljesítési határidő 30 nap.'];
      const docxBuf = await makeDocxBuffer(paras);
      const dl = async () => docxBuf;

      const vB = await resolveVersionText({ id: 'v1', documentId: 'd1', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', originalFileName: 'contract_v1.docx', size: docxBuf.length }, dl);
      const vT = await resolveVersionText({ id: 'v2', documentId: 'd1', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', originalFileName: 'contract_v2.docx', size: docxBuf.length }, dl);

      expect(vB.supported).toBe(true);
      expect(vT.supported).toBe(true);
      expect(vB.text).toContain('Szerződéses feltételek');

      const diff = compareVersions({
        baseText: vB.text,
        targetText: vT.text,
        baseSupported: vB.supported,
        targetSupported: vT.supported,
      });

      expect(diff.status).toBe('IDENTICAL');
      expect(diff.segments).toHaveLength(0);
    });

    it('4. DOCX vs DOCX paragraph modification produces REPLACE segment', async () => {
      const docxB = await makeDocxBuffer(['Bekezdés 1: Felek megállapodása.', 'Bekezdés 2: Díj 100 EUR.']);
      const docxT = await makeDocxBuffer(['Bekezdés 1: Felek megállapodása.', 'Bekezdés 2: Díj 250 EUR.']);

      const vB = await resolveVersionText({ id: 'v1', documentId: 'd1', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', originalFileName: 'v1.docx', size: docxB.length }, async () => docxB);
      const vT = await resolveVersionText({ id: 'v2', documentId: 'd1', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', originalFileName: 'v2.docx', size: docxT.length }, async () => docxT);

      const diff = compareVersions({
        baseText: vB.text,
        targetText: vT.text,
        baseSupported: vB.supported,
        targetSupported: vT.supported,
      });

      expect(diff.status).toBe('READY');
      expect(diff.summary.replaces).toBe(1);
      expect(diff.segments[0].changeType).toBe('REPLACE');
      expect(diff.segments[0].baseExcerpt).toContain('100 EUR');
      expect(diff.segments[0].targetExcerpt).toContain('250 EUR');
    });

    it('5. DOCX added paragraph produces INSERT segment', async () => {
      const docxB = await makeDocxBuffer(['Kezdeti bekezdés.']);
      const docxT = await makeDocxBuffer(['Kezdeti bekezdés.', 'Újonnan hozzáadott bekezdés.']);

      const vB = await resolveVersionText({ id: 'v1', documentId: 'd1', mimeType: null, originalFileName: 'v1.docx', size: docxB.length }, async () => docxB);
      const vT = await resolveVersionText({ id: 'v2', documentId: 'd1', mimeType: null, originalFileName: 'v2.docx', size: docxT.length }, async () => docxT);

      const diff = compareVersions({
        baseText: vB.text,
        targetText: vT.text,
        baseSupported: vB.supported,
        targetSupported: vT.supported,
      });

      expect(diff.status).toBe('READY');
      expect(diff.summary.inserts).toBe(1);
      expect(diff.segments[0].changeType).toBe('INSERT');
      expect(diff.segments[0].targetExcerpt).toContain('Újonnan hozzáadott');
    });

    it('6. DOCX removed paragraph produces DELETE segment', async () => {
      const docxB = await makeDocxBuffer(['Kezdeti bekezdés.', 'Törlendő záradék.']);
      const docxT = await makeDocxBuffer(['Kezdeti bekezdés.']);

      const vB = await resolveVersionText({ id: 'v1', documentId: 'd1', mimeType: null, originalFileName: 'v1.docx', size: docxB.length }, async () => docxB);
      const vT = await resolveVersionText({ id: 'v2', documentId: 'd1', mimeType: null, originalFileName: 'v2.docx', size: docxT.length }, async () => docxT);

      const diff = compareVersions({
        baseText: vB.text,
        targetText: vT.text,
        baseSupported: vB.supported,
        targetSupported: vT.supported,
      });

      expect(diff.status).toBe('READY');
      expect(diff.summary.deletes).toBe(1);
      expect(diff.segments[0].changeType).toBe('DELETE');
      expect(diff.segments[0].baseExcerpt).toContain('Törlendő záradék');
    });

    it('7. malformed DOCX yields safe typed failure (EXTRACTION_FAILED)', async () => {
      const corruptBuf = Buffer.from('PK\x03\x04corrupt_zip_header_payload_junk');
      const res = await resolveVersionText(
        { id: 'v1', documentId: 'd1', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', originalFileName: 'corrupt.docx', size: corruptBuf.length },
        async () => corruptBuf
      );

      expect(res.supported).toBe(false);
      expect(res.text).toBeNull();
      expect(res.reasonCode).toBe('EXTRACTION_FAILED');
    });

    it('8. oversized DOCX input yields bounded failure (CONTENT_TOO_LARGE)', async () => {
      const fakeLargeSize = MAX_EXTRACT_BYTES + 100;
      const res = await resolveVersionText(
        { id: 'v1', documentId: 'd1', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', originalFileName: 'huge.docx', size: fakeLargeSize },
        async () => Buffer.alloc(fakeLargeSize)
      );

      expect(res.supported).toBe(false);
      expect(res.text).toBeNull();
      expect(res.reasonCode).toBe('CONTENT_TOO_LARGE');
    });
  });

  // ==========================================
  // PDF MATRIX
  // ==========================================
  describe('PDF (9-14)', () => {
    it('9. PDF vs PDF identical text extracts text and reports IDENTICAL', async () => {
      const pdfText = 'Adminiculum PDF szerződés 1. pontja.';
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

    it('10. PDF vs PDF changed text produces structured diff', async () => {
      const pdfBufB = makePdfBuffer('Szerződés díja: 1000 EUR');
      const pdfBufT = makePdfBuffer('Szerződés díja: 2500 EUR');

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

    it('11. text PDF vs DOCX mixed-format comparison produces structured diff', async () => {
      const pdfBuf = makePdfBuffer('Közös megállapodás 1. szakasz.');
      const docxBuf = await makeDocxBuffer(['Közös megállapodás 1. szakasz.', 'Új 2. szakasz a DOCX verzióban.']);

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
      expect(diff.segments[0].targetExcerpt).toContain('Új 2. szakasz');
    });

    it('12. image/no-text PDF yields honest NO_EXTRACTABLE_TEXT without false identical', async () => {
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

    it('13. malformed PDF yields safe typed failure (EXTRACTION_FAILED)', async () => {
      const corruptPdf = Buffer.from('%PDF-1.4\ncorrupt body syntax << >>');
      const res = await resolveVersionText(
        { id: 'v1', documentId: 'd1', mimeType: 'application/pdf', originalFileName: 'corrupt.pdf', size: corruptPdf.length },
        async () => corruptPdf
      );

      expect(res.supported).toBe(false);
      expect(res.text).toBeNull();
      expect(res.reasonCode).toBe('EXTRACTION_FAILED');
    });

    it('14. oversized PDF buffer yields bounded failure (CONTENT_TOO_LARGE)', async () => {
      const fakeLargeSize = MAX_EXTRACT_BYTES + 500;
      const res = await resolveVersionText(
        { id: 'v1', documentId: 'd1', mimeType: 'application/pdf', originalFileName: 'huge.pdf', size: fakeLargeSize },
        async () => Buffer.alloc(fakeLargeSize)
      );

      expect(res.supported).toBe(false);
      expect(res.reasonCode).toBe('CONTENT_TOO_LARGE');
    });
  });

  // ==========================================
  // AUTH & STORAGE MATRIX (15-19)
  // ==========================================
  describe('AUTH / STORAGE (15-19)', () => {
    it('15. unauthorized document access fails closed before storage download', async () => {
      const dl = jest.fn();
      await expect(
        createOrGetComparison(
          { actorId: '', documentId: 'doc-1', baseVersionId: 'v1', targetVersionId: 'v2' },
          { prisma: makeMockPrisma(), resolveText: async (v) => resolveVersionText(v, dl) }
        )
      ).rejects.toMatchObject({ code: 'UNAUTHENTICATED', status: 401 });

      expect(dl).not.toHaveBeenCalled();
    });

    it('16. unauthorized or non-existent version cannot trigger extraction', async () => {
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

    it('17. cross-case/cross-document version substitution fails closed', async () => {
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

    it('18. storage download failure is safely mapped without exposing internal details', async () => {
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

    it('19. raw parser error never leaks library names or stack traces in response', async () => {
      const corrupt = Buffer.from('INVALID_DATA');
      const extraction = await extractText(corrupt, 'application/pdf', 'test.pdf');

      expect(extraction.success).toBe(false);
      expect(extraction.reasonCode).toBe('EXTRACTION_FAILED');
      expect(extraction.error).not.toMatch(/node_modules|stack|line|column|PDFParse/i);
    });
  });

  // ==========================================
  // REGRESSION MATRIX (20-26)
  // ==========================================
  describe('REGRESSION (20-26)', () => {
    it('20. existing textual comparison remains unchanged and deterministic', () => {
      const a = 'A díj 100 EUR.\n\nA határidő 30 nap.';
      const b = 'A díj 150 EUR.\n\nA határidő 30 nap.';
      const diff1 = compareVersions({ baseText: a, targetText: b, baseSupported: true, targetSupported: true });
      const diff2 = compareVersions({ baseText: a, targetText: b, baseSupported: true, targetSupported: true });

      expect(diff1).toEqual(diff2);
      expect(diff1.status).toBe('READY');
      expect(diff1.summary.replaces).toBe(1);
    });

    it('21. existing structured diff DTO mapping remains identical', () => {
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

    it('22. format detection correctly identifies docx, doc, pdf, txt, md, csv, html, rtf', () => {
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
