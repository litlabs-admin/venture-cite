import { beforeEach, describe, expect, it, vi } from "vitest";

import { logger } from "../../server/lib/logger";
import { reconcileBrandWorkOpportunities } from "../../server/services/work/productionOpportunities";
import { readWorkTaskLinks, withWorkTaskLinks } from "../../server/routes/workLinks";

vi.mock("../../server/lib/logger", () => ({
  logger: { warn: vi.fn() },
}));

vi.mock("../../server/services/work/productionOpportunities", () => ({
  reconcileBrandWorkOpportunities: vi.fn(),
}));

const reconcile = vi.mocked(reconcileBrandWorkOpportunities);
const warn = vi.mocked(logger.warn);

describe("work route links", () => {
  const userId = "11111111-1111-4111-8111-111111111111";
  const brandId = "brand-a";
  const source = "factSheetV2.aggregate";
  const links = [
    {
      id: "task-1",
      taskKey: "facts:conflict:product:pricing:pricing_model",
      taskVersion: 1,
      taskType: "fact" as const,
      state: "suggested" as const,
      url: "/api/brands/brand-a/work/tasks/task-1",
    },
  ];

  beforeEach(() => {
    reconcile.mockReset();
    warn.mockReset();
  });

  it("returns reconciled links and attaches them to a route body", async () => {
    reconcile.mockResolvedValueOnce(links);

    const result = await readWorkTaskLinks(userId, brandId, source);
    const body = withWorkTaskLinks({ success: true }, result);

    expect(reconcile).toHaveBeenCalledWith({
      actor: { userId },
      brandId,
    });
    expect(body).toEqual({ success: true, workTaskLinks: links });
    expect(warn).not.toHaveBeenCalled();
  });

  it("keeps the feature response available when reconciliation fails", async () => {
    reconcile.mockRejectedValueOnce(new Error("temporary failure"));

    const result = await readWorkTaskLinks(userId, brandId, source);

    expect(result).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        brandId,
        source,
        err: expect.any(Error),
      }),
      "work opportunity reconciliation failed",
    );
    expect(withWorkTaskLinks({ success: true }, result)).toEqual({
      success: true,
    });
  });
});
