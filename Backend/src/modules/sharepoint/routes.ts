import { Router, Request, Response } from 'express';
import { authenticate } from '../../middleware/auth';
import graphClient, { GraphClientError } from './graphClient';

type DiagnosticsError = {
  code: string;
  message: string;
};

type SharePointDiagnosticsResponse = {
  timestamp: string;
  correlationId: string;
  configured: boolean;
  missingEnvVars: string[];
  siteResolvable: boolean;
  driveResolvable: boolean;
  rootFolderResolvable: boolean;
  permissionsSmoke: {
    ok: boolean;
  };
  metadata: {
    configSource: {
      credentialSet: 'SP' | 'AZURE_LEGACY' | 'MIXED' | 'NONE';
      hasSiteUrl: boolean;
      hasSiteId: boolean;
      hasDriveId: boolean;
    };
    operation: {
      siteReference: 'SP_SITE_ID' | 'SHAREPOINT_SITE_URL' | 'NONE';
      driveReference: 'SP_DRIVE_ID' | 'SITE_DEFAULT_DRIVE' | 'NONE';
    };
  };
  errors: DiagnosticsError[];
};

const router = Router();

function sanitizeError(error: unknown, fallbackCode: string): DiagnosticsError {
  console.error(`[sharepoint/diagnostics] ${fallbackCode}:`, error instanceof Error ? error.message : error);
  if (error instanceof GraphClientError) {
    return {
      code: error.code || fallbackCode,
      message: 'A SharePoint/Graph request failed.',
    };
  }
  if (error instanceof Error) {
    return {
      code: fallbackCode,
      message: 'An internal error occurred.',
    };
  }
  return {
    code: fallbackCode,
    message: 'Unknown error',
  };
}

function getMissingSharePointEnvVars(): string[] {
  const missing: string[] = [];
  if (!process.env.SP_CLIENT_ID && !process.env.AZURE_CLIENT_ID) {
    missing.push('SP_CLIENT_ID');
  }
  if (!process.env.SP_CLIENT_SECRET && !process.env.AZURE_CLIENT_SECRET) {
    missing.push('SP_CLIENT_SECRET');
  }
  if (!process.env.SP_TENANT_ID && !process.env.AZURE_TENANT_ID) {
    missing.push('SP_TENANT_ID');
  }
  if (!process.env.SP_SITE_ID && !process.env.SHAREPOINT_SITE_ID && !process.env.SHAREPOINT_SITE_URL && !process.env.SP_SITE_URL) {
    missing.push('SP_SITE_ID_OR_SHAREPOINT_SITE_URL');
  }
  return missing;
}

function detectCredentialSet(): 'SP' | 'AZURE_LEGACY' | 'MIXED' | 'NONE' {
  const hasSp = Boolean(process.env.SP_CLIENT_ID && process.env.SP_CLIENT_SECRET && process.env.SP_TENANT_ID);
  const hasAzure = Boolean(process.env.AZURE_CLIENT_ID && process.env.AZURE_CLIENT_SECRET && process.env.AZURE_TENANT_ID);

  if (hasSp && hasAzure) return 'MIXED';
  if (hasSp) return 'SP';
  if (hasAzure) return 'AZURE_LEGACY';
  return 'NONE';
}

async function resolveSiteIdFromUrl(siteUrl: string): Promise<string> {
  const parsed = new URL(siteUrl);
  const host = parsed.hostname;
  const sitePath = (parsed.pathname || '/').replace(/\/+$/, '') || '/';
  const candidates = [`/sites/${host}:${sitePath}`, `/sites/root:${sitePath}`];

  let lastError: unknown = null;
  for (const endpoint of candidates) {
    try {
      const site = await graphClient.get<{ id?: string }>(endpoint);
      if (site?.id) {
        return site.id;
      }
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error
    ? new Error(`Site lookup failed: ${lastError.message}`)
    : new Error('Site lookup failed');
}

router.get('/diagnostics', authenticate, async (_req: Request, res: Response): Promise<void> => {
  const requestIdHeader = _req.headers['x-request-id'];
  const correlationId =
    (typeof requestIdHeader === 'string' && requestIdHeader.trim()) ||
    `spdiag-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const timestamp = new Date().toISOString();
  const config = graphClient.getConfig();
  const siteUrl = process.env.SHAREPOINT_SITE_URL || process.env.SP_SITE_URL || '';
  const configured = graphClient.isConfigured();
  const missingEnvVars = getMissingSharePointEnvVars();
  const errors: DiagnosticsError[] = [];

  let siteResolvable = false;
  let driveResolvable = false;
  let rootFolderResolvable = false;
  let permissionsSmokeOk = false;
  let resolvedSiteId = '';
  let resolvedDriveId = '';

  if (!configured) {
    res.status(200).json({
      timestamp,
      correlationId,
      configured,
      missingEnvVars,
      siteResolvable,
      driveResolvable,
      rootFolderResolvable,
      permissionsSmoke: { ok: permissionsSmokeOk },
      metadata: {
        configSource: {
          credentialSet: detectCredentialSet(),
          hasSiteUrl: Boolean(siteUrl),
          hasSiteId: Boolean(config.siteId),
          hasDriveId: Boolean(config.driveId),
        },
        operation: {
          siteReference: config.siteId ? 'SP_SITE_ID' : siteUrl ? 'SHAREPOINT_SITE_URL' : 'NONE',
          driveReference: config.driveId ? 'SP_DRIVE_ID' : 'NONE',
        },
      },
      errors: [{ code: 'NOT_CONFIGURED', message: 'SharePoint credential configuration is incomplete.' }],
    } satisfies SharePointDiagnosticsResponse);
    return;
  }

  try {
    await graphClient.getAccessToken();
    permissionsSmokeOk = true;
  } catch (error) {
    errors.push(sanitizeError(error, 'TOKEN_REQUEST_FAILED'));
  }

  try {
    if (config.siteId) {
      const site = await graphClient.get<{ id?: string }>(`/sites/${config.siteId}`);
      if (site?.id) {
        resolvedSiteId = site.id;
        siteResolvable = true;
      }
    } else if (siteUrl) {
      resolvedSiteId = await resolveSiteIdFromUrl(siteUrl);
      siteResolvable = Boolean(resolvedSiteId);
    } else {
      errors.push({
        code: 'SITE_REFERENCE_MISSING',
        message: 'Neither SP_SITE_ID/SHAREPOINT_SITE_ID nor SHAREPOINT_SITE_URL/SP_SITE_URL is configured.',
      });
    }
  } catch (error) {
    errors.push(sanitizeError(error, 'SITE_RESOLUTION_FAILED'));
  }

  try {
    if (config.driveId) {
      const drive = await graphClient.get<{ id?: string }>(`/drives/${config.driveId}`);
      resolvedDriveId = drive?.id || '';
      driveResolvable = Boolean(resolvedDriveId);
    } else if (resolvedSiteId) {
      const drive = await graphClient.get<{ id?: string }>(`/sites/${resolvedSiteId}/drive`);
      resolvedDriveId = drive?.id || '';
      driveResolvable = Boolean(resolvedDriveId);
    } else {
      errors.push({
        code: 'DRIVE_REFERENCE_MISSING',
        message: 'Drive cannot be resolved without a valid site reference.',
      });
    }
  } catch (error) {
    errors.push(sanitizeError(error, 'DRIVE_RESOLUTION_FAILED'));
  }

  try {
    if (resolvedDriveId) {
      const root = await graphClient.get<{ id?: string }>(`/drives/${resolvedDriveId}/root`);
      rootFolderResolvable = Boolean(root?.id);
    } else {
      errors.push({
        code: 'ROOT_FOLDER_REFERENCE_MISSING',
        message: 'Root folder cannot be resolved without a drive reference.',
      });
    }
  } catch (error) {
    errors.push(sanitizeError(error, 'ROOT_FOLDER_RESOLUTION_FAILED'));
  }

  res.status(200).json({
    timestamp,
    correlationId,
    configured,
    missingEnvVars,
    siteResolvable,
    driveResolvable,
    rootFolderResolvable,
    permissionsSmoke: {
      ok: permissionsSmokeOk,
    },
    metadata: {
      configSource: {
        credentialSet: detectCredentialSet(),
        hasSiteUrl: Boolean(siteUrl),
        hasSiteId: Boolean(config.siteId),
        hasDriveId: Boolean(config.driveId),
      },
      operation: {
        siteReference: config.siteId ? 'SP_SITE_ID' : siteUrl ? 'SHAREPOINT_SITE_URL' : 'NONE',
        driveReference: config.driveId ? 'SP_DRIVE_ID' : resolvedSiteId ? 'SITE_DEFAULT_DRIVE' : 'NONE',
      },
    },
    errors,
  } satisfies SharePointDiagnosticsResponse);
});

export default router;
