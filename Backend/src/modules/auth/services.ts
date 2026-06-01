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

const DEFAULT_LOCAL_DEV_EMAIL = 'hubay.mate@balintfy.onmicrosoft.hu';
const DEFAULT_LOCAL_DEV_PASSWORD = 'Password123!';
const DEFAULT_LOCAL_DEV_NAME = 'dr. HUBAY Gyula Máté';

const isProduction = (process.env.NODE_ENV || '').toLowerCase() === 'production';

function isLocalDevLogin(email: string, password: string): boolean {
  if (isProduction) return false;
  const configuredEmail = (process.env.LOCAL_DEV_LOGIN_EMAIL || process.env.DEV_LOGIN_EMAIL || DEFAULT_LOCAL_DEV_EMAIL).trim().toLowerCase();
  const configuredPassword = process.env.LOCAL_DEV_LOGIN_PASSWORD || process.env.DEV_LOGIN_PASSWORD || DEFAULT_LOCAL_DEV_PASSWORD;
  return email.trim().toLowerCase() === configuredEmail && password === configuredPassword;
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
    const normalizedEmail = email.trim().toLowerCase();
    const shouldProvisionLocalDevUser = isLocalDevLogin(normalizedEmail, password);

    let user = await prisma.user.findUnique({
      where: { email: normalizedEmail }
    });

    if (shouldProvisionLocalDevUser) {
      const passwordHash = await bcrypt.hash(password, 10);
      user = await prisma.user.upsert({
        where: { email: normalizedEmail },
        update: {
          passwordHash,
          name: process.env.LOCAL_DEV_LOGIN_NAME || process.env.DEV_LOGIN_NAME || DEFAULT_LOCAL_DEV_NAME,
          role: 'ADMIN',
          status: 'ACTIVE',
          isActive: true,
        },
        create: {
          email: normalizedEmail,
          passwordHash,
          name: process.env.LOCAL_DEV_LOGIN_NAME || process.env.DEV_LOGIN_NAME || DEFAULT_LOCAL_DEV_NAME,
          role: 'ADMIN',
          status: 'ACTIVE',
          isActive: true,
        },
      });
    }

    if (!user) {
      return { status: 401, data: { error: 'Invalid credentials' } };
    }

    const passwordHash = (user as any).passwordHash || (user as any).password_hash;
    if (!passwordHash && shouldProvisionLocalDevUser) {
      const nextPasswordHash = await bcrypt.hash(password, 10);
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash: nextPasswordHash,
          status: 'ACTIVE',
          isActive: true,
        },
      });
    } else if (!passwordHash) {
      return { status: 401, data: { error: 'Invalid credentials' } };
    }

    const effectivePasswordHash = (user as any).passwordHash || (user as any).password_hash;
    const validPassword = await bcrypt.compare(password, effectivePasswordHash);
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
   * Get current user profile by id or email, auto-provision if enabled
   */
  async getMeByClaims(
    userId: string,
    email?: string,
    role?: UserRole,
    autoProvision?: boolean
  ): Promise<{ status: number; data: UserResponse | ApiError }> {
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';

    let user = await prisma.user.findUnique({ where: { id: userId } });

    if (!user && normalizedEmail) {
      user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    }

    if (!user && autoProvision && normalizedEmail) {
      const name = normalizedEmail.split('@')[0] || 'Azure User';
      user = await prisma.user.create({
        data: {
          email: normalizedEmail,
          name,
          role: (role || 'LAWYER') as any,
          status: 'ACTIVE',
          isActive: true
        }
      });
    }

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
