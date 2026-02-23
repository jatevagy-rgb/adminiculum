/**
 * Cases Service V3 - Integrated with Documents + Timeline
 * Case management with timeline, documents, and summary endpoints
 */
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
    assignedUsers: Array<{
        userId: string;
        name: string;
        role: string;
    }>;
    lastTimelineEvent?: {
        event: string;
        timestamp: Date;
    };
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
declare class CasesService {
    /**
     * Get all cases with pagination
     */
    getCases(params: {
        page?: number;
        limit?: number;
    }): Promise<{
        data: CaseListItem[];
        pagination: {
            page: number;
            limit: number;
            total: number;
        };
    }>;
    /**
     * Get case by ID
     */
    getCaseById(caseId: string): Promise<any | null>;
    /**
     * Get timeline events for a case
     */
    getCaseTimeline(caseId: string): Promise<TimelineEventDTO[]>;
    /**
     * Get documents for a case
     */
    getCaseDocuments(caseId: string): Promise<any[]>;
    /**
     * Get case summary with timeline, documents, and stats
     */
    getCaseSummary(caseId: string): Promise<CaseSummaryDTO | null>;
    /**
     * Create new case
     */
    createCase(params: CreateCaseInput): Promise<{
        id: string;
        caseNumber: string;
        status: string;
        createdAt: Date;
    }>;
    /**
     * Update case status
     */
    updateCaseStatus(caseId: string, newStatus: string, userId: string, comment?: string): Promise<{
        id: string;
        previousStatus: string;
        newStatus: string;
        updatedAt: Date;
    }>;
    /**
     * Assign user to case
     */
    assignUser(caseId: string, userId: string, role: string, assignedById: string): Promise<{
        assignmentId: string;
        caseId: string;
        userId: string;
        role: string;
    }>;
    /**
     * Get dashboard stats
     */
    getDashboardStats(): Promise<{
        stats: {
            totalCases: number;
            inReview: number;
            pendingClient: number;
            completedThisMonth: number;
        };
        recentActivity: Array<{
            id: string;
            type: string;
            text: string;
            timestamp: Date;
            caseId?: string;
        }>;
    }>;
    /**
     * Get workflow data for workflow map visualization
     */
    getWorkflow(caseId: string): Promise<{
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
    } | null>;
}
declare const _default: CasesService;
export default _default;
//# sourceMappingURL=services.d.ts.map