const { Router } = require('express');
const ctrl = require('../controllers/tenant.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const { resolveTenant, enforceTenantScope } = require('../middleware/tenant.middleware');
const {
  attachAccessState,
  injectTrialHeaders,
  enforceTeamLimit,
  requireFullAccess,
} = require('../middleware/subscription.middleware');
const { body } = require('express-validator');
const validate = require('../middleware/validate.middleware');

const router = Router();

// All tenant routes require auth + tenant resolution + access state
router.use(authenticate, resolveTenant, enforceTenantScope, attachAccessState, injectTrialHeaders);

// Profile reads: allowed in hibernation (data read-only mode)
router.get('/profile',    ctrl.getProfile);
router.patch('/profile',  authorize('owner', 'admin'), requireFullAccess, ctrl.updateProfile);

// Team reads: allowed in hibernation
router.get('/team',       ctrl.getTeam);

// Team mutations: gated by both role AND active subscription + team limit
router.post(
  '/team/invite',
  authorize('owner', 'admin'),
  requireFullAccess,
  enforceTeamLimit,
  [
    body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
    body('firstName').trim().notEmpty().withMessage('First name required'),
    body('lastName').trim().notEmpty().withMessage('Last name required'),
    body('role').optional().isIn(['admin', 'member', 'viewer']).withMessage('Invalid role'),
  ],
  validate,
  ctrl.inviteMember,
);

router.patch('/team/:userId/role', authorize('owner', 'admin'), requireFullAccess, ctrl.updateMemberRole);
router.delete('/team/:userId',     authorize('owner'),          requireFullAccess, ctrl.removeMember);

module.exports = router;
