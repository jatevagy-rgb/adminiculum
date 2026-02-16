"use strict";
/**
 * Workgroup Service
 * Client workload tracking business logic
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.workloadService = exports.workgroupService = void 0;
exports.isValidPeriodFormat = isValidPeriodFormat;
exports.formatPeriod = formatPeriod;
const prisma_service_1 = __importDefault(require("../../prisma/prisma.service"));
// ============================================================================
// Validation Helpers
// ============================================================================
function isValidPeriodFormat(period) {
    // YYYY-MM format validation
    const regex = /^\d{4}-(0[1-9]|1[0-2])$/;
    return regex.test(period);
}
function formatPeriod(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
}
// ============================================================================
// Workgroup CRUD Operations
// ============================================================================
exports.workgroupService = {
    /**
     * Create a new workgroup for a client
     */
    async createWorkgroup(clientId, input) {
        // Verify client exists
        const client = await prisma_service_1.default.client.findUnique({
            where: { id: clientId }
        });
        if (!client) {
            throw new Error('Client not found');
        }
        const workgroup = await prisma_service_1.default.clientWorkgroup.create({
            data: {
                clientId,
                name: input.name,
                description: input.description || null
            }
        });
        return {
            id: workgroup.id,
            clientId: workgroup.clientId,
            name: workgroup.name,
            description: workgroup.description,
            isActive: workgroup.isActive,
            createdAt: workgroup.createdAt,
            updatedAt: workgroup.updatedAt
        };
    },
    /**
     * Get all workgroups for a client
     */
    async getWorkgroupsByClient(clientId) {
        const workgroups = await prisma_service_1.default.clientWorkgroup.findMany({
            where: {
                clientId,
                isActive: true
            },
            orderBy: { name: 'asc' }
        });
        return workgroups.map((wg) => ({
            id: wg.id,
            clientId: wg.clientId,
            name: wg.name,
            description: wg.description,
            isActive: wg.isActive,
            createdAt: wg.createdAt,
            updatedAt: wg.updatedAt
        }));
    },
    /**
     * Get a single workgroup by ID
     */
    async getWorkgroupById(workgroupId) {
        const workgroup = await prisma_service_1.default.clientWorkgroup.findUnique({
            where: { id: workgroupId }
        });
        if (!workgroup) {
            return null;
        }
        return {
            id: workgroup.id,
            clientId: workgroup.clientId,
            name: workgroup.name,
            description: workgroup.description,
            isActive: workgroup.isActive,
            createdAt: workgroup.createdAt,
            updatedAt: workgroup.updatedAt
        };
    },
    /**
     * Update a workgroup
     */
    async updateWorkgroup(workgroupId, input) {
        const workgroup = await prisma_service_1.default.clientWorkgroup.update({
            where: { id: workgroupId },
            data: {
                name: input.name,
                description: input.description,
                isActive: input.isActive
            }
        });
        return {
            id: workgroup.id,
            clientId: workgroup.clientId,
            name: workgroup.name,
            description: workgroup.description,
            isActive: workgroup.isActive,
            createdAt: workgroup.createdAt,
            updatedAt: workgroup.updatedAt
        };
    },
    /**
     * Soft delete a workgroup (set isActive = false)
     */
    async deleteWorkgroup(workgroupId) {
        await prisma_service_1.default.clientWorkgroup.update({
            where: { id: workgroupId },
            data: { isActive: false }
        });
    }
};
// ============================================================================
// Workload Recording Operations
// ============================================================================
exports.workloadService = {
    /**
     * Record workload for a workgroup (upsert - overwrite if exists)
     */
    async recordWorkload(workgroupId, input) {
        // Validate period format
        if (!isValidPeriodFormat(input.period)) {
            throw new Error('Invalid period format. Expected YYYY-MM');
        }
        // Verify workgroup exists
        const workgroup = await prisma_service_1.default.clientWorkgroup.findUnique({
            where: { id: workgroupId }
        });
        if (!workgroup) {
            throw new Error('Workgroup not found');
        }
        const record = await prisma_service_1.default.workloadRecord.upsert({
            where: {
                workgroupId_period: {
                    workgroupId,
                    period: input.period
                }
            },
            update: {
                reportedHours: input.reportedHours,
                note: input.note || null
            },
            create: {
                workgroupId,
                period: input.period,
                reportedHours: input.reportedHours,
                note: input.note || null
            }
        });
        return {
            id: record.id,
            workgroupId: record.workgroupId,
            period: record.period,
            reportedHours: record.reportedHours,
            note: record.note,
            createdAt: record.createdAt,
            updatedAt: record.updatedAt
        };
    },
    /**
     * Get workload records for a workgroup
     */
    async getWorkloadByWorkgroup(workgroupId) {
        const records = await prisma_service_1.default.workloadRecord.findMany({
            where: { workgroupId },
            orderBy: { period: 'desc' }
        });
        return records.map((r) => ({
            id: r.id,
            workgroupId: r.workgroupId,
            period: r.period,
            reportedHours: r.reportedHours,
            note: r.note,
            createdAt: r.createdAt,
            updatedAt: r.updatedAt
        }));
    },
    /**
     * Get workload summary for a client and period
     */
    async getClientWorkloadSummary(clientId, period) {
        // Validate period format
        if (!isValidPeriodFormat(period)) {
            throw new Error('Invalid period format. Expected YYYY-MM');
        }
        // Get all active workgroups for the client
        const workgroups = await prisma_service_1.default.clientWorkgroup.findMany({
            where: {
                clientId,
                isActive: true
            },
            select: {
                id: true,
                name: true
            }
        });
        // Get workload records for the period
        const workloadRecords = await prisma_service_1.default.workloadRecord.findMany({
            where: {
                workgroupId: { in: workgroups.map((w) => w.id) },
                period
            }
        });
        // Build aggregation map
        const aggregationMap = new Map();
        // Initialize all workgroups with 0 hours
        workgroups.forEach((wg) => {
            aggregationMap.set(wg.id, { name: wg.name, hours: 0 });
        });
        // Sum up hours for each workgroup
        workloadRecords.forEach((record) => {
            const existing = aggregationMap.get(record.workgroupId);
            if (existing) {
                existing.hours += record.reportedHours;
            }
        });
        // Calculate total hours
        const aggregations = Array.from(aggregationMap.entries()).map(([id, data]) => ({
            workgroupId: id,
            workgroupName: data.name,
            totalHours: data.hours
        }));
        const totalHours = aggregations.reduce((sum, agg) => sum + agg.totalHours, 0);
        // Calculate percentages
        const workgroupsWithPercentage = aggregations.map(agg => ({
            id: agg.workgroupId,
            name: agg.workgroupName,
            hours: agg.totalHours,
            percentage: totalHours > 0 ? Math.round((agg.totalHours / totalHours) * 1000) / 10 : 0
        }));
        return {
            clientId,
            period,
            totalHours: Math.round(totalHours * 10) / 10,
            workgroups: workgroupsWithPercentage
        };
    }
};
exports.default = {
    workgroupService: exports.workgroupService,
    workloadService: exports.workloadService,
    isValidPeriodFormat,
    formatPeriod
};
//# sourceMappingURL=services.js.map