/**
 * Auth Service V2
 * Authentication and token management
 * Matching Prisma Schema V2
 */
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
declare class AuthService {
    /**
     * Authenticate user with email and password
     */
    login(email: string, password: string): Promise<{
        status: number;
        data: LoginResult | ApiError;
    }>;
    /**
     * Get current user profile
     */
    getMe(userId: string): Promise<{
        status: number;
        data: UserResponse | ApiError;
    }>;
    /**
     * Logout user
     */
    logout(userId: string): Promise<void>;
    /**
     * Refresh access token
     */
    refresh(refreshToken: string): Promise<{
        status: number;
        data: {
            accessToken: string;
        } | ApiError;
    }>;
}
declare const _default: AuthService;
export default _default;
//# sourceMappingURL=services.d.ts.map