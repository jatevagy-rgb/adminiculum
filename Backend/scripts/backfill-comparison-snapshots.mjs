import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function normalizeEditBlocks(blocks) {
  return blocks
    .map((block, index) => {
      const title = String(block?.title || `Záradék ${index + 1}`).trim();
      const body = String(block?.body || '').trim();
      const id = String(block?.id || `block-${index + 1}`).trim();
      const sourceClauseId = block?.sourceClauseId ? String(block.sourceClauseId) : null;
      const orderIndex = Number.isFinite(Number(block?.orderIndex))
        ? Number(block.orderIndex)
        : index;

      return {
        id,
        title,
        body,
        orderIndex,
        sourceClauseId,
      };
    })
    .filter((block) => block.body.length > 0 || block.title.length > 0)
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map((block, index) => ({ ...block, orderIndex: index }));
}

function deriveBlocksFromAssembledText(assembledText) {
  const normalized = String(assembledText || '')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (!normalized) return [];

  const chunks = normalized
    .split(/\n\s*\n/)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0)
    .slice(0, 80);

  return chunks.map((chunk, index) => {
    const lines = chunk.split('\n').map((line) => line.trim()).filter(Boolean);
    const firstLine = lines[0] || '';
    const numberedTitle = firstLine.match(/^\d+[\.)]\s+(.+)$/);
    const title = numberedTitle?.[1]?.trim() || `Záradék ${index + 1}`;
    const body = numberedTitle
      ? lines.slice(1).join('\n').trim()
      : lines.join('\n').trim();

    return {
      id: `parsed-${index + 1}`,
      title,
      body: body || chunk,
      orderIndex: index,
      sourceClauseId: null,
    };
  });
}

function getComparableContractText(templateData) {
  const source = templateData && typeof templateData === 'object' ? templateData : {};
  const value = [
    source.assembled_contract_body,
    source.assembledText,
    source.contract_body,
  ].find((item) => typeof item === 'string' && item.trim().length > 0);

  return typeof value === 'string' ? value : '';
}

function buildSnapshot({ blocks, assembledText, sourceMode, sourceDocumentId, generatedAt }) {
  const normalizedBlocks = normalizeEditBlocks(Array.isArray(blocks) ? blocks : []);
  const flattenedText = String(assembledText || '').trim() || normalizedBlocks
    .map((block, index) => `${index + 1}. ${block.title}\n${block.body}`.trim())
    .join('\n\n')
    .trim();

  return {
    sourceMode,
    sourceDocumentId: sourceDocumentId || null,
    generatedAt: generatedAt || new Date().toISOString(),
    blockCount: normalizedBlocks.length,
    assembledText: flattenedText,
    blocks: normalizedBlocks,
  };
}

async function main() {
  const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
  const dryRun = process.argv.includes('--dry-run');
  const limit = limitArg ? Number(limitArg.split('=')[1]) : 200;

  const candidates = await prisma.contractGeneration.findMany({
    where: {
      template: { category: 'ADASVETEL' },
    },
    include: {
      template: { select: { category: true } },
    },
    orderBy: { generatedAt: 'asc' },
    take: Number.isFinite(limit) && limit > 0 ? limit : 200,
  });

  let considered = 0;
  let updated = 0;
  let skipped = 0;

  for (const generation of candidates) {
    if (generation.comparisonSnapshot) {
      skipped += 1;
      continue;
    }

    considered += 1;
    const templateData = generation.templateData || {};
    const comparableText = getComparableContractText(templateData);
    if (!comparableText) {
      skipped += 1;
      continue;
    }

    const blocks = deriveBlocksFromAssembledText(comparableText);
    const snapshot = buildSnapshot({
      blocks,
      assembledText: comparableText,
      sourceMode: 'backfill_text_split',
      sourceDocumentId: generation.parentRevisionId || generation.id,
      generatedAt: new Date().toISOString(),
    });

    if (!snapshot.blocks.length) {
      skipped += 1;
      continue;
    }

    if (!dryRun) {
      await prisma.contractGeneration.update({
        where: { id: generation.id },
        data: { comparisonSnapshot: snapshot },
      });
    }

    updated += 1;
  }

  console.log('[backfill-comparison-snapshots] finished', {
    dryRun,
    considered,
    updated,
    skipped,
    limit,
  });
}

main()
  .catch((error) => {
    console.error('[backfill-comparison-snapshots] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

