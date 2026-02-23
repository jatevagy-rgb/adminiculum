/**
 * Auth Service V2
 * Authentication and token management
 * Matching Prisma Schema V2
 */

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../../prisma/prisma.service';
import { jwtConfig } from '../../config/jwt';

export type UserRole = 'ADMIN' | 'PARTNER' | 'LAWYER' | 'COLLAB_LAWYER' | 'TRAINEE' | 'LEGAL_ASSISTANT' | 'CLIENT' | 'EXTERNAL_REVIEWER';
export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';

interface UserResponse {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

interface LoginResult {
  accessToken: string;
  refreshToken: string;
  user: UserResponse;
}

interface ApiError {
  error: string;
}

class AuthService {
  /**
   * Register a new user (DEV/TEST ONLY)
   */
  async register(
    email: string,
    password: string,
    name: string,
    role: string
  ): Promise<{ status: number; data: UserResponse | ApiError }> {
    // Check if user exists
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return { status: 400, data: { error: 'User already exists' } };
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create user
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        name,
        role: role as any,
        status: 'ACTIVE',
        isActive: true
      }
    });

    return {
      status: 201,
      data: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
      }
    };
  }

  /**
   * Authenticate user with email and password
   */
  async login(
    email: string,
    password: string
  ): Promise<{ status: number; data: LoginResult | ApiError }> {
    const user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user) {
      return { status: 401, data: { error: 'Invalid credentials' } };
    }

    const passwordHash = (user as any).passwordHash || (user as any).password_hash;
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

    const accessToken = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      jwtConfig.secret,
      { expiresIn: '1h' }
    );

    const refreshToken = jwt.sign(
      { userId: user.id },
      jwtConfig.refreshSecret,
      { expiresIn: '7d' }
    );

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
  async getMe(
    userId: string
  ): Promise<{ status: number; data: UserResponse | ApiError }> {
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
  async logout(userId: string): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: { updatedAt: new Date() }
    });
  }

  /**
   * Refresh access token
   */
  async refresh(
    refreshToken: string
  ): Promise<{ status: number; data: { accessToken: string } | ApiError }> {
    try {
      const decoded = jwt.verify(refreshToken, jwtConfig.refreshSecret) as {
        userId: string;
      };

      const user = await prisma.user.findUnique({
        where: { id: decoded.userId }
      });

      if (!user || user.status !== 'ACTIVE') {
        return { status: 401, data: { error: 'Invalid token' } };
      }

      const accessToken = jwt.sign(
        { userId: user.id, email: user.email, role: user.role },
        jwtConfig.secret,
        { expiresIn: '1h' }
      );

      return { status: 200, data: { accessToken } };
    } catch {
      return { status: 401, data: { error: 'Invalid token' } };
    }
  }
}

export default new AuthService();
