const { Router } = require('express');
const ctrl = require('../controllers/payment.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const { resolveTenant, enforceTenantScope } = require('../middleware/tenant.middleware');
const {
  attachAccessState,
  injectTrialHeaders,
  requireApiAccess,
  requireFullAccess,
} = require('../middleware/subscription.middleware');
const validate = require('../middleware/validate.middleware');

const router = Router();

router.use(authenticate, resolveTenant, enforceTenantScope, attachAccessState, injectTrialHeaders);

// Reads: allowed in hibernation (data read-only mode)
router.get('/',              ctrl.list);
router.get('/analytics',     ctrl.analytics);
router.get('/:paymentId',    ctrl.show);

// Writes: require active API access
router.post(
  '/',
  authorize('owner', 'admin', 'member'),
  requireApiAccess,
  ctrl.createValidators,
  validate,
  ctrl.create,
);

router.post(
  '/:paymentId/refunds',
  authorize('owner', 'admin'),
  requireApiAccess,
  ctrl.refund,
);

module.exports = router;
