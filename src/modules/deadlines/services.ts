import { prisma } from '../../prisma/prisma.service';
import textExtractionService from '../textExtraction/services';
import {
  addBusinessDaysHU,
  addCalendarDays,
} from './calendarHU';
import {
  DeadlineRecord,
  ExtractDeadlinesInput,
  ExtractedDeadlineCandidate,
} from './types';

const BUSINESS_DAY_REGEX = /(\d{1,3})\s*(munkanap|munkanapon)\s*(belül|határidő)/gi;
const CALENDAR_DAY_REGEX = /(\d{1,3})\s*nap(on)?\s*(belül|határidő|napos)/gi;

function parseCandidates(rawText: string): ExtractedDeadlineCandidate[] {
  const out: ExtractedDeadlineCandidate[] = [];

  for (const match of rawText.matchAll(BUSINESS_DAY_REGEX)) {
    const days = Number(match[1]);
    if (!Number.isFinite(days)) continue;
    out.push({
      extractedPhrase: match[0],
      durationDays: days,
      businessDays: true,
      confidence: 0.92,
      ruleSet: 'UNKNOWN',
    });
  }

  for (const match of rawText.matchAll(CALENDAR_DAY_REGEX)) {
    const days = Number(match[1]);
    if (!Number.isFinite(days)) continue;
    out.push({
      extractedPhrase: match[0],
      durationDays: days,
      businessDays: false,
      confidence: 0.88,
      ruleSet: 'UNKNOWN',
    });
  }

  return out;
}

class DeadlinesService {
  async extract(input: ExtractDeadlinesInput): Promise<DeadlineRecord[]> {
    const document = await prisma.document.findUnique({
      where: { id: input.documentId },
      select: {
        id: true,
        caseId: true,
        spItemId: true,
        mimeType: true,
        createdAt: true,
      },
    });

    if (!document) {
      throw new Error('Document not found');
    }
    if (document.caseId !== input.caseId) {
      throw new Error('Document does not belong to case');
    }
    if (!document.spItemId) {
      throw new Error('Document has no SharePoint item id');
    }

    const extracted = await textExtractionService.extractTextFromSharePointItem(
      document.spItemId,
      document.mimeType || undefined,
    );

    const candidates = parseCandidates(extracted.rawText || '');
    if (candidates.length === 0) {
      return [];
    }

    const hasServedAt = Boolean(input.servedAt);
    const triggerDate = hasServedAt
      ? new Date(input.servedAt as string)
      : new Date(document.createdAt);

    const createdRows: DeadlineRecord[] = [];
    for (const c of candidates) {
      const dueDate = c.businessDays
        ? addBusinessDaysHU(triggerDate, c.durationDays)
        : addCalendarDays(triggerDate, c.durationDays);

      const row = await (prisma as any).deadline.create({
        data: {
          caseId: input.caseId,
          documentId: input.documentId,
          extractedPhrase: c.extractedPhrase,
          triggerDate,
          durationDays: c.durationDays,
          businessDays: c.businessDays,
          dueDate,
          ruleSet: c.ruleSet,
          confidence: hasServedAt ? c.confidence : Math.max(0.5, c.confidence - 0.2),
          status: 'OPEN',
        },
      });

      createdRows.push({
        id: row.id,
        caseId: row.caseId,
        documentId: row.documentId,
        extractedPhrase: row.extractedPhrase,
        triggerDate: row.triggerDate,
        durationDays: row.durationDays,
        businessDays: row.businessDays,
        dueDate: row.dueDate,
        ruleSet: row.ruleSet,
        confidence: row.confidence,
        status: row.status,
        createdAt: row.createdAt,
      });
    }

    return createdRows;
  }

  async listCaseDeadlines(caseId: string): Promise<DeadlineRecord[]> {
    const rows = await (prisma as any).deadline.findMany({
      where: { caseId },
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
    });

    return rows.map((row: any) => ({
      id: row.id,
      caseId: row.caseId,
      documentId: row.documentId,
      extractedPhrase: row.extractedPhrase,
      triggerDate: row.triggerDate,
      durationDays: row.durationDays,
      businessDays: row.businessDays,
      dueDate: row.dueDate,
      ruleSet: row.ruleSet,
      confidence: row.confidence,
      status: row.status,
      createdAt: row.createdAt,
    }));
  }
}

export default new DeadlinesService();

