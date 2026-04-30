const crypto = require("crypto");

function requestContext(req, res, next) {
  const requestId = req.headers["x-request-id"] || crypto.randomUUID();
  const tenantId = req.headers["x-tenant-id"] || null;

  req.context = {
    requestId,
    tenantId,
    subscription: null,
    auth: null,
  };

  res.setHeader("x-request-id", requestId);
  next();
}

module.exports = {
  requestContext,
};
