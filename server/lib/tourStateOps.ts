// server/lib/tourStateOps.ts
//
// Pure-function tour-state op application. Extracted so unit tests can
// import without pulling the DatabaseStorage initialization (which requires
// DATABASE_URL) into the test environment.

export function applyTourStateOp(
  tours: Record<string, unknown>,
  op: "markCompleted" | "markSkipped" | "suppress" | "clearBrand",
  args: {
    tourId?: string;
    version?: number;
    brandId?: string | null;
    timestamp: string;
  },
): Record<string, unknown> {
  const next = JSON.parse(JSON.stringify(tours)) as Record<string, unknown>;

  if (op === "suppress") {
    if (!args.tourId) return next;
    const list = Array.isArray(next.perUserSuppressed) ? (next.perUserSuppressed as string[]) : [];
    if (!list.includes(args.tourId)) list.push(args.tourId);
    next.perUserSuppressed = list;
    return next;
  }

  if (op === "clearBrand") {
    if (!args.brandId) return next;
    const perBrand = (next.perBrand as Record<string, unknown> | undefined) ?? {};
    delete perBrand[args.brandId];
    next.perBrand = perBrand;
    return next;
  }

  // markCompleted / markSkipped — both write to global or perBrand[id][tourId].
  if (!args.tourId || args.version === undefined) return next;
  const field = op === "markCompleted" ? "completedAt" : "skippedAt";
  const record = { v: args.version, [field]: args.timestamp };

  if (args.tourId === "global-welcome") {
    next.global = record;
    return next;
  }

  if (args.brandId) {
    const perBrand = ((next.perBrand as Record<string, unknown> | undefined) ?? {}) as Record<
      string,
      Record<string, unknown>
    >;
    const brand = perBrand[args.brandId] ?? {};
    brand[args.tourId] = record;
    perBrand[args.brandId] = brand;
    next.perBrand = perBrand;
  } else {
    // Page tour without brand context — store in a perUser sub-tree.
    const perUser = ((next.perUser as Record<string, unknown> | undefined) ?? {}) as Record<
      string,
      unknown
    >;
    perUser[args.tourId] = record;
    next.perUser = perUser;
  }
  return next;
}
