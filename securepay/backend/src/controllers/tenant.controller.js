const tenantService = require('../services/tenant.service');
const { success, error } = require('../utils/apiResponse');

async function getProfile(req, res, next) {
  try {
    const tenant = await tenantService.getTenant(req.tenant.id);
    return success(res, tenant);
  } catch (err) {
    next(err);
  }
}

async function updateProfile(req, res, next) {
  try {
    const tenant = await tenantService.updateTenant(req.tenant.id, req.body);
    return success(res, tenant, 'Tenant profile updated');
  } catch (err) {
    next(err);
  }
}

async function getTeam(req, res, next) {
  try {
    const result = await tenantService.getTeamMembers(req.tenant.id, req.query);
    return res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

async function updateMemberRole(req, res, next) {
  try {
    const member = await tenantService.updateMemberRole(req.tenant.id, req.params.userId, req.body.role);
    return success(res, member, 'Role updated');
  } catch (err) {
    next(err);
  }
}

async function removeMember(req, res, next) {
  try {
    await tenantService.removeMember(req.tenant.id, req.params.userId, req.user.id);
    return success(res, null, 'Member removed');
  } catch (err) {
    next(err);
  }
}

module.exports = { getProfile, updateProfile, getTeam, updateMemberRole, removeMember };
