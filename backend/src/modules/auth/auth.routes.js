const { Router } = require('express');
const { body } = require('express-validator');
const authService = require('./auth.service');
const validate = require('../../shared/middleware/validate');
const authenticate = require('../../shared/middleware/authenticate');
const { authLimiter } = require('../../shared/middleware/rateLimiter');
const { sendSuccess, sendCreated, sendError } = require('../../shared/utils/apiResponse');

const router = Router();

// POST /auth/register
router.post(
  '/register',
  authLimiter,
  validate([
    body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
    body('password')
      .isLength({ min: 8 })
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
      .withMessage('Password must be 8+ chars with uppercase, lowercase, and a number'),
    body('firstName').trim().notEmpty().withMessage('First name required'),
    body('lastName').trim().notEmpty().withMessage('Last name required'),
    body('orgName').trim().isLength({ min: 2 }).withMessage('Organization name required'),
    body('orgType').isIn(['solo', 'agency']).withMessage('orgType must be "solo" or "agency"'),
  ]),
  async (req, res, next) => {
    try {
      const { user, org, tokens } = await authService.register(req.body);
      return sendCreated(res, {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          role: user.role,
        },
        org: { id: org.id, name: org.name, slug: org.slug, plan: org.plan },
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      });
    } catch (err) {
      next(err);
    }
  }
);

// POST /auth/login
router.post(
  '/login',
  authLimiter,
  validate([
    body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
    body('password').notEmpty().withMessage('Password required'),
  ]),
  async (req, res, next) => {
    try {
      const result = await authService.login(req.body);
      return sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }
);

// POST /auth/refresh
router.post(
  '/refresh',
  validate([body('refreshToken').notEmpty().withMessage('refreshToken required')]),
  async (req, res, next) => {
    try {
      const tokens = await authService.refreshAccessToken(req.body.refreshToken);
      return sendSuccess(res, tokens);
    } catch (err) {
      next(err);
    }
  }
);

// POST /auth/logout
router.post('/logout', authenticate, async (req, res, next) => {
  try {
    await authService.logout(req.user.id);
    return sendSuccess(res, { message: 'Logged out successfully' });
  } catch (err) {
    next(err);
  }
});

// GET /auth/me
router.get('/me', authenticate, (req, res) => {
  return sendSuccess(res, { user: req.user });
});

module.exports = router;
