const logger = require('../services/logger');

const notFound = (req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.originalUrl} not found` });
};

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  const status = err.status || err.statusCode || 500;
  const message = status < 500 ? err.message : 'Internal server error';

  if (status >= 500) {
    logger.error('Unhandled server error', {
      error: err.message,
      stack: err.stack,
      path: req.originalUrl,
      method: req.method,
      orgId: req.orgId,
      userId: req.user?.id,
    });
  } else {
    logger.warn('Client error', { message: err.message, path: req.originalUrl, status });
  }

  res.status(status).json({ error: message });
};

module.exports = { notFound, errorHandler };
