/**
 * Adminiculum Backend V2 - Main Application Entry Point (minimal deployable)
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import yaml from 'js-yaml';
import { createCorsOptions } from './config/cors';
import { prisma } from './prisma/prisma.service';

/**
 * Minimal structured request logger. NEVER logs Authorization/Cookie, request
 * body, document/email text, PII values, or token query parameters. Route is
 * logged as path-only (query string stripped) to avoid leaking identifiers.
 */
function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const requestId = crypto.randomUUID().slice(0, 8);
  const startedAt = Date.now();
  res.on('finish', () => {
    try {
      const durationMs = Date.now() - startedAt;
      const pathOnly = req.originalUrl.split('?')[0] || req.path || '/';
      // JSON-lines structured record. pathOnly contains no query params.
      const line = JSON.stringify({
        timestamp: new Date().toISOString(),
        level: res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
        requestId,
        method: req.method,
        path: pathOnly,
        status: res.statusCode,
        durationMs,
      });
      console.log(line);
    } catch {
      // logging must never break the request
    }
  });
  next();
}

type StartupConfigHealthStatus = {
  checkedAt: string;
  status: 'healthy' | 'degraded';
  missing: string[];
  matchedCredentialSet:
    | 'SP_CLIENT_TRIPLET'
    | 'LEGACY_SHAREPOINT_PAIR'
    | 'AZURE_APP_TRIPLET_LEGACY'
    | null;
};

let startupConfigHealth: StartupConfigHealthStatus | null = null;

function parseCsvEnv(value: string | undefined): string[] {
  return String(value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function isPresent(value: string | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function evaluateStartupConfigHealth(): StartupConfigHealthStatus {
  const checkedAt = new Date().toISOString();
  const missing: string[] = [];

  if (!isPresent(process.env.DATABASE_URL)) {
    missing.push('DATABASE_URL');
  }
  if (!isPresent(process.env.JWT_SECRET)) {
    missing.push('JWT_SECRET');
  }

  const credentialSets: Array<{
    name: StartupConfigHealthStatus['matchedCredentialSet'];
    keys: string[];
  }> = [
    {
      name: 'SP_CLIENT_TRIPLET',
      keys: ['SP_CLIENT_ID', 'SP_CLIENT_SECRET', 'SP_TENANT_ID'],
    },
    { name: 'LEGACY_SHAREPOINT_PAIR', keys: ['SHAREPOINT_CLIENT_ID', 'SHAREPOINT_SECRET'] },
    {
      name: 'AZURE_APP_TRIPLET_LEGACY',
      keys: ['AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET', 'AZURE_TENANT_ID'],
    },
  ];

  const matched = credentialSets.find((set) => set.keys.every((key) => isPresent(process.env[key])));

  if (!matched) {
    for (const set of credentialSets) {
      const missingKeys = set.keys.filter((key) => !isPresent(process.env[key]));
      missing.push(`${set.name}: missing ${missingKeys.join('+')}`);
    }
  }

  return {
    checkedAt,
    status: missing.length === 0 ? 'healthy' : 'degraded',
    missing,
    matchedCredentialSet: matched?.name || null,
  };
}

function resolveOpenApiSpecPath(): string {
  const fromEnv = process.env.OPENAPI_SPEC_PATH?.trim();
  const candidates: string[] = [];

  if (fromEnv) {
    if (path.isAbsolute(fromEnv)) {
      candidates.push(fromEnv);
    } else {
      candidates.push(path.resolve(process.cwd(), fromEnv));
      candidates.push(path.resolve(__dirname, '..', fromEnv));
    }
  }

  const fallbackNames = ['powerapps-swagger2-runtime-aligned.yaml', 'swagger2.yaml', 'swagger.yaml'];
  for (const fileName of fallbackNames) {
    candidates.push(path.resolve(process.cwd(), fileName));
    candidates.push(path.resolve(__dirname, '..', fileName));
    candidates.push(path.resolve(__dirname, '..', '..', fileName));
  }

  const firstExisting = candidates.find((candidate) => fs.existsSync(candidate));
  if (!firstExisting) {
    throw new Error('No OpenAPI spec file found (checked OPENAPI_SPEC_PATH, swagger.yaml, swagger2.yaml)');
  }

  return firstExisting;
}

function loadOpenApiSpec(): any {
  const specPath = resolveOpenApiSpecPath();
  const specContent = fs.readFileSync(specPath, 'utf8');
  if (specPath.endsWith('.json')) {
    return JSON.parse(specContent);
  }
  return yaml.load(specContent) as any;
}

function setOpenApiServers(spec: any): any {
  const baseUrl = process.env.WEBSITE_HOSTNAME || 'localhost:3000';
  const protocol = process.env.WEBSITE_HOSTNAME ? 'https' : 'http';
  spec.servers = [{ url: `${protocol}://${baseUrl}/api/v1` }];
  return spec;
}

function handleOpenApiJson(_req: Request, res: Response): void {
  try {
    const swaggerJson = setOpenApiServers(loadOpenApiSpec());
    res.json(swaggerJson);
  } catch (error) {
    console.error('Error loading OpenAPI spec:', error);
    res.status(500).json({ error: 'Failed to load OpenAPI specification' });
  }
}

startupConfigHealth = evaluateStartupConfigHealth();

const app = express();
// Local default aligns with dev launcher expectations (scripts/dev-launch.ps1).
const PORT = parseInt(process.env.PORT || '3001', 10);
const isProduction = (process.env.NODE_ENV || '').toLowerCase() === 'production';
const configuredAllowedOrigins = parseCsvEnv(process.env.CORS_ALLOWED_ORIGINS);
const frontendOrigin = process.env.FRONTEND_ORIGIN?.trim();
const frontendUrl = process.env.FRONTEND_URL?.trim();
const productionAllowedOrigins = configuredAllowedOrigins.length
  ? configuredAllowedOrigins
  : [frontendOrigin, frontendUrl].filter((entry): entry is string => Boolean(entry));

// OPS-1: production fail-closed. Omissions that would weaken auth, security or
// availability must never silently start a permissive/degraded production
// service. Optional integrations (SharePoint config) are NOT blockers.
if (isProduction) {
  if (!isPresent(process.env.DATABASE_URL)) {
    throw new Error('[Startup Validation] Production requires DATABASE_URL. Aborting.');
  }
  if (!isPresent(process.env.JWT_SECRET)) {
    throw new Error('[Startup Validation] Production requires JWT_SECRET. Aborting.');
  }
  if (productionAllowedOrigins.length === 0) {
    throw new Error(
      '[Startup Validation] Production requires a non-empty CORS allowlist (CORS_ALLOWED_ORIGINS or FRONTEND_ORIGIN/FRONTEND_URL). Aborting.'
    );
  }
}

// Middleware
app.use(helmet());
app.use(cors(createCorsOptions({ isProduction, productionAllowedOrigins, frontendUrl })));
app.use(requestLogger);
// Increase payload limits for normal DOC/DOCX base64 uploads from frontend
// (base64 payloads are larger than binary source files)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.get('/health', (_req: Request, res: Response) => {
  const configHealth = startupConfigHealth || evaluateStartupConfigHealth();

  res.json({
    status: configHealth.status,
    timestamp: new Date().toISOString(),
    startupConfigHealth: configHealth,
  });
});

app.get('/health/db', async (_req: Request, res: Response) => {
  try {
    // Read-only connectivity probe; never mutates data.
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', database: 'reachable', timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(503).json({
      status: 'error',
      database: 'unreachable',
      timestamp: new Date().toISOString(),
      message: 'Database is not reachable.',
    });
  }
});

app.get('/health/storage', (_req: Request, res: Response) => {
  // Read-only configuration state; never creates/deletes remote data.
  // SharePoint may legitimately be unconfigured in some environments, which is
  // a safe "NOT_CONFIGURED" state rather than an error.
  const sets = [
    { name: 'SP_CLIENT_TRIPLET', keys: ['SP_CLIENT_ID', 'SP_CLIENT_SECRET', 'SP_TENANT_ID'] },
    { name: 'LEGACY_SHAREPOINT_PAIR', keys: ['SHAREPOINT_CLIENT_ID', 'SHAREPOINT_SECRET'] },
    { name: 'AZURE_APP_TRIPLET_LEGACY', keys: ['AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET', 'AZURE_TENANT_ID'] },
  ];
  const matched = sets.filter((set) => set.keys.every((key) => isPresent(process.env[key])));
  res.json({
    status: matched.length ? 'configured' : 'not_configured',
    storage: matched.length ? 'SharePoint' : 'none',
    configuredSet: matched[0]?.name || null,
    timestamp: new Date().toISOString(),
  });
});

app.get('/', (_req: Request, res: Response) => {
  res.json({
    name: 'Adminiculum API V2',
    version: '2.0.0',
    description: 'Legal Document Management System API',
    endpoints: {
      health: '/health',
      auth: '/api/v1/auth',
      users: '/api/v1/users',
      cases: '/api/v1/cases',
      tasks: '/api/v1/tasks',
      contracts: '/api/v1/contracts',
      openapi: '/api/v1/openapi.json',
    },
  });
});

app.get('/api/v1/openapi.json', handleOpenApiJson);

app.get('/openapi.json', handleOpenApiJson);

import authRoutes from './modules/auth/routes';
app.use('/api/v1/auth', authRoutes);

import usersRoutes from './modules/users/routes';
app.use('/api/v1/users', usersRoutes);

import casesRoutes from './modules/cases/routes';
app.use('/api/v1/cases', casesRoutes);

import clientsRoutes from './modules/clients/routes';
app.use('/api/v1/clients', clientsRoutes);

import tasksRoutes from './modules/tasks/routes';
app.use('/api/v1/tasks', tasksRoutes);

import agendaRoutes from './modules/agenda/routes';
app.use('/api/v1/agenda', agendaRoutes);

import workloadRoutes from './modules/responsibility/routes';
app.use('/api/v1/workload', workloadRoutes);

import intakeRoutes from './modules/intake/routes';
app.use('/api/v1/intake', intakeRoutes);

import settingsRoutes from './modules/settings/routes';
app.use('/api/v1/settings', settingsRoutes);

import workPackageAdminRoutes from './modules/work-package-admin/routes';
app.use('/api/v1/work-package-admin', workPackageAdminRoutes);

import anonymizeRoutes from './modules/anonymize/routes';
app.use('/api/v1', anonymizeRoutes);

import mattersRoutes from './routes/matters';
app.use('/api/v1/matters', mattersRoutes);

import timeEntriesRoutes from './routes/timeEntries';
app.use('/api/v1/time-entries', timeEntriesRoutes);

import clientSafeComplianceRoutes from './modules/compliance/clientSafeComplianceRoutes';
app.use('/api/v1/client-portal/compliance', clientSafeComplianceRoutes);

import clientPortalRoutes from './routes/clientPortal';
app.use('/api/v1/client-portal', clientPortalRoutes);

import { clientIdentityRouter } from './modules/client-identity/routes';
app.use('/api/v1/client-identity', clientIdentityRouter);

import { clientInteractionCustomerRouter } from './modules/client-interaction/customerRoutes';
app.use('/api/v1/client-interaction', clientInteractionCustomerRouter);

import { clientInteractionInternalRouter } from './modules/client-interaction/internalRoutes';
app.use('/api/v1/internal/client-interaction', clientInteractionInternalRouter);

import { clientPublicationRouter } from './modules/client-publication/publication.routes';
app.use('/api/v1/client-publications', clientPublicationRouter);

import { clientCompanyRouter } from './modules/client-company/routes';
app.use('/api/v1/client-company', clientCompanyRouter);

import { clientContractsRouter } from './modules/client-contracts/routes';
app.use('/api/v1/client-contracts', clientContractsRouter);

import { clientOrganizationRouter } from './modules/client-organization/routes';
app.use('/api/v1/client-organization', clientOrganizationRouter);

import { companyWorkspaceRouter } from './modules/company-workspace/routes';
app.use('/api/v1/company-workspace', companyWorkspaceRouter);

import complianceProposalRoutes from './modules/compliance/complianceProposalRoutes';
app.use('/api/v1/compliance/proposals', complianceProposalRoutes);

import complianceOverviewRoutes from './modules/compliance/complianceOverviewRoutes';
app.use('/api/v1/compliance', complianceOverviewRoutes);

import contractsRoutes from './modules/contracts/routes';
app.use('/api/v1/contracts', contractsRoutes);

import reviewNotesRoutes from './modules/review-notes/routes';
app.use('/api/v1/contracts', reviewNotesRoutes);

import legalAnalysesRoutes from './modules/legal-analyses/routes';
app.use('/api/v1', legalAnalysesRoutes);

import documentsRoutes from './modules/documents/routes';
app.use('/api/v1/documents', documentsRoutes);

import { documentScopedComparisonRouter, comparisonRouter } from './modules/documents/comparison/comparison.routes';
app.use('/api/v1/documents', documentScopedComparisonRouter);
app.use('/api/v1/document-comparisons', comparisonRouter);

import { documentReviewRouter, reviewRouter } from './modules/documents/review/review.routes';
app.use('/api/v1/documents', documentReviewRouter);
app.use('/api/v1/document-reviews', reviewRouter);

import communicationsRoutes from './modules/communications/routes';
app.use('/api/v1/communications', communicationsRoutes);

import workgroupRoutes from './modules/workgroups/routes';
app.use('/api/v1', workgroupRoutes);

import generationDraftRoutes from './modules/generation-draft/routes';
app.use('/api/v1/generation-drafts', generationDraftRoutes);

import newsFeedRoutes from './modules/news-feed/routes';
app.use('/api/v1/news-feed', newsFeedRoutes);

import clauseLibraryRoutes from './modules/clause-library/routes';
app.use('/api/v1/clause-library', clauseLibraryRoutes);

import timesheetReportRoutes from './modules/timesheet-reports/routes';
app.use('/api/v1/timesheet-reports', timesheetReportRoutes);

import handoffPackagesRoutes from './modules/handoff-packages/routes';
app.use('/api/v1', handoffPackagesRoutes);

import notificationsRoutes from './modules/notifications/routes';
app.use('/api/v1/notifications', notificationsRoutes);

import sharepointRoutes from './modules/sharepoint/routes';
app.use('/api/v1/sharepoint', sharepointRoutes);

app.use((_req: Request, res: Response) => {
  res.status(404).json({ message: 'Endpoint not found' });
});

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({
    message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error',
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(
    `[Startup] NODE_ENV=${process.env.NODE_ENV || 'development'} PORT=${PORT}`,
  );

  startupConfigHealth = evaluateStartupConfigHealth();
  if (startupConfigHealth.status === 'healthy') {
    console.log(`[Startup Validation] PASS credentialSet=${startupConfigHealth.matchedCredentialSet}`);
  } else {
    console.warn(
      `[Startup Validation] DEGRADED missing=${startupConfigHealth.missing.join(' | ')}`,
    );
  }
  if (isProduction) {
    console.log(
      `[Startup Validation] CORS allowlist entries=${productionAllowedOrigins.length}`,
    );
  } else {
    console.log('[Startup Validation] CORS mode=development (localhost origins allowed)');
  }

  console.log(`🚀 Adminiculum API V2 running on http://localhost:${PORT}`);
});

export default app;
