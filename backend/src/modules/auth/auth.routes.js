const { Router } = require('express');
const { body } = require('express-validator');
const controller = require('./auth.controller');
const validate = require('../../middleware/validate');
const { authenticate } = require('../../middleware/auth');

const router = Router();

router.post(
  '/register',
  [
    body('email').isEmail().normalizeEmail(),
    body('password')
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters')
      .matches(/[A-Z]/).withMessage('Password must contain an uppercase letter')
      .matches(/[0-9]/).withMessage('Password must contain a number'),
    body('fullName').trim().isLength({ min: 2, max: 100 }),
    body('organizationName').trim().isLength({ min: 2, max: 100 }),
    body('planType').optional().isIn(['solo', 'agency']),
  ],
  validate,
  controller.register
);

router.post(
  '/login',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty(),
  ],
  validate,
  controller.login
);

router.post(
  '/refresh',
  [body('refreshToken').notEmpty()],
  validate,
  controller.refresh
);

router.post('/logout', controller.logout);

router.get('/me', authenticate, controller.me);

module.exports = router;
