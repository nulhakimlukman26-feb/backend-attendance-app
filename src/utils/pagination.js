function parsePagination(query) {
  let page = parseInt(query.page || '1', 10);
  let limit = parseInt(query.limit || '20', 10);
  if (isNaN(page) || page < 1) page = 1;
  if (isNaN(limit) || limit < 1) limit = 20;
  if (limit > 100) limit = 100;
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

function paginationMeta(total, page, limit) {
  const totalPages = Math.ceil(total / limit);
  return { total, page, limit, totalPages, hasNext: page < totalPages, hasPrev: page > 1 };
}

module.exports = { parsePagination, paginationMeta };
