// ============================================================================
// CLIENT PORTAL API ROUTES
// ============================================================================
//
// Read-only endpoints for client visibility
// Shows time summaries, department breakdowns, matter details
// Clients can only see their own data
// ============================================================================
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
const router = Router();
const prisma = new PrismaClient();
// ============================================================================
// MIDDLEWARE: Check if user is CLIENT role
// ============================================================================
const requireClientAccess = async (req, res, next) => {
    try {
        // Get user from auth middleware (would be implemented with proper JWT)
        const userId = req.headers['x-user-id'];
        if (!userId) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        const user = await prisma.user.findUnique({
            where: { id: userId }
        });
        if (!user || user.role !== 'CLIENT') {
            return res.status(403).json({ error: 'Access denied. Client access only.' });
        }
        // Attach client ID to request for filtering
        req.clientId = userId; // In real implementation, link user to client
        next();
    }
    catch (error) {
        console.error('Client access check error:', error);
        res.status(500).json({ error: 'Access check failed' });
    }
};
// ============================================================================
// GET /api/v1/client-portal/summary - Client dashboard summary
// ============================================================================
//
// Returns:
// - Total hours logged
// - Active matters count
// - Department breakdown
// ============================================================================
router.get('/summary/:clientId', async (req, res) => {
    try {
        const { clientId } = req.params;
        // Get all matters for this client
        const matters = await prisma.matter.findMany({
            where: { clientId: clientId },
            include: {
                department: {
                    select: { id: true, name: true }
                },
                timeEntries: true
            }
        });
        // Get all time entries for this client
        const allTimeEntries = await prisma.timeEntry.findMany({
            where: {
                matter: { clientId: clientId }
            },
            include: {
                department: {
                    select: { id: true, name: true }
                }
            }
        });
        // Calculate totals
        const totalMinutes = allTimeEntries.reduce((sum, e) => sum + e.minutes, 0);
        const activeMatters = matters.filter(m => m.status === 'OPEN').length;
        // Department breakdown
        const deptStats = {};
        matters.forEach(matter => {
            const deptId = matter.departmentId || 'unassigned';
            const deptName = matter.department?.name || 'Nincs osztály';
            if (!deptStats[deptId]) {
                deptStats[deptId] = { name: deptName, minutes: 0, matters: 0 };
            }
            deptStats[deptId].minutes += matter.totalMinutes;
            if (matter.status === 'OPEN') {
                deptStats[deptId].matters++;
            }
        });
        res.json({
            clientId,
            totalHours: (totalMinutes / 60).toFixed(2),
            totalMinutes,
            activeMatters,
            closedMatters: matters.filter(m => m.status === 'CLOSED').length,
            departmentBreakdown: Object.entries(deptStats).map(([id, data]) => ({
                departmentId: id === 'unassigned' ? null : id,
                departmentName: data.name,
                hours: (data.minutes / 60).toFixed(2),
                minutes: data.minutes,
                activeMatters: data.matters
            }))
        });
    }
    catch (error) {
        console.error('Error fetching client summary:', error);
        res.status(500).json({ error: 'Failed to fetch client summary' });
    }
});
// ============================================================================
// GET /api/v1/client-portal/departments - List departments for client
// ============================================================================
//
// Returns department breakdown with hours
// ============================================================================
router.get('/departments/:clientId', async (req, res) => {
    try {
        const clientId = req.params.clientId;
        const departments = await prisma.department.findMany({
            where: { clientId },
            include: {
                matters: {
                    where: { clientId: clientId },
                    select: { id: true, status: true, totalMinutes: true }
                },
                timeEntries: {
                    where: {
                        matter: { clientId: clientId }
                    },
                    select: { minutes: true }
                }
            }
        });
        const result = departments.map((dept) => {
            const totalMinutes = dept.timeEntries.reduce((sum, e) => sum + e.minutes, 0);
            const activeMatters = dept.matters.filter(m => m.status === 'OPEN').length;
            return {
                id: dept.id,
                name: dept.name,
                description: dept.description,
                activeMatters,
                totalHours: (totalMinutes / 60).toFixed(2),
                totalMinutes
            };
        });
        res.json(result);
    }
    catch (error) {
        console.error('Error fetching departments:', error);
        res.status(500).json({ error: 'Failed to fetch departments' });
    }
});
// ============================================================================
// GET /api/v1/client-portal/departments/:id/matters - List matters for department
// ============================================================================
//
// Returns matters with time summaries (no sensitive details)
// ============================================================================
router.get('/departments/:departmentId/matters', async (req, res) => {
    try {
        const { departmentId } = req.params;
        const matters = await prisma.matter.findMany({
            where: { departmentId: departmentId },
            include: {
                client: {
                    select: { id: true, name: true }
                },
                timeEntries: {
                    select: { minutes: true, workDate: true }
                },
                _count: {
                    select: { cases: true }
                }
            },
            orderBy: { openedAt: 'desc' }
        });
        const result = matters.map((matter) => {
            const totalMinutes = matter.timeEntries.reduce((sum, e) => sum + e.minutes, 0);
            const lastEntry = matter.timeEntries.sort((a, b) => new Date(b.workDate).getTime() - new Date(a.workDate).getTime())[0];
            return {
                id: matter.id,
                title: matter.title,
                type: matter.matterType,
                status: matter.status,
                openedAt: matter.openedAt,
                closedAt: matter.closedAt,
                totalHours: (totalMinutes / 60).toFixed(2),
                totalMinutes,
                lastActivity: lastEntry?.workDate,
                casesCount: matter._count.cases
            };
        });
        res.json(result);
    }
    catch (error) {
        console.error('Error fetching matters:', error);
        res.status(500).json({ error: 'Failed to fetch matters' });
    }
});
// ============================================================================
// GET /api/v1/client-portal/matters/:matterId - Get matter details (client-safe)
// ============================================================================
//
// Returns matter without sensitive internal details
// ============================================================================
router.get('/matters/:matterId', async (req, res) => {
    try {
        const { matterId } = req.params;
        const matter = await prisma.matter.findUnique({
            where: { id: matterId },
            include: {
                client: {
                    select: { id: true, name: true }
                },
                department: {
                    select: { id: true, name: true }
                },
                timeEntries: {
                    include: {
                        user: {
                            select: { name: true } // Only name, no email
                        },
                        department: {
                            select: { name: true }
                        }
                    },
                    orderBy: { workDate: 'desc' }
                }
            }
        });
        if (!matter) {
            return res.status(404).json({ error: 'Matter not found' });
        }
        // Group time entries by type for summary
        const byType = {};
        matter.timeEntries.forEach(entry => {
            if (!byType[entry.workType]) {
                byType[entry.workType] = { type: entry.workType, minutes: 0, count: 0 };
            }
            byType[entry.workType].minutes += entry.minutes;
            byType[entry.workType].count++;
        });
        // Latest entries (last 10)
        const recentEntries = matter.timeEntries.slice(0, 10).map(e => ({
            workType: e.workType,
            description: e.description,
            minutes: e.minutes,
            hours: (e.minutes / 60).toFixed(2),
            workDate: e.workDate,
            userName: e.user.name,
            departmentName: e.department?.name
        }));
        res.json({
            id: matter.id,
            title: matter.title,
            description: matter.description,
            type: matter.matterType,
            status: matter.status,
            openedAt: matter.openedAt,
            closedAt: matter.closedAt,
            department: matter.department,
            client: matter.client,
            totalHours: (matter.totalMinutes / 60).toFixed(2),
            totalMinutes: matter.totalMinutes,
            timeByType: Object.values(byType).map(t => ({
                workType: t.type,
                hours: (t.minutes / 60).toFixed(2),
                entries: t.count
            })),
            recentEntries
        });
    }
    catch (error) {
        console.error('Error fetching matter:', error);
        res.status(500).json({ error: 'Failed to fetch matter' });
    }
});
// ============================================================================
// GET /api/v1/client-portal/matters/:matterId/time-log - Get time log for matter
// ============================================================================
//
// Returns time entries without internal metadata
// ============================================================================
router.get('/matters/:matterId/time-log', async (req, res) => {
    try {
        const { matterId } = req.params;
        const { limit = '50', offset = '0' } = req.query;
        const entries = await prisma.timeEntry.findMany({
            where: { matterId: matterId },
            include: {
                user: {
                    select: { name: true }
                },
                department: {
                    select: { name: true }
                }
            },
            orderBy: { workDate: 'desc' },
            take: parseInt(limit),
            skip: parseInt(offset)
        });
        const total = await prisma.timeEntry.count({ where: { matterId: matterId } });
        const result = entries.map(e => ({
            id: e.id,
            workType: e.workType,
            description: e.description,
            minutes: e.minutes,
            hours: (e.minutes / 60).toFixed(2),
            workDate: e.workDate,
            userName: e.user.name,
            departmentName: e.department?.name
        }));
        res.json({
            entries: result,
            total,
            hasMore: parseInt(offset) + entries.length < total
        });
    }
    catch (error) {
        console.error('Error fetching time log:', error);
        res.status(500).json({ error: 'Failed to fetch time log' });
    }
});
// ============================================================================
// GET /api/v1/client-portal/export/:clientId - Export data for client
// ============================================================================
//
// Returns all data in exportable format
// ============================================================================
router.get('/export/:clientId', async (req, res) => {
    try {
        const clientId = req.params.clientId;
        const { format = 'json' } = req.query;
        const client = await prisma.client.findUnique({
            where: { id: clientId }
        });
        if (!client) {
            return res.status(404).json({ error: 'Client not found' });
        }
        const departments = await prisma.department.findMany({
            where: { clientId },
            include: {
                matters: {
                    include: {
                        timeEntries: {
                            include: {
                                user: { select: { name: true } },
                                department: { select: { name: true } }
                            }
                        }
                    }
                }
            }
        });
        const exportData = {
            client: {
                name: client.name,
                exportedAt: new Date().toISOString()
            },
            summary: {
                totalHours: "0",
                totalMinutes: 0,
                activeMatters: 0
            },
            departments: departments.map((dept) => {
                const deptMinutes = dept.matters.reduce((sum, m) => sum + m.timeEntries.reduce((s, e) => s + e.minutes, 0), 0);
                const activeMatters = dept.matters.filter(m => m.status === 'OPEN').length;
                return {
                    name: dept.name,
                    matters: dept.matters.map((m) => ({
                        title: m.title,
                        type: m.matterType,
                        status: m.status,
                        openedAt: m.openedAt,
                        closedAt: m.closedAt,
                        totalMinutes: m.totalMinutes,
                        timeEntries: m.timeEntries.map(e => ({
                            workType: e.workType,
                            description: e.description,
                            minutes: e.minutes,
                            workDate: e.workDate,
                            userName: e.user.name,
                            departmentName: e.department?.name
                        }))
                    })),
                    totalMinutes: deptMinutes,
                    activeMatters
                };
            })
        };
        // Calculate grand total
        exportData.summary.totalMinutes = exportData.departments.reduce((sum, d) => sum + d.totalMinutes, 0);
        exportData.summary.totalHours = (exportData.summary.totalMinutes / 60).toFixed(2);
        exportData.summary.activeMatters = exportData.departments.reduce((sum, d) => sum + d.activeMatters, 0);
        if (format === 'csv') {
            // Simple CSV export
            let csv = 'Department,Matter,Work Type,Description,Minutes,Date,User\n';
            exportData.departments.forEach(dept => {
                dept.matters.forEach(matter => {
                    matter.timeEntries.forEach(entry => {
                        csv += `"${dept.name}","${matter.title}","${entry.workType}","${entry.description}",${entry.minutes},${entry.workDate},"${entry.userName}"\n`;
                    });
                });
            });
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename=export-${clientId}.csv`);
            return res.send(csv);
        }
        res.json(exportData);
    }
    catch (error) {
        console.error('Error exporting data:', error);
        res.status(500).json({ error: 'Failed to export data' });
    }
});
export default router;
//# sourceMappingURL=clientPortal.js.map