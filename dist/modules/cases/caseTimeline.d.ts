/**
 * Case Timeline Service V2
 * Manages timeline events for case workflow
 */
export declare const EVENT_LABELS: Record<string, string>;
export declare const EVENT_COLORS: Record<string, string>;
interface TimelineEventInput {
    caseId: string;
    type: string;
    description?: string;
    metadata?: Record<string, unknown>;
    userId?: string;
}
interface TimelineEventResponse {
    id: string;
    caseId: string;
    type: string;
    typeLabel: string;
    color: string;
    description: string;
    metadata: Record<string, unknown> | null;
    createdAt: Date;
    user: {
        id: string;
        name: string | null;
        email: string | null;
        role: string;
    } | null;
}
declare class CaseTimelineService {
    /**
     * Get complete timeline for a case
     */
    getTimeline(caseId: string): Promise<TimelineEventResponse[]>;
    /**
     * Create a new timeline event
     */
    createEvent(input: TimelineEventInput): Promise<{
        user: {
            id: string;
            email: string;
            name: string;
            role: import(".prisma/client").$Enums.UserRole;
        };
    } & {
        id: string;
        createdAt: Date;
        userId: string | null;
        description: string | null;
        eventType: import(".prisma/client").$Enums.TimelineEventType;
        type: string | null;
        payload: import("@prisma/client/runtime/library").JsonValue | null;
        metadata: import("@prisma/client/runtime/library").JsonValue | null;
        caseId: string;
        documentId: string | null;
        taskId: string | null;
        timeEntryId: string | null;
    }>;
    /**
     * Get timeline events by type
     */
    getEventsByType(caseId: string, type: string): Promise<({
        user: {
            id: string;
            email: string;
            name: string;
        };
    } & {
        id: string;
        createdAt: Date;
        userId: string | null;
        description: string | null;
        eventType: import(".prisma/client").$Enums.TimelineEventType;
        type: string | null;
        payload: import("@prisma/client/runtime/library").JsonValue | null;
        metadata: import("@prisma/client/runtime/library").JsonValue | null;
        caseId: string;
        documentId: string | null;
        taskId: string | null;
        timeEntryId: string | null;
    })[]>;
    /**
     * Get latest event for a case
     */
    getLatestEvent(caseId: string): Promise<{
        user: {
            id: string;
            email: string;
            name: string;
        };
    } & {
        id: string;
        createdAt: Date;
        userId: string | null;
        description: string | null;
        eventType: import(".prisma/client").$Enums.TimelineEventType;
        type: string | null;
        payload: import("@prisma/client/runtime/library").JsonValue | null;
        metadata: import("@prisma/client/runtime/library").JsonValue | null;
        caseId: string;
        documentId: string | null;
        taskId: string | null;
        timeEntryId: string | null;
    }>;
    /**
     * Get timeline statistics for a case
     */
    getTimelineStats(caseId: string): Promise<Record<string, number>>;
    /**
     * Initialize case timeline with creation event
     */
    initializeCase(caseId: string, userId: string): Promise<{
        id: string;
        createdAt: Date;
        userId: string | null;
        description: string | null;
        eventType: import(".prisma/client").$Enums.TimelineEventType;
        type: string | null;
        payload: import("@prisma/client/runtime/library").JsonValue | null;
        metadata: import("@prisma/client/runtime/library").JsonValue | null;
        caseId: string;
        documentId: string | null;
        taskId: string | null;
        timeEntryId: string | null;
    }>;
}
declare const _default: CaseTimelineService;
export default _default;
//# sourceMappingURL=caseTimeline.d.ts.map