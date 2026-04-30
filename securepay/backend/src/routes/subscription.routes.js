const { Router } = require('express');
const ctrl = require('../controllers/subscription.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const { resolveTenant, enforceTenantScope } = require('../middleware/tenant.middleware');

const router = Router();

// All subscription routes require a valid session
router.use(authenticate, resolveTenant, enforceTenantScope);

// Any authenticated member can read subscription status
router.get('/status',       ctrl.getStatus);
router.get('/check-access', ctrl.checkAccess);
router.get('/events',       ctrl.getEvents);

// Reactivation requires owner-level (would be triggered by payment webhook in production)
router.post('/reactivate', authorize('owner'), ctrl.reactivate);

module.exports = router;
