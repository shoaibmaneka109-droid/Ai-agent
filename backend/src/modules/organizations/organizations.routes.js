const { Router } = require('express');
const { body, param } = require('express-validator');
const orgService = require('./organizations.service');
const authenticate = require('../../shared/middleware/authenticate');
const { authorize, tenantGuard } = require('../../shared/middleware/authorize');
const validate = require('../../shared/middleware/validate');
const { sendSuccess, sendCreated, sendNotFound } = require('../../shared/utils/apiResponse');

const router = Router();
router.use(authenticate);

// GET /organizations/:organizationId
router.get(
  '/:organizationId',
  tenantGuard,
  async (req, res, next) => {
    try {
      const org = await orgService.getOrganization(req.params.organizationId);
      return sendSuccess(res, { organization: org });
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /organizations/:organizationId
router.patch(
  '/:organizationId',
  tenantGuard,
  authorize(['owner', 'admin']),
  validate([
    param('organizationId').isUUID(),
    body('name').optional().trim().isLength({ min: 2 }),
    body('settings').optional().isObject(),
  ]),
  async (req, res, next) => {
    try {
      const org = await orgService.updateOrganization(
        req.params.organizationId,
        req.body
      );
      return sendSuccess(res, { organization: org });
    } catch (err) {
      next(err);
    }
  }
);

// GET /organizations/:organizationId/members
router.get(
  '/:organizationId/members',
  tenantGuard,
  async (req, res, next) => {
    try {
      const result = await orgService.listMembers(req.params.organizationId, req.query);
      return sendSuccess(res, result, 200, result.meta);
    } catch (err) {
      next(err);
    }
  }
);

// POST /organizations/:organizationId/members/invite
router.post(
  '/:organizationId/members/invite',
  tenantGuard,
  authorize(['owner', 'admin']),
  validate([
    param('organizationId').isUUID(),
    body('email').isEmail().normalizeEmail(),
    body('role').isIn(['admin', 'member']),
  ]),
  async (req, res, next) => {
    try {
      const invitation = await orgService.inviteMember(
        req.params.organizationId,
        { ...req.body, invitedById: req.user.id }
      );
      return sendCreated(res, { invitation });
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /organizations/:organizationId/members/:userId/role
router.patch(
  '/:organizationId/members/:userId/role',
  tenantGuard,
  authorize(['owner', 'admin']),
  validate([
    param('organizationId').isUUID(),
    param('userId').isUUID(),
    body('role').isIn(['admin', 'member']),
  ]),
  async (req, res, next) => {
    try {
      const member = await orgService.updateMemberRole(
        req.params.organizationId,
        req.params.userId,
        req.body.role,
        req.user.id
      );
      return sendSuccess(res, { member });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
