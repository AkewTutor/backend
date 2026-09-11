export function paginate(
  page?: number,
  limit?: number,
): { skip: number; take: number; page: number; limit: number } {
  const p = Math.max(1, page && page > 0 ? page : 1);
  const l = Math.max(1, Math.min(100, limit && limit > 0 ? limit : 20));
  const skip = (p - 1) * l;
  return { skip, take: l, page: p, limit: l };
}

export function paginatedResponse(items: any[], total: number, page: number, limit: number): any {
  return { items, page, limit, total };
}
