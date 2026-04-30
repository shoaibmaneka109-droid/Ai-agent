const { Router } = require('express');
const { body, param } = require('express-validator');
const ctrl = require('./providerConnections.controller');
const validate = require('../../middleware/validate');
const { authenticate, requireRole } = require('../../middleware/auth');
const { tenantContext } = require('../../middleware/tenantContext');
const { requireActiveSubscription, requireNotCancelled } = require('../../middleware/subscriptionGuard');

const router = Router();
router.use(authenticate, tenantContext);

// ── Static provider metadata (logos, labels, docs URLs) ─────────────────
// Available to all authenticated users — no subscription gate needed.
router.get('/meta', ctrl.getProviderMeta);

// ── List & read — available in hibernation (Data Hibernation: can still view) ──
router.get('/',      requireNotCancelled, ctrl.list);
router.get('/:id',   requireNotCancelled, ctrl.getOne);
router.get('/:id/test-logs', requireNotCancelled, ctrl.getTestLogs);

// ── Write operations — require active/trialing subscription ──────────────
const ownerAdmin = requireRole('owner', 'admin');
const activeGuard = requireActiveSubscription;

const secretKeyValidation = [
  body('secretKey').notEmpty().withMessage('secretKey is required'),
];

const upsertValidation = [
  body('provider').isIn(['stripe', 'airwallex', 'wise']).withMessage('provider must be stripe | airwallex | wise'),
  body('environment').optional().isIn(['live', 'test']),
  body('displayName').trim().isLength({ min: 1, max: 255 }),
  ...secretKeyValidation,
  body('publishableKey').optional().isString(),
  body('webhookSecret').optional().isString(),
  body('extraCredential').optional().isString(),
  body('webhookEndpointUrl').optional().isURL().withMessage('webhookEndpointUrl must be a valid URL'),
];

router.post('/',        ownerAdmin, activeGuard, upsertValidation, validate, ctrl.upsert);
router.patch('/:id/webhook-url',
  ownerAdmin, activeGuard,
  [body('webhookEndpointUrl').isURL()], validate,
  ctrl.updateWebhookUrl
);
router.put('/:id/rotate',
  ownerAdmin, activeGuard,
  [
    body('secretKey').optional().isString(),
    body('publishableKey').optional().isString(),
    body('webhookSecret').optional().isString(),
    body('extraCredential').optional().isString(),
  ],
  validate,
  ctrl.rotateSecrets
);

// ── Connection test — rate-limited separately, requires active sub ────────
router.post('/:id/test', ownerAdmin, activeGuard, ctrl.testConnection);

// ── Deactivate ────────────────────────────────────────────────────────────
router.delete('/:id', ownerAdmin, activeGuard, ctrl.deactivate);

module.exports = router;
