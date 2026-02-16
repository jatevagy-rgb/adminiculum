"use strict";
/**
 * Users Service V2
 * User management with skill profiles
 * Matching Prisma Schema V2
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const prisma_service_1 = require("../../prisma/prisma.service");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
class UsersService {
    /**
     * Get all users
     */
    async getUsers(params) {
        const users = await prisma_service_1.prisma.user.findMany({
            orderBy: { name: 'asc' },
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                status: true,
                _count: {
                    select: { assignments: true }
                }
            }
        });
        const data = users.map((u) => ({
            id: u.id,
            name: u.name,
            email: u.email,
            role: u.role,
            status: u.status,
            caseCount: u._count.assignments
        }));
        return { data };
    }
    /**
     * Get user by ID
     */
    async getUserById(userId) {
        const user = await prisma_service_1.prisma.user.findUnique({
            where: { id: userId },
            include: {
                skillProfile: true,
                assignments: {
                    include: {
                        case: {
                            select: { id: true, caseNumber: true }
                        }
                    }
                }
            }
        });
        if (!user)
            return null;
        return {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            title: user.title || undefined,
            phone: user.phone || undefined,
            hourlyRate: user.hourlyRate || undefined,
            status: user.status,
            createdAt: user.createdAt,
            lastLoginAt: user.lastLoginAt || undefined,
            skillProfile: user.skillProfile
                ? {
                    userId: user.skillProfile.userId,
                    skills: {
                        legalAnalysis: user.skillProfile.legalAnalysis,
                        drafting: user.skillProfile.drafting,
                        clientCommunication: user.skillProfile.clientCommunication,
                        negotiation: user.skillProfile.negotiation,
                        compliance: user.skillProfile.compliance,
                        research: user.skillProfile.research
                    }
                }
                : undefined,
            assignments: user.assignments.map((a) => ({
                caseId: a.case.id,
                caseNumber: a.case.caseNumber,
                role: a.role,
                assignedAt: a.createdAt
            }))
        };
    }
    /**
     * Create new user
     */
    async createUser(params) {
        const hashedPassword = await bcryptjs_1.default.hash('password123', 10);
        const user = await prisma_service_1.prisma.user.create({
            data: {
                name: params.name,
                email: params.email,
                passwordHash: hashedPassword,
                role: params.role,
                title: params.title,
                phone: params.phone,
                hourlyRate: params.hourlyRate
            }
        });
        return {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role
        };
    }
    /**
     * Get user skills
     */
    async getUserSkills(userId) {
        const skillProfile = await prisma_service_1.prisma.skillProfile.findUnique({
            where: { userId }
        });
        if (!skillProfile)
            return null;
        return {
            userId: skillProfile.userId,
            skills: {
                legalAnalysis: skillProfile.legalAnalysis,
                drafting: skillProfile.drafting,
                clientCommunication: skillProfile.clientCommunication,
                negotiation: skillProfile.negotiation,
                compliance: skillProfile.compliance,
                research: skillProfile.research
            }
        };
    }
    /**
     * Update user skills
     */
    async updateUserSkills(userId, skills) {
        const skillProfile = await prisma_service_1.prisma.skillProfile.upsert({
            where: { userId },
            update: skills,
            create: {
                userId,
                legalAnalysis: skills.legalAnalysis || 3,
                drafting: skills.drafting || 3,
                clientCommunication: skills.clientCommunication || 3,
                negotiation: skills.negotiation || 3,
                compliance: skills.compliance || 3,
                research: skills.research || 3
            }
        });
        return {
            userId: skillProfile.userId,
            skills: {
                legalAnalysis: skillProfile.legalAnalysis,
                drafting: skillProfile.drafting,
                clientCommunication: skillProfile.clientCommunication,
                negotiation: skillProfile.negotiation,
                compliance: skillProfile.compliance,
                research: skillProfile.research
            }
        };
    }
}
exports.default = new UsersService();
//# sourceMappingURL=services.js.map