export function parsePagination(query, opts = {}) {
  const maxLimit = opts.maxLimit ?? 100;
  const defaultLimit = opts.defaultLimit ?? 20;

  let limit = parseInt(String(query.limit ?? ""), 10);
  if (!Number.isFinite(limit) || limit < 1) limit = defaultLimit;
  if (limit > maxLimit) limit = maxLimit;

  let offset = parseInt(String(query.offset ?? ""), 10);
  if (!Number.isFinite(offset) || offset < 0) offset = 0;

  return { limit, offset };
}

export function pageToOffset(page, limit) {
  const p = Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1;
  return (p - 1) * limit;
}
