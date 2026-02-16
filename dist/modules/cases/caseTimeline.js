"use strict";
/**
 * Case Timeline Service V2
 * Manages timeline events for case workflow
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.EVENT_COLORS = exports.EVENT_LABELS = void 0;
const prisma_service_1 = require("../../prisma/prisma.service");
// Display names in Hungarian
exports.EVENT_LABELS = {
    CASE_CREATED: 'Ügy létrehozva',
    CASE_ASSIGNED: 'Ügy hozzárendelve',
    CASE_STATUS_CHANGED: 'Státusz változás',
    CASE_CLOSED: 'Ügy lezárva',
    CASE_REOPENED: 'Ügy újranyitva',
    DOCUMENT_CREATED: 'Dokumentum létrehozva',
    DOCUMENT_GENERATED: 'Szerződés generálva',
    DOCUMENT_UPLOADED: 'Dokumentum feltöltve',
    DOCUMENT_DOWNLOADED: 'Dokumentum letöltve',
    DOCUMENT_UPDATED: 'Dokumentum frissítve',
    DOCUMENT_DELETED: 'Dokumentum törölve',
    SUBMITTED_FOR_REVIEW: 'Review-ra beküldve',
    REVIEW_STARTED: 'Felülvizsgálat indult',
    DOCUMENT_APPROVED: 'Dokumentum jóváhagyva',
    DOCUMENT_REJECTED: 'Dokumentum elutasítva',
    REVIEW_COMMENT_ADDED: 'Review komment hozzáadva',
    CHECKED_OUT: 'Check-out',
    CHECKED_IN: 'Check-in',
    VERSION_CREATED: 'Új verzió létrehozva',
    PERMISSION_GRANTED: 'Jogosultság megadva',
    PERMISSION_REVOKED: 'Jogosultság visszavonva',
    TASK_CREATED: 'Feladat létrehozva',
    TASK_COMPLETED: 'Feladat teljesítve',
    TASK_ASSIGNED: 'Feladat hozzárendelve',
    CUSTOM: 'Egyéni esemény',
};
// Colors for each event type
exports.EVENT_COLORS = {
    CASE_CREATED: '#6366f1',
    CASE_ASSIGNED: '#8b5cf6',
    CASE_STATUS_CHANGED: '#3b82f6',
    CASE_CLOSED: '#22c55e',
    CASE_REOPENED: '#f59e0b',
    DOCUMENT_CREATED: '#06b6d4',
    DOCUMENT_GENERATED: '#f97316',
    DOCUMENT_UPLOADED: '#64748b',
    SUBMITTED_FOR_REVIEW: '#3b82f6',
    REVIEW_STARTED: '#f59e0b',
    DOCUMENT_APPROVED: '#10b981',
    DOCUMENT_REJECTED: '#ef4444',
    REVIEW_COMMENT_ADDED: '#a855f7',
    CHECKED_OUT: '#f59e0b',
    CHECKED_IN: '#10b981',
    VERSION_CREATED: '#06b6d4',
    PERMISSION_GRANTED: '#10b981',
    PERMISSION_REVOKED: '#ef4444',
    TASK_CREATED: '#06b6d4',
    TASK_COMPLETED: '#22c55e',
    TASK_ASSIGNED: '#8b5cf6',
    CUSTOM: '#64748b',
};
class CaseTimelineService {
    /**
     * Get complete timeline for a case
     */
    async getTimeline(caseId) {
        const events = await prisma_service_1.prisma.timelineEvent.findMany({
            where: { caseId },
            include: {
                user: {
                    select: { id: true, name: true, email: true, role: true }
                }
            },
            orderBy: { createdAt: 'asc' },
        });
        return events.map((event) => ({
            id: event.id,
            caseId: event.caseId,
            type: event.type,
            typeLabel: exports.EVENT_LABELS[event.type] || event.type,
            color: exports.EVENT_COLORS[event.type] || '#6366f1',
            description: event.payload?.description || exports.EVENT_LABELS[event.type] || event.type,
            metadata: event.payload,
            createdAt: event.createdAt,
            user: event.user ? {
                id: event.user.id,
                name: event.user.name,
                email: event.user.email,
                role: event.user.role,
            } : null,
        }));
    }
    /**
     * Create a new timeline event
     */
    async createEvent(input) {
        const { caseId, type, description, metadata, userId } = input;
        const event = await prisma_service_1.prisma.timelineEvent.create({
            data: {
                caseId,
                eventType: type,
                type: type,
                userId,
                payload: {
                    description: description || exports.EVENT_LABELS[type] || type,
                    ...metadata,
                },
            },
            include: {
                user: {
                    select: { id: true, name: true, email: true, role: true }
                }
            }
        });
        return event;
    }
    /**
     * Get timeline events by type
     */
    async getEventsByType(caseId, type) {
        return prisma_service_1.prisma.timelineEvent.findMany({
            where: { caseId, type: type },
            include: {
                user: {
                    select: { id: true, name: true, email: true }
                }
            },
            orderBy: { createdAt: 'desc' },
        });
    }
    /**
     * Get latest event for a case
     */
    async getLatestEvent(caseId) {
        return prisma_service_1.prisma.timelineEvent.findFirst({
            where: { caseId },
            include: {
                user: {
                    select: { id: true, name: true, email: true }
                }
            },
            orderBy: { createdAt: 'desc' },
        });
    }
    /**
     * Get timeline statistics for a case
     */
    async getTimelineStats(caseId) {
        const events = await prisma_service_1.prisma.timelineEvent.findMany({
            where: { caseId },
            select: { type: true },
        });
        const stats = {};
        for (const event of events) {
            stats[event.type] = (stats[event.type] || 0) + 1;
        }
        return stats;
    }
    /**
     * Initialize case timeline with creation event
     */
    async initializeCase(caseId, userId) {
        const existing = await prisma_service_1.prisma.timelineEvent.findFirst({
            where: { caseId },
            orderBy: { createdAt: 'desc' },
        });
        if (existing && existing.type === 'CASE_CREATED')
            return existing;
        return this.createEvent({
            caseId,
            type: 'CASE_CREATED',
            description: 'Ügy létrehozva a rendszerben',
            userId,
        });
    }
}
exports.default = new CaseTimelineService();
//# sourceMappingURL=caseTimeline.js.map