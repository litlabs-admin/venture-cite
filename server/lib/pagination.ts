// Pagination parsing helper (Wave 4.6).
//
// Reads `?limit=` and `?offset=` from the request, clamps them to safe
// ranges, and returns sensible defaults when missing. The defaults
// (limit=100, max=500) bound how much one HTTP response can pull from
// the DB without touching every list endpoint individually.

import type { Request } from "express";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

export interface Pagination {
  limit: number;
  offset: number;
}

export function parsePagination(req: Request): Pagination {
  const rawLimit = (req.query.limit ?? "").toString();
  const rawOffset = (req.query.offset ?? "").toString();

  let limit = Number.parseInt(rawLimit, 10);
  if (!Number.isFinite(limit) || limit <= 0) limit = DEFAULT_LIMIT;
  if (limit > MAX_LIMIT) limit = MAX_LIMIT;

  let offset = Number.parseInt(rawOffset, 10);
  if (!Number.isFinite(offset) || offset < 0) offset = 0;

  return { limit, offset };
}
