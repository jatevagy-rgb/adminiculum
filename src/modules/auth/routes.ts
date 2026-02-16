/**
 * Auth Routes Module V2
 * Modular route structure for authentication
 * Matching Frontend Data Contract
 */

import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import authService from './services';
import { authenticate } from '../../middleware/auth';

const router = Router();

/**
 * Validation middleware
 */
const handleValidation = (req: Request, res: Response, next: Function) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Validation failed',
      details: errors.array()
    });
    return;
  }
  next();
};

// ============================================================================
// POST /auth/login
// ============================================================================
router.post(
  '/login',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 6 }),
    handleValidation
  ],
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { email, password } = req.body;
      const result = await authService.login(email, password);

      res.status(result.status).json(result.data);
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({
        status: 500,
        code: 'INTERNAL_ERROR',
        message: 'Internal server error'
      });
    }
  }
);

// ============================================================================
// POST /auth/logout
// ============================================================================
router.post('/logout', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.userId;
    await authService.logout(userId);
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      status: 500,
      code: 'INTERNAL_ERROR',
      message: 'Internal server error'
    });
  }
});

// ============================================================================
// GET /auth/me
// ============================================================================
router.get('/me', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.userId;
    const result = await authService.getMe(userId);
    res.status(result.status).json(result.data);
  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({
      status: 500,
      code: 'INTERNAL_ERROR',
      message: 'Internal server error'
    });
  }
});

// ============================================================================
// POST /auth/refresh
// ============================================================================
router.post(
  '/refresh',
  [body('refreshToken').notEmpty(), handleValidation],
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { refreshToken } = req.body;
      const result = await authService.refresh(refreshToken);
      res.status(result.status).json(result.data);
    } catch (error) {
      console.error('Refresh error:', error);
      res.status(500).json({
        status: 500,
        code: 'INTERNAL_ERROR',
        message: 'Internal server error'
      });
    }
  }
);

export default router;
