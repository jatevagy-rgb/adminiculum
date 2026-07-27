import { linkSegmentAnnotation } from '../src/modules/documents/comparison/comparisonReadService';

function makePrisma(annotation: any) {
  return {
    documentChangeSegment: {
      findFirst: jest.fn(async () => ({ id: 'seg-1', comparisonId: 'cmp-1', revision: 0 })),
      update: jest.fn(async ({ data }: any) => ({ id: 'seg-1', linkedAnnotationId: data.linkedAnnotationId, revision: 1 })),
    },
    documentComparison: {
      findUnique: jest.fn(async () => ({
        id: 'cmp-1',
        documentId: 'doc-1',
        baseVersionId: 'ver-base',
        targetVersionId: 'ver-target',
      })),
    },
    documentAnnotation: {
      findUnique: jest.fn(async () => annotation),
    },
  };
}

describe('comparison read service annotation linking', () => {
  it('links annotations from either compared version', async () => {
    const prisma = makePrisma({ id: 'ann-1', documentId: 'doc-1', documentVersionId: 'ver-target' });

    const result = await linkSegmentAnnotation('cmp-1', 'seg-1', 'ann-1', prisma);

    expect(result.linkedAnnotationId).toBe('ann-1');
    expect(prisma.documentChangeSegment.update).toHaveBeenCalledWith({
      where: { id: 'seg-1' },
      data: { linkedAnnotationId: 'ann-1', revision: { increment: 1 } },
    });
  });

  it('rejects cross-document annotation links', async () => {
    const prisma = makePrisma({ id: 'ann-cross', documentId: 'doc-2', documentVersionId: 'ver-target' });

    await expect(linkSegmentAnnotation('cmp-1', 'seg-1', 'ann-cross', prisma)).rejects.toMatchObject({
      code: 'ANNOTATION_NOT_IN_COMPARISON',
      status: 400,
    });
    expect(prisma.documentChangeSegment.update).not.toHaveBeenCalled();
  });

  it('rejects same-document annotations from versions outside the compared pair', async () => {
    const prisma = makePrisma({ id: 'ann-other-version', documentId: 'doc-1', documentVersionId: 'ver-other' });

    await expect(linkSegmentAnnotation('cmp-1', 'seg-1', 'ann-other-version', prisma)).rejects.toMatchObject({
      code: 'ANNOTATION_NOT_IN_COMPARISON',
      status: 400,
    });
    expect(prisma.documentChangeSegment.update).not.toHaveBeenCalled();
  });
});
