const { Router } = require('express');
const { body }   = require('express-validator');
const validate   = require('../../middleware/validate');
const authenticate = require('../../middleware/authenticate');
const { register, login, refreshAccessToken } = require('./auth.service');
const { created, success, error } = require('../../utils/apiResponse');

const router = Router();

router.post(
  '/register',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('firstName').trim().notEmpty(),
    body('lastName').trim().notEmpty(),
    body('orgName').trim().notEmpty().withMessage('Organization name is required'),
    body('orgType').isIn(['solo', 'agency']).withMessage("orgType must be 'solo' or 'agency'"),
  ],
  validate,
  async (req, res, next) => {
    try {
      const result = await register(req.body);
      created(res, result);
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/login',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty(),
  ],
  validate,
  async (req, res, next) => {
    try {
      const result = await login(req.body);
      success(res, result);
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/refresh',
  [body('refreshToken').notEmpty()],
  validate,
  async (req, res, next) => {
    try {
      const result = await refreshAccessToken(req.body.refreshToken);
      success(res, result);
    } catch (err) {
      next(err);
    }
  },
);

router.get('/me', authenticate, (req, res) => {
  success(res, req.user);
});

module.exports = router;
