/**
 * Cases Service V3 - Integrated with Documents + Timeline
 * Case management with timeline, documents, and summary endpoints
 */

import { prisma } from '../../prisma/prisma.service';
import { driveService } from '../sharepoint';
import { workflowService } from '../workflow';
import { instantiateCaseWorkflow } from './caseWorkflowOrchestration';
import { createCaseWorkPackageSnapshot, CaseWorkPackageError } from './caseWorkPackage.service';
import { isWorkforceRole } from '../../middleware/workforceAuthorization';

// Prisma schema enum values
const VALID_MATTER_TYPES = ['REAL_ESTATE_SALE', 'LEASE', 'EMPLOYMENT', 'CORPORATE', 'LITIGATION', 'OTHER'];
const DEFAULT_MATTER_TYPE = 'OTHER';
const DEFAULT_STATUS = 'CLIENT_INPUT';

/**
 * Resolve the matter title shown to users.
 *
 * The user-entered "Ügy megnevezése" is authoritative and is persisted on
 * Case.title by the intake workflow. These read DTOs used to discard it and
 * recompose `clientName - matterType`, so a matter typed as e.g. "Bérleti
 * szerződés felülvizsgálat" surfaced as "Bálintfy és Társai Ügyvédi Iroda -
 * CONTRACT_REVIEW". The persisted title now wins; the composed form is only a
 * fallback for records with no stored title. Legacy cases created via the old
 * createCase path already store that composed value, so their display is
 * unchanged. Client name and matter type stay separate metadata.
 */
export function resolveDisplayTitle(row: {
  title?: string | null;
  clientName?: string | null;
  matterType?: string | null;
  caseNumber?: string | null;
}): string {
  const persisted = typeof row.title === 'string' ? row.title.trim() : '';
  if (persisted) return persisted;
  const client = (row.clientName || '').trim() || 'Unknown Client';
  const type = (row.matterType || '').trim() || 'Unknown Type';
  return `${client} - ${type}`;
}

interface CaseListItem {
  id: string;
  caseNumber: string;
  title: string;
  clientName: string;
  clientId?: string;
  matterType: string;
  status: string;
  priority: string;
  deadline?: Date | null;
  clientRole?: string | null;
  clientColorKey?: string | null;
  createdAt: Date;
  updatedAt: Date;
  assignedLawyer: { id: string; name: string; email: string; role: string } | null;
  collaboratorCount?: number;
  lastTimelineEvent?: { event: string; timestamp: Date };
}

interface TimelineEventDTO {
  id: string;
  caseId: string;
  type: string;
  payload: any;
  userId?: string;
  userName?: string;
  createdAt: Date;
}

interface CaseSummaryDTO {
  case: {
    id: string;
    caseNumber: string;
    title: string;
    clientName: string;
    clientId?: string;
    matterId?: string;
    matterType: string;
    status: string;
    description?: string;
    priority: string;
    clientRole?: string;
    sharePointFolderPath?: string;
    createdAt: Date;
    updatedAt: Date;
  };
  last5TimelineEvents: TimelineEventDTO[];
  activeDocuments: Array<{
    id: string;
    fileName: string;
    documentType: string;
    version: string;
    status: string;
    spWebUrl: string;
    createdAt: Date;
  }>;
  stats: {
    totalDocuments: number;
    approvedDocuments: number;
    pendingReview: number;
  };
}

interface CreateCaseInput {
  title?: string;
  clientName: string;
  clientId?: string;
  matterType: string;
  description?: string;
  clientRole?: string | null;
  createdById?: string;
  assignedLawyerId?: string | null;
  responsibleLawyerId?: string | null;
  deadline?: string | null;
  workflowTemplateKey?: string | null;
  workflowAssignees?: Record<string, string | null | undefined>;
  caseTypeDefinitionId?: string | null;
  selectedModuleKeys?: unknown;
}

type ActiveUserRecord = {
  id: string;
  status: string;
  isActive: boolean;
};

class CasesService {
  /**
   * Get all cases with pagination
   */
  async getCases(params: { page?: number; limit?: number; status?: string; assignedLawyerId?: string; clientId?: string }): Promise<{ data: CaseListItem[]; pagination: { page: number; limit: number; total: number } }> {
    const { page = 1, limit = 20 } = params;
    const where: Record<string, any> = {};
    if (params.status) {
      const status = params.status;
      if (workflowService.isValidStatus(status)) {
        where.status = status;
      }
    }
    if (params.assignedLawyerId) {
      where.assignedLawyerId = params.assignedLawyerId;
    }
    if (params.clientId) {
      where.clientId = params.clientId;
    }

    const [cases, total] = await Promise.all([
      prisma.case.findMany({
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          assignedLawyer: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true
            }
          },
          client: {
            select: {
              id: true,
              name: true,
              colorKey: true,
            },
          },
        },
        ...(Object.keys(where).length ? { where } : {})
      }),
      prisma.case.count(Object.keys(where).length ? { where } : undefined)
    ]);

    const data: CaseListItem[] = cases.map((c: any) => ({
      id: c.id,
      caseNumber: c.caseNumber,
      title: resolveDisplayTitle(c),
      clientName: c.client?.name || c.clientName || 'Unknown Client',
      clientId: c.clientId,
      matterType: c.matterType || 'Unknown',
      status: c.status,
      priority: c.priority,
      deadline: c.deadline || null,
      clientRole: c.clientRole || null,
      clientColorKey: c.client?.colorKey || null,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      assignedLawyer: c.assignedLawyer ? {
        id: c.assignedLawyer.id,
        name: c.assignedLawyer.name,
        email: c.assignedLawyer.email,
        role: c.assignedLawyer.role
      } : null,
      collaboratorCount: 0,
      lastTimelineEvent: undefined
    }));

    return { data, pagination: { page, limit, total } };
  }

  /**
   * Get case by ID
   */
  async getCaseById(caseId: string): Promise<any | null> {
    const caseData = await prisma.case.findUnique({
      where: { id: caseId },
      include: {
        assignedLawyer: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true
          },
        },
        client: {
          select: {
            id: true,
            name: true,
            colorKey: true,
          },
        },
      },
    });

    if (!caseData) return null;

    return {
      id: caseData.id,
      caseNumber: caseData.caseNumber,
      title: resolveDisplayTitle(caseData),
      clientName: caseData.client?.name || caseData.clientName || 'Unknown Client',
      clientId: caseData.clientId,
      matterType: caseData.matterType || 'Unknown',
      status: caseData.status,
      description: caseData.description || undefined,
      priority: caseData.priority,
      deadline: caseData.deadline || null,
      clientRole: caseData.clientRole || null,
      clientColorKey: caseData.client?.colorKey || null,
      sharePointFolderPath: caseData.sharepointRoot || undefined,
      assignedLawyer: caseData.assignedLawyer ? {
        id: caseData.assignedLawyer.id,
        name: caseData.assignedLawyer.name,
        email: caseData.assignedLawyer.email,
        role: caseData.assignedLawyer.role
      } : null,
      timeline: [],
      documents: []
    };
  }

  /**
   * Get timeline events for a case
   */
  async getCaseTimeline(caseId: string): Promise<TimelineEventDTO[]> {
    const events = await prisma.timelineEvent.findMany({
      where: { caseId },
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    return events.map((e: any) => ({
      id: e.id,
      caseId: e.caseId,
      type: e.type,
      payload: e.payload,
      userId: e.userId || undefined,
      userName: e.user?.name || undefined,
      createdAt: e.createdAt
    }));
  }

  /**
   * Get documents for a case
   */
  async getCaseDocuments(caseId: string): Promise<any[]> {
    const documents = await prisma.document.findMany({
      where: { caseId },
      select: {
        id: true,
        caseId: true,
        fileName: true,
        documentType: true,
        spItemId: true,
        spPath: true,
        version: true,
        folder: true,
        isLatest: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' }
    });

    return documents.map((doc: any) => ({
      id: doc.id,
      caseId: doc.caseId,
      fileName: doc.fileName,
      documentType: doc.documentType,
      spItemId: doc.spItemId,
      spWebUrl: doc.spPath,
      version: doc.version,
      folder: doc.folder,
      isLatest: doc.isLatest,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt
    }));
  }

  /**
   * Get case summary with timeline, documents, and stats
   */
  async getCaseSummary(caseId: string): Promise<CaseSummaryDTO | null> {
    const caseData = await prisma.case.findUnique({
      where: { id: caseId }
    });

    if (!caseData) return null;

    // Get last 5 timeline events
    const timelineEvents = await prisma.timelineEvent.findMany({
      where: { caseId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: {
        user: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    // Get active documents
    const documents = await prisma.document.findMany({
      where: { caseId },
      select: {
        id: true,
        fileName: true,
        documentType: true,
        version: true,
        folder: true,
        spPath: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' }
    });

    // Calculate stats
    const approvedDocs = documents.filter((d: any) => d.folder === 'APPROVED' || d.folder === 'FINAL');
    const pendingReview = documents.filter((d: any) => d.folder === 'REVIEW');

return {
      case: {
        id: caseData.id,
        caseNumber: caseData.caseNumber,
        title: resolveDisplayTitle(caseData),
        clientName: caseData.clientName || 'Unknown Client',
        clientId: caseData.clientId,
        matterId: caseData.matterId ?? undefined,
        matterType: caseData.matterType || 'Unknown',
        status: caseData.status,
        description: caseData.description || undefined,
        priority: caseData.priority,
        clientRole: caseData.clientRole || undefined,
        sharePointFolderPath: caseData.sharepointRoot || undefined,
        createdAt: caseData.createdAt,
        updatedAt: caseData.updatedAt
      },
      last5TimelineEvents: timelineEvents.map((e: any) => ({
        id: e.id,
        caseId: e.caseId,
        type: e.type,
        payload: e.payload,
        userId: e.userId || undefined,
        userName: e.user?.name || undefined,
        createdAt: e.createdAt
      })),
      activeDocuments: documents.map((doc: any) => ({
        id: doc.id,
        fileName: doc.fileName,
        documentType: doc.documentType || 'OTHER',
        version: doc.version || '1',
        status: doc.folder,
        spWebUrl: doc.spPath,
        createdAt: doc.createdAt
      })),
      stats: {
        totalDocuments: documents.length,
        approvedDocuments: approvedDocs.length,
        pendingReview: pendingReview.length
      }
    };
  }

  async getCaseClientHouseStyle(caseId: string): Promise<any | null> {
    const caseData = await prisma.case.findUnique({
      where: { id: caseId },
      select: { id: true, clientId: true }
    });

    if (!caseData) {
      throw new Error('Case not found');
    }

    if (!caseData.clientId) {
      return null;
    }

    try {
      return await prisma.clientHouseStyleProfile.findUnique({
        where: { clientId: caseData.clientId }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : '';
      const relationDrift =
        message.includes('clienthousestyleprofile') ||
        message.includes('unknown field') ||
        message.includes('unknown arg') ||
        message.includes('does not exist');
      if (relationDrift) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Create new case
   */
  async createCase(params: CreateCaseInput, db = prisma): Promise<{ id: string; caseNumber: string; status: string; createdAt: Date; workPackage?: unknown }> {
    const year = new Date().getFullYear();
    const count = await db.case.count({ where: { caseNumber: { startsWith: `CASE-${year}-` } } });
    const caseNumber = `CASE-${year}-${String(count + 1).padStart(3, '0')}`;

    // Use default if invalid matterType
    const matterType = VALID_MATTER_TYPES.includes(params.matterType) ? params.matterType : DEFAULT_MATTER_TYPE;

    let resolvedClientName = (params.clientName || '').trim();

    // Prefer explicit existing client linkage when clientId is provided.
    // This avoids creating orphan linkage behavior in create-case flows.
    let resolvedClientId = (params.clientId || '').trim() || undefined;
    if (resolvedClientId) {
      const linkedClient = await db.client.findUnique({
        where: { id: resolvedClientId },
        select: { id: true, name: true }
      });
      if (!linkedClient) {
        throw new Error('Client not found');
      }
      if (!resolvedClientName) {
        resolvedClientName = linkedClient.name;
      }
    }

    if (!resolvedClientName && !resolvedClientId) {
      throw new Error('Client name or clientId is required');
    }

    // Prefer explicit title when provided; fallback to clientName - matterType
    const explicitTitle = (params.title || '').trim();
    const title = explicitTitle || `${resolvedClientName} - ${matterType}`;

    // Validate responsible lawyer if provided
    const rawAssignedId = (params.assignedLawyerId || params.responsibleLawyerId || '').trim() || null;
    let assignedLawyerId: string | null = null;
    if (rawAssignedId) {
      const assignedUser = await db.user.findUnique({
        where: { id: rawAssignedId },
        select: { id: true, status: true, isActive: true, role: true },
      });
      if (!assignedUser || assignedUser.status !== 'ACTIVE' || assignedUser.isActive === false || !isWorkforceRole(assignedUser.role)) {
        throw new CaseWorkPackageError('INVALID_RESPONSIBLE_LAWYER', 'The selected responsible lawyer is not an eligible active workforce member.', 400);
      }
      assignedLawyerId = assignedUser.id;
    }

    if (!params.createdById) {
      throw new Error('Authenticated user is required for case creation');
    }

    const existingUser = await db.user.findUnique({
      where: { id: params.createdById },
      select: { id: true, status: true, isActive: true },
    }) as ActiveUserRecord | null;
    if (!existingUser) {
      throw new Error('Authenticated user not found');
    }
    if (existingUser.status !== 'ACTIVE' || existingUser.isActive === false) {
      throw new Error('Authenticated user is inactive');
    }
    const resolvedCreatedById = existingUser.id;

    // Case schema requires clientId FK. If no valid client is provided, fail with a clear
    // validation error instead of attempting a synthetic fallback that can cause 500s.
    const clientIdFromParams = resolvedClientId;
    let clientId = clientIdFromParams;
    if (!clientId) {
      throw new Error('Client is required for case creation');
    }

    if (!resolvedClientName) {
      const linkedClient = await db.client.findUnique({
        where: { id: clientId },
        select: { id: true, name: true }
      });
      resolvedClientName = linkedClient?.name || 'Unknown Client';
    }

    const explicitCaseTypeId = params.caseTypeDefinitionId?.trim() || null;
    if (explicitCaseTypeId) {
      const existingCaseType = await db.caseTypeDefinition.findUnique({
        where: { id: explicitCaseTypeId },
        select: { id: true, isActive: true },
      });
      if (!existingCaseType) {
        throw new CaseWorkPackageError('CASE_TYPE_NOT_FOUND', 'The selected case type does not exist.', 404);
      }
      if (!existingCaseType.isActive) {
        throw new CaseWorkPackageError('CASE_TYPE_INACTIVE', 'The selected case type is inactive.', 409);
      }
    }

    const created = await db.$transaction(async (tx) => {
      const newCase = await tx.case.create({
        data: {
          caseNumber,
          title,
          clientName: resolvedClientName,
          matterType: matterType as any,
          caseType: 'OTHER' as any,
          caseTypeDefinitionId: params.caseTypeDefinitionId || null,
          description: params.description,
          clientRole: params.clientRole ?? null,
          status: DEFAULT_STATUS as any,
          priority: 'MEDIUM' as any,
          deadline: params.deadline ? new Date(params.deadline) : undefined,
          assignedLawyerId: assignedLawyerId || undefined,
          sharepointSite: 'Adminiculum - Legal Workflow',
          sharepointRoot: `/sites/AdminiculumLegalWorkflow/Cases/${caseNumber}`,
          createdById: resolvedCreatedById,
          clientId
        } as any
      });

      const workPackage = await createCaseWorkPackageSnapshot(tx, newCase.id, resolvedCreatedById, {
        caseTypeDefinitionId: params.caseTypeDefinitionId,
        selectedModuleKeys: params.selectedModuleKeys,
      }, matterType);
      if (workPackage) {
        await tx.case.update({ where: { id: newCase.id }, data: { caseTypeDefinitionId: workPackage.caseTypeDefinitionId } });
      }

      const workflow = await instantiateCaseWorkflow({
        caseId: newCase.id,
        templateId: workPackage?.template.defaultWorkflowTemplateId,
        templateKey: params.workflowTemplateKey || 'SIMPLE',
        actor: { userId: resolvedCreatedById },
        assigneesByStepKey: params.workflowAssignees,
        fallbackAssigneeId: assignedLawyerId || resolvedCreatedById,
      }, tx as any);

      await tx.timelineEvent.create({
        data: {
          caseId: newCase.id,
          userId: resolvedCreatedById,
          eventType: 'CASE_CREATED',
          type: 'CASE_CREATED' as any,
          payload: {
            caseNumber,
            clientName: resolvedClientName,
            matterType,
            caseTypeDefinitionId: params.caseTypeDefinitionId || null,
            workPackageTemplateId: workPackage?.template.id || null,
            workPackageTemplateVersion: workPackage?.template.version || null,
            workflowTemplateId: workPackage?.template.defaultWorkflowTemplateId || workflow?.templateKey || null,
            workflowTemplateKey: workflow?.templateKey || null,
            workflowTemplateVersion: workflow?.templateVersion || null,
            assignedLawyerId,
          },
        } as any,
      });

      return { newCase, workPackage };
    });
    const newCase = created.newCase;

    // Create case folder in SharePoint
    // If folder creation fails, log but do NOT fail the case creation.
    // The case DB record is the source of truth; SharePoint is a convenience layer.
    const folderResult = await driveService.createCaseFolders(caseNumber, resolvedClientName);
    if (!folderResult) {
      console.warn(`[CASES_SERVICE] SharePoint folder creation returned null for case ${caseNumber}. Case created in DB but SharePoint folder is missing.`);
    }

    return {
      id: newCase.id,
      caseNumber: newCase.caseNumber,
      status: newCase.status,
      createdAt: newCase.createdAt,
      workPackage: created.workPackage ? {
        id: created.workPackage.snapshot.id,
        workPackageTemplateId: created.workPackage.snapshot.workPackageTemplateId,
        workPackageTemplateVersion: created.workPackage.snapshot.workPackageTemplateVersion,
        snapshotWorkflowTemplateId: created.workPackage.snapshot.snapshotWorkflowTemplateId,
        items: created.workPackage.snapshot.items.map((item) => ({
          id: item.id, moduleType: item.moduleType, moduleKey: item.moduleKey,
          label: item.label, config: item.config, order: item.order,
          sourceTemplateItemId: item.sourceTemplateItemId,
        })),
      } : undefined
    };
  }

  /**
   * Partial update for case fields (deadline, priority, description)
   */
  async updateCase(params: {
    caseId: string;
    deadline?: string | null;
    priority?: string;
    description?: string;
    clientRole?: string | null;
    userId?: string;
  }): Promise<{ id: string; deadline?: Date | null; priority?: string; description?: string | null; clientRole?: string | null; updatedAt: Date }> {
    const { caseId, deadline, priority, description, clientRole, userId } = params;
    
    const caseData = await prisma.case.findUnique({ where: { id: caseId } });
    if (!caseData) {
      throw new Error('Case not found');
    }

    const updateData: Record<string, any> = {};
    if (deadline !== undefined) {
      updateData.deadline = deadline ? new Date(deadline) : null;
    }
    if (priority !== undefined) {
      updateData.priority = priority;
    }
    if (description !== undefined) {
      updateData.description = description;
    }
    if (clientRole !== undefined) {
      updateData.clientRole = clientRole;
    }

    const updatedCase = await prisma.case.update({
      where: { id: caseId },
      data: updateData
    });

    // Create timeline event if userId provided
    if (userId && (deadline !== undefined || priority !== undefined || description !== undefined || clientRole !== undefined)) {
      const changes: string[] = [];
      if (deadline !== undefined) changes.push(`határidő: ${deadline || '(nincs)'}`);
      if (priority !== undefined) changes.push(`prioritás: ${priority}`);
      if (description !== undefined) changes.push('leírás frissítve');
      if (clientRole !== undefined) changes.push(`ügyfél oldali szerep: ${clientRole || '(nincs)'}`);
      
      await prisma.timelineEvent.create({
        data: {
          caseId,
          userId,
          eventType: 'CASE_DETAILS_UPDATED',
          type: 'CASE_DETAILS_UPDATED' as any,
          payload: { changes, deadline, priority, clientRole }
        } as any
      });
    }

    return {
      id: updatedCase.id,
      deadline: updatedCase.deadline,
      priority: updatedCase.priority,
      description: updatedCase.description,
      clientRole: updatedCase.clientRole,
      updatedAt: updatedCase.updatedAt
    };
  }

  /**
   * Update case status
   */
  async updateCaseStatus(
    caseId: string,
    newStatus: string,
    userId: string,
    comment?: string
  ): Promise<{ id: string; previousStatus: string; newStatus: string; updatedAt: Date }> {
    const caseData = await prisma.case.findUnique({ where: { id: caseId } });
    if (!caseData) {
      throw new Error('Case not found');
    }

    const previousStatus = caseData.status;

    const updatedCase = await prisma.case.update({
      where: { id: caseId },
      data: {
        status: newStatus as any
      }
    });

    // Create TimelineEvent for status change
    await prisma.timelineEvent.create({
      data: {
        caseId,
        userId,
        eventType: 'CASE_STATUS_CHANGED',
        type: 'CASE_STATUS_CHANGED' as any,
        payload: {
          previousStatus,
          newStatus,
          comment
        }
      } as any
    });

    return {
      id: updatedCase.id,
      previousStatus,
      newStatus: updatedCase.status,
      updatedAt: updatedCase.updatedAt
    };
  }

  /**
   * Assign lawyer to case (sets assignedLawyerId on Case)
   */
  async assignUser(
    caseId: string,
    userId: string,
    role: string,
    assignedById: string
  ): Promise<{ assignmentId: string; caseId: string; userId: string; role: string }> {
    // Update the case with the assigned lawyer
    const updatedCase = await prisma.case.update({
      where: { id: caseId },
      data: {
        assignedLawyerId: userId
      }
    });

    // Create TimelineEvent for assignment
    await prisma.timelineEvent.create({
      data: {
        caseId,
        userId: assignedById,
        eventType: 'CASE_ASSIGNED',
        type: 'CASE_ASSIGNED' as any,
        payload: {
          action: 'CASE_ASSIGNED',
          assignedLawyerId: userId,
          role
        }
      } as any
    });

    return {
      assignmentId: `assignment-${caseId}-${userId}`,
      caseId: caseId,
      userId: userId,
      role: role
    };
  }

  /**
   * Get case with assigned lawyer
   */
  async getCaseWithAssignment(caseId: string): Promise<any | null> {
    const caseData = await prisma.case.findUnique({
      where: { id: caseId },
      include: {
        assignedLawyer: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true
          }
        }
      }
    });

    if (!caseData) return null;

    return {
      id: caseData.id,
      caseNumber: caseData.caseNumber,
      title: resolveDisplayTitle(caseData),
      clientName: caseData.clientName || 'Unknown Client',
      matterType: caseData.matterType || 'Unknown',
      status: caseData.status,
      description: caseData.description || undefined,
      priority: caseData.priority,
      deadline: caseData.deadline || null,
      clientRole: caseData.clientRole || null,
      sharePointFolderPath: caseData.sharepointRoot || undefined,
      assignedLawyer: caseData.assignedLawyer,
      createdAt: caseData.createdAt,
      updatedAt: caseData.updatedAt
    };
  }

  /**
   * Get dashboard stats
   */
  async getDashboardStats(userId?: string): Promise<{
    stats: { totalCases: number; inReview: number; pendingClient: number; completedThisMonth: number };
    recentActivity: Array<{ id: string; type: string; text: string; timestamp: Date; caseId?: string; taskId?: string; documentId?: string; href?: string }>;
  }> {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [totalCases, inReview, pendingClient, completedThisMonth] = await Promise.all([
      prisma.case.count(),
      prisma.case.count({ where: { status: 'IN_REVIEW' as any } }),
      prisma.case.count({ where: { status: 'CLIENT_INPUT' as any } }),
      prisma.case.count({
        where: {
          status: 'FINAL' as any,
          updatedAt: { gte: startOfMonth }
        }
      })
    ]);

    // Get recent activity
    const recentEvents = await prisma.timelineEvent.findMany({
      where: userId ? { userId } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        eventType: true,
        type: true,
        description: true,
        createdAt: true,
        caseId: true,
        taskId: true,
        documentId: true,
      },
    });

    const recentActivity = recentEvents.map((e: any) => ({
      id: e.id,
      type: e.type || e.eventType,
      text: e.description || e.type || e.eventType,
      timestamp: e.createdAt,
      caseId: e.caseId,
      taskId: e.taskId || undefined,
      documentId: e.documentId || undefined,
      href: e.taskId
        ? `/tasks?taskId=${encodeURIComponent(e.taskId)}`
        : e.documentId && e.caseId
          ? `/documents/compare?caseId=${encodeURIComponent(e.caseId)}&documentId=${encodeURIComponent(e.documentId)}`
          : e.caseId
            ? `/cases/${encodeURIComponent(e.caseId)}`
            : undefined,
    }));

    return {
      stats: {
        totalCases,
        inReview,
        pendingClient,
        completedThisMonth
      },
      recentActivity
    };
  }

  /**
   * Get workflow data for workflow map visualization
   */
  async getWorkflow(caseId: string): Promise<{
    caseId: string;
    currentStatus: string;
    currentStep: string;
    completedSteps: string[];
    documentId?: string;
    documentName?: string;
    timelineEvents: Array<{
      type: string;
      createdAt: string;
    }>;
  } | null> {
    const caseData = await prisma.case.findUnique({
      where: { id: caseId }
    });

    if (!caseData) return null;

    // Get all timeline events
    const events = await prisma.timelineEvent.findMany({
      where: { caseId },
      orderBy: { createdAt: 'asc' }
    });

    // Get latest document
    const latestDoc = await prisma.document.findFirst({
      where: { caseId },
      orderBy: { createdAt: 'desc' }
    });

    // Determine completed steps based on events
    const completedSteps: string[] = [];
    
    // Always start with CLIENT_REGISTERED
    completedSteps.push('CLIENT_REGISTERED');
    
    // Map timeline events to workflow steps
    events.forEach((e: any) => {
      switch (e.type) {
        case 'DOCUMENT_UPLOADED':
        case 'CONTRACT_GENERATED':
          if (!completedSteps.includes('DOCUMENT_GENERATED')) {
            completedSteps.push('DOCUMENT_GENERATED');
          }
          break;
        case 'SENT_TO_REVIEW':
          if (!completedSteps.includes('IN_REVIEW')) {
            completedSteps.push('IN_REVIEW');
          }
          break;
        case 'CONTRACT_REJECTED':
          if (!completedSteps.includes('NEEDS_REVISION')) {
            completedSteps.push('NEEDS_REVISION');
          }
          break;
        case 'CONTRACT_APPROVED':
          if (!completedSteps.includes('APPROVED')) {
            completedSteps.push('APPROVED');
          }
          break;
        case 'SENT_TO_CLIENT':
          if (!completedSteps.includes('SENT_TO_CLIENT')) {
            completedSteps.push('SENT_TO_CLIENT');
          }
          break;
        case 'CLIENT_FEEDBACK_RECEIVED':
          if (!completedSteps.includes('CLIENT_FEEDBACK')) {
            completedSteps.push('CLIENT_FEEDBACK');
          }
          break;
        case 'CASE_CLOSED':
        case 'CASE_COMPLETED':
          if (!completedSteps.includes('CLOSED')) {
            completedSteps.push('CLOSED');
          }
          break;
      }
    });

    // Determine current step based on case status
    let currentStep = 'CLIENT_REGISTERED';
    switch (caseData.status) {
      case 'DRAFT':
        currentStep = completedSteps.includes('DOCUMENT_GENERATED') ? 'DOCUMENT_GENERATED' : 'CLIENT_REGISTERED';
        break;
      case 'IN_REVIEW':
        currentStep = 'IN_REVIEW';
        break;
      case 'APPROVED':
        currentStep = 'APPROVED';
        break;
      case 'SENT_TO_CLIENT':
        currentStep = 'SENT_TO_CLIENT';
        break;
      case 'CLIENT_FEEDBACK':
        currentStep = 'CLIENT_FEEDBACK';
        break;
      case 'FINAL':
        currentStep = 'CLOSED';
        break;
    }

    return {
      caseId: caseData.id,
      currentStatus: caseData.status,
      currentStep,
      completedSteps: [...new Set(completedSteps)],
      documentId: latestDoc?.id,
      documentName: latestDoc?.fileName,
      timelineEvents: events.map((e: any) => ({
        type: e.type,
        createdAt: e.createdAt.toISOString()
      }))
    };
  }

  /**
   * Get all collaborators for a case
   */
  async getCaseCollaborators(caseId: string): Promise<{ id: string; userId: string; role: string; addedAt: Date; user: { id: string; name: string; email: string; role: string } }[]> {
    const collaborators = await prisma.caseCollaborator.findMany({
      where: { caseId },
      include: {
        user: {
          select: { id: true, name: true, email: true, role: true }
        }
      },
      orderBy: { addedAt: 'asc' }
    });
    return collaborators.map(c => ({
      id: c.id,
      userId: c.userId,
      role: c.role,
      addedAt: c.addedAt,
      user: c.user
    }));
  }

  /**
   * Add a collaborator to a case
   */
  async addCaseCollaborator(caseId: string, userId: string, role: string = 'COLLABORATOR'): Promise<{ id: string; userId: string; role: string; addedAt: Date; user: { id: string; name: string; email: string; role: string } }> {
    const collaborator = await prisma.caseCollaborator.create({
      data: { caseId, userId, role },
      include: {
        user: {
          select: { id: true, name: true, email: true, role: true }
        }
      }
    });
    return {
      id: collaborator.id,
      userId: collaborator.userId,
      role: collaborator.role,
      addedAt: collaborator.addedAt,
      user: collaborator.user
    };
  }

  /**
   * Remove a collaborator from a case
   */
  async removeCaseCollaborator(collaboratorId: string): Promise<void> {
    await prisma.caseCollaborator.delete({
      where: { id: collaboratorId }
    });
  }
}

export default new CasesService();
