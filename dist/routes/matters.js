"use strict";
// ============================================================================
// MATTERS API ROUTES
// ============================================================================
//
// CRUD operations for Matters (legal matters/projects)
// ============================================================================
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("@prisma/client");
const router = (0, express_1.Router)();
const prisma = new client_1.PrismaClient();
// ============================================================================
// GET /api/v1/matters - List all matters
// ============================================================================
router.get('/', async (req, res) => {
    try {
        const { clientId, departmentId, status, matterType } = req.query;
        const where = {};
        if (clientId)
            where.clientId = clientId;
        if (departmentId)
            where.departmentId = departmentId;
        if (status)
            where.status = status;
        if (matterType)
            where.matterType = matterType;
        const matters = await prisma.matter.findMany({
            where,
            include: {
                client: {
                    select: { id: true, name: true }
                },
                department: {
                    select: { id: true, name: true }
                },
                _count: {
                    select: {
                        cases: true,
                        timeEntries: true
                    }
                }
            },
            orderBy: { openedAt: 'desc' }
        });
        res.json(matters);
    }
    catch (error) {
        console.error('Error fetching matters:', error);
        res.status(500).json({ error: 'Failed to fetch matters' });
    }
});
// ============================================================================
// GET /api/v1/matters/:id - Get single matter
// ============================================================================
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const matter = await prisma.matter.findUnique({
            where: { id },
            include: {
                client: true,
                department: true,
                cases: {
                    include: {
                        assignedLawyer: {
                            select: { id: true, name: true }
                        }
                    }
                },
                timeEntries: {
                    include: {
                        user: {
                            select: { id: true, name: true }
                        }
                    },
                    orderBy: { workDate: 'desc' }
                },
                tasks: {
                    select: { id: true, title: true, status: true }
                }
            }
        });
        if (!matter) {
            return res.status(404).json({ error: 'Matter not found' });
        }
        // Calculate total minutes
        const totalMinutes = matter.timeEntries.reduce((sum, entry) => sum + entry.minutes, 0);
        res.json({
            ...matter,
            totalMinutes,
            totalHours: (totalMinutes / 60).toFixed(2)
        });
    }
    catch (error) {
        console.error('Error fetching matter:', error);
        res.status(500).json({ error: 'Failed to fetch matter' });
    }
});
// ============================================================================
// POST /api/v1/matters - Create new matter
// ============================================================================
router.post('/', async (req, res) => {
    try {
        const { title, description, matterType, clientId, departmentId, budgetHours } = req.body;
        // Validate required fields
        if (!title || !matterType || !clientId) {
            return res.status(400).json({
                error: 'Missing required fields: title, matterType, clientId'
            });
        }
        // Generate matter reference number
        const count = await prisma.matter.count({
            where: { clientId }
        });
        const matterNumber = `M-${String(count + 1).padStart(4, '0')}`;
        const matter = await prisma.matter.create({
            data: {
                title,
                description,
                matterType,
                clientId,
                departmentId,
                budgetHours: budgetHours ? parseFloat(budgetHours) : null,
                status: 'OPEN'
            },
            include: {
                client: {
                    select: { id: true, name: true }
                },
                department: {
                    select: { id: true, name: true }
                }
            }
        });
        res.status(201).json(matter);
    }
    catch (error) {
        console.error('Error creating matter:', error);
        res.status(500).json({ error: 'Failed to create matter' });
    }
});
// ============================================================================
// PATCH /api/v1/matters/:id - Update matter
// ============================================================================
router.patch('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { title, description, matterType, status, departmentId, budgetHours, closedAt } = req.body;
        const matter = await prisma.matter.update({
            where: { id },
            data: {
                title,
                description,
                matterType,
                status,
                departmentId,
                budgetHours: budgetHours ? parseFloat(budgetHours) : null,
                closedAt: status === 'CLOSED' ? new Date() : closedAt
            },
            include: {
                client: {
                    select: { id: true, name: true }
                },
                department: {
                    select: { id: true, name: true }
                }
            }
        });
        res.json(matter);
    }
    catch (error) {
        console.error('Error updating matter:', error);
        res.status(500).json({ error: 'Failed to update matter' });
    }
});
// ============================================================================
// GET /api/v1/matters/:id/time-summary - Get time summary for matter
// ============================================================================
router.get('/:id/time-summary', async (req, res) => {
    try {
        const { id } = req.params;
        const timeEntries = await prisma.timeEntry.findMany({
            where: { matterId: id },
            include: {
                user: {
                    select: { id: true, name: true }
                },
                department: {
                    select: { id: true, name: true }
                }
            },
            orderBy: { workDate: 'desc' }
        });
        // Group by work type
        const byWorkType = {};
        const byUser = {};
        const byDepartment = {};
        timeEntries.forEach(entry => {
            // By work type
            if (!byWorkType[entry.workType]) {
                byWorkType[entry.workType] = { count: 0, minutes: 0 };
            }
            byWorkType[entry.workType].count++;
            byWorkType[entry.workType].minutes += entry.minutes;
            // By user
            if (!byUser[entry.userId]) {
                byUser[entry.userId] = { name: entry.user.name, minutes: 0 };
            }
            byUser[entry.userId].minutes += entry.minutes;
            // By department
            if (entry.departmentId && entry.department) {
                if (!byDepartment[entry.departmentId]) {
                    byDepartment[entry.departmentId] = { name: entry.department.name, minutes: 0 };
                }
                byDepartment[entry.departmentId].minutes += entry.minutes;
            }
        });
        const totalMinutes = timeEntries.reduce((sum, entry) => sum + entry.minutes, 0);
        res.json({
            totalEntries: timeEntries.length,
            totalMinutes,
            totalHours: (totalMinutes / 60).toFixed(2),
            byWorkType: Object.entries(byWorkType).map(([type, data]) => ({
                workType: type,
                entries: data.count,
                minutes: data.minutes,
                hours: (data.minutes / 60).toFixed(2)
            })),
            byUser: Object.entries(byUser).map(([userId, data]) => ({
                userId,
                userName: data.name,
                minutes: data.minutes,
                hours: (data.minutes / 60).toFixed(2)
            })),
            byDepartment: Object.entries(byDepartment).map(([deptId, data]) => ({
                departmentId: deptId,
                departmentName: data.name,
                minutes: data.minutes,
                hours: (data.minutes / 60).toFixed(2)
            })),
            entries: timeEntries
        });
    }
    catch (error) {
        console.error('Error fetching time summary:', error);
        res.status(500).json({ error: 'Failed to fetch time summary' });
    }
});
exports.default = router;
//# sourceMappingURL=matters.js.map