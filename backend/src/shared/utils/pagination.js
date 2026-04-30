/**
 * Parse and normalise pagination query parameters.
 * Returns { limit, offset, page } safe for SQL LIMIT / OFFSET.
 */
const parsePagination = (query, defaults = {}) => {
  const maxLimit = defaults.maxLimit || 100;
  const defaultLimit = defaults.limit || 20;

  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, parseInt(query.limit, 10) || defaultLimit));
  const offset = (page - 1) * limit;

  return { page, limit, offset };
};

/**
 * Build a standardised meta object for list responses.
 */
const buildPaginationMeta = (total, { page, limit }) => ({
  total,
  page,
  limit,
  totalPages: Math.ceil(total / limit),
  hasNext: page * limit < total,
  hasPrev: page > 1,
});

module.exports = { parsePagination, buildPaginationMeta };
