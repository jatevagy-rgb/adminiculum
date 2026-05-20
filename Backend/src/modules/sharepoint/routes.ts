import { Router, Request, Response } from 'express';
import { authenticate } from '../../middleware/auth';
import graphClient from './graphClient';

type DiagnosticsError = {
  code: string;
  message: string;
};

type SharePointDiagnosticsResponse = {
  configured: boolean;
  siteResolvable: boolean;
  driveResolvable: boolean;
  permissionsSmoke: {
    ok: boolean;
  };
  metadata: {
    configSource: {
      credentialSet: 'SP' | 'AZURE' | 'MIXED' | 'NONE';
      hasSiteUrl: boolean;
      hasSiteId: boolean;
      hasDriveId: boolean;
    };
  };
  errors: DiagnosticsError[];
};

const router = Router();

function sanitizeError(error: unknown, fallbackCode: string): DiagnosticsError {
  if (error instanceof Error) {
    return {
      code: fallbackCode,
      message: error.message.slice(0, 300),
    };
  }
  return {
    code: fallbackCode,
    message: 'Unknown error',
  };
}

function detectCredentialSet(): 'SP' | 'AZURE' | 'MIXED' | 'NONE' {
  const hasSp = Boolean(process.env.SP_CLIENT_ID && process.env.SP_CLIENT_SECRET && process.env.SP_TENANT_ID);
  const hasAzure = Boolean(process.env.AZURE_CLIENT_ID && process.env.AZURE_CLIENT_SECRET && process.env.AZURE_TENANT_ID);

  if (hasSp && hasAzure) return 'MIXED';
  if (hasSp) return 'SP';
  if (hasAzure) return 'AZURE';
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
  const config = graphClient.getConfig();
  const siteUrl = process.env.SHAREPOINT_SITE_URL || '';
  const configured = graphClient.isConfigured();
  const errors: DiagnosticsError[] = [];

  let siteResolvable = false;
  let driveResolvable = false;
  let permissionsSmokeOk = false;
  let resolvedSiteId = '';

  if (!configured) {
    res.status(200).json({
      configured,
      siteResolvable,
      driveResolvable,
      permissionsSmoke: { ok: permissionsSmokeOk },
      metadata: {
        configSource: {
          credentialSet: detectCredentialSet(),
          hasSiteUrl: Boolean(siteUrl),
          hasSiteId: Boolean(config.siteId),
          hasDriveId: Boolean(config.driveId),
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
        message: 'Neither SP_SITE_ID/SHAREPOINT_SITE_ID nor SHAREPOINT_SITE_URL is configured.',
      });
    }
  } catch (error) {
    errors.push(sanitizeError(error, 'SITE_RESOLUTION_FAILED'));
  }

  try {
    if (config.driveId) {
      const drive = await graphClient.get<{ id?: string }>(`/drives/${config.driveId}`);
      driveResolvable = Boolean(drive?.id);
    } else if (resolvedSiteId) {
      const drive = await graphClient.get<{ id?: string }>(`/sites/${resolvedSiteId}/drive`);
      driveResolvable = Boolean(drive?.id);
    } else {
      errors.push({
        code: 'DRIVE_REFERENCE_MISSING',
        message: 'Drive cannot be resolved without a valid site reference.',
      });
    }
  } catch (error) {
    errors.push(sanitizeError(error, 'DRIVE_RESOLUTION_FAILED'));
  }

  res.status(200).json({
    configured,
    siteResolvable,
    driveResolvable,
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
    },
    errors,
  } satisfies SharePointDiagnosticsResponse);
});

export default router;
