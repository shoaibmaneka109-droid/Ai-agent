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

// Listing keys (masked): allowed in hibernation so user can see what they have
router.get('/',          ctrl.list);
router.get('/:keyId',    ctrl.show);

// Storing / revoking keys requires active access
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
  requireApiAccess,   // revocation is an API-level action
  ctrl.revoke,
);

module.exports = router;
