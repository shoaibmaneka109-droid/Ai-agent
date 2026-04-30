const { Router } = require('express');
const { body } = require('express-validator');
const controller = require('./users.controller');
const validate = require('../../middleware/validate');
const { authenticate, requireRole } = require('../../middleware/auth');
const { tenantContext } = require('../../middleware/tenantContext');

const router = Router();
router.use(authenticate, tenantContext);

router.get('/', requireRole('owner', 'admin'), controller.listUsers);
router.get('/:id', controller.getUser);

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

router.patch(
  '/:id/role',
  requireRole('owner', 'admin'),
  [body('role').isIn(['admin', 'member'])],
  validate,
  controller.updateUserRole
);

router.delete('/:id', requireRole('owner', 'admin'), controller.deactivateUser);

module.exports = router;
