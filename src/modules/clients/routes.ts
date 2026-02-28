/**
 * Clients Routes Module V2
 * Client management endpoints
 * Matching Frontend Data Contract
 */

import { Router, Request, Response } from 'express';
import { prisma } from '../../prisma/prisma.service';
import { authenticate } from '../../middleware/auth';

const router = Router();

// ============================================================================
// GET /clients
// ============================================================================
router.get('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const clients = await prisma.client.findMany({
      orderBy: { name: 'asc' }
    });
    res.json({ data: clients });
  } catch (error) {
    console.error('Get clients error:', error);
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

    if (!name) {
      res.status(400).json({ status: 400, code: 'VALIDATION_ERROR', message: 'Client name is required' });
      return;
    }

    const client = await prisma.client.create({
      data: {
        name,
        email: email || null,
        phone: phone || null,
        address: address || null
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

    const { name, email, phone, address } = req.body;

    const client = await prisma.client.update({
      where: { id: clientId },
      data: {
        ...(name && { name }),
        ...(email !== undefined && { email }),
        ...(phone !== undefined && { phone }),
        ...(address !== undefined && { address })
      }
    });
    res.json(client);
  } catch (error: any) {
    console.error('Update client error:', error);
    
    if (error.code === 'P2025') {
      res.status(404).json({ status: 404, code: 'NOT_FOUND', message: 'Client not found' });
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
