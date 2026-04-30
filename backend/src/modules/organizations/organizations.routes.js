const { Router } = require('express');
const { body } = require('express-validator');
const controller = require('./organizations.controller');
const validate = require('../../middleware/validate');
const { authenticate, requireRole } = require('../../middleware/auth');
const { tenantContext } = require('../../middleware/tenantContext');

const router = Router();
router.use(authenticate, tenantContext);

router.get('/', controller.getOrganization);
router.get('/members', controller.getMembers);
router.get('/stats', controller.getStats);

router.patch(
  '/',
  requireRole('owner', 'admin'),
  [
    body('name').optional().trim().isLength({ min: 2, max: 100 }),
    body('billing_email').optional().isEmail().normalizeEmail(),
    body('company_name').optional().trim().isLength({ max: 255 }),
    body('company_website').optional().isURL(),
  ],
  validate,
  controller.updateOrganization
);

module.exports = router;
