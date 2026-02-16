/**
 * Auth Service V2
 * Authentication and token management
 * Matching Prisma Schema V2
 */
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../../prisma/prisma.service';
import { jwtConfig } from '../../config/jwt';
class AuthService {
    /**
     * Authenticate user with email and password
     */
    async login(email, password) {
        const user = await prisma.user.findUnique({
            where: { email }
        });
        if (!user) {
            return { status: 401, data: { error: 'Invalid credentials' } };
        }
        const passwordHash = user.passwordHash || user.password_hash;
        if (!passwordHash) {
            return { status: 401, data: { error: 'Invalid credentials' } };
        }
        const validPassword = await bcrypt.compare(password, passwordHash);
        if (!validPassword) {
            return { status: 401, data: { error: 'Invalid credentials' } };
        }
        if (user.status !== 'ACTIVE') {
            return { status: 403, data: { error: 'Account is not active' } };
        }
        // Update last login
        await prisma.user.update({
            where: { id: user.id },
            data: { lastLoginAt: new Date() }
        });
        const accessToken = jwt.sign({ userId: user.id, email: user.email, role: user.role }, jwtConfig.secret, { expiresIn: '1h' });
        const refreshToken = jwt.sign({ userId: user.id }, jwtConfig.refreshSecret, { expiresIn: '7d' });
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
        const user = await prisma.user.findUnique({
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
        await prisma.user.update({
            where: { id: userId },
            data: { updatedAt: new Date() }
        });
    }
    /**
     * Refresh access token
     */
    async refresh(refreshToken) {
        try {
            const decoded = jwt.verify(refreshToken, jwtConfig.refreshSecret);
            const user = await prisma.user.findUnique({
                where: { id: decoded.userId }
            });
            if (!user || user.status !== 'ACTIVE') {
                return { status: 401, data: { error: 'Invalid token' } };
            }
            const accessToken = jwt.sign({ userId: user.id, email: user.email, role: user.role }, jwtConfig.secret, { expiresIn: '1h' });
            return { status: 200, data: { accessToken } };
        }
        catch {
            return { status: 401, data: { error: 'Invalid token' } };
        }
    }
}
export default new AuthService();
//# sourceMappingURL=services.js.map