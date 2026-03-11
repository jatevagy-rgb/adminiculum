import { prisma } from '../../prisma/prisma.service';
import textExtractionService from '../textExtraction/services';
import {
  ClassificationDecision,
  DocumentClassificationRecord,
} from './types';

const CONTRACT_KEYWORDS = ['szerződés', 'megállapodás', 'kötbér'];
const COURT_KEYWORDS = ['végzés', 'hiánypótlás', 'fellebbez'];
const INVOICE_KEYWORDS = ['számla', 'invoice'];

function countKeywordHits(haystack: string, keywords: string[]): number {
  return keywords.reduce((sum, kw) => (haystack.includes(kw) ? sum + 1 : sum), 0);
}

function isEmailLike(rawText: string): boolean {
  const hasFrom = /(^|\n)\s*from\s*:/i.test(rawText);
  const hasSubject = /(^|\n)\s*subject\s*:/i.test(rawText);
  return hasFrom && hasSubject;
}

function decideCategory(fileName: string, rawText: string): ClassificationDecision {
  const name = String(fileName || '').toLowerCase();
  const text = String(rawText || '').toLowerCase();
  const haystack = `${name}\n${text}`;

  const contractHits = countKeywordHits(haystack, CONTRACT_KEYWORDS);
  const courtHits = countKeywordHits(haystack, COURT_KEYWORDS);
  const invoiceHits = countKeywordHits(haystack, INVOICE_KEYWORDS);
  const emailLike = isEmailLike(rawText) || (haystack.includes('from:') && haystack.includes('subject:'));

  const candidates: ClassificationDecision[] = [];

  if (contractHits > 0) {
    candidates.push({
      category: 'CONTRACT',
      tags: [],
      confidence: Math.min(0.96, 0.82 + contractHits * 0.05),
    });
  }

  if (courtHits > 0) {
    candidates.push({
      category: 'COURT_DOCUMENT',
      tags: ['deadline_likely'],
      confidence: Math.min(0.98, 0.86 + courtHits * 0.04),
    });
  }

  if (emailLike) {
    candidates.push({
      category: 'CORRESPONDENCE',
      tags: [],
      confidence: 0.84,
    });
  }

  if (invoiceHits > 0) {
    candidates.push({
      category: 'INVOICE',
      tags: [],
      confidence: Math.min(0.96, 0.88 + invoiceHits * 0.03),
    });
  }

  if (candidates.length === 0) {
    return {
      category: 'OTHER',
      tags: [],
      confidence: 0.55,
    };
  }

  return candidates.sort((a, b) => b.confidence - a.confidence)[0];
}

function mapRecord(row: any): DocumentClassificationRecord {
  return {
    id: row.id,
    documentId: row.documentId,
    category: row.category,
    tags: row.tags,
    confidence: row.confidence,
    createdAt: row.createdAt,
  };
}

class DocumentClassificationService {
  async classifyDocument(documentId: string): Promise<DocumentClassificationRecord> {
    const document = await prisma.document.findUnique({
      where: { id: documentId },
      select: {
        id: true,
        fileName: true,
        name: true,
        spItemId: true,
        mimeType: true,
      },
    });

    if (!document) {
      throw new Error('Document not found');
    }

    let rawText = '';
    if (document.spItemId) {
      const extracted = await textExtractionService.extractTextFromSharePointItem(
        document.spItemId,
        document.mimeType || undefined,
      );
      rawText = extracted.rawText || '';
    }

    const decision = decideCategory(document.fileName || document.name || '', rawText);

    const row = await (prisma as any).documentClassification.create({
      data: {
        documentId: document.id,
        category: decision.category,
        tags: decision.tags,
        confidence: decision.confidence,
      },
    });

    return mapRecord(row);
  }

  async getLatestForDocument(documentId: string): Promise<DocumentClassificationRecord | null> {
    const row = await (prisma as any).documentClassification.findFirst({
      where: { documentId },
      orderBy: { createdAt: 'desc' },
    });

    if (!row) return null;
    return mapRecord(row);
  }
}

export default new DocumentClassificationService();

