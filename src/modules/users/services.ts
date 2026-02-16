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
        status: true,
        _count: {
          select: { assignments: true }
        }
      }
    });

    const data: UserListItem[] = users.map((u) => ({
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
  async getUserById(userId: string): Promise<UserDetailDTO | null> {
    const user = await prisma.user.findUnique({
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

    if (!user) return null;

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
  async createUser(params: CreateUserInput): Promise<{ id: string; name: string; email: string; role: string }> {
    const hashedPassword = await bcrypt.hash('password123', 10);

    const user = await prisma.user.create({
      data: {
        name: params.name,
        email: params.email,
        passwordHash: hashedPassword,
        role: params.role as Role,
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
  async getUserSkills(userId: string): Promise<SkillProfileDTO | null> {
    const skillProfile = await prisma.skillProfile.findUnique({
      where: { userId }
    });

    if (!skillProfile) return null;

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
    const skillProfile = await prisma.skillProfile.upsert({
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

export default new UsersService();
