/**
 * Behavioural tests for document work context (DOCUMENT-WORK-CONTEXT-1).
 * Exercises the real service against a mocked Prisma client: authorization,
 * field whitelisting, the separation from version state, and two-way task links.
 */
const prismaMock: any = {
  document: { findUnique: jest.fn(), update: jest.fn() },
  documentTaskLink: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), delete: jest.fn() },
  documentVersion: { update: jest.fn(), updateMany: jest.fn() },
  task: { findUnique: jest.fn() },
  user: { findUnique: jest.fn() },
  case: { findUnique: jest.fn() },
  caseCollaborator: { findFirst: jest.fn() },
  communication: { findUnique: jest.fn() },
};
jest.mock('../src/prisma/prisma.service', () => ({ prisma: prismaMock }));

const auth: any = { read: jest.fn(), manage: jest.fn() };
jest.mock('../src/modules/cases/authorization', () => ({
  userCanReadCase: (...a: any[]) => auth.read(...a),
  userCanManageCase: (...a: any[]) => auth.manage(...a),
}));

import {
  getDocumentWorkContext, updateDocumentWorkContext,
  linkDocumentTask, unlinkDocumentTask, listTaskDocuments,
} from '../src/modules/documents/workContext.service';

const req = { user: { userId: 'user-1' } } as any;
const DOC = 'doc-1';
const CASE = 'case-1';

function documentRow(extra: Record<string, unknown> = {}) {
  return {
    id: DOC, caseId: CASE, name: 'szerzodes.docx', fileName: 'szerzodes.docx',
    title: 'Szállítási szerződés', documentRole: 'DRAFT_CONTRACT',
    workStatus: 'IN_PROGRESS', workInstruction: 'Teljes magyar fordítás készítése.',
    workInstructionUpdatedAt: new Date('2026-07-24'), dueDate: new Date('2026-08-01'),
    workPriority: 'HIGH', nextStep: 'Fordítás ellenőrzése', category: 'CONTRACT',
    documentType: 'CONTRACT', currentVersion: 2, updatedAt: new Date('2026-07-24'),
    sourceCommunicationId: null,
    responsible: { id: 'u2', name: 'Nagy Anna' },
    reviewer: { id: 'u3', name: 'dr. Kiss' },
    workInstructionUpdatedBy: { id: 'user-1', name: 'dr. Teszt' },
    ...extra,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  auth.read.mockResolvedValue(true);
  auth.manage.mockResolvedValue(true);
  prismaMock.document.findUnique.mockResolvedValue(documentRow());
  prismaMock.document.update.mockResolvedValue(documentRow());
  prismaMock.documentTaskLink.findMany.mockResolvedValue([]);
  prismaMock.documentTaskLink.findFirst.mockResolvedValue(null);
  prismaMock.communication.findUnique.mockResolvedValue(null);
});

describe('authorization', () => {
  it('requires authentication', async () => {
    await expect(getDocumentWorkContext({ user: undefined } as any, DOC))
      .rejects.toMatchObject({ status: 401 });
  });

  it('404s an unknown document', async () => {
    prismaMock.document.findUnique.mockResolvedValue(null);
    await expect(getDocumentWorkContext(req, 'ghost')).rejects.toMatchObject({ code: 'DOCUMENT_NOT_FOUND', status: 404 });
  });

  it('403s a reader without case access', async () => {
    auth.read.mockResolvedValue(false);
    await expect(getDocumentWorkContext(req, DOC)).rejects.toMatchObject({ status: 403 });
  });

  it('reading is not enough to change work context', async () => {
    auth.manage.mockResolvedValue(false);
    await expect(updateDocumentWorkContext(req, DOC, { title: 'x' }))
      .rejects.toMatchObject({ code: 'DOCUMENT_MANAGE_FORBIDDEN', status: 403 });
    expect(prismaMock.document.update).not.toHaveBeenCalled();
  });
});

describe('the work card is operational, not technical', () => {
  it('exposes work meaning and hides storage identifiers', async () => {
    const card = await getDocumentWorkContext(req, DOC);
    expect(card).toMatchObject({
      title: 'Szállítási szerződés', workStatus: 'IN_PROGRESS',
      workInstruction: 'Teljes magyar fordítás készítése.', nextStep: 'Fordítás ellenőrzése',
    });
    expect(card.responsible).toEqual({ id: 'u2', name: 'Nagy Anna' });
    expect(card.reviewer).toEqual({ id: 'u3', name: 'dr. Kiss' });
    const payload = JSON.stringify(card);
    for (const leak of ['spPath', 'spDriveId', 'spItemId', 'checksum', 'spWebUrl', 'workspaceText']) {
      expect(payload).not.toContain(leak);
    }
  });

  it('falls back to the filename when no human title is set', async () => {
    prismaMock.document.findUnique.mockResolvedValue(documentRow({ title: null, name: null }));
    const card = await getDocumentWorkContext(req, DOC);
    expect(card.title).toBe('szerzodes.docx');
    expect(card.fileName).toBe('szerzodes.docx');
  });

  it('shows communication provenance without the message body', async () => {
    prismaMock.document.findUnique.mockResolvedValue(documentRow({ sourceCommunicationId: 'c1' }));
    prismaMock.communication.findUnique.mockResolvedValue({
      id: 'c1', subject: 'Szerződéstervezet', senderName: 'Ügyfél', createdAt: new Date('2026-07-20'),
    });
    const card = await getDocumentWorkContext(req, DOC);
    expect(card.source).toMatchObject({ communicationId: 'c1', subject: 'Szerződéstervezet', sender: 'Ügyfél' });
    expect(JSON.stringify(card)).not.toMatch(/content|body/i);
  });
});

describe('work metadata update', () => {
  it('updates the allowed operational fields', async () => {
    await updateDocumentWorkContext(req, DOC, {
      title: 'Új cím', workStatus: 'internal_review', nextStep: 'Review kérése',
      workPriority: 'urgent', dueDate: '2026-08-05T10:00:00.000Z', documentRole: 'EVIDENCE',
    });
    const data = prismaMock.document.update.mock.calls[0][0].data;
    expect(data).toMatchObject({ title: 'Új cím', workStatus: 'INTERNAL_REVIEW', workPriority: 'URGENT', documentRole: 'EVIDENCE' });
    expect(data.dueDate).toBeInstanceOf(Date);
  });

  it('records who changed the work instruction and when', async () => {
    await updateDocumentWorkContext(req, DOC, { workInstruction: 'Hasonlítsd össze a felelősségi klauzulákat.' });
    const data = prismaMock.document.update.mock.calls[0][0].data;
    expect(data.workInstruction).toBe('Hasonlítsd össze a felelősségi klauzulákat.');
    expect(data.workInstructionUpdatedById).toBe('user-1');
    expect(data.workInstructionUpdatedAt).toBeInstanceOf(Date);
  });

  it('never mutates a version while updating work metadata', async () => {
    await updateDocumentWorkContext(req, DOC, { workStatus: 'APPROVED' });
    expect(prismaMock.documentVersion.update).not.toHaveBeenCalled();
    expect(prismaMock.documentVersion.updateMany).not.toHaveBeenCalled();
  });

  it.each(['reviewStatus', 'publicationStatus', 'currentVersion', 'spItemId', 'checksum', 'caseId', 'fileName'])(
    'refuses to set %s through the work-context endpoint', async (field) => {
      await expect(updateDocumentWorkContext(req, DOC, { [field]: 'x' }))
        .rejects.toMatchObject({ code: 'FIELD_NOT_ACCEPTED' });
      expect(prismaMock.document.update).not.toHaveBeenCalled();
    });

  it('rejects unknown fields and empty payloads', async () => {
    await expect(updateDocumentWorkContext(req, DOC, { madeUp: 1 })).rejects.toMatchObject({ code: 'UNSUPPORTED_FIELD' });
    await expect(updateDocumentWorkContext(req, DOC, {})).rejects.toMatchObject({ code: 'NO_FIELDS' });
  });

  it('validates the controlled work status and priority', async () => {
    await expect(updateDocumentWorkContext(req, DOC, { workStatus: 'NOT_A_STATUS' })).rejects.toMatchObject({ code: 'INVALID_WORK_STATUS' });
    await expect(updateDocumentWorkContext(req, DOC, { workPriority: 'SUPER' })).rejects.toMatchObject({ code: 'INVALID_PRIORITY' });
  });

  it('accepts every documented work status', async () => {
    for (const s of ['RECEIVED','WAITING_FOR_PROCESSING','IN_PROGRESS','INTERNAL_REVIEW','CHANGES_REQUESTED','APPROVED','READY_FOR_CLIENT','SENT','ARCHIVED']) {
      prismaMock.document.update.mockClear();
      await updateDocumentWorkContext(req, DOC, { workStatus: s });
      expect(prismaMock.document.update.mock.calls[0][0].data.workStatus).toBe(s);
    }
  });

  it('validates the due date and bounds free text', async () => {
    await expect(updateDocumentWorkContext(req, DOC, { dueDate: 'not-a-date' })).rejects.toMatchObject({ code: 'INVALID_DUE_DATE' });
    await expect(updateDocumentWorkContext(req, DOC, { workInstruction: 'x'.repeat(5000) })).rejects.toMatchObject({ code: 'FIELD_TOO_LONG' });
    await expect(updateDocumentWorkContext(req, DOC, { title: 'x'.repeat(400) })).rejects.toMatchObject({ code: 'FIELD_TOO_LONG' });
  });
});

describe('responsible and reviewer validation', () => {
  it('rejects a user that does not exist', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    await expect(updateDocumentWorkContext(req, DOC, { reviewerId: 'ghost' }))
      .rejects.toMatchObject({ code: 'USER_NOT_FOUND', status: 400 });
  });

  it('rejects a user with no access to the owning case', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 'outsider', role: 'LAWYER' });
    prismaMock.case.findUnique.mockResolvedValue({ assignedLawyerId: 'other', createdById: 'other' });
    prismaMock.caseCollaborator.findFirst.mockResolvedValue(null);
    await expect(updateDocumentWorkContext(req, DOC, { responsibleId: 'outsider' }))
      .rejects.toMatchObject({ code: 'USER_NOT_ALLOWED', status: 403 });
  });

  it('accepts a collaborator on the case', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 'collab', role: 'LAWYER' });
    prismaMock.case.findUnique.mockResolvedValue({ assignedLawyerId: 'other', createdById: 'other' });
    prismaMock.caseCollaborator.findFirst.mockResolvedValue({ id: 'cc' });
    await updateDocumentWorkContext(req, DOC, { responsibleId: 'collab' });
    expect(prismaMock.document.update.mock.calls[0][0].data.responsibleId).toBe('collab');
  });

  it('allows clearing the owner and reviewer', async () => {
    await updateDocumentWorkContext(req, DOC, { responsibleId: null, reviewerId: null });
    const data = prismaMock.document.update.mock.calls[0][0].data;
    expect(data.responsibleId).toBeNull();
    expect(data.reviewerId).toBeNull();
  });
});

describe('two-way document/task links', () => {
  it('links a task in the same case', async () => {
    prismaMock.task.findUnique.mockResolvedValue({ id: 't1', caseId: CASE });
    prismaMock.documentTaskLink.create.mockResolvedValue({ id: 'l1' });
    await linkDocumentTask(req, DOC, { taskId: 't1', note: 'Fordítandó irat' });
    expect(prismaMock.documentTaskLink.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.documentTaskLink.create.mock.calls[0][0].data).toMatchObject({
      documentId: DOC, taskId: 't1', createdById: 'user-1',
    });
  });

  it('refuses a task from another case', async () => {
    prismaMock.task.findUnique.mockResolvedValue({ id: 't1', caseId: 'other-case' });
    await expect(linkDocumentTask(req, DOC, { taskId: 't1' }))
      .rejects.toMatchObject({ code: 'CROSS_CASE_LINK_DENIED', status: 403 });
    expect(prismaMock.documentTaskLink.create).not.toHaveBeenCalled();
  });

  it('refuses a duplicate link', async () => {
    prismaMock.task.findUnique.mockResolvedValue({ id: 't1', caseId: CASE });
    prismaMock.documentTaskLink.findFirst.mockResolvedValue({ id: 'existing' });
    await expect(linkDocumentTask(req, DOC, { taskId: 't1' }))
      .rejects.toMatchObject({ code: 'LINK_ALREADY_EXISTS', status: 409 });
    expect(prismaMock.documentTaskLink.create).not.toHaveBeenCalled();
  });

  it('404s an unknown task and requires a taskId', async () => {
    prismaMock.task.findUnique.mockResolvedValue(null);
    await expect(linkDocumentTask(req, DOC, { taskId: 'ghost' })).rejects.toMatchObject({ code: 'TASK_NOT_FOUND', status: 404 });
    await expect(linkDocumentTask(req, DOC, {})).rejects.toMatchObject({ code: 'TASK_ID_REQUIRED' });
  });

  it('unlinks without deleting the document or the task', async () => {
    prismaMock.documentTaskLink.findFirst.mockResolvedValue({ id: 'l1' });
    prismaMock.documentTaskLink.delete.mockResolvedValue({ id: 'l1' });
    await unlinkDocumentTask(req, DOC, 't1');
    expect(prismaMock.documentTaskLink.delete).toHaveBeenCalledWith({ where: { id: 'l1' } });
    expect(prismaMock.document.update).not.toHaveBeenCalled();
  });

  it('404s unlinking something that is not linked', async () => {
    prismaMock.documentTaskLink.findFirst.mockResolvedValue(null);
    await expect(unlinkDocumentTask(req, DOC, 't1')).rejects.toMatchObject({ code: 'LINK_NOT_FOUND', status: 404 });
  });

  it('surfaces linked tasks on the card with their work state', async () => {
    prismaMock.documentTaskLink.findMany.mockResolvedValue([
      { id: 'l1', task: { id: 't1', title: 'Fordítás', status: 'IN_PROGRESS', dueDate: new Date('2026-08-02'), assignedTo: { id: 'u2', name: 'Nagy Anna' } } },
    ]);
    const card = await getDocumentWorkContext(req, DOC);
    expect(card.linkedTasks[0]).toMatchObject({ taskId: 't1', title: 'Fordítás', status: 'IN_PROGRESS' });
    expect(card.linkedTasks[0].assignee).toEqual({ id: 'u2', name: 'Nagy Anna' });
  });
});

describe('task -> documents (the reverse direction)', () => {
  it('lists documents attached to a task', async () => {
    prismaMock.task.findUnique.mockResolvedValue({ id: 't1', caseId: CASE });
    prismaMock.documentTaskLink.findMany.mockResolvedValue([
      { id: 'l1', note: null, createdAt: new Date(), document: {
        id: DOC, name: 'a.docx', fileName: 'a.docx', title: 'Szerződés', workStatus: 'IN_PROGRESS',
        documentRole: 'DRAFT_CONTRACT', dueDate: null, currentVersion: 1,
        responsible: { id: 'u2', name: 'Nagy Anna' }, reviewer: null } },
    ]);
    const res = await listTaskDocuments(req, 't1');
    expect(res.documents[0]).toMatchObject({ id: DOC, title: 'Szerződés', workStatus: 'IN_PROGRESS' });
  });

  it('denies a task the caller cannot read', async () => {
    prismaMock.task.findUnique.mockResolvedValue({ id: 't1', caseId: CASE });
    auth.read.mockResolvedValue(false);
    await expect(listTaskDocuments(req, 't1')).rejects.toMatchObject({ status: 403 });
  });
});
