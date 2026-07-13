/**
 * Clients Routes Module V2
 * Client management endpoints
 * Matching Frontend Data Contract
 */

import { Router, Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../../prisma/prisma.service';
import { authenticate } from '../../middleware/auth';
import {
  isDatabaseFoundationEnabled,
  requireDatabaseFoundation,
} from '../../middleware/featureAvailability';

const router = Router();
const CLIENT_IDENTITY_MANAGER_ROLES = new Set(['ADMIN', 'PARTNER']);
const isHouseStyleFoundationEnabled = () =>
  isDatabaseFoundationEnabled('ENABLE_CLIENT_HOUSE_STYLE');
const requireHouseStyleFoundation = requireDatabaseFoundation({
  feature: 'CLIENT_HOUSE_STYLE',
  enabled: isHouseStyleFoundationEnabled,
  message: 'Client house-style persistence is not available in this environment.',
  nextStep: 'Complete the client house-style database reconciliation before saving a profile.',
});

function logPrismaRouteError(route: string, error: unknown): void {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const details =
      process.env.NODE_ENV === 'production'
        ? { code: error.code }
        : { code: error.code, meta: error.meta };
    console.error(`[clients] ${route} prisma error`, details);
    return;
  }
  console.error(`[clients] ${route} error`, error instanceof Error ? error.message : error);
}

const HOUSE_STYLE_FIELDS = [
  'officialName',
  'shortName',
  'registeredSeat',
  'taxNumber',
  'registrationNumber',
  'contactPerson',
  'contactEmail',
  'contactPhone',
  'preferredLanguage',
  'documentLanguageMode',
  'fontFamily',
  'fontSize',
  'headingStyle',
  'numberingStyle',
  'headerRequirements',
  'footerRequirements',
  'signatureBlock',
  'headerAssetPath',
  'headerDescription',
  'brandingNotes',
  'bilingualNotes',
  'translationNotes',
  'preferredTone',
  'prohibitedWording',
  'reusablePromptInstructions',
  'wordFormattingInstructions',
  'externalAiInstructions',
  'notes',
] as const;

function pickHouseStylePayload(body: any): Record<string, string | null> {
  const data: Record<string, string | null> = {};
  for (const field of HOUSE_STYLE_FIELDS) {
    if (body[field] !== undefined) {
      const value = body[field];
      data[field] = value === null ? null : String(value).trim();
    }
  }
  return data;
}

function isClientIdentityManager(req: Request): boolean {
  const role = String(req.user?.role || '').toUpperCase();
  return CLIENT_IDENTITY_MANAGER_ROLES.has(role);
}

function sendClientIdentityForbidden(res: Response): void {
  res.status(403).json({
    status: 403,
    code: 'CLIENT_IDENTITY_ACCESS_FORBIDDEN',
    message: 'You do not have access to client identity data.',
  });
}

async function getCaseAccessibleClientIds(req: Request): Promise<string[]> {
  const userId = req.user?.userId;
  if (!userId) {
    return [];
  }

  const cases = await prisma.case.findMany({
    where: {
      OR: [
        { assignedLawyerId: userId },
        { createdById: userId },
        { collaborators: { some: { userId } } },
      ],
    },
    select: { clientId: true },
  });

  return Array.from(new Set(cases.map((caseRecord: { clientId: string }) => caseRecord.clientId).filter(Boolean)));
}

async function canReadClientIdentity(req: Request, clientId: string): Promise<boolean> {
  if (isClientIdentityManager(req)) {
    return true;
  }

  const userId = req.user?.userId;
  if (!userId) {
    return false;
  }

  const relatedCase = await prisma.case.findFirst({
    where: {
      clientId,
      OR: [
        { assignedLawyerId: userId },
        { createdById: userId },
        { collaborators: { some: { userId } } },
      ],
    },
    select: { id: true },
  });

  return Boolean(relatedCase);
}

async function requireClientIdentityReadAccess(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const clientId = Array.isArray(req.params.clientId) ? req.params.clientId[0] : req.params.clientId;
  if (!clientId) {
    res.status(400).json({ status: 400, code: 'VALIDATION_ERROR', message: 'Client ID is required' });
    return;
  }

  try {
    const access = await canReadClientIdentity(req, clientId);
    if (!access) {
      sendClientIdentityForbidden(res);
      return;
    }
    next();
  } catch (error) {
    logPrismaRouteError('client identity read authorization', error);
    res.status(500).json({ status: 500, code: 'CLIENT_IDENTITY_AUTHORIZATION_ERROR', message: 'Client identity access could not be verified.' });
  }
}

async function requireClientIdentityManageAccess(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!isClientIdentityManager(req)) {
    sendClientIdentityForbidden(res);
    return;
  }
  next();
}

// Ping endpoint for debugging
router.get('/ping', (_req: Request, res: Response) => {
  res.json({ ok: true, message: 'Clients router working' });
});

// ============================================================================
// GET /clients/:clientId/house-style
// ============================================================================
router.get('/:clientId/house-style', authenticate, async (req: Request, res: Response): Promise<void> => {
  if (!isHouseStyleFoundationEnabled()) {
    res.json(null);
    return;
  }
  try {
    const clientId = Array.isArray(req.params.clientId) ? req.params.clientId[0] : req.params.clientId;

    if (!clientId) {
      res.status(400).json({ status: 400, code: 'VALIDATION_ERROR', message: 'Client ID is required' });
      return;
    }

    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: { id: true }
    });

    if (!client) {
      res.status(404).json({ status: 404, code: 'NOT_FOUND', message: 'Client not found' });
      return;
    }

    const profile = await prisma.clientHouseStyleProfile.findUnique({
      where: { clientId }
    });
    res.json(profile);
  } catch (error) {
    console.error('Get client house style error:', error);
    res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
});

// ============================================================================
// PUT /clients/:clientId/house-style
// ============================================================================
router.put('/:clientId/house-style', authenticate, requireHouseStyleFoundation, async (req: Request, res: Response): Promise<void> => {
  try {
    const clientId = Array.isArray(req.params.clientId) ? req.params.clientId[0] : req.params.clientId;

    if (!clientId) {
      res.status(400).json({ status: 400, code: 'VALIDATION_ERROR', message: 'Client ID is required' });
      return;
    }

    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: { id: true }
    });

    if (!client) {
      res.status(404).json({ status: 404, code: 'NOT_FOUND', message: 'Client not found' });
      return;
    }

    const payload = pickHouseStylePayload(req.body || {});

    const profile = await prisma.clientHouseStyleProfile.upsert({
      where: { clientId },
      create: {
        clientId,
        ...payload,
      },
      update: payload,
    });

    res.json(profile);
  } catch (error) {
    console.error('Update client house style error:', error);
    res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
});

// ============================================================================
// GET /clients
// ============================================================================
router.get('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const accessibleClientIds = isClientIdentityManager(req) ? null : await getCaseAccessibleClientIds(req);
    if (accessibleClientIds !== null && accessibleClientIds.length === 0) {
      res.json({ data: [] });
      return;
    }

    let baseClients: any[] = [];
    try {
      baseClients = await prisma.client.findMany({
        ...(accessibleClientIds ? { where: { id: { in: accessibleClientIds } } } : {}),
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          address: true,
        },
      });
    } catch (error) {
      logPrismaRouteError('GET /clients base-query', error);
      throw error;
    }

    const clients = baseClients.map((client) => ({
      ...client,
      houseStyleProfile: null,
      taxNumber: null,
      companyRegistrationNumber: null,
      authorizedRepresentative: null,
      contactPerson: null,
    }));

    const clientIndex = new Map(clients.map((client) => [client.id, client]));

    try {
      const enrichedClients = await prisma.client.findMany({
        where: { id: { in: clients.map((client) => client.id) } },
        select: {
          id: true,
          taxNumber: true,
          companyRegistrationNumber: true,
          authorizedRepresentative: true,
          contactPerson: true,
        },
      });
      for (const enriched of enrichedClients) {
        const target = clientIndex.get(enriched.id);
        if (target) Object.assign(target, enriched);
      }
    } catch (error) {
      // Optional identity fields may be missing on older staging DBs. Keep the client list usable.
      logPrismaRouteError('GET /clients optional-identity-fields', error);
    }

    try {
      const profiles = await prisma.clientHouseStyleProfile.findMany({
        where: { clientId: { in: clients.map((client) => client.id) } },
      });
      for (const profile of profiles) {
        const target = clientIndex.get(profile.clientId);
        if (target) target.houseStyleProfile = profile;
      }
    } catch (error) {
      // House style is optional for pilot browsing; a relation/table drift should not break /clients.
      logPrismaRouteError('GET /clients optional-house-style', error);
    }

    res.json({ data: clients });
  } catch (error) {
    logPrismaRouteError('GET /clients final', error);
    res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
});

// ============================================================================
// GET /clients/lookup — WORKFLOW-CORE-INTAKE-MATTER-OPENING-1
// Bounded duplicate-safety lookup for intake. Match signals are supported-field
// exact matches plus name similarity FOR HUMAN REVIEW ONLY — a search match is
// never a confirmed duplicate and never triggers a merge.
// ============================================================================
const LOOKUP_MIN_QUERY_LENGTH = 2;
const LOOKUP_MAX_RESULTS = 10;

router.get('/lookup', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const query = String(req.query.q || '').trim();
    if (query.length < LOOKUP_MIN_QUERY_LENGTH) {
      res.status(400).json({
        status: 400,
        code: 'QUERY_TOO_SHORT',
        message: `A kereséshez legalább ${LOOKUP_MIN_QUERY_LENGTH} karakter szükséges.`,
      });
      return;
    }

    // Same access model as the client list: identity managers search all
    // clients; other users search only clients on their accessible cases.
    const accessibleClientIds = isClientIdentityManager(req) ? null : await getCaseAccessibleClientIds(req);
    if (accessibleClientIds !== null && accessibleClientIds.length === 0) {
      res.json({ query, candidates: [] });
      return;
    }

    const normalized = query.toLowerCase();
    const candidates = await prisma.client.findMany({
      where: {
        ...(accessibleClientIds ? { id: { in: accessibleClientIds } } : {}),
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { email: { equals: query, mode: 'insensitive' } },
          { taxNumber: { equals: query } },
          { companyRegistrationNumber: { equals: query } },
        ],
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: LOOKUP_MAX_RESULTS,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        taxNumber: true,
        companyRegistrationNumber: true,
      },
    });

    const manager = isClientIdentityManager(req);
    res.json({
      query,
      candidates: candidates.map((client) => {
        const matchSignals: string[] = [];
        if (client.email && client.email.toLowerCase() === normalized) matchSignals.push('EXACT_EMAIL');
        if (client.companyRegistrationNumber && client.companyRegistrationNumber === query) matchSignals.push('EXACT_REGISTRATION_ID');
        if (client.taxNumber && client.taxNumber === query) matchSignals.push('EXACT_TAX_ID');
        if (client.name && client.name.toLowerCase().includes(normalized)) matchSignals.push('SIMILAR_NAME');
        return {
          id: client.id,
          displayName: client.name,
          // No person/organization type field exists in the schema — never inferred.
          type: null,
          email: client.email,
          phone: client.phone,
          matchSignals,
          // Every candidate requires human review; a match signal is not a
          // duplicate confirmation and never triggers an automatic merge.
          warning: 'REVIEW_REQUIRED',
          capabilities: {
            canSelect: true,
            canEdit: manager,
          },
        };
      }),
    });
  } catch (error) {
    logPrismaRouteError('GET /clients/lookup', error);
    res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
});

// ============================================================================
// GET /clients/:clientId
// ============================================================================
router.get('/:clientId', authenticate, requireClientIdentityReadAccess, async (req: Request, res: Response): Promise<void> => {
  try {
    const clientId = Array.isArray(req.params.clientId) ? req.params.clientId[0] : req.params.clientId;
    
    if (!clientId) {
      res.status(400).json({ status: 400, code: 'VALIDATION_ERROR', message: 'Client ID is required' });
      return;
    }
    
    const client = await prisma.client.findUnique({
      where: { id: clientId }
    });
    
    if (!client) {
      res.status(404).json({ status: 404, code: 'NOT_FOUND', message: 'Client not found' });
      return;
    }
    res.json(client);
  } catch (error) {
    console.error('Get client error:', error);
    res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
});

// ============================================================================
// POST /clients
// ============================================================================
router.post('/', authenticate, requireClientIdentityManageAccess, async (req: Request, res: Response): Promise<void> => {
  try {
    // Support both JSON and form-urlencoded body
    const name = req.body.name || req.body['name'];
    const email = req.body.email || req.body['email'];
    const phone = req.body.phone || req.body['phone'];
    const address = req.body.address || req.body['address'];
    const taxNumber = req.body.taxNumber || req.body['taxNumber'] || req.body.vatNumber || req.body['vatNumber'];
    const companyRegistrationNumber = req.body.companyRegistrationNumber || req.body['companyRegistrationNumber'];
    const authorizedRepresentative = req.body.authorizedRepresentative || req.body['authorizedRepresentative'];
    const contactPerson = req.body.contactPerson || req.body['contactPerson'];

    if (!name) {
      res.status(400).json({ status: 400, code: 'VALIDATION_ERROR', message: 'Client name is required' });
      return;
    }

    const client = await prisma.client.create({
      data: {
        name,
        email: email || null,
        phone: phone || null,
        address: address || null,
        taxNumber: taxNumber || null,
        companyRegistrationNumber: companyRegistrationNumber || null,
        authorizedRepresentative: authorizedRepresentative || null,
        contactPerson: contactPerson || null
      }
    });
    res.status(201).json(client);
  } catch (error: any) {
    console.error('Create client error:', error);
    
    // Handle Prisma P2002 unique constraint violation
    if (error.code === 'P2002') {
      res.status(409).json({ status: 409, code: 'CONFLICT', message: 'Client with this name already exists' });
      return;
    }

    if (error.code === 'P2022') {
      const missingColumn = String(error?.meta?.column || 'unknown column');
      res.status(500).json({
        status: 500,
        code: 'SCHEMA_MISMATCH',
        message: `Database schema mismatch: missing column ${missingColumn}. Run client identity field migration.`,
      });
      return;
    }
    
    res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
});

// ============================================================================
// PATCH /clients/:clientId
// ============================================================================
router.patch('/:clientId', authenticate, requireClientIdentityManageAccess, async (req: Request, res: Response): Promise<void> => {
  try {
    const clientId = Array.isArray(req.params.clientId) ? req.params.clientId[0] : req.params.clientId;
    
    if (!clientId) {
      res.status(400).json({ status: 400, code: 'VALIDATION_ERROR', message: 'Client ID is required' });
      return;
    }

    const {
      name,
      email,
      phone,
      address,
      taxNumber,
      vatNumber,
      companyRegistrationNumber,
      authorizedRepresentative,
      contactPerson,
    } = req.body;

    const resolvedTaxNumber = taxNumber !== undefined ? taxNumber : vatNumber;

    const client = await prisma.client.update({
      where: { id: clientId },
      data: {
        ...(name && { name }),
        ...(email !== undefined && { email }),
        ...(phone !== undefined && { phone }),
        ...(address !== undefined && { address }),
        ...(resolvedTaxNumber !== undefined && { taxNumber: resolvedTaxNumber }),
        ...(companyRegistrationNumber !== undefined && { companyRegistrationNumber }),
        ...(authorizedRepresentative !== undefined && { authorizedRepresentative }),
        ...(contactPerson !== undefined && { contactPerson })
      }
    });
    res.json(client);
  } catch (error: any) {
    console.error('Update client error:', error);
    
    if (error.code === 'P2025') {
      res.status(404).json({ status: 404, code: 'NOT_FOUND', message: 'Client not found' });
      return;
    }

    if (error.code === 'P2022') {
      const missingColumn = String(error?.meta?.column || 'unknown column');
      res.status(500).json({
        status: 500,
        code: 'SCHEMA_MISMATCH',
        message: `Database schema mismatch: missing column ${missingColumn}. Run client identity field migration.`,
      });
      return;
    }
    
    res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
});

// ============================================================================
// DELETE /clients/:clientId
// ============================================================================
router.delete('/:clientId', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const clientId = Array.isArray(req.params.clientId) ? req.params.clientId[0] : req.params.clientId;
    
    if (!clientId) {
      res.status(400).json({ status: 400, code: 'VALIDATION_ERROR', message: 'Client ID is required' });
      return;
    }

    await prisma.client.delete({
      where: { id: clientId }
    });
    res.status(204).send();
  } catch (error: any) {
    console.error('Delete client error:', error);
    
    if (error.code === 'P2025') {
      res.status(404).json({ status: 404, code: 'NOT_FOUND', message: 'Client not found' });
      return;
    }
    
    res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
});

export default router;
