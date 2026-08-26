/**
 * Contracts Routes
 * API endpoints for contract template management and document generation
 */

import { Router, Request, Response, NextFunction } from 'express';
import contractsService from './services';
import { authenticate } from '../../middleware/auth';
import { requireWorkforceUser } from '../../middleware/workforceAuthorization';
import { prisma } from '../../prisma/prisma.service';
import { ADASVETEL_VARIABLES, TemplateCategory } from './types';
import multer from 'multer';
import { isDatabaseFoundationEnabled, sendFeatureUnavailable } from '../../middleware/featureAvailability';
import { getEditorTemplateCapabilities } from './templateCapabilities';
import {
  requireContractReadAccess,
  requireContractManageAccess,
  requireAdminRole,
  requireCaseManageAccessFromBody,
  requireCaseReadAccessFromParams,
} from './contractAuthorization';

const router = Router();
router.use(authenticate, requireWorkforceUser);
const isContractsEnabled = (): boolean =>
  isDatabaseFoundationEnabled('ENABLE_CONTRACT_GENERATION') &&
  isDatabaseFoundationEnabled('ENABLE_CONTRACT_GENERATION_STORAGE_MODEL');

const requireContractsEnabled = (_req: Request, res: Response, next: NextFunction): void => {
  if (!isContractsEnabled()) {
    sendFeatureUnavailable(res, {
      feature: 'CONTRACTS',
      message: 'Contract generation is not available in this environment.',
      reason: 'CONTRACTS_NOT_ENABLED',
      nextStep:
        'Contracts require an approved storage, retention, permission, and audit model before they can be enabled.',
    });
    return;
  }
  next();
};

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

router.use(authenticate);

router.get('/editor-template-capabilities', (_req: Request, res: Response): void => {
  res.json(getEditorTemplateCapabilities());
});

router.use(requireContractsEnabled);

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
router.post('/templates', authenticate, requireAdminRole, upload.single('template'), async (req: Request, res: Response): Promise<void> => {
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
router.post('/generate', authenticate, requireContractsEnabled, requireCaseManageAccessFromBody, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.userId;
    const userEmail = (req as any).user?.email;
    const { templateId, caseId, data, title, selectedBundleItemIds } = req.body;

    if (!templateId || !data) {
      res.status(400).json({
        status: 400,
        code: 'VALIDATION_ERROR',
        message: 'templateId and data are required'
      });
      return;
    }

    const bundleRequested = Array.isArray(selectedBundleItemIds) && selectedBundleItemIds.length > 0;

    console.info('[contracts/generate] request', {
      templateId,
      caseId,
      title,
      bundleRequested,
      selectedBundleItemIds,
      selectedBundleItemIdsType: typeof selectedBundleItemIds,
      selectedBundleItemIdsLength: Array.isArray(selectedBundleItemIds) ? selectedBundleItemIds.length : null,
    });

    const result = await contractsService.generateWithBundle({
      templateId,
      caseId,
      data,
      title,
      selectedBundleItemIds,
      userId,
      userEmail
    });

    if (!result.success) {
      res.status(400).json({
        status: 400,
        code: 'GENERATION_FAILED',
        message: result.error
      });
      return;
    }

    const responsePayload = bundleRequested
      ? {
          ...result,
          bundleDocuments: Array.isArray((result as any).bundleDocuments) ? (result as any).bundleDocuments : [],
          skippedBundleItems: Array.isArray((result as any).skippedBundleItems) ? (result as any).skippedBundleItems : [],
        }
      : result;

    console.info('[contracts/generate] service-result-shape', {
      bundleRequested,
      keys: Object.keys(result || {}),
      hasBundleDocumentsField: Object.prototype.hasOwnProperty.call(result, 'bundleDocuments'),
      hasSkippedBundleItemsField: Object.prototype.hasOwnProperty.call(result, 'skippedBundleItems'),
      bundleDocumentsLength: Array.isArray((result as any).bundleDocuments) ? (result as any).bundleDocuments.length : null,
      skippedBundleItemsLength: Array.isArray((result as any).skippedBundleItems) ? (result as any).skippedBundleItems.length : null,
    });

    console.info('[contracts/generate] response-shape', {
      keys: Object.keys(responsePayload || {}),
      hasBundleDocumentsField: Object.prototype.hasOwnProperty.call(responsePayload, 'bundleDocuments'),
      hasSkippedBundleItemsField: Object.prototype.hasOwnProperty.call(responsePayload, 'skippedBundleItems'),
      bundleDocumentsLength: Array.isArray((responsePayload as any).bundleDocuments)
        ? (responsePayload as any).bundleDocuments.length
        : null,
      skippedBundleItemsLength: Array.isArray((responsePayload as any).skippedBundleItems)
        ? (responsePayload as any).skippedBundleItems.length
        : null,
    });

    res.status(201).json(responsePayload);
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
 * POST /api/v1/contracts/bundle-options
 * Get ADASVETEL bundle options with eligibility flags based on intake data
 */
router.post('/bundle-options', authenticate, requireContractsEnabled, async (req: Request, res: Response): Promise<void> => {
  try {
    const { contractType, intakeData } = req.body || {};
    const options = await contractsService.getBundleOptions({
      contractType,
      intakeData,
    });
    res.status(200).json({
      contractType: String(contractType || 'ADASVETEL').toUpperCase(),
      options,
    });
  } catch (error) {
    console.error('Get bundle options error:', error);
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
router.post('/preview', authenticate, requireContractsEnabled, async (req: Request, res: Response): Promise<void> => {
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
router.get('/case/:caseId', authenticate, requireContractsEnabled, requireCaseReadAccessFromParams, async (req: Request, res: Response): Promise<void> => {
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
 * GET /api/v1/contracts/:id/compare
 * Compare target contract against source contract at block level
 */
router.get('/:id/compare', authenticate, requireContractsEnabled, requireContractReadAccess, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    const against = typeof req.query.against === 'string' ? req.query.against : undefined;

    const result = await contractsService.getContractComparison(id, against);

    if (!result.success) {
      const message = result.error || 'Compare failed';
      const isNotFound = /not found/i.test(message);
      const isValidation = /supports only adasvetel|lineage required|no source contract/i.test(message);
      res.status(isNotFound ? 404 : isValidation ? 400 : 500).json({
        status: isNotFound ? 404 : isValidation ? 400 : 500,
        code: isNotFound ? 'NOT_FOUND' : isValidation ? 'VALIDATION_ERROR' : 'INTERNAL_ERROR',
        message,
      });
      return;
    }

    res.status(200).json(result.comparison);
  } catch (error) {
    console.error('Compare contract error:', error);
    res.status(500).json({
      status: 500,
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    });
  }
});

/**
 * GET /api/v1/contracts/:id/edit-draft
 * Load ADASVETEL edit-mode draft blocks
 */
router.get('/:id/edit-draft', authenticate, requireContractsEnabled, requireContractReadAccess, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    const result = await contractsService.getEditDraft(id);
    res.status(200).json(result);
  } catch (error) {
    console.error('Get edit draft error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    const isNotFound = /not found/i.test(message);
    const isValidation = /only for adasvetel|requires case-linked/i.test(message);
    res.status(isNotFound ? 404 : isValidation ? 400 : 500).json({
      status: isNotFound ? 404 : isValidation ? 400 : 500,
      code: isNotFound ? 'NOT_FOUND' : isValidation ? 'VALIDATION_ERROR' : 'INTERNAL_ERROR',
      message,
    });
  }
});

/**
 * PUT /api/v1/contracts/:id/edit-draft
 * Save ADASVETEL edit-mode draft blocks
 */
router.put('/:id/edit-draft', authenticate, requireContractsEnabled, requireContractManageAccess, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    const { blocks } = req.body || {};

    if (!Array.isArray(blocks)) {
      res.status(400).json({
        status: 400,
        code: 'VALIDATION_ERROR',
        message: 'blocks array is required',
      });
      return;
    }

    const result = await contractsService.saveEditDraft(id, { blocks });
    res.status(200).json(result);
  } catch (error) {
    console.error('Save edit draft error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    const isNotFound = /not found/i.test(message);
    const isValidation = /only for adasvetel|requires case-linked/i.test(message);
    res.status(isNotFound ? 404 : isValidation ? 400 : 500).json({
      status: isNotFound ? 404 : isValidation ? 400 : 500,
      code: isNotFound ? 'NOT_FOUND' : isValidation ? 'VALIDATION_ERROR' : 'INTERNAL_ERROR',
      message,
    });
  }
});

/**
 * POST /api/v1/contracts/:id/edit-draft/generate
 * Generate non-destructive edited revision output from saved edit draft
 */
router.post('/:id/edit-draft/generate', authenticate, requireContractsEnabled, requireContractManageAccess, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    const userId = (req as any).user?.userId;
    const userEmail = (req as any).user?.email;

    const result = await contractsService.generateRevisionFromEditDraft(id, userId, userEmail);

    if (!result.success) {
      const message = result.error || 'Failed to generate edited revision';
      const isNotFound = /not found/i.test(message);
      const isValidation = /only for adasvetel|requires case-linked|no editable content/i.test(message);
      res.status(isNotFound ? 404 : isValidation ? 400 : 500).json({
        status: isNotFound ? 404 : isValidation ? 400 : 500,
        code: isNotFound ? 'NOT_FOUND' : isValidation ? 'VALIDATION_ERROR' : 'INTERNAL_ERROR',
        message,
      });
      return;
    }

    res.status(201).json(result);
  } catch (error) {
    console.error('Generate edit draft revision error:', error);
    res.status(500).json({
      status: 500,
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    });
  }
});

/**
 * GET /api/v1/contracts/:id/edit-suggestions
 * Load narrow clause suggestions for ADASVETEL edit mode
 */
router.get('/:id/edit-suggestions', authenticate, requireContractsEnabled, requireContractReadAccess, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const result = await contractsService.getEditSuggestions(id, search);
    res.status(200).json(result);
  } catch (error) {
    console.error('Get edit suggestions error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    const isNotFound = /not found/i.test(message);
    const isValidation = /only for adasvetel|requires case-linked/i.test(message);
    res.status(isNotFound ? 404 : isValidation ? 400 : 500).json({
      status: isNotFound ? 404 : isValidation ? 400 : 500,
      code: isNotFound ? 'NOT_FOUND' : isValidation ? 'VALIDATION_ERROR' : 'INTERNAL_ERROR',
      message,
    });
  }
});

/**
 * GET /api/v1/contracts/:id/download
 * Download generated contract
 */
router.get('/:id/download', authenticate, requireContractsEnabled, requireContractReadAccess, async (req: Request, res: Response): Promise<void> => {
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
router.post('/:id/upload-sharepoint', authenticate, requireContractManageAccess, async (req: Request, res: Response): Promise<void> => {
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
router.post('/cleanup', authenticate, requireAdminRole, async (req: Request, res: Response): Promise<void> => {
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

/**
 * POST /api/v1/contracts/:id/finalize
 * Finalize a contract generation (mark as final/locked)
 */
router.post('/:id/finalize', authenticate, requireContractsEnabled, requireContractManageAccess, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    
    const result = await contractsService.finalizeContract(id);

    if (!result.success) {
      res.status(400).json({
        status: 400,
        code: 'FINALIZE_FAILED',
        message: result.error || 'Failed to finalize contract'
      });
      return;
    }

    res.json(result);
  } catch (error) {
    console.error('Finalize contract error:', error);
    res.status(500).json({
      status: 500,
      code: 'INTERNAL_ERROR',
      message: 'Internal server error'
    });
  }
});

/**
 * POST /api/v1/contracts/:id/create-revision
 * Create a revision (new version) of an existing contract generation
 */
router.post('/:id/create-revision', authenticate, requireContractsEnabled, requireContractManageAccess, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    const userId = (req as any).user?.userId;
    const userEmail = (req as any).user?.email;
    
    const result = await contractsService.createContractRevision(id, userId, userEmail);

    if (!result.success) {
      res.status(400).json({
        status: 400,
        code: 'REVISION_FAILED',
        message: result.error || 'Failed to create revision'
      });
      return;
    }

    res.status(201).json(result);
  } catch (error) {
    console.error('Create revision error:', error);
    res.status(500).json({
      status: 500,
      code: 'INTERNAL_ERROR',
      message: 'Internal server error'
    });
  }
});

/**
 * GET /api/v1/contracts/case/:caseId/bundle-download
 * Download all generated contracts for a case as a ZIP bundle
 */
router.get('/case/:caseId/bundle-download', authenticate, requireContractsEnabled, requireCaseReadAccessFromParams, async (req: Request, res: Response): Promise<void> => {
  try {
    const { caseId } = req.params as { caseId: string };
    
    const result = await contractsService.downloadCaseBundle(caseId);

    if (!result.success || !result.zipBuffer) {
      res.status(400).json({
        status: 400,
        code: 'BUNDLE_FAILED',
        message: result.error || 'Failed to create bundle'
      });
      return;
    }

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${result.fileName}"`);
    res.setHeader('Content-Length', result.zipBuffer.length);
    res.send(result.zipBuffer);
  } catch (error) {
    console.error('Bundle download error:', error);
    res.status(500).json({
      status: 500,
      code: 'INTERNAL_ERROR',
      message: 'Internal server error'
    });
  }
});

/**
 * POST /api/v1/contracts/:id/reject-approval
 * Reject / undo approval - move contract back to GENERATED state
 */
router.post('/:id/reject-approval', authenticate, requireContractsEnabled, requireContractManageAccess, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    const userId = (req as any).user?.userId;
    const userEmail = (req as any).user?.email;
    const { reason } = req.body || {};

    const result = await contractsService.rejectApproval(id, userId, userEmail, reason);

    if (!result.success) {
      res.status(400).json({
        status: 400,
        code: 'REJECT_APPROVAL_FAILED',
        message: result.error || 'Failed to reject approval'
      });
      return;
    }

    res.status(200).json(result);
  } catch (error) {
    console.error('Reject approval error:', error);
    res.status(500).json({
      status: 500,
      code: 'INTERNAL_ERROR',
      message: 'Internal server error'
    });
  }
});

/**
 * POST /api/v1/contracts/:id/back-to-review
 * Send contract back to review state
 */
router.post('/:id/back-to-review', authenticate, requireContractsEnabled, requireContractManageAccess, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    const userId = (req as any).user?.userId;
    const userEmail = (req as any).user?.email;
    const { note } = req.body || {};

    const result = await contractsService.backToReview(id, userId, userEmail, note);

    if (!result.success) {
      res.status(400).json({
        status: 400,
        code: 'BACK_TO_REVIEW_FAILED',
        message: result.error || 'Failed to send back to review'
      });
      return;
    }

    res.status(200).json(result);
  } catch (error) {
    console.error('Back to review error:', error);
    res.status(500).json({
      status: 500,
      code: 'INTERNAL_ERROR',
      message: 'Internal server error'
    });
  }
});

/**
 * GET /api/v1/contracts/:id/timeline
 * Get document-specific timeline events
 */
router.get('/:id/timeline', authenticate, requireContractsEnabled, requireContractReadAccess, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params as { id: string };

    const result = await contractsService.getContractTimeline(id);

    if (!result.success) {
      res.status(404).json({
        status: 404,
        code: 'TIMELINE_NOT_FOUND',
        message: result.error || 'Contract not found'
      });
      return;
    }

    res.status(200).json(result);
  } catch (error) {
    console.error('Get timeline error:', error);
    res.status(500).json({
      status: 500,
      code: 'INTERNAL_ERROR',
      message: 'Internal server error'
    });
  }
});

export default router;
