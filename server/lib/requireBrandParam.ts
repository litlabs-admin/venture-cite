import type { Request } from "express";
import { OwnershipError, requireBrand, requireUser } from "./ownership";
import type { Brand } from "@shared/schema";

// Centralised auth check for `:brandId` route params. Replaces the pattern
// of calling requireUser + requireBrand separately at the top of every
// handler (easy to forget — several endpoints were missing one or both).
//
// Additionally blocks access to soft-deleted brands, which `requireBrand`
// by itself does not.
export async function requireBrandParam(
  req: Request,
  paramName = "brandId",
): Promise<{ user: { id: string }; brand: Brand }> {
  const user = requireUser(req);
  const brandId = req.params?.[paramName];
  if (!brandId) throw new OwnershipError(400, "Missing brandId");
  const brand = await requireBrand(brandId, user.id);
  if ((brand as Brand & { deletedAt?: Date | null }).deletedAt) {
    throw new OwnershipError(404, "Brand not found");
  }
  return { user, brand: brand as Brand };
}
