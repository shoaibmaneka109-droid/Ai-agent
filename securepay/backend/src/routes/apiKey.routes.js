const { Router } = require('express');
const ctrl = require('../controllers/apiKey.controller');
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

// ── Read (allowed in hibernation — data read-only mode) ───────────────────────
router.get('/',                    ctrl.list);
router.get('/:keyId',              ctrl.show);
router.get('/:keyId/test-log',     ctrl.getTestLog);

// ── Write (require active subscription) ───────────────────────────────────────
router.post(
  '/',
  authorize('owner', 'admin'),
  requireFullAccess,
  ctrl.createValidators,
  validate,
  ctrl.create,
);

router.patch(
  '/:keyId',
  authorize('owner', 'admin'),
  requireFullAccess,
  ctrl.update,
);

router.delete(
  '/:keyId',
  authorize('owner', 'admin'),
  requireApiAccess,
  ctrl.revoke,
);

// ── Connection test (requires active access — can't test a locked account) ───
router.post(
  '/:keyId/test',
  authorize('owner', 'admin'),
  requireFullAccess,
  ctrl.testConnection,
);

module.exports = router;
