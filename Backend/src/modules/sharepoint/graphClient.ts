/**
 * Graph Client Service
 * Microsoft Graph API client using native fetch
 */

interface TokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

type GraphClientRequestOptions = {
  siteId?: string;
  driveId?: string;
  asBinary?: boolean;
  headers?: Record<string, string>;
};

interface SharePointConfig {
  clientId: string;
  clientSecret: string;
  tenantId: string;
  redirectUri: string;
  siteId: string;
  driveId: string;
}

export class GraphClientError extends Error {
  status?: number;
  code?: string;
  operation: string;
  endpoint: string;
  retryable: boolean;

  constructor(params: {
    message: string;
    operation: string;
    endpoint: string;
    status?: number;
    code?: string;
  }) {
    super(params.message);
    this.name = 'GraphClientError';
    this.operation = params.operation;
    this.endpoint = params.endpoint;
    this.status = params.status;
    this.code = params.code;
    this.retryable = [429, 502, 503, 504].includes(params.status || 0);
  }
}

class GraphClientService {
  private config: SharePointConfig;
  private accessToken: string | null = null;
  private tokenExpiry: Date | null = null;

  constructor() {
    this.config = {
      // Canonical env naming: SP_*
      // Legacy compatibility fallback: AZURE_* and SHAREPOINT_*
      clientId: process.env.SP_CLIENT_ID || process.env.AZURE_CLIENT_ID || '',
      clientSecret: process.env.SP_CLIENT_SECRET || process.env.AZURE_CLIENT_SECRET || '',
      tenantId: process.env.SP_TENANT_ID || process.env.AZURE_TENANT_ID || '',
      redirectUri: process.env.AZURE_REDIRECT_URI || 'http://localhost:3000/callback',
      siteId: process.env.SP_SITE_ID || process.env.SHAREPOINT_SITE_ID || '',
      driveId: process.env.SP_DRIVE_ID || process.env.SHAREPOINT_DRIVE_ID || '',
    };
  }

  async getAccessToken(): Promise<string> {
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
      throw new GraphClientError({
        operation: 'token',
        endpoint: tokenUrl,
        status: response.status,
        code: 'TOKEN_REQUEST_FAILED',
        message: `Token request failed (${response.status})`,
      });
    }

    const data = await response.json() as TokenResponse;
    this.accessToken = data.access_token;
    this.tokenExpiry = new Date(Date.now() + (data.expires_in - 60) * 1000);

    return this.accessToken;
  }

  private resolveUrl(endpoint: string, options?: GraphClientRequestOptions): string {
    let url = endpoint;
    if (options?.siteId) url = url.replace('{siteId}', options.siteId);
    if (options?.driveId) url = url.replace('{driveId}', options.driveId);
    return `https://graph.microsoft.com/v1.0${url}`;
  }

  private async handleErrorResponse(
    response: Response,
    operation: string,
    endpoint: string
  ): Promise<never> {
    let code = 'GRAPH_REQUEST_FAILED';
    let message = `${operation.toUpperCase()} request failed (${response.status})`;

    try {
      const payload = await response.json();
      const graphError = (payload as any)?.error;
      if (graphError?.code) code = String(graphError.code);
      if (graphError?.message) message = String(graphError.message).slice(0, 400);
    } catch {
      try {
        const raw = await response.text();
        if (raw) message = raw.slice(0, 400);
      } catch {
        // ignore
      }
    }

    throw new GraphClientError({
      operation,
      endpoint,
      status: response.status,
      code,
      message,
    });
  }

  async get<T = any>(endpoint: string, options?: GraphClientRequestOptions): Promise<T> {
    const token = await this.getAccessToken();
    const url = this.resolveUrl(endpoint, options);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: options?.asBinary ? '*/*' : 'application/json',
        ...(options?.headers || {}),
      },
    });

    if (!response.ok) {
      await this.handleErrorResponse(response, 'get', endpoint);
    }

    if (options?.asBinary) {
      const bytes = await response.arrayBuffer();
      return Buffer.from(bytes) as T;
    }

    return (await response.json()) as T;
  }

  async post<T = any>(endpoint: string, body: unknown, options?: GraphClientRequestOptions): Promise<T> {
    const token = await this.getAccessToken();
    const url = this.resolveUrl(endpoint, options);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(options?.headers || {}),
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      await this.handleErrorResponse(response, 'post', endpoint);
    }

    return (await response.json()) as T;
  }

  async put<T = any>(endpoint: string, body: unknown, options?: GraphClientRequestOptions): Promise<T> {
    const token = await this.getAccessToken();
    const url = this.resolveUrl(endpoint, options);
    const isBinaryBody = Buffer.isBuffer(body);

    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        ...(isBinaryBody ? { 'Content-Type': 'application/octet-stream' } : { 'Content-Type': 'application/json' }),
        ...(options?.headers || {}),
      },
      body: isBinaryBody ? (body as Buffer) : JSON.stringify(body),
    });

    if (!response.ok) {
      await this.handleErrorResponse(response, 'put', endpoint);
    }

    return (await response.json()) as T;
  }

  async delete<T = unknown>(endpoint: string, options?: GraphClientRequestOptions): Promise<T> {
    const token = await this.getAccessToken();
    const url = this.resolveUrl(endpoint, options);

    const response = await fetch(url, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        ...(options?.headers || {}),
      },
    });

    if (!response.ok) {
      await this.handleErrorResponse(response, 'delete', endpoint);
    }

    if (response.status === 204) {
      return undefined as unknown as T;
    }
    if (response.headers.get('content-type')?.includes('application/json')) {
      return (await response.json()) as T;
    }
    return (await response.text()) as unknown as T;
  }

  async patch<T = any>(endpoint: string, body: unknown, options?: GraphClientRequestOptions): Promise<T> {
    const token = await this.getAccessToken();
    const url = this.resolveUrl(endpoint, options);

    const response = await fetch(url, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(options?.headers || {}),
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      await this.handleErrorResponse(response, 'patch', endpoint);
    }

    return (await response.json()) as T;
  }

  getConfig(): SharePointConfig {
    return { ...this.config };
  }

  isConfigured(): boolean {
    return !!(this.config.clientId && this.config.clientSecret && this.config.tenantId);
  }
}

export default new GraphClientService();
