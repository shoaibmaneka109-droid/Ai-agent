const { Router } = require('express');
const ctrl = require('../controllers/tenant.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const { resolveTenant, enforceTenantScope } = require('../middleware/tenant.middleware');

const router = Router();

// All tenant routes require authentication and tenant resolution
router.use(authenticate, resolveTenant, enforceTenantScope);

router.get('/profile',                            ctrl.getProfile);
router.patch('/profile', authorize('owner', 'admin'), ctrl.updateProfile);

router.get('/team',                               ctrl.getTeam);
router.patch('/team/:userId/role', authorize('owner', 'admin'), ctrl.updateMemberRole);
router.delete('/team/:userId',     authorize('owner'),          ctrl.removeMember);

module.exports = router;
