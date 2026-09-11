import { prisma as defaultPrisma } from '../../prisma/prisma.service';
import { transitionWorkspace } from '../client-workspace/workspaceService';

type Prisma = typeof defaultPrisma;
type InternalActor = { userId: string; role?: string | null };

const CLIENT_LIFECYCLE_MANAGER_ROLES = new Set(['ADMIN', 'PARTNER']);

export class ClientLifecycleError extends Error {
  constructor(public status: number, public code: string, message: string, public dependencies?: ClientDependencySummary) {
    super(message);
    this.name = 'ClientLifecycleError';
  }
}

function requireClientLifecycleManager(actor: InternalActor): void {
  if (!actor.userId || !CLIENT_LIFECYCLE_MANAGER_ROLES.has(String(actor.role || ''))) {
    throw new ClientLifecycleError(403, 'CLIENT_LIFECYCLE_FORBIDDEN', 'Client lifecycle administration requires an authorized internal actor.');
  }
}

// Counts only — no record payloads are loaded for the preview, and every
// category blocks hard delete so a raw client row can never silently orphan
// linked operational or historical data.
const DEPENDENCY_CHECKS: Array<{ key: string; count: (db: Prisma, clientId: string) => Promise<number> }> = [
  { key: 'cases', count: (db, clientId) => db.case.count({ where: { clientId } }) },
  { key: 'matters', count: (db, clientId) => db.matter.count({ where: { clientId } }) },
  { key: 'departments', count: (db, clientId) => db.department.count({ where: { clientId } }) },
  { key: 'workgroups', count: (db, clientId) => db.clientWorkgroup.count({ where: { clientId } }) },
  { key: 'documents', count: (db, clientId) => db.document.count({ where: { clientId } }) },
  { key: 'communications', count: (db, clientId) => db.communication.count({ where: { clientId } }) },
  {
    key: 'timeEntries',
    count: (db, clientId) => db.timeEntry.count({
      where: { OR: [{ case: { clientId } }, { matter: { clientId } }, { department: { clientId } }] },
    }),
  },
  { key: 'hourlyRates', count: (db, clientId) => db.hourlyRateVersion.count({ where: { clientId } }) },
  { key: 'timesheetReports', count: (db, clientId) => db.timesheetReportInstance.count({ where: { clientId } }) },
  { key: 'timesheetPresets', count: (db, clientId) => db.timesheetPreset.count({ where: { clientId } }) },
  { key: 'billingPreparations', count: (db, clientId) => db.billingPreparation.count({ where: { clientId } }) },
  { key: 'invoiceDrafts', count: (db, clientId) => db.invoiceDraft.count({ where: { preparation: { clientId } } }) },
  { key: 'portalWorkspaces', count: (db, clientId) => db.clientPortalWorkspace.count({ where: { clientId } }) },
  { key: 'portalInvitations', count: (db, clientId) => db.clientPortalInvitation.count({ where: { clientId } }) },
  { key: 'portalGrants', count: (db, clientId) => db.clientPortalGrant.count({ where: { clientId } }) },
  {
    key: 'portalPublications',
    count: async (db, clientId) => (await db.clientMatterPublication.count({ where: { clientId } }))
      + (await db.clientDocumentPublication.count({ where: { clientId } }))
      + (await db.clientPublicationEvent.count({ where: { clientId } })),
  },
  {
    key: 'clientRequests',
    count: async (db, clientId) => (await db.clientRequest.count({ where: { clientId } }))
      + (await db.clientQuestionThread.count({ where: { clientId } }))
      + (await db.clientSubmission.count({ where: { clientId } })),
  },
  {
    key: 'clientInteractions',
    count: async (db, clientId) => (await db.clientActionRequest.count({ where: { clientId } }))
      + (await db.clientSafeUpdate.count({ where: { clientId } }))
      + (await db.clientNotificationDelivery.count({ where: { clientId } })),
  },
  {
    key: 'contractsAndObligations',
    count: async (db, clientId) => (await db.contractRecord.count({ where: { clientId } }))
      + (await db.clientObligation.count({ where: { clientId } }))
      + (await db.contractEntitlement.count({ where: { clientId } })),
  },
  {
    key: 'complianceAndFoundation',
    count: async (db, clientId) => (await db.clientFact.count({ where: { clientId } }))
      + (await db.clientFactAnswerState.count({ where: { clientId } }))
      + (await db.factSubject.count({ where: { clientId } }))
      + (await db.companyMilestone.count({ where: { clientId } }))
      + (await db.assessment.count({ where: { clientId } }))
      + (await db.assessmentFinding.count({ where: { clientId } }))
      + (await db.requirementApplicability.count({ where: { clientId } }))
      + (await db.complianceProposal.count({ where: { clientId } }))
      + (await db.developmentInitiative.count({ where: { clientId } }))
      + (await db.businessProcess.count({ where: { clientId } }))
      + (await db.businessSystem.count({ where: { clientId } })),
  },
  {
    key: 'organizationRecords',
    count: async (db, clientId) => (await db.organizationPerson.count({ where: { clientId } }))
      + (await db.clientOrganizationGroup.count({ where: { clientId } }))
      + (await db.clientOrganizationMembership.count({ where: { clientId } })),
  },
  {
    key: 'clientProfiles',
    count: async (db, clientId) => (await db.clientHouseStyleProfile.count({ where: { clientId } }))
      + (await db.clientOperatingProfile.count({ where: { clientId } }))
      + (await db.clientRedactionProfile.count({ where: { clientId } })),
  },
];

export type ClientDependencySummary = {
  dependencies: Record<string, number>;
  total: number;
  canHardDelete: boolean;
};

export async function getClientDependencySummary(clientId: string, db: Prisma = defaultPrisma): Promise<ClientDependencySummary> {
  const entries = await Promise.all(
    DEPENDENCY_CHECKS.map(async (check) => [check.key, await check.count(db, clientId)] as const),
  );
  const dependencies = Object.fromEntries(entries);
  const total = entries.reduce((sum, [, value]) => sum + value, 0);
  return { dependencies, total, canHardDelete: total === 0 };
}

export async function getClientLifecyclePreview(clientId: string, db: Prisma = defaultPrisma) {
  const client = await db.client.findUnique({ where: { id: clientId }, select: { id: true, name: true, archivedAt: true } });
  if (!client) throw new ClientLifecycleError(404, 'CLIENT_NOT_FOUND', 'Client not found.');
  const summary = await getClientDependencySummary(clientId, db);
  return { clientId: client.id, name: client.name, archivedAt: client.archivedAt, ...summary };
}

// Archiving is lifecycle metadata only: linked cases, documents, billing,
// communications and history are preserved; portal workspaces are archived
// through the canonical workspace transition (audit events preserved) while
// ClientPortalIdentity records are never touched.
export async function archiveClient(actor: InternalActor, clientId: string, db: Prisma = defaultPrisma) {
  requireClientLifecycleManager(actor);
  const client = await db.client.findUnique({ where: { id: clientId }, select: { id: true, name: true, archivedAt: true } });
  if (!client) throw new ClientLifecycleError(404, 'CLIENT_NOT_FOUND', 'Client not found.');

  const workspaces = await db.clientPortalWorkspace.findMany({
    where: { clientId, status: { not: 'ARCHIVED' } },
    select: { id: true, revision: true },
  });
  const archivedWorkspaceIds: string[] = [];
  for (const workspace of workspaces) {
    await transitionWorkspace(actor, workspace.id, 'archive', workspace.revision, db);
    archivedWorkspaceIds.push(workspace.id);
  }

  const archived = client.archivedAt
    ? await db.client.findUniqueOrThrow({ where: { id: clientId } })
    : await db.client.update({ where: { id: clientId }, data: { archivedAt: new Date(), archivedById: actor.userId } });
  return { client: archived, archivedWorkspaceIds, alreadyArchived: Boolean(client.archivedAt) };
}

// Hard delete is available only for a client with zero linked records. Any
// dependency blocks it with a machine-readable 409 payload; there is no
// cascade purge.
export async function hardDeleteClient(actor: InternalActor, clientId: string, db: Prisma = defaultPrisma) {
  requireClientLifecycleManager(actor);
  const client = await db.client.findUnique({ where: { id: clientId }, select: { id: true } });
  if (!client) throw new ClientLifecycleError(404, 'CLIENT_NOT_FOUND', 'Client not found.');
  const summary = await getClientDependencySummary(clientId, db);
  if (!summary.canHardDelete) {
    throw new ClientLifecycleError(409, 'CLIENT_DELETE_BLOCKED', 'Client has linked records and cannot be hard-deleted.', summary);
  }
  await db.client.delete({ where: { id: clientId } });
  return { deleted: true };
}
