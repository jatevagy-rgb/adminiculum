/**
 * Users Service V2
 * User management with skill profiles
 * Matching Prisma Schema V2
 */
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
declare class UsersService {
    /**
     * Get all users
     */
    getUsers(params?: {
        role?: Role;
        status?: string;
    }): Promise<{
        data: UserListItem[];
    }>;
    /**
     * Get user by ID
     */
    getUserById(userId: string): Promise<UserDetailDTO | null>;
    /**
     * Create new user
     */
    createUser(params: CreateUserInput): Promise<{
        id: string;
        name: string;
        email: string;
        role: string;
    }>;
    /**
     * Get user skills
     */
    getUserSkills(userId: string): Promise<SkillProfileDTO | null>;
    /**
     * Update user skills
     */
    updateUserSkills(userId: string, skills: Partial<{
        legalAnalysis: number;
        drafting: number;
        clientCommunication: number;
        negotiation: number;
        compliance: number;
        research: number;
    }>): Promise<SkillProfileDTO>;
}
declare const _default: UsersService;
export default _default;
//# sourceMappingURL=services.d.ts.map