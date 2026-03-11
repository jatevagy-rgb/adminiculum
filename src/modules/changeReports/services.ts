import { prisma } from '../../prisma/prisma.service';
import { driveService } from '../sharepoint';
import textExtractionService from '../textExtraction/services';
import {
  ChangeEntry,
  ChangeImpact,
  GenerateChangeReportInput,
  StoredChangeReport,
} from './types';

function truncateSnippet(input: string, max = 500): string {
  const normalized = String(input || '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 3)}...`;
}

function parseNumericNearKeywords(text: string, keywords: string[]): number | null {
  const lower = text.toLowerCase();
  const foundKeyword = keywords.some((k) => lower.includes(k));
  if (!foundKeyword) return null;

  const matches = [...lower.matchAll(/(\d+(?:[\.,]\d+)?)(?:\s*%|\s*percent)?/g)];
  if (!matches.length) return null;

  const parsed = matches
    .map((m) => Number(String(m[1]).replace(',', '.')))
    .filter((n) => Number.isFinite(n));

  if (!parsed.length) return null;
  return Math.max(...parsed);
}

function detectTags(beforeText: string, afterText: string): string[] {
  const txt = `${beforeText} ${afterText}`.toLowerCase();
  const tags: string[] = [];

  if (/(kötbér|kotber|penalty)/.test(txt)) tags.push('PENALTY');
  if (/(felelősség|felelosseg|liability)/.test(txt)) tags.push('LIABILITY');
  if (/(joghatóság|joghatosag|jurisdiction|governing law)/.test(txt)) tags.push('JURISDICTION');
  if (/(bankgarancia|óvadék|ovadek|zálog|zalog|biztosíték|biztositek)/.test(txt)) tags.push('SECURITY');

  if (tags.length === 0) tags.push('GENERAL');
  return tags;
}

function calculateImpact(tags: string[]): ChangeImpact {
  if (tags.includes('JURISDICTION') || tags.includes('SECURITY')) return 'HIGH';
  if (tags.includes('LIABILITY') || tags.includes('PENALTY')) return 'MEDIUM';
  return 'LOW';
}

function detectRedFlags(changes: ChangeEntry[]): string[] {
  const flags = new Set<string>();

  for (const ch of changes) {
    const before = ch.beforeSnippet || '';
    const after = ch.afterSnippet || '';
    const beforeLower = before.toLowerCase();
    const afterLower = after.toLowerCase();

    const penaltyBefore = parseNumericNearKeywords(before, ['kötbér', 'kotber', 'penalty']);
    const penaltyAfter = parseNumericNearKeywords(after, ['kötbér', 'kotber', 'penalty']);
    if (penaltyBefore !== null && penaltyAfter !== null && penaltyAfter > penaltyBefore) {
      flags.add('PENALTY_INCREASED:MED');
    }

    const liabilityBefore = parseNumericNearKeywords(before, ['felelősség', 'felelosseg', 'liability cap']);
    const liabilityAfter = parseNumericNearKeywords(after, ['felelősség', 'felelosseg', 'liability cap']);
    if (liabilityBefore !== null && liabilityAfter !== null && liabilityAfter > liabilityBefore) {
      flags.add('LIABILITY_WIDENED:HIGH');
    }

    const jurisdictionChanged =
      /(joghatóság|joghatosag|jurisdiction|governing law)/.test(beforeLower) &&
      /(joghatóság|joghatosag|jurisdiction|governing law)/.test(afterLower) &&
      beforeLower !== afterLower;
    if (jurisdictionChanged) {
      flags.add('JURISDICTION_CHANGED:HIGH');
    }

    const securityKeywords = /(bankgarancia|óvadék|ovadek|zálog|zalog|biztosíték|biztositek)/;
    const securityRemoved = securityKeywords.test(beforeLower) && !securityKeywords.test(afterLower);
    if (securityRemoved) {
      flags.add('SECURITY_REMOVED:HIGH');
    }
  }

  return [...flags];
}

class ChangeReportsService {
  async generate(input: GenerateChangeReportInput): Promise<StoredChangeReport> {
    const document = await prisma.document.findUnique({ where: { id: input.documentId } });
    if (!document) {
      throw new Error('Document not found');
    }

    const [fromVersion, toVersion] = await Promise.all([
      prisma.documentVersion.findUnique({
        where: {
          documentId_version: {
            documentId: input.documentId,
            version: input.fromVersionInt,
          },
        },
      }),
      prisma.documentVersion.findUnique({
        where: {
          documentId_version: {
            documentId: input.documentId,
            version: input.toVersionInt,
          },
        },
      }),
    ]);

    if (!fromVersion || !toVersion) {
      throw new Error('Source or target DocumentVersion not found');
    }
    if (!fromVersion.spVersionId || !toVersion.spVersionId) {
      throw new Error('DocumentVersion is missing SharePoint version ID');
    }
    if (!document.spItemId) {
      throw new Error('Document is missing SharePoint item ID');
    }

    const [fromBuffer, toBuffer] = await Promise.all([
      driveService.downloadDocumentVersion(document.spItemId, fromVersion.spVersionId),
      driveService.downloadDocumentVersion(document.spItemId, toVersion.spVersionId),
    ]);

    if (!fromBuffer || !toBuffer) {
      throw new Error('Could not download one or both SharePoint versions');
    }

    const [fromText, toText] = await Promise.all([
      textExtractionService.extractTextFromBuffer(fromBuffer, document.mimeType || undefined),
      textExtractionService.extractTextFromBuffer(toBuffer, document.mimeType || undefined),
    ]);

    const toMap = new Map(toText.sections.map((s) => [s.key, s]));
    const changes: ChangeEntry[] = [];

    for (const beforeSection of fromText.sections) {
      const afterSection = toMap.get(beforeSection.key);
      if (!afterSection) continue;

      const beforeBody = String(beforeSection.text || '').trim();
      const afterBody = String(afterSection.text || '').trim();
      if (!beforeBody || !afterBody) continue;
      if (beforeBody === afterBody) continue;

      const tags = detectTags(beforeBody, afterBody);
      changes.push({
        sectionKey: beforeSection.key,
        beforeSnippet: truncateSnippet(beforeBody),
        afterSnippet: truncateSnippet(afterBody),
        tags,
        impact: calculateImpact(tags),
      });
    }

    const redFlags = detectRedFlags(changes);

    const summaryLines = [
      `# Change Report`,
      '',
      `- Document: ${input.documentId}`,
      `- From version: ${input.fromVersionInt}`,
      `- To version: ${input.toVersionInt}`,
      `- Changes detected: ${changes.length}`,
      `- Red flags: ${redFlags.length}`,
    ];

    const created = await (prisma as any).changeReport.create({
      data: {
        documentId: input.documentId,
        fromVersionInt: input.fromVersionInt,
        toVersionInt: input.toVersionInt,
        summaryMarkdown: summaryLines.join('\n'),
        changesJson: changes as any,
        redFlags,
        createdById: input.createdById,
      },
    });

    return {
      id: created.id,
      documentId: created.documentId,
      fromVersionInt: created.fromVersionInt,
      toVersionInt: created.toVersionInt,
      summaryMarkdown: created.summaryMarkdown,
      changesJson: (created.changesJson as any[]) as ChangeEntry[],
      redFlags: created.redFlags,
      createdById: created.createdById,
      createdAt: created.createdAt,
    };
  }

  async getById(id: string): Promise<StoredChangeReport | null> {
    const row = await (prisma as any).changeReport.findUnique({ where: { id } });
    if (!row) return null;

    return {
      id: row.id,
      documentId: row.documentId,
      fromVersionInt: row.fromVersionInt,
      toVersionInt: row.toVersionInt,
      summaryMarkdown: row.summaryMarkdown,
      changesJson: (row.changesJson as any[]) as ChangeEntry[],
      redFlags: row.redFlags,
      createdById: row.createdById,
      createdAt: row.createdAt,
    };
  }
}

export default new ChangeReportsService();

