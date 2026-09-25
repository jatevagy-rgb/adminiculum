/**
 * PostgreSQL-backed concurrency + completion-cycle integration tests for
 * modification proposals.
 *
 * Guarded exactly like the repository's other PostgreSQL suites: it runs only
 * when the dedicated disposable database URL is provided, and skips cleanly
 * otherwise (so the default local/unit run is unaffected).
 */
const databaseUrl = process.env.DOCUMENT_MODIFICATION_PROPOSAL_TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

const ids = {
  reader: 'f1000000-0000-4000-8000-000000000001',
  lawyer: 'f1000000-0000-4000-8000-000000000002',
  client: 'f2000000-0000-4000-8000-000000000001',
  case: 'f3000000-0000-4000-8000-000000000001',
  document: 'f4000000-0000-4000-8000-000000000001',
  version: 'f5000000-0000-4000-8000-000000000001',
};

describeWithDatabase('DocumentModificationProposal PostgreSQL concurrency invariants', () => {
  let prisma: any;
  let service: typeof import('../src/modules/documents/modificationProposals.service');

  beforeAll(async () => {
    const parsed = new URL(databaseUrl as string);
    expect(['127.0.0.1', 'localhost', '::1']).toContain(parsed.hostname);

    process.env.DATABASE_URL = databaseUrl as string;
    const prismaModule = await import('../src/prisma/prisma.service');
    prisma = prismaModule.prisma;
    await prisma.$connect();
    service = await import('../src/modules/documents/modificationProposals.service');

    await prisma.user.createMany({
      data: [
        { id: ids.reader, email: 'reader@proposal.invalid', name: 'Reader', role: 'TRAINEE', status: 'ACTIVE', isActive: true, skills: [] },
        { id: ids.lawyer, email: 'lawyer@proposal.invalid', name: 'Lawyer', role: 'LAWYER', status: 'ACTIVE', isActive: true, skills: [] },
      ],
    });
    await prisma.client.create({ data: { id: ids.client, name: 'Proposal Client' } });
    await prisma.case.create({
      data: {
        id: ids.case,
        caseNumber: 'PROP-001',
        title: 'Proposal Case',
        caseType: 'CONTRACT_REVIEW',
        clientId: ids.client,
        createdById: ids.lawyer,
        assignedLawyerId: ids.lawyer,
      },
    });
    await prisma.document.create({
      data: {
        id: ids.document,
        name: 'Proposal document',
        fileName: 'proposal.txt',
        category: 'OTHER',
        caseId: ids.case,
        clientId: ids.client,
        responsibleId: ids.lawyer,
        reviewerId: ids.lawyer,
      },
    });
    await prisma.documentVersion.create({
      data: {
        id: ids.version,
        documentId: ids.document,
        version: 1,
        name: 'proposal.txt',
        originalFileName: 'proposal.txt',
        isCurrent: true,
        uploadedById: ids.lawyer,
      },
    });
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.documentModificationProposalEvent.deleteMany({});
    await prisma.documentModificationProposal.deleteMany({ where: { documentId: ids.document } });
    await prisma.notification.deleteMany({ where: { userId: { in: [ids.reader, ids.lawyer] } } });
    await prisma.timelineEvent.deleteMany({ where: { documentId: ids.document } });
    await prisma.documentVersion.deleteMany({ where: { documentId: ids.document } });
    await prisma.document.deleteMany({ where: { id: ids.document } });
    await prisma.case.deleteMany({ where: { id: ids.case } });
    await prisma.client.deleteMany({ where: { id: ids.client } });
    await prisma.user.deleteMany({ where: { id: { in: [ids.reader, ids.lawyer] } } });
    await prisma.$disconnect();
  });

  async function resetCycle() {
    await prisma.documentModificationProposalEvent.deleteMany({});
    await prisma.documentModificationProposal.deleteMany({ where: { documentId: ids.document } });
    await prisma.timelineEvent.deleteMany({ where: { documentId: ids.document } });
    await prisma.notification.deleteMany({ where: { userId: { in: [ids.reader, ids.lawyer] } } });
    await prisma.documentVersion.update({
      where: { id: ids.version },
      data: { correctionNotifiedAt: null },
    });
  }

  async function createProposal(suffix: string) {
    return service.createModificationProposal(ids.document, ids.version, ids.reader, {
      selectedText: `select-${suffix}`,
      startOffset: 0,
      endOffset: 8,
      proposedText: `proposed-${suffix}`,
      idempotencyKey: `key-${suffix}`,
    });
  }

  async function timelineCount() {
    return prisma.timelineEvent.count({
      where: { documentId: ids.document, type: 'DOCUMENT_READY_FOR_CORRECTION' },
    });
  }

  async function notificationCount() {
    return prisma.notification.count({
      where: { userId: ids.lawyer, title: 'Dokumentum kész a javításra' },
    });
  }

  it('A. two final pending proposals decided concurrently complete once', async () => {
    await resetCycle();
    const p1 = await createProposal('a1');
    const p2 = await createProposal('a2');

    const results = await Promise.allSettled([
      service.acceptModificationProposal(ids.document, ids.version, p1.id, { id: ids.lawyer, role: 'LAWYER' }),
      service.acceptModificationProposal(ids.document, ids.version, p2.id, { id: ids.lawyer, role: 'LAWYER' }),
    ]);
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);

    const pending = await prisma.documentModificationProposal.count({
      where: { documentVersionId: ids.version, deletedAt: null, status: 'PENDING' },
    });
    expect(pending).toBe(0);
    expect(await timelineCount()).toBe(1);
    expect(await notificationCount()).toBe(1);
  });

  it('B. CREATE racing with the final decision leaves a truthful serial result', async () => {
    await resetCycle();
    const p1 = await createProposal('b1');
    const results = await Promise.allSettled([
      service.acceptModificationProposal(ids.document, ids.version, p1.id, { id: ids.lawyer, role: 'LAWYER' }),
      createProposal('b2'),
    ]);
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);

    const active = await prisma.documentModificationProposal.findMany({
      where: { documentVersionId: ids.version, deletedAt: null },
      select: { status: true },
    });
    const pending = active.filter((p) => p.status === 'PENDING').length;
    // Either the create landed before completion (pending>0, no handoff) or after
    // (handoff emitted and the new proposal reopened the cycle). Both are truthful;
    // no completion event may be lost when a pending proposal remains.
    if (pending > 0) {
      expect(await timelineCount()).toBeLessThanOrEqual(1);
    } else {
      expect(await timelineCount()).toBe(1);
    }
  });

  it('C+D. second completion cycle emits a second handoff', async () => {
    await resetCycle();
    const first = await createProposal('c1');
    await service.acceptModificationProposal(ids.document, ids.version, first.id, { id: ids.lawyer, role: 'LAWYER' });
    expect(await timelineCount()).toBe(1);

    await createProposal('c2');
    const marker = await prisma.documentVersion.findUnique({ where: { id: ids.version } });
    expect(marker?.correctionNotifiedAt).toBeNull();

    const second = await prisma.documentModificationProposal.findFirst({
      where: { documentVersionId: ids.version, status: 'PENDING' },
    });
    await service.acceptModificationProposal(ids.document, ids.version, second!.id, { id: ids.lawyer, role: 'LAWYER' });
    expect(await timelineCount()).toBe(2);
    expect(await notificationCount()).toBe(2);
  });

  it('E. idempotent CREATE retry does not reset the completion marker', async () => {
    await resetCycle();
    const proposal = await createProposal('e1');
    const key = `key-e1`;
    await prisma.documentVersion.update({
      where: { id: ids.version },
      data: { correctionNotifiedAt: new Date() },
    });
    const retry = await service.createModificationProposal(ids.document, ids.version, ids.reader, {
      selectedText: 'select-e1',
      startOffset: 0,
      endOffset: 8,
      proposedText: 'proposed-e1',
      idempotencyKey: key,
    });
    expect(retry.id).toBe(proposal.id);
    const marker = await prisma.documentVersion.findUnique({ where: { id: ids.version } });
    expect(marker?.correctionNotifiedAt).not.toBeNull();
  });

  it('F. withdrawing the last pending while an accepted proposal remains completes', async () => {
    await resetCycle();
    const accepted = await createProposal('f1');
    const pending = await createProposal('f2');
    await service.acceptModificationProposal(ids.document, ids.version, accepted.id, { id: ids.lawyer, role: 'LAWYER' });
    expect(await timelineCount()).toBe(0);
    await service.withdrawModificationProposal(ids.document, ids.version, pending.id, { id: ids.reader, role: 'TRAINEE' });
    expect(await timelineCount()).toBe(1);
  });

  it('G. withdrawing the only active proposal produces no handoff', async () => {
    await resetCycle();
    const only = await createProposal('g1');
    await service.withdrawModificationProposal(ids.document, ids.version, only.id, { id: ids.reader, role: 'TRAINEE' });
    expect(await timelineCount()).toBe(0);
    const marker = await prisma.documentVersion.findUnique({ where: { id: ids.version } });
    expect(marker?.correctionNotifiedAt).toBeNull();
  });

  it('I. canonical document deletion succeeds with proposal data (no raw FK 500)', async () => {
    const docId = 'f4000000-0000-4000-8000-000000000099';
    const verId = 'f5000000-0000-4000-8000-000000000099';
    await prisma.document.create({
      data: {
        id: docId,
        name: 'Deletable document',
        fileName: 'deletable.txt',
        category: 'OTHER',
        caseId: ids.case,
        clientId: ids.client,
        responsibleId: ids.lawyer,
      },
    });
    await prisma.documentVersion.create({
      data: { id: verId, documentId: docId, version: 1, name: 'deletable.txt', isCurrent: true, uploadedById: ids.lawyer },
    });
    const proposal = await service.createModificationProposal(docId, verId, ids.reader, {
      selectedText: 'a',
      startOffset: 0,
      endOffset: 1,
      proposedText: 'b',
    });
    await service.acceptModificationProposal(docId, verId, proposal.id, { id: ids.lawyer, role: 'LAWYER' });

    await expect(prisma.document.delete({ where: { id: docId } })).resolves.toBeTruthy();
    const remaining = await prisma.documentModificationProposal.count({ where: { documentId: docId } });
    expect(remaining).toBe(0);
  });

  it('H. concurrent ACCEPT vs REJECT yields exactly one terminal truth', async () => {
    await resetCycle();
    const proposal = await createProposal('h1');

    const results = await Promise.allSettled([
      service.acceptModificationProposal(ids.document, ids.version, proposal.id, { id: ids.lawyer, role: 'LAWYER' }),
      service.rejectModificationProposal(
        ids.document, ids.version, proposal.id, { id: ids.lawyer, role: 'LAWYER' }, 'nem jó'
      ),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    expect(fulfilled).toHaveLength(1);

    const stored = await prisma.documentModificationProposal.findUnique({ where: { id: proposal.id } });
    expect(['ACCEPTED', 'REJECTED']).toContain(stored?.status);
    const events = await prisma.documentModificationProposalEvent.count({
      where: { proposalId: proposal.id, eventType: { in: ['PROPOSAL_ACCEPTED', 'PROPOSAL_REJECTED'] } },
    });
    expect(events).toBe(1);
  });
});
