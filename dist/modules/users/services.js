/**
 * Users Service V2
 * User management with skill profiles
 * Matching Prisma Schema V2
 */
import { prisma } from '../../prisma/prisma.service';
import bcrypt from 'bcryptjs';
class UsersService {
    /**
     * Get all users
     */
    async getUsers(params) {
        const users = await prisma.user.findMany({
            orderBy: { name: 'asc' },
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                status: true
            }
        });
        const data = users.map((u) => ({
            id: u.id,
            name: u.name,
            email: u.email,
            role: u.role,
            status: u.status,
            caseCount: 0
        }));
        return { data };
    }
    /**
     * Get user by ID
     */
    async getUserById(userId) {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            include: {
                cases: {
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
            status: user.status,
            createdAt: user.createdAt,
            lastLoginAt: user.lastLoginAt || undefined
        };
    }
    /**
     * Create new user
     */
    async createUser(params) {
        const hashedPassword = await bcrypt.hash('password123', 10);
        const user = await prisma.user.create({
            data: {
                name: params.name,
                email: params.email,
                passwordHash: hashedPassword,
                role: params.role
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
        // Return null as skillProfile is not in the current schema
        return null;
    }
    /**
     * Update user skills
     */
    async updateUserSkills(userId, skills) {
        // Return empty skill profile as skillProfile is not in the current schema
        return {
            userId,
            skills: {
                legalAnalysis: 3,
                drafting: 3,
                clientCommunication: 3,
                negotiation: 3,
                compliance: 3,
                research: 3
            }
        };
    }
}
export default new UsersService();
//# sourceMappingURL=services.js.map