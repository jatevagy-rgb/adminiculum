/**
 * Users Routes Module V2
 * User management endpoints
 * Matching Frontend Data Contract
 */
import { Router } from 'express';
import usersService from './services';
import { authenticate } from '../../middleware/auth';
const router = Router();
// ============================================================================
// GET /users
// ============================================================================
router.get('/', authenticate, async (req, res) => {
    try {
        const result = await usersService.getUsers();
        res.json(result);
    }
    catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' });
    }
});
// ============================================================================
// GET /users/:userId
// ============================================================================
router.get('/:userId', authenticate, async (req, res) => {
    try {
        const userId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
        const user = await usersService.getUserById(userId);
        if (!user) {
            res.status(404).json({ status: 404, code: 'NOT_FOUND', message: 'User not found' });
            return;
        }
        res.json(user);
    }
    catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' });
    }
});
// ============================================================================
// POST /users
// ============================================================================
router.post('/', authenticate, async (req, res) => {
    try {
        const { name, email, role, title, phone, hourlyRate } = req.body;
        if (!name || !email || !role) {
            res.status(400).json({ status: 400, code: 'VALIDATION_ERROR', message: 'Missing required fields' });
            return;
        }
        const result = await usersService.createUser({
            name,
            email,
            role,
            title,
            phone,
            hourlyRate
        });
        res.status(201).json(result);
    }
    catch (error) {
        console.error('Create user error:', error);
        res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' });
    }
});
// ============================================================================
// GET /users/:userId/skills
// ============================================================================
router.get('/:userId/skills', authenticate, async (req, res) => {
    try {
        const userId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
        const skills = await usersService.getUserSkills(userId);
        if (!skills) {
            res.status(404).json({ status: 404, code: 'NOT_FOUND', message: 'Skill profile not found' });
            return;
        }
        res.json(skills);
    }
    catch (error) {
        console.error('Get skills error:', error);
        res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' });
    }
});
// ============================================================================
// PATCH /users/:userId/skills
// ============================================================================
router.patch('/:userId/skills', authenticate, async (req, res) => {
    try {
        const userId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
        const { skills } = req.body;
        if (!skills) {
            res.status(400).json({ status: 400, code: 'VALIDATION_ERROR', message: 'Missing skills' });
            return;
        }
        const result = await usersService.updateUserSkills(userId, skills);
        res.json(result);
    }
    catch (error) {
        console.error('Update skills error:', error);
        res.status(500).json({ status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' });
    }
});
export default router;
//# sourceMappingURL=routes.js.map