const { Router } = require('express');
const { body, param } = require('express-validator');
const authenticate  = require('../../middleware/authenticate');
const authorize     = require('../../middleware/authorize');
const validate      = require('../../middleware/validate');
const { getUser, inviteUser, updateUser, deactivateUser, changePassword } = require('./users.service');
const { success, noContent } = require('../../utils/apiResponse');

const router = Router({ mergeParams: true });

router.use(authenticate);

router.get('/:userId', async (req, res, next) => {
  try {
    const user = await getUser(req.params.userId, req.tenant.id);
    success(res, user);
  } catch (err) {
    next(err);
  }
});

router.post(
  '/invite',
  authorize('owner', 'admin'),
  [
    body('email').isEmail().normalizeEmail(),
    body('firstName').trim().notEmpty(),
    body('lastName').trim().notEmpty(),
    body('role').isIn(['admin', 'member']),
    body('tempPassword').isLength({ min: 8 }),
  ],
  validate,
  async (req, res, next) => {
    try {
      const user = await inviteUser(req.tenant.id, req.body);
      success(res, user, 201);
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  '/:userId',
  authorize('owner', 'admin'),
  [
    body('firstName').optional().trim().notEmpty(),
    body('lastName').optional().trim().notEmpty(),
    body('role').optional().isIn(['admin', 'member']),
  ],
  validate,
  async (req, res, next) => {
    try {
      const user = await updateUser(req.params.userId, req.tenant.id, req.body);
      success(res, user);
    } catch (err) {
      next(err);
    }
  },
);

router.delete(
  '/:userId',
  authorize('owner', 'admin'),
  async (req, res, next) => {
    try {
      await deactivateUser(req.params.userId, req.tenant.id, req.user.id);
      noContent(res);
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/me/change-password',
  [
    body('currentPassword').notEmpty(),
    body('newPassword').isLength({ min: 8 }),
  ],
  validate,
  async (req, res, next) => {
    try {
      await changePassword(req.user.id, req.body);
      noContent(res);
    } catch (err) {
      next(err);
    }
  },
);

module.exports = router;
