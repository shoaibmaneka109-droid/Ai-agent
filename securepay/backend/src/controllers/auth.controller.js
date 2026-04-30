const { body } = require('express-validator');
const authService = require('../services/auth.service');
const { success, created, error, badRequest } = require('../utils/apiResponse');
const validate = require('../middleware/validate.middleware');

const registerValidators = [
  body('tenantName').trim().notEmpty().withMessage('Tenant name is required'),
  body('tenantSlug')
    .trim().notEmpty()
    .matches(/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/)
    .withMessage('Slug must be 3-63 lowercase alphanumeric characters or hyphens'),
  body('plan').isIn(['solo', 'agency']).withMessage('Plan must be solo or agency'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password')
    .isLength({ min: 8 })
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/)
    .withMessage('Password must be 8+ chars with upper, lower, number, and special character'),
  body('firstName').trim().notEmpty().withMessage('First name is required'),
  body('lastName').trim().notEmpty().withMessage('Last name is required'),
];

const loginValidators = [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
  body('tenantSlug').trim().notEmpty().withMessage('Tenant slug is required'),
];

async function register(req, res, next) {
  try {
    const result = await authService.register(req.body);
    return created(res, result, 'Account created successfully');
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const result = await authService.login(req.body);
    return success(res, result, 'Login successful');
  } catch (err) {
    next(err);
  }
}

async function refresh(req, res, next) {
  try {
    const { userId, refreshToken } = req.body;
    if (!userId || !refreshToken) return badRequest(res, 'userId and refreshToken are required');
    const tokens = await authService.refreshTokens(userId, refreshToken);
    return success(res, tokens, 'Tokens refreshed');
  } catch (err) {
    next(err);
  }
}

async function logout(req, res, next) {
  try {
    await authService.logout(req.user.id);
    return success(res, null, 'Logged out successfully');
  } catch (err) {
    next(err);
  }
}

async function me(req, res) {
  return success(res, req.user, 'User profile');
}

module.exports = { register, login, refresh, logout, me, registerValidators, loginValidators };
