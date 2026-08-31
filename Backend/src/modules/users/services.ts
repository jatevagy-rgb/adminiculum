/**
 * Users Service V2
 * User management with skill profiles
 * Matching Prisma Schema V2
 */

import { randomUUID } from 'crypto';
import { prisma } from '../../prisma/prisma.service';
import bcrypt from 'bcryptjs';
import type { UserStatus } from '@prisma/client';

type Role = 'LAWYER' | 'COLLAB_LAWYER' | 'TRAINEE' | 'LEGAL_ASSISTANT' | 'ADMIN' | 'PARTNER';

const INTERNAL_PILOT_ROLES: Role[] = ['ADMIN', 'PARTNER', 'LAWYER', 'COLLAB_LAWYER', 'TRAINEE', 'LEGAL_ASSISTANT'];
const PILOT_TEAM_EMAILS = [
  'hubay.gyula@balintfy.onmicrosoft.com',
  'csanad@trugly.eu',
  'sommer.anna@balintfy.onmicrosoft.com',
  'szucs.amanda@balintfy.onmicrosoft.com',
];

interface UserListItem {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  caseCount: number;
  createdAt: Date;
}

interface UserDetailDTO {
  id: string;
  name: string;
  email: string;
  role: string;
  title?: string;
  phone?: string;
  hourlyRate?: number;
  status: string;
  createdAt: Date;
  lastLoginAt?: Date;
  skillProfile?: SkillProfileDTO;
  assignments?: Array<{
    caseId: string;
    caseNumber: string;
    role: string;
    assignedAt: Date;
  }>;
}

interface SkillProfileDTO {
  userId: string;
  skills: {
    legalAnalysis: number;
    drafting: number;
    clientCommunication: number;
    negotiation: number;
    compliance: number;
    research: number;
  };
}

interface CreateUserInput {
  name: string;
  email: string;
  role: Role;
  title?: string;
  phone?: string;
  hourlyRate?: number;
}

class UsersService {
  /**
   * Get all users
   */
  async getUsers(params?: {
    role?: Role;
    status?: string;
  }): Promise<{ data: UserListItem[] }> {
    const baseWhere = {
      isActive: true,
      status: (params?.status || 'ACTIVE') as UserStatus,
      role: params?.role ? params.role : { in: INTERNAL_PILOT_ROLES },
    };

    const pilotUsers = await prisma.user.findMany({
      where: {
        ...baseWhere,
        email: { in: PILOT_TEAM_EMAILS },
      },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        createdAt: true
      }
    });

    const users = pilotUsers.length > 0
      ? pilotUsers.sort((left, right) => {
          const leftIndex = PILOT_TEAM_EMAILS.indexOf(String(left.email || '').toLowerCase());
          const rightIndex = PILOT_TEAM_EMAILS.indexOf(String(right.email || '').toLowerCase());
          return leftIndex - rightIndex;
        })
      : await prisma.user.findMany({
          where: baseWhere,
          orderBy: { name: 'asc' },
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            status: true,
            createdAt: true
          }
        });

    const data = users.map((u: any) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      status: u.status,
      caseCount: 0
      ,
      createdAt: u.createdAt
    }));

    return { data };
  }

  /**
   * Get user by ID
   */
  async getUserById(userId: string): Promise<UserDetailDTO | null> {
    const user = await (prisma.user.findUnique as any)({
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

    if (!user) return null;

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
  async createUser(params: CreateUserInput): Promise<{ id: string; name: string; email: string; role: string }> {
    const hashedPassword = await bcrypt.hash(randomUUID(), 10);

    const user = await prisma.user.create({
      data: {
        name: params.name,
        email: params.email,
        passwordHash: hashedPassword,
        role: params.role as Role
      } as any
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
  async getUserSkills(userId: string): Promise<SkillProfileDTO | null> {
    // Return null as skillProfile is not in the current schema
    return null;
  }

  /**
   * Update user skills
   */
  async updateUserSkills(
    userId: string,
    skills: Partial<{
      legalAnalysis: number;
      drafting: number;
      clientCommunication: number;
      negotiation: number;
      compliance: number;
      research: number;
    }>
  ): Promise<SkillProfileDTO> {
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
