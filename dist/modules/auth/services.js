"use strict";
/**
 * Auth Service V2
 * Authentication and token management
 * Matching Prisma Schema V2
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const prisma_service_1 = require("../../prisma/prisma.service");
const jwt_1 = require("../../config/jwt");
class AuthService {
    /**
     * Authenticate user with email and password
     */
    async login(email, password) {
        const user = await prisma_service_1.prisma.user.findUnique({
            where: { email }
        });
        if (!user) {
            return { status: 401, data: { error: 'Invalid credentials' } };
        }
        const passwordHash = user.passwordHash || user.password_hash;
        if (!passwordHash) {
            return { status: 401, data: { error: 'Invalid credentials' } };
        }
        const validPassword = await bcryptjs_1.default.compare(password, passwordHash);
        if (!validPassword) {
            return { status: 401, data: { error: 'Invalid credentials' } };
        }
        if (user.status !== 'ACTIVE') {
            return { status: 403, data: { error: 'Account is not active' } };
        }
        // Update last login
        await prisma_service_1.prisma.user.update({
            where: { id: user.id },
            data: { lastLoginAt: new Date() }
        });
        const accessToken = jsonwebtoken_1.default.sign({ userId: user.id, email: user.email, role: user.role }, jwt_1.jwtConfig.secret, { expiresIn: '1h' });
        const refreshToken = jsonwebtoken_1.default.sign({ userId: user.id }, jwt_1.jwtConfig.refreshSecret, { expiresIn: '7d' });
        return {
            status: 200,
            data: {
                accessToken,
                refreshToken,
                user: {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    role: user.role
                }
            }
        };
    }
    /**
     * Get current user profile
     */
    async getMe(userId) {
        const user = await prisma_service_1.prisma.user.findUnique({
            where: { id: userId }
        });
        if (!user) {
            return { status: 404, data: { error: 'User not found' } };
        }
        return {
            status: 200,
            data: {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role
            }
        };
    }
    /**
     * Logout user
     */
    async logout(userId) {
        await prisma_service_1.prisma.user.update({
            where: { id: userId },
            data: { updatedAt: new Date() }
        });
    }
    /**
     * Refresh access token
     */
    async refresh(refreshToken) {
        try {
            const decoded = jsonwebtoken_1.default.verify(refreshToken, jwt_1.jwtConfig.refreshSecret);
            const user = await prisma_service_1.prisma.user.findUnique({
                where: { id: decoded.userId }
            });
            if (!user || user.status !== 'ACTIVE') {
                return { status: 401, data: { error: 'Invalid token' } };
            }
            const accessToken = jsonwebtoken_1.default.sign({ userId: user.id, email: user.email, role: user.role }, jwt_1.jwtConfig.secret, { expiresIn: '1h' });
            return { status: 200, data: { accessToken } };
        }
        catch {
            return { status: 401, data: { error: 'Invalid token' } };
        }
    }
}
exports.default = new AuthService();
//# sourceMappingURL=services.js.map