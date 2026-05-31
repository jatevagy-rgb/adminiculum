/**
 * Clients Routes Module V2
 * Client management endpoints
 * Matching Frontend Data Contract
 */

import { Router, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../../prisma/prisma.service';
import { authenticate } from '../../middleware/auth';

const router = Router();

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

// Ping endpoint for debugging
router.get('/ping', (_req: Request, res: Response) => {
  res.json({ ok: true, message: 'Clients router working' });
});

// ============================================================================
// GET /clients/:clientId/house-style
// ============================================================================
router.get('/:clientId/house-style', authenticate, async (req: Request, res: Response): Promise<void> => {
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
router.put('/:clientId/house-style', authenticate, async (req: Request, res: Response): Promise<void> => {
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
    let clients: any[] = [];
    try {
      clients = await prisma.client.findMany({
        include: { houseStyleProfile: true },
        orderBy: { name: 'asc' }
      });
    } catch (error) {
      logPrismaRouteError('GET /clients primary-query', error);
      const message = error instanceof Error ? error.message.toLowerCase() : '';
      const relationDrift =
        message.includes('housestyleprofile') ||
        message.includes('unknown field') ||
        message.includes('unknown arg') ||
        message.includes('does not exist');
      const schemaDrift =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === 'P2022' || error.code === 'P2021');
      if (!relationDrift && !schemaDrift) {
        throw error;
      }

      // Staging fallback: if relation/column drift occurs, query a minimal stable shape.
      let baseClients: any[] = [];
      try {
        baseClients = await prisma.client.findMany({
          orderBy: { name: 'asc' },
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            address: true,
          },
        });
      } catch (fallbackError) {
        logPrismaRouteError('GET /clients fallback-query', fallbackError);
        baseClients = [];
      }
      clients = baseClients.map((client) => ({
        ...client,
        houseStyleProfile: null,
        taxNumber: null,
        companyRegistrationNumber: null,
        authorizedRepresentative: null,
        contactPerson: null,
      }));
    }
    res.json({ data: clients });
  } catch (error) {
    logPrismaRouteError('GET /clients final', error);
    res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
});

// ============================================================================
// GET /clients/:clientId
// ============================================================================
router.get('/:clientId', authenticate, async (req: Request, res: Response): Promise<void> => {
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
router.post('/', authenticate, async (req: Request, res: Response): Promise<void> => {
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
router.patch('/:clientId', authenticate, async (req: Request, res: Response): Promise<void> => {
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
