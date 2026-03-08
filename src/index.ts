/**
 * Adminiculum Backend V2 - Main Application Entry Point
 * Legal Document Management System API
 * Modular Architecture
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import fs from 'fs';
import yaml from 'js-yaml';
import { attachFeatures } from './middleware/features';
import { authenticate } from './middleware/auth';
import { getConfigPresenceStatus } from './config/configStatus';
import { getEscalationConfig } from './modules/escalation/config';
import { prisma } from './prisma/prisma.service';

type AutomationSchemaSanityStatus = {
  checkedAt: string;
  ok: boolean;
  missing: string[];
};

type StartupConfigHealthStatus = {
  checkedAt: string;
  status: 'healthy' | 'degraded';
  missing: string[];
  matchedCredentialSet: 'SP_CLIENT_PAIR' | 'LEGACY_SHAREPOINT_PAIR' | 'AZURE_APP_TRIPLET' | null;
};

let automationSchemaSanity: AutomationSchemaSanityStatus | null = null;
let startupConfigHealth: StartupConfigHealthStatus | null = null;

async function runAutomationSchemaSanityCheck(): Promise<AutomationSchemaSanityStatus> {
  const missing: string[] = [];

  try {
    const [tableRows, policyEnumRows, retryabilityEnumRows, compensationEnumRows] = await Promise.all([
      prisma.$queryRawUnsafe<Array<{ regclass: string | null }>>(
        "SELECT to_regclass('public.automation_execution_step_logs') AS regclass",
      ),
      prisma.$queryRawUnsafe<Array<{ enumlabel: string }>>(
        `SELECT e.enumlabel
         FROM pg_type t
         JOIN pg_enum e ON t.oid = e.enumtypid
         WHERE t.typname = 'AutomationActionPolicy'`,
      ),
      prisma.$queryRawUnsafe<Array<{ enumlabel: string }>>(
        `SELECT e.enumlabel
         FROM pg_type t
         JOIN pg_enum e ON t.oid = e.enumtypid
         WHERE t.typname = 'AutomationStepRetryability'`,
      ),
      prisma.$queryRawUnsafe<Array<{ enumlabel: string }>>(
        `SELECT e.enumlabel
         FROM pg_type t
         JOIN pg_enum e ON t.oid = e.enumtypid
         WHERE t.typname = 'AutomationCompensationReadiness'`,
      ),
    ]);

    if (!tableRows?.[0]?.regclass) {
      missing.push('table:automation_execution_step_logs');
    }

    if (!policyEnumRows?.length) {
      missing.push('enum:AutomationActionPolicy');
    }
    if (!retryabilityEnumRows?.length) {
      missing.push('enum:AutomationStepRetryability');
    }
    if (!compensationEnumRows?.length) {
      missing.push('enum:AutomationCompensationReadiness');
    }
  } catch (error) {
    missing.push(`check_error:${error instanceof Error ? error.message : 'unknown'}`);
  }

  return {
    checkedAt: new Date().toISOString(),
    ok: missing.length === 0,
    missing,
  };
}

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
    { name: 'SP_CLIENT_PAIR', keys: ['SP_CLIENT_ID', 'SP_CLIENT_SECRET'] },
    { name: 'LEGACY_SHAREPOINT_PAIR', keys: ['SHAREPOINT_CLIENT_ID', 'SHAREPOINT_SECRET'] },
    {
      name: 'AZURE_APP_TRIPLET',
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

  const fallbackNames = ['swagger.yaml', 'swagger2.yaml'];
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
const PORT = parseInt(process.env.PORT || '3000', 10);
const isProduction = (process.env.NODE_ENV || '').toLowerCase() === 'production';
const configuredAllowedOrigins = parseCsvEnv(process.env.CORS_ALLOWED_ORIGINS);
const frontendUrl = process.env.FRONTEND_URL?.trim();

// Middleware
app.use(helmet());
app.use(cors({
  origin: function(origin: string | undefined, callback: (err: Error | null, allow: boolean) => void) {
    if (!origin) {
      return callback(null, true);
    }

    if (!isProduction) {
      if (origin.match(/^http:\/\/localhost:\d+$/) || origin.match(/^https:\/\/localhost:\d+$/)) {
        return callback(null, true);
      }
      if (frontendUrl && origin === frontendUrl) {
        return callback(null, true);
      }
      return callback(null, true);
    }

    if (configuredAllowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Authorization', 'Content-Type', 'X-Requested-With', 'Accept', 'Origin'],
}));
app.use(morgan('combined'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(attachFeatures);

app.get('/health', (_req: Request, res: Response) => {
  const configHealth = startupConfigHealth || evaluateStartupConfigHealth();

  res.json({
    status: configHealth.status,
    timestamp: new Date().toISOString(),
    startupConfigHealth: configHealth,
    automationSchemaSanity,
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

import settingsRoutes from './modules/settings/routes';
app.use('/api/v1/settings', settingsRoutes);

import anonymizeRoutes from './modules/anonymize/routes';
app.use('/api/v1', anonymizeRoutes);

import mattersRoutes from './routes/matters';
app.use('/api/v1/matters', mattersRoutes);

import timeEntriesRoutes from './routes/timeEntries';
app.use('/api/v1/time-entries', timeEntriesRoutes);

import clientPortalRoutes from './routes/clientPortal';
app.use('/api/v1/client-portal', clientPortalRoutes);

import contractsRoutes from './modules/contracts/routes';
app.use('/api/v1/contracts', contractsRoutes);

import documentsRoutes from './modules/documents/routes';
app.use('/api/v1/documents', documentsRoutes);

import changeReportsRoutes from './modules/changeReports/routes';
app.use('/api/v1', changeReportsRoutes);

import deadlinesRoutes from './modules/deadlines/routes';
app.use('/api/v1', deadlinesRoutes);

import documentClassificationRoutes from './modules/documentClassification/routes';
app.use('/api/v1', documentClassificationRoutes);

import automationEventsRoutes from './modules/automationEvents/routes';
app.use('/api/v1', automationEventsRoutes);

import automationPreferencesRoutes from './modules/automationPreferences/routes';
app.use('/api/v1', automationPreferencesRoutes);

import automationSuggestionsRoutes from './modules/automationSuggestions/routes';
app.use('/api/v1', automationSuggestionsRoutes);

import knowledgeBaseRoutes from './modules/knowledgeBase/routes';
app.use('/api/v1/knowledge-base', knowledgeBaseRoutes);

import learningRoutes from './modules/learning/routes';
app.use('/api/v1/learning', learningRoutes);

import escalationRoutes from './modules/escalation/routes';
app.use('/api/v1/escalation', escalationRoutes);
import { startEscalationCronJob } from './modules/escalation/cron';
import { ensureDefaultEscalationRule } from './modules/escalation/bootstrap';

import knowledgeRoutes from './modules/knowledgeBase/routes/knowledge.routes';
app.use('/api/v1', knowledgeRoutes);

import workgroupRoutes from './modules/workgroups/routes';
app.use('/api/v1', workgroupRoutes);

import { runMigration } from './routes/migrate';
app.post('/api/v1/migrate', authenticate, runMigration);

import { debugWhoami } from './routes/debug';
app.get('/api/v1/debug/whoami', debugWhoami);

import { checkAndSyncDatabase } from './routes/dbcheck';
app.get('/api/v1/dbcheck', checkAndSyncDatabase);

import adminConfigRoutes from './routes/adminConfig';
app.use('/api/v1/admin', adminConfigRoutes);

app.use((_req: Request, res: Response) => {
  res.status(404).json({ message: 'Endpoint not found' });
});

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({
    message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error',
  });
});

app.listen(PORT, '0.0.0.0', async () => {
  const escalationConfig = getEscalationConfig();
  console.log(
    `[Startup] NODE_ENV=${process.env.NODE_ENV || 'development'} PORT=${PORT} ESCALATION_ENGINE=${escalationConfig.engineEnabled} ESCALATION_BOOTSTRAP=${escalationConfig.bootstrapEnabled}`,
  );

  if (process.env.ENABLE_LEARNING_AUTO_UPDATE === 'true') {
    console.log('[Startup] Learning auto-update enabled');
  }

  const configPresence = getConfigPresenceStatus();
  const hasMissingConfig = Object.values(configPresence).some((status) => status === 'missing');
  if (hasMissingConfig) {
    console.log(`[Config Presence] ${JSON.stringify(configPresence)}`);
  } else {
    console.log('[Config Presence] OK');
  }

  startupConfigHealth = evaluateStartupConfigHealth();
  if (startupConfigHealth.status === 'healthy') {
    console.log(`[Startup Validation] PASS credentialSet=${startupConfigHealth.matchedCredentialSet}`);
  } else {
    console.warn(
      `[Startup Validation] DEGRADED missing=${startupConfigHealth.missing.join(' | ')}`,
    );
  }

  let dbConnectivityOk = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbConnectivityOk = true;
  } catch {
    dbConnectivityOk = false;
  }
  console.log(`[Startup] DB connectivity: ${dbConnectivityOk ? 'PASS' : 'FAIL'}`);

  if (dbConnectivityOk) {
    automationSchemaSanity = await runAutomationSchemaSanityCheck();
    if (automationSchemaSanity.ok) {
      console.log('[Startup] Automation schema sanity: PASS');
    } else {
      console.warn(
        `[Startup] Automation schema sanity: WARN missing=${automationSchemaSanity.missing.join(', ')}`,
      );
    }
  }

  console.log(`🚀 Adminiculum API V2 running on http://localhost:${PORT}`);

  ensureDefaultEscalationRule().catch((error) => {
    console.error('Failed to load default escalation rule:', error?.message || error);
  });
  startEscalationCronJob();
});

export default app;




