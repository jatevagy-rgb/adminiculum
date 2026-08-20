// ============================================================================
// OUTLOOK GRAPH LIVE READER (workforce, app-only client-credentials)
// ----------------------------------------------------------------------------
// Bounded read of recent inbound mail from a configured workforce mailbox via
// Microsoft Graph. It NEVER exposes, logs, or returns bearer tokens. It fetches
// a bounded window of lightweight metadata (no full bodies, no arbitrary mailbox
// dump). Credentials reuse the canonical SP_*/AZURE_* app-only secret pair, and
// the target mailbox is read from COMMUNICATIONS_MAILBOX.
//
// The transport is injectable so tests can provide a fake HTTP + token without
// any live Graph/Azure dependency.
// ============================================================================

export type GraphMailAddress = {
  emailAddress?: { address?: unknown; name?: unknown } | null;
};

export type GraphLiveMessage = {
  id?: unknown;
  internetMessageId?: unknown;
  conversationId?: unknown;
  subject?: unknown;
  from?: GraphMailAddress | null;
  toRecipients?: GraphMailAddress[] | null;
  ccRecipients?: GraphMailAddress[] | null;
  receivedDateTime?: unknown;
  sentDateTime?: unknown;
  bodyPreview?: unknown;
  hasAttachments?: unknown;
  attachments?: Array<{ id?: unknown; name?: unknown; contentType?: unknown; size?: unknown }> | null;
};

export type OutlookSyncConfig = {
  mailboxAddress: string;
  clientId: string;
  clientSecret: string;
  tenantId: string;
};

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const DEFAULT_MAX_MESSAGES = 50;
const MAX_MESSAGES_LIMIT = 200;

export function readOutlookSyncConfig(): OutlookSyncConfig | null {
  const mailboxAddress = (process.env.COMMUNICATIONS_MAILBOX || '').trim();
  const clientId = process.env.SP_CLIENT_ID || process.env.AZURE_CLIENT_ID || '';
  const clientSecret = process.env.SP_CLIENT_SECRET || process.env.AZURE_CLIENT_SECRET || '';
  const tenantId = process.env.SP_TENANT_ID || process.env.AZURE_TENANT_ID || '';
  if (!mailboxAddress || !clientId || !clientSecret || !tenantId) return null;
  return { mailboxAddress, clientId, clientSecret, tenantId };
}

export function isOutlookSyncConfigured(): boolean {
  return readOutlookSyncConfig() !== null;
}

export function parseOutlookSyncLimit(value: unknown): number {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_MAX_MESSAGES;
  return Math.min(parsed, MAX_MESSAGES_LIMIT);
}

export class OutlookGraphReaderError extends Error {
  constructor(
    public classification:
      | 'CONFIG_UNAVAILABLE'
      | 'GRAPH_UNAVAILABLE'
      | 'RATE_LIMITED'
      | 'AUTHORIZATION_FAILED'
      | 'INVALID_RESPONSE',
    message: string,
  ) {
    super(message);
    this.name = 'OutlookGraphReaderError';
  }
}

export type OutlookGraphReaderDeps = {
  getAccessToken?: (config: OutlookSyncConfig) => Promise<string>;
  httpFetch?: typeof fetch;
};

function classifyHttpStatus(status: number): OutlookGraphReaderError['classification'] {
  if (status === 401 || status === 403) return 'AUTHORIZATION_FAILED';
  if (status === 429) return 'RATE_LIMITED';
  if (status === 502 || status === 503 || status === 504) return 'GRAPH_UNAVAILABLE';
  if (status >= 500) return 'GRAPH_UNAVAILABLE';
  return 'INVALID_RESPONSE';
}

export async function requestOutlookGraphAccessToken(
  config: OutlookSyncConfig,
  httpFetch: typeof fetch = fetch,
): Promise<string> {
  const tokenUrl = `https://login.microsoftonline.com/${encodeURIComponent(config.tenantId)}/oauth2/v2.0/token`;
  const params = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  });

  let response: Response;
  try {
    response = await httpFetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
  } catch (error) {
    throw new OutlookGraphReaderError(
      'GRAPH_UNAVAILABLE',
      `Microsoft Graph token endpoint is unavailable (${error instanceof Error ? error.message : 'network error'})`,
    );
  }

  if (!response.ok) {
    throw new OutlookGraphReaderError(classifyHttpStatus(response.status), 'Microsoft Graph authorization failed');
  }

  const payload = (await response.json()) as { access_token?: unknown; expires_in?: unknown };
  if (typeof payload.access_token !== 'string' || !payload.access_token) {
    throw new OutlookGraphReaderError('AUTHORIZATION_FAILED', 'Microsoft Graph did not return an access token');
  }
  return payload.access_token;
}

export function createOutlookGraphMailReader(deps: OutlookGraphReaderDeps = {}) {
  const getToken =
    deps.getAccessToken || ((config: OutlookSyncConfig) => requestOutlookGraphAccessToken(config, deps.httpFetch || fetch));
  const httpFetch = deps.httpFetch || fetch;

  async function fetchRecentInbound(limit: number): Promise<GraphLiveMessage[]> {
    const config = readOutlookSyncConfig();
    if (!config) {
      throw new OutlookGraphReaderError('CONFIG_UNAVAILABLE', 'Outlook synchronization is not configured');
    }

    const capped = parseOutlookSyncLimit(limit);
    const token = await getToken(config);

    const fields = [
      'id',
      'internetMessageId',
      'conversationId',
      'subject',
      'from',
      'toRecipients',
      'ccRecipients',
      'receivedDateTime',
      'sentDateTime',
      'bodyPreview',
      'hasAttachments',
      'attachments',
    ].join(',');

    const url =
      `${GRAPH_BASE}/users/${encodeURIComponent(config.mailboxAddress)}/messages` +
      `?$select=${fields}&$top=${capped}&$expand=attachments`;

    let response: Response;
    try {
      response = await httpFetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });
    } catch (error) {
      throw new OutlookGraphReaderError(
        'GRAPH_UNAVAILABLE',
        `Microsoft Graph is unavailable (${error instanceof Error ? error.message : 'network error'})`,
      );
    }

    if (!response.ok) {
      throw new OutlookGraphReaderError(classifyHttpStatus(response.status), 'Microsoft Graph message read failed');
    }

    let payload: { value?: unknown };
    try {
      payload = (await response.json()) as { value?: unknown };
    } catch (error) {
      throw new OutlookGraphReaderError('INVALID_RESPONSE', 'Microsoft Graph returned an unreadable response');
    }

    if (!Array.isArray(payload.value)) {
      throw new OutlookGraphReaderError('INVALID_RESPONSE', 'Microsoft Graph returned no message list');
    }

    return payload.value as GraphLiveMessage[];
  }

  return {
    fetchRecentInbound,
    isConfigured: isOutlookSyncConfigured,
    config: readOutlookSyncConfig,
  };
}

export const outlookGraphMailReader = createOutlookGraphMailReader();
