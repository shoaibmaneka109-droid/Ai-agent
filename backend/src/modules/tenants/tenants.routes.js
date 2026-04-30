const { Router } = require('express');
const { body, query: qv, param } = require('express-validator');
const authenticate       = require('../../middleware/authenticate');
const authorize          = require('../../middleware/authorize');
const tenantContext       = require('../../middleware/tenantContext');
const checkSubscription  = require('../../middleware/checkSubscription');
const validate           = require('../../middleware/validate');
const { getOrganization, updateOrganization, upgradePlan, listMembers } = require('./tenants.service');
const { success } = require('../../utils/apiResponse');

const router = Router({ mergeParams: true });

// checkSubscription here uses default mode:
//   GETs → always allowed (Data Hibernation: users can see their org data)
//   Writes → blocked when hibernated
router.use(authenticate, tenantContext, checkSubscription);

router.get('/', async (req, res, next) => {
  try {
    const org = await getOrganization(req.organization.id);
    success(res, org);
  } catch (err) {
    next(err);
  }
});

router.patch(
  '/',
  authorize('owner', 'admin'),
  [
    body('name').optional().trim().notEmpty(),
    body('settings').optional().isObject(),
  ],
  validate,
  async (req, res, next) => {
    try {
      const org = await updateOrganization(req.organization.id, req.body);
      success(res, org);
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/plan',
  authorize('owner'),
  [body('plan').notEmpty()],
  validate,
  async (req, res, next) => {
    try {
      const org = await upgradePlan(req.organization.id, req.body.plan);
      success(res, org);
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/members',
  authorize('owner', 'admin'),
  [
    qv('page').optional().isInt({ min: 1 }).toInt(),
    qv('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  ],
  validate,
  async (req, res, next) => {
    try {
      const result = await listMembers(req.organization.id, req.query);
      success(res, result.members, 200, { total: result.total, page: result.page, limit: result.limit });
    } catch (err) {
      next(err);
    }
  },
);

module.exports = router;
