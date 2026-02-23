/**
 * Graph Client Service
 * Microsoft Graph API client using native fetch
 */
interface SharePointConfig {
    clientId: string;
    clientSecret: string;
    tenantId: string;
    redirectUri: string;
    siteId: string;
    driveId: string;
}
declare class GraphClientService {
    private config;
    private accessToken;
    private tokenExpiry;
    constructor();
    getAccessToken(): Promise<string>;
    get<T = any>(endpoint: string, options?: Record<string, any>): Promise<T>;
    post<T = any>(endpoint: string, body: unknown, options?: Record<string, any>): Promise<T>;
    put<T = any>(endpoint: string, body: unknown, options?: Record<string, any>): Promise<T>;
    patch<T = any>(endpoint: string, body: unknown, options?: Record<string, any>): Promise<T>;
    getConfig(): SharePointConfig;
    isConfigured(): boolean;
}
declare const _default: GraphClientService;
export default _default;
//# sourceMappingURL=graphClient.d.ts.map