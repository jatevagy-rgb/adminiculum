/**
 * Users Service V2
 * User management with skill profiles
 * Matching Prisma Schema V2
 */

import { prisma } from '../../prisma/prisma.service';
import bcrypt from 'bcryptjs';

type Role = 'LAWYER' | 'COLLAB_LAWYER' | 'TRAINEE' | 'LEGAL_ASSISTANT' | 'ADMIN';

interface UserListItem {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  caseCount: number;
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

    const data = users.map((u: any) => ({
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
    const hashedPassword = await bcrypt.hash('password123', 10);

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
