const { Router } = require('express');
const ctrl = require('../controllers/payment.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const { resolveTenant, enforceTenantScope } = require('../middleware/tenant.middleware');
const validate = require('../middleware/validate.middleware');

const router = Router();

router.use(authenticate, resolveTenant, enforceTenantScope);

router.get('/',                       ctrl.list);
router.get('/analytics',              ctrl.analytics);
router.get('/:paymentId',             ctrl.show);
router.post('/', authorize('owner', 'admin', 'member'), ctrl.createValidators, validate, ctrl.create);
router.post('/:paymentId/refunds',    authorize('owner', 'admin'), ctrl.refund);

module.exports = router;
