const { Router } = require('express');
const { body } = require('express-validator');
const usersService = require('./users.service');
const authenticate = require('../../shared/middleware/authenticate');
const validate = require('../../shared/middleware/validate');
const { sendSuccess } = require('../../shared/utils/apiResponse');

const router = Router();
router.use(authenticate);

// GET /users/profile
router.get('/profile', async (req, res, next) => {
  try {
    const profile = await usersService.getProfile(req.user.id);
    return sendSuccess(res, { profile });
  } catch (err) {
    next(err);
  }
});

// PATCH /users/profile
router.patch(
  '/profile',
  validate([
    body('firstName').optional().trim().notEmpty(),
    body('lastName').optional().trim().notEmpty(),
  ]),
  async (req, res, next) => {
    try {
      const profile = await usersService.updateProfile(req.user.id, req.body);
      return sendSuccess(res, { profile });
    } catch (err) {
      next(err);
    }
  }
);

// POST /users/change-password
router.post(
  '/change-password',
  validate([
    body('currentPassword').notEmpty(),
    body('newPassword')
      .isLength({ min: 8 })
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
      .withMessage('Password must be 8+ chars with uppercase, lowercase, and a number'),
  ]),
  async (req, res, next) => {
    try {
      await usersService.changePassword(req.user.id, req.body);
      return sendSuccess(res, { message: 'Password changed successfully' });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
