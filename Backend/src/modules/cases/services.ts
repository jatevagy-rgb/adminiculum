/**
 * Cases Service V3 - Integrated with Documents + Timeline
 * Case management with timeline, documents, and summary endpoints
 */

import { prisma } from '../../prisma/prisma.service';
import { driveService } from '../sharepoint';
import { workflowService } from '../workflow';

// Prisma schema enum values
const VALID_MATTER_TYPES = ['REAL_ESTATE_SALE', 'LEASE', 'EMPLOYMENT', 'CORPORATE', 'LITIGATION', 'OTHER'];
const DEFAULT_MATTER_TYPE = 'OTHER';
const DEFAULT_STATUS = 'CLIENT_INPUT';

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
  clientColor?: string | null;
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
  clientName: string;
  clientId?: string;
  matterType: string;
  description?: string;
  clientRole?: string | null;
  createdById?: string;
  deadline?: string | null;
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
          }
        },
        ...(Object.keys(where).length ? { where } : {})
      }),
      prisma.case.count(Object.keys(where).length ? { where } : undefined)
    ]);

    const data: CaseListItem[] = cases.map((c: any) => ({
      id: c.id,
      caseNumber: c.caseNumber,
      title: `${c.clientName || 'Unknown Client'} - ${c.matterType || 'Unknown Type'}`,
      clientName: c.clientName || 'Unknown Client',
      clientId: c.clientId,
      matterType: c.matterType || 'Unknown',
      status: c.status,
      priority: c.priority,
      deadline: c.deadline || null,
      clientRole: c.clientRole || null,
      clientColor: null,
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
          }
        }
      }
    });

    if (!caseData) return null;

    return {
      id: caseData.id,
      caseNumber: caseData.caseNumber,
      title: `${caseData.clientName || 'Unknown Client'} - ${caseData.matterType || 'Unknown Type'}`,
      clientName: caseData.clientName || 'Unknown Client',
      clientId: caseData.clientId,
      matterType: caseData.matterType || 'Unknown',
      status: caseData.status,
      description: caseData.description || undefined,
      priority: caseData.priority,
      deadline: caseData.deadline || null,
      clientRole: caseData.clientRole || null,
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
        title: `${caseData.clientName || 'Unknown Client'} - ${caseData.matterType || 'Unknown Type'}`,
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
  async createCase(params: CreateCaseInput): Promise<{ id: string; caseNumber: string; status: string; createdAt: Date }> {
    const year = new Date().getFullYear();
    const count = await prisma.case.count();
    const caseNumber = `CASE-${year}-${String(count + 1).padStart(3, '0')}`;

    // Use default if invalid matterType
    const matterType = VALID_MATTER_TYPES.includes(params.matterType) ? params.matterType : DEFAULT_MATTER_TYPE;

    let resolvedClientName = (params.clientName || '').trim();

    // Prefer explicit existing client linkage when clientId is provided.
    // This avoids creating orphan linkage behavior in create-case flows.
    let resolvedClientId = (params.clientId || '').trim() || undefined;
    if (resolvedClientId) {
      const linkedClient = await prisma.client.findUnique({
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

    // Generate title from resolved clientName + matterType
    const title = `${resolvedClientName} - ${matterType}`;

    if (!params.createdById) {
      throw new Error('Authenticated user is required for case creation');
    }

    const existingUser = await prisma.user.findUnique({
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
      const linkedClient = await prisma.client.findUnique({
        where: { id: clientId },
        select: { id: true, name: true }
      });
      resolvedClientName = linkedClient?.name || 'Unknown Client';
    }

    const newCase = await prisma.case.create({
      data: {
        caseNumber,
        title,
        clientName: resolvedClientName,
        matterType: matterType as any,
        caseType: 'OTHER' as any,
        description: params.description,
        clientRole: params.clientRole ?? null,
        status: DEFAULT_STATUS as any,
        priority: 'MEDIUM' as any,
        deadline: params.deadline ? new Date(params.deadline) : undefined,
        sharepointSite: 'Adminiculum - Legal Workflow',
        sharepointRoot: `/sites/AdminiculumLegalWorkflow/Cases/${caseNumber}`,
        createdById: resolvedCreatedById,
        clientId
      } as any
    });

    // Create case folder in SharePoint
    // If folder creation fails, log but do NOT fail the case creation.
    // The case DB record is the source of truth; SharePoint is a convenience layer.
    const folderResult = await driveService.createCaseFolders(caseNumber, resolvedClientName);
    if (!folderResult) {
      console.warn(`[CASES_SERVICE] SharePoint folder creation returned null for case ${caseNumber}. Case created in DB but SharePoint folder is missing.`);
    }

    // Create TimelineEvent for case creation
    await prisma.timelineEvent.create({
      data: {
        caseId: newCase.id,
        userId: resolvedCreatedById,
        eventType: 'CASE_CREATED',
        type: 'CASE_CREATED' as any,
        payload: {
          caseNumber,
          clientName: resolvedClientName,
          matterType: matterType
        }
      } as any
    });

    return {
      id: newCase.id,
      caseNumber: newCase.caseNumber,
      status: newCase.status,
      createdAt: newCase.createdAt
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
      title: `${caseData.clientName || 'Unknown Client'} - ${caseData.matterType || 'Unknown Type'}`,
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
  async getDashboardStats(): Promise<{
    stats: { totalCases: number; inReview: number; pendingClient: number; completedThisMonth: number };
    recentActivity: Array<{ id: string; type: string; text: string; timestamp: Date; caseId?: string }>;
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
      orderBy: { createdAt: 'desc' },
      take: 10
    });

    const recentActivity = recentEvents.map((e: any) => ({
      id: e.id,
      type: e.type,
      text: e.type,
      timestamp: e.createdAt,
      caseId: e.caseId
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
