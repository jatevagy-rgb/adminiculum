/**
 * Contracts Routes
 * API endpoints for contract template management and document generation
 */

import { Router, Request, Response } from 'express';
import contractsService from './services';
import { authenticate } from '../../middleware/auth';
import { prisma } from '../../prisma/prisma.service';
import { ADASVETEL_VARIABLES, TemplateCategory } from './types';
import multer from 'multer';

const router = Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      cb(null, true);
    } else {
      cb(new Error('Only .docx files are allowed'));
    }
  },
});

/**
 * GET /api/v1/contracts/templates
 * List all contract templates
 */
router.get('/templates', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const category = req.query.category as string | undefined;
    const templates = await contractsService.getTemplates(category as TemplateCategory);
    res.json(templates);
  } catch (error) {
    console.error('Get templates error:', error);
    res.status(500).json({
      status: 500,
      code: 'INTERNAL_ERROR',
      message: 'Internal server error'
    });
  }
});

/**
 * GET /api/v1/contracts/templates/:id
 * Get template by ID with variables
 */
router.get('/templates/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    const template = await contractsService.getTemplateById(id);

    if (!template) {
      res.status(404).json({
        status: 404,
        code: 'NOT_FOUND',
        message: 'Template not found'
      });
      return;
    }

    res.json(template);
  } catch (error) {
    console.error('Get template error:', error);
    res.status(500).json({
      status: 500,
      code: 'INTERNAL_ERROR',
      message: 'Internal server error'
    });
  }
});

/**
 * GET /api/v1/contracts/templates/adasvetel/variables
 * Get predefined variables for adásvételi contract
 */
router.get('/templates/adasvetel/variables', authenticate, async (req: Request, res: Response): Promise<void> => {
  res.json({
    category: 'ADASVETEL',
    variables: ADASVETEL_VARIABLES
  });
});

/**
 * POST /api/v1/contracts/templates
 * Upload and register new template
 */
router.post('/templates', authenticate, upload.single('template'), async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.userId;
    const { name, description, category, variables } = req.body;

    if (!req.file) {
      res.status(400).json({
        status: 400,
        code: 'VALIDATION_ERROR',
        message: 'Template file is required'
      });
      return;
    }

    if (!name || !category) {
      res.status(400).json({
        status: 400,
        code: 'VALIDATION_ERROR',
        message: 'Name and category are required'
      });
      return;
    }

    // Save template file
    const templatePath = await contractsService.saveTemplateFile({
      name: req.file.originalname,
      data: req.file.buffer
    });

    // Parse variables (JSON string or use defaults)
    let parsedVariables = [];
    if (variables) {
      try {
        parsedVariables = JSON.parse(variables);
      } catch {
        parsedVariables = [];
      }
    }

    const template = await contractsService.createTemplate({
      name,
      description,
      category: category as TemplateCategory,
      templatePath,
      originalFileName: req.file.originalname,
      variables: parsedVariables,
      isDefault: req.body.isDefault === 'true'
    });

    if (!template) {
      res.status(500).json({
        status: 500,
        code: 'CREATE_FAILED',
        message: 'Failed to create template'
      });
      return;
    }

    res.status(201).json(template);
  } catch (error) {
    console.error('Create template error:', error);
    res.status(500).json({
      status: 500,
      code: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

/**
 * POST /api/v1/contracts/generate
 * Generate contract document
 */
router.post('/generate', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.userId;
    const { templateId, caseId, data, title } = req.body;

    if (!templateId || !data) {
      res.status(400).json({
        status: 400,
        code: 'VALIDATION_ERROR',
        message: 'templateId and data are required'
      });
      return;
    }

    const result = await contractsService.generateContract({
      templateId,
      caseId,
      data,
      title,
      userId
    });

    if (!result.success) {
      res.status(400).json({
        status: 400,
        code: 'GENERATION_FAILED',
        message: result.error
      });
      return;
    }

    res.status(201).json(result);
  } catch (error) {
    console.error('Generate contract error:', error);
    res.status(500).json({
      status: 500,
      code: 'INTERNAL_ERROR',
      message: 'Internal server error'
    });
  }
});

/**
 * POST /api/v1/contracts/preview
 * Generate preview (temporary, auto-deleted after 24h)
 */
router.post('/preview', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { templateId, data } = req.body;

    if (!templateId || !data) {
      res.status(400).json({
        status: 400,
        code: 'VALIDATION_ERROR',
        message: 'templateId and data are required'
      });
      return;
    }

    const result = await contractsService.generatePreview({
      templateId,
      data
    });

    if (!result.success) {
      res.status(400).json({
        status: 400,
        code: 'PREVIEW_FAILED',
        message: result.error
      });
      return;
    }

    res.json(result);
  } catch (error) {
    console.error('Preview generation error:', error);
    res.status(500).json({
      status: 500,
      code: 'INTERNAL_ERROR',
      message: 'Internal server error'
    });
  }
});

/**
 * GET /api/v1/contracts/case/:caseId
 * Get generated contracts for a case
 */
router.get('/case/:caseId', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { caseId } = req.params as { caseId: string };
    const contracts = await contractsService.getCaseContracts(caseId);
    res.json(contracts);
  } catch (error) {
    console.error('Get case contracts error:', error);
    res.status(500).json({
      status: 500,
      code: 'INTERNAL_ERROR',
      message: 'Internal server error'
    });
  }
});

/**
 * GET /api/v1/contracts/:id/download
 * Download generated contract
 */
router.get('/:id/download', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    const generation = await prisma.contractGeneration.findUnique({
      where: { id }
    });

    if (!generation) {
      res.status(404).json({
        status: 404,
        code: 'NOT_FOUND',
        message: 'Generated contract not found'
      });
      return;
    }

    // Check if file exists
    const fs = await import('fs');
    if (!fs.existsSync(generation.filePath)) {
      res.status(404).json({
        status: 404,
        code: 'FILE_NOT_FOUND',
        message: 'File no longer exists'
      });
      return;
    }

    res.download(generation.filePath, generation.fileName);
  } catch (error) {
    console.error('Download contract error:', error);
    res.status(500).json({
      status: 500,
      code: 'INTERNAL_ERROR',
      message: 'Internal server error'
    });
  }
});

/**
 * POST /api/v1/contracts/:id/upload-sharepoint
 * Upload generated contract to SharePoint
 */
router.post('/:id/upload-sharepoint', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    
    const result = await contractsService.uploadToSharePoint(id);

    if (!result.success) {
      res.status(400).json({
        status: 400,
        code: 'UPLOAD_FAILED',
        message: result.error || 'Upload to SharePoint failed'
      });
      return;
    }

    res.json({
      success: true,
      spItemId: result.spItemId,
      spWebUrl: result.spWebUrl
    });
  } catch (error) {
    console.error('SharePoint upload error:', error);
    res.status(500).json({
      status: 500,
      code: 'INTERNAL_ERROR',
      message: 'Internal server error'
    });
  }
});

/**
 * POST /api/v1/contracts/cleanup
 * Cleanup expired previews (admin only)
 */
router.post('/cleanup', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.userId;
    
    // Verify admin role
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (user?.role !== 'ADMIN') {
      res.status(403).json({
        status: 403,
        code: 'FORBIDDEN',
        message: 'Admin access required'
      });
      return;
    }

    const count = await contractsService.cleanupExpiredPreviews();
    res.json({
      success: true,
      deletedCount: count
    });
  } catch (error) {
    console.error('Cleanup error:', error);
    res.status(500).json({
      status: 500,
      code: 'INTERNAL_ERROR',
      message: 'Internal server error'
    });
  }
});

export default router;
