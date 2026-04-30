const { Router } = require('express');
const ctrl = require('../controllers/apiKey.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const { resolveTenant, enforceTenantScope } = require('../middleware/tenant.middleware');
const validate = require('../middleware/validate.middleware');

const router = Router();

router.use(authenticate, resolveTenant, enforceTenantScope);

router.get('/',           ctrl.list);
router.get('/:keyId',     ctrl.show);
router.post('/',          authorize('owner', 'admin'), ctrl.createValidators, validate, ctrl.create);
router.patch('/:keyId',   authorize('owner', 'admin'), ctrl.update);
router.delete('/:keyId',  authorize('owner', 'admin'), ctrl.revoke);

module.exports = router;
