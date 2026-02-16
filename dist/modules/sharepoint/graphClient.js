"use strict";
/**
 * Graph Client Service
 * Microsoft Graph API client using native fetch
 */
Object.defineProperty(exports, "__esModule", { value: true });
class GraphClientService {
    config;
    accessToken = null;
    tokenExpiry = null;
    constructor() {
        this.config = {
            // Support both AZURE_* and SP_* environment variable prefixes
            clientId: process.env.SP_CLIENT_ID || process.env.AZURE_CLIENT_ID || '',
            clientSecret: process.env.SP_CLIENT_SECRET || process.env.AZURE_CLIENT_SECRET || '',
            tenantId: process.env.SP_TENANT_ID || process.env.AZURE_TENANT_ID || '',
            redirectUri: process.env.AZURE_REDIRECT_URI || 'http://localhost:3000/callback',
            siteId: process.env.SP_SITE_ID || process.env.SHAREPOINT_SITE_ID || '',
            driveId: process.env.SP_DRIVE_ID || process.env.SHAREPOINT_DRIVE_ID || '',
        };
    }
    async getAccessToken() {
        if (this.accessToken && this.tokenExpiry && this.tokenExpiry > new Date()) {
            return this.accessToken;
        }
        const tokenUrl = `https://login.microsoftonline.com/${this.config.tenantId}/oauth2/v2.0/token`;
        const params = new URLSearchParams({
            client_id: this.config.clientId,
            client_secret: this.config.clientSecret,
            scope: 'https://graph.microsoft.com/.default',
            grant_type: 'client_credentials',
        });
        const response = await fetch(tokenUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params.toString(),
        });
        if (!response.ok) {
            throw new Error(`Token request failed: ${response.status}`);
        }
        const data = await response.json();
        this.accessToken = data.access_token;
        this.tokenExpiry = new Date(Date.now() + (data.expires_in - 60) * 1000);
        return this.accessToken;
    }
    async get(endpoint, options) {
        const token = await this.getAccessToken();
        let url = endpoint;
        if (options?.siteId)
            url = url.replace('{siteId}', options.siteId);
        if (options?.driveId)
            url = url.replace('{driveId}', options.driveId);
        const response = await fetch(`https://graph.microsoft.com/v1.0${url}`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        });
        if (!response.ok) {
            throw new Error(`Graph API GET failed: ${response.status}`);
        }
        return (await response.json());
    }
    async post(endpoint, body, options) {
        const token = await this.getAccessToken();
        let url = endpoint;
        if (options?.siteId)
            url = url.replace('{siteId}', options.siteId);
        if (options?.driveId)
            url = url.replace('{driveId}', options.driveId);
        const response = await fetch(`https://graph.microsoft.com/v1.0${url}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!response.ok) {
            throw new Error(`Graph API POST failed: ${response.status}`);
        }
        return (await response.json());
    }
    async put(endpoint, body, options) {
        const token = await this.getAccessToken();
        let url = endpoint;
        if (options?.siteId)
            url = url.replace('{siteId}', options.siteId);
        if (options?.driveId)
            url = url.replace('{driveId}', options.driveId);
        const response = await fetch(`https://graph.microsoft.com/v1.0${url}`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!response.ok) {
            throw new Error(`Graph API PUT failed: ${response.status}`);
        }
        return (await response.json());
    }
    async patch(endpoint, body, options) {
        const token = await this.getAccessToken();
        let url = endpoint;
        if (options?.siteId)
            url = url.replace('{siteId}', options.siteId);
        if (options?.driveId)
            url = url.replace('{driveId}', options.driveId);
        const response = await fetch(`https://graph.microsoft.com/v1.0${url}`, {
            method: 'PATCH',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!response.ok) {
            throw new Error(`Graph API PATCH failed: ${response.status}`);
        }
        return (await response.json());
    }
    getConfig() {
        return { ...this.config };
    }
    isConfigured() {
        return !!(this.config.clientId && this.config.clientSecret && this.config.tenantId);
    }
}
exports.default = new GraphClientService();
//# sourceMappingURL=graphClient.js.map