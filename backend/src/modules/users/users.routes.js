const { Router } = require('express');
const { body } = require('express-validator');
const controller = require('./users.controller');
const validate = require('../../middleware/validate');
const { authenticate, requireRole } = require('../../middleware/auth');
const { tenantContext } = require('../../middleware/tenantContext');
const {
  requireNotCancelled,
  trialMemberLimitGuard,
} = require('../../middleware/subscriptionGuard');

const router = Router();
router.use(authenticate, tenantContext);

// READ: visible even during hibernation (users can audit their own team)
router.get('/', requireRole('owner', 'admin'), requireNotCancelled, controller.listUsers);
router.get('/:id', requireNotCancelled, controller.getUser);

// Profile & password: these are "account" actions, always allowed
router.patch(
  '/me/profile',
  [
    body('fullName').optional().trim().isLength({ min: 2, max: 100 }),
    body('avatarUrl').optional().isURL(),
  ],
  validate,
  controller.updateProfile
);

router.post(
  '/me/change-password',
  [
    body('currentPassword').notEmpty(),
    body('newPassword')
      .isLength({ min: 8 })
      .matches(/[A-Z]/)
      .matches(/[0-9]/),
  ],
  validate,
  controller.changePassword
);

// Role changes + deactivation: mutation → requires active subscription
// AND enforces agency trial member limit on promotions
router.patch(
  '/:id/role',
  requireRole('owner', 'admin'),
  trialMemberLimitGuard,
  [body('role').isIn(['admin', 'member'])],
  validate,
  controller.updateUserRole
);

router.delete(
  '/:id',
  requireRole('owner', 'admin'),
  controller.deactivateUser
);

module.exports = router;
