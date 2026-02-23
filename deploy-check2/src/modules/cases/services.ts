/**
 * Cases Service V3 - Integrated with Documents + Timeline
 * Case management with timeline, documents, and summary endpoints
 */

import { prisma } from '../../prisma/prisma.service';
import { driveService } from '../sharepoint';

// Prisma schema enum values
const VALID_MATTER_TYPES = ['REAL_ESTATE_SALE', 'LEASE', 'EMPLOYMENT', 'CORPORATE', 'LITIGATION', 'OTHER'];
const DEFAULT_MATTER_TYPE = 'OTHER';
const DEFAULT_STATUS = 'CLIENT_INPUT';

interface CaseListItem {
  id: string;
  caseNumber: string;
  title: string;
  clientName: string;
  matterType: string;
  status: string;
  priority: string;
  createdAt: Date;
  updatedAt: Date;
  assignedUsers: Array<{ userId: string; name: string; role: string }>;
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
    matterType: string;
    status: string;
    description?: string;
    priority: string;
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
  matterType: string;
  description?: string;
  createdById: string;
}

class CasesService {
  /**
   * Get all cases with pagination
   */
  async getCases(params: { page?: number; limit?: number }): Promise<{ data: CaseListItem[]; pagination: { page: number; limit: number; total: number } }> {
    const { page = 1, limit = 20 } = params;

    const [cases, total] = await Promise.all([
      prisma.case.findMany({
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit
      }),
      prisma.case.count()
    ]);

    const data: CaseListItem[] = cases.map((c: any) => ({
      id: c.id,
      caseNumber: c.caseNumber,
      title: `${c.clientName} - ${c.matterType}`,
      clientName: c.clientName,
      matterType: c.matterType,
      status: c.status,
      priority: c.priority,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      assignedUsers: [],
      lastTimelineEvent: undefined
    }));

    return { data, pagination: { page, limit, total } };
  }

  /**
   * Get case by ID
   */
  async getCaseById(caseId: string): Promise<any | null> {
    const caseData = await prisma.case.findUnique({
      where: { id: caseId }
    });

    if (!caseData) return null;

    return {
      id: caseData.id,
      caseNumber: caseData.caseNumber,
      title: `${caseData.clientName} - ${caseData.matterType}`,
      clientName: caseData.clientName,
      matterType: caseData.matterType,
      status: caseData.status,
      description: caseData.description || undefined,
      priority: caseData.priority,
      sharePointFolderPath: caseData.sharepointRoot || undefined,
      assignedUsers: [],
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
      orderBy: { createdAt: 'desc' }
    });

    // Calculate stats
    const approvedDocs = documents.filter((d: any) => d.folder === 'APPROVED' || d.folder === 'FINAL');
    const pendingReview = documents.filter((d: any) => d.folder === 'REVIEW');

    return {
      case: {
        id: caseData.id,
        caseNumber: caseData.caseNumber,
        title: `${caseData.clientName} - ${caseData.matterType}`,
        clientName: caseData.clientName,
        matterType: caseData.matterType,
        status: caseData.status,
        description: caseData.description || undefined,
        priority: caseData.priority,
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

  /**
   * Create new case
   */
  async createCase(params: CreateCaseInput): Promise<{ id: string; caseNumber: string; status: string; createdAt: Date }> {
    const year = new Date().getFullYear();
    const count = await prisma.case.count();
    const caseNumber = `CASE-${year}-${String(count + 1).padStart(3, '0')}`;

    // Use default if invalid matterType
    const matterType = VALID_MATTER_TYPES.includes(params.matterType) ? params.matterType : DEFAULT_MATTER_TYPE;

    const newCase = await prisma.case.create({
      data: {
        caseNumber,
        clientName: params.clientName,
        matterType: matterType as any,
        description: params.description,
        status: DEFAULT_STATUS as any,
        priority: 'MEDIUM' as any,
        sharepointSite: 'Adminiculum - Legal Workflow',
        sharepointRoot: `/sites/AdminiculumLegalWorkflow/Cases/${caseNumber}`
      } as any
    });

    // Create case folder in SharePoint
    await driveService.createCaseFolders(caseNumber, params.clientName);

    // Create TimelineEvent for case creation
    await prisma.timelineEvent.create({
      data: {
        caseId: newCase.id,
        userId: params.createdById,
        eventType: 'CASE_CREATED',
        type: 'CASE_CREATED' as any,
        payload: {
          caseNumber,
          clientName: params.clientName,
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
   * Assign user to case
   */
  async assignUser(
    caseId: string,
    userId: string,
    role: string,
    assignedById: string
  ): Promise<{ assignmentId: string; caseId: string; userId: string; role: string }> {
    // Use any type to bypass Prisma type checking
    const assignment = await (prisma as any).caseAssignment.create({
      data: {
        caseId,
        userId,
        role: role as any
      }
    });

    // Create TimelineEvent for assignment
    await prisma.timelineEvent.create({
      data: {
        caseId,
        userId: assignedById,
        eventType: 'USER_ASSIGNED',
        type: 'USER_ASSIGNED' as any,
        payload: {
          action: 'USER_ASSIGNED',
          assignedUserId: userId,
          role
        }
      } as any
    });

    return {
      assignmentId: assignment.id,
      caseId: assignment.caseId,
      userId: assignment.userId,
      role: assignment.role
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
}

export default new CasesService();
