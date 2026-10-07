import { getOrganizationalGrow } from '../src/modules/client-workspace/orgGrowService';

jest.mock('../src/prisma/prisma.service', () => ({ prisma: {} }));
jest.mock('../src/modules/company-observatory/intake', () => ({
  listPortalSurveyIntakes: jest.fn(async () => ({ items: [] })),
}));

function fixture() {
  const initiatives = ['initiative-a', 'initiative-b'].map((id) => ({
    id, title: 'Same title', status: 'ACTIVE', targetState: null, targetAt: null,
    caseId: null, milestones: [],
  }));
  const outcomes = [
    { id: 'measured-a', basis: 'MEASURED', developmentInitiativeId: 'initiative-a' },
    { id: 'calculated-b', basis: 'CALCULATED', developmentInitiativeId: 'initiative-b' },
    { id: 'estimated-a', basis: 'ESTIMATED', developmentInitiativeId: 'initiative-a' },
    { id: 'unlinked', basis: 'MEASURED', developmentInitiativeId: null },
  ].map((outcome) => ({
    ...outcome,
    developmentInitiative: outcome.developmentInitiativeId ? { title: 'Same title' } : null,
    businessProcess: { name: 'Customer process' },
    metricsSummary: { internalRationale: 'not customer data' },
    opportunityId: 'internal-opportunity',
    beforeSnapshotId: 'internal-before',
    afterSnapshotId: 'internal-after',
  }));
  const db = {
    clientPortalWorkspace: { findFirst: jest.fn(async () => ({ id: 'workspace', clientId: 'client', mode: 'ORGANIZATION' })) },
    clientPortalWorkspaceMembership: { findFirst: jest.fn(async () => ({ id: 'membership' })) },
    client: { findUnique: jest.fn(async () => ({ name: 'Customer' })) },
    businessProcess: { findMany: jest.fn(async () => []) },
    developmentInitiative: { findMany: jest.fn(async () => initiatives) },
    outcomeMeasurement: { findMany: jest.fn(async () => outcomes) },
    clientImprovementOpportunityPublication: { findMany: jest.fn() },
    improvementOpportunity: { findMany: jest.fn(() => { throw new Error('Raw opportunities must not be read'); }) },
  };
  db.clientImprovementOpportunityPublication.findMany.mockResolvedValue([]);
  const load = () => getOrganizationalGrow('identity', 'workspace', db as unknown as NonNullable<Parameters<typeof getOrganizationalGrow>[2]>);
  return { db, load };
}

test('customer outcomes project canonical initiative identity despite duplicate titles', async () => {
  const { db, load } = fixture();
  const dto = await load();
  const outcomes = [...dto.outcomes.measured, ...dto.outcomes.calculatedOrEstimated];

  expect(dto.initiatives.map((item) => item.title)).toEqual(['Same title', 'Same title']);
  expect(outcomes.filter((item) => item.initiativeId === dto.initiatives[0].id).map((item) => item.id))
    .toEqual(['measured-a', 'estimated-a']);
  expect(outcomes.filter((item) => item.initiativeId === dto.initiatives[1].id).map((item) => item.id))
    .toEqual(['calculated-b']);
  expect(outcomes.find((item) => item.id === 'unlinked')).toMatchObject({ initiativeId: null, initiativeTitle: null });
  expect(dto.outcomes.measured.map((item) => item.basis)).toEqual(['MEASURED', 'MEASURED']);
  expect(dto.outcomes.calculatedOrEstimated.map((item) => item.basis)).toEqual(['CALCULATED', 'ESTIMATED']);
  for (const outcome of outcomes) {
    expect(Object.keys(outcome).sort()).toEqual(['basis', 'basisLabel', 'id', 'initiativeId', 'initiativeTitle', 'processName']);
  }
  expect(db.outcomeMeasurement.findMany).toHaveBeenCalledWith(expect.objectContaining({
    where: { clientId: 'client', synthetic: false, basis: { in: ['MEASURED', 'CALCULATED', 'ESTIMATED'] } },
  }));
});

test('identity projection preserves the scoped current customer publication boundary', async () => {
  const { db, load } = fixture();
  const publishedAt = new Date('2026-01-01T00:00:00.000Z');
  const revision = {
    id: 'revision', publicationId: 'publication', clientSafeTitle: 'Published title',
    clientSafeSummary: 'Approved customer summary', clientSafeDirection: 'Approved direction',
    internalRationale: 'not customer data',
  };
  const publication = { id: 'publication', currentRevisionId: 'revision', publishedAt, revisions: [revision] };
  db.clientImprovementOpportunityPublication.findMany.mockResolvedValue([
    publication,
    { ...publication, currentRevisionId: null },
    { ...publication, publishedAt: null },
    { ...publication, currentRevisionId: 'missing-revision' },
    { ...publication, revisions: [{ ...revision, publicationId: 'other-publication' }] },
    { ...publication, revisions: [{ ...revision, clientSafeSummary: ' ' }] },
    { ...publication, revisions: [{ ...revision, clientSafeSummary: 'internalRationale must stay private' }] },
  ]);

  const dto = await load();
  expect(db.clientImprovementOpportunityPublication.findMany).toHaveBeenCalledWith(expect.objectContaining({
    where: {
      workspaceId: 'workspace', clientId: 'client', status: 'PUBLISHED',
      revokedAt: null, currentRevisionId: { not: null },
    },
  }));
  expect(dto.opportunities).toEqual([{
    publicationId: 'publication', title: 'Published title', summary: 'Approved customer summary',
    direction: 'Approved direction', publishedAt: publishedAt.toISOString(),
  }]);
  expect(db.improvementOpportunity.findMany).not.toHaveBeenCalled();
  expect(JSON.stringify(dto)).not.toMatch(/internalRationale|metricsSummary|internal-opportunity|internal-before|internal-after/);
});

test('without published snapshots raw opportunities remain internal by default', async () => {
  const { db, load } = fixture();
  expect((await load()).opportunities).toEqual([]);
  expect(db.improvementOpportunity.findMany).not.toHaveBeenCalled();
});
