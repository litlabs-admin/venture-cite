import { test, expect } from "@playwright/test";
import { z } from "zod";
import {
  createLocalAccount,
  deleteLocalAccount,
  getLocalBrandRow,
  localE2EConfig,
  localHeaders,
} from "./support/local-fixtures";

const articleResponseSchema = z.object({
  success: z.literal(true),
  article: z.object({ id: z.string().min(1) }),
});
const previewResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({ articles: z.number(), prompts: z.number(), citationRuns: z.number() }),
});
const deletionResponseSchema = z.object({
  success: z.literal(true),
  scheduledFor: z.string().datetime(),
});
const brandsResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(z.object({ id: z.string().min(1), name: z.string().min(1) })),
});

test.describe("local brand deletion safety", () => {
  test.skip(
    !localE2EConfig(),
    "Set loopback E2E_LOCAL_APP_URL and E2E_LOCAL_SUPABASE_* variables.",
  );

  test("previews data, schedules deletion, and hides owned data from every caller", async ({
    request,
  }) => {
    let owner: Awaited<ReturnType<typeof createLocalAccount>> | null = null;
    let other: Awaited<ReturnType<typeof createLocalAccount>> | null = null;
    let articleId: string | null = null;

    try {
      owner = await createLocalAccount(request, "brand-delete-owner");
      other = await createLocalAccount(request, "brand-delete-other");
      const ownerHeaders = localHeaders(owner);
      const otherHeaders = localHeaders(other);
      const articleResponse = await request.post(`${owner.appUrl}/api/articles`, {
        headers: ownerHeaders,
        data: {
          brandId: owner.brandId,
          title: "Deletion safety article",
          content: "# Deletion safety\n\nThis row belongs to the owner brand.",
          industry: "software",
          contentType: "article",
        },
        failOnStatusCode: false,
      });
      expect(articleResponse.status()).toBe(200);
      articleId = articleResponseSchema.parse(await articleResponse.json()).article.id;

      const previewResponse = await request.get(
        `${owner.appUrl}/api/brands/${owner.brandId}/deletion-preview`,
        { headers: ownerHeaders, failOnStatusCode: false },
      );
      expect(previewResponse.status()).toBe(200);
      const preview = previewResponseSchema.parse(await previewResponse.json());
      expect(preview.data.articles).toBe(1);
      expect(preview.data.prompts).toBe(0);
      expect(preview.data.citationRuns).toBe(0);

      const otherBrandResponse = await request.get(`${other.appUrl}/api/brands/${owner.brandId}`, {
        headers: otherHeaders,
        failOnStatusCode: false,
      });
      expect(otherBrandResponse.status()).toBe(404);
      const otherArticleResponse = await request.get(`${other.appUrl}/api/articles/${articleId}`, {
        headers: otherHeaders,
        failOnStatusCode: false,
      });
      expect(otherArticleResponse.status()).toBe(404);

      const deleteResponse = await request.delete(`${owner.appUrl}/api/brands/${owner.brandId}`, {
        headers: ownerHeaders,
        failOnStatusCode: false,
      });
      expect(deleteResponse.status()).toBe(200);
      const deletion = deletionResponseSchema.parse(await deleteResponse.json());
      const scheduledFor = new Date(deletion.scheduledFor);
      expect(scheduledFor.getTime()).toBeGreaterThan(Date.now());
      expect(scheduledFor.getTime() - Date.now()).toBeGreaterThan(29 * 24 * 60 * 60 * 1000);

      const storedBrand = await getLocalBrandRow(request, owner);
      expect(storedBrand).not.toBeNull();
      expect(storedBrand?.deleted_at).toBeTruthy();
      expect(storedBrand?.deletion_scheduled_for).toBeTruthy();

      const ownerBrandsResponse = await request.get(`${owner.appUrl}/api/brands`, {
        headers: ownerHeaders,
        failOnStatusCode: false,
      });
      expect(ownerBrandsResponse.status()).toBe(200);
      const ownerBrands = brandsResponseSchema.parse(await ownerBrandsResponse.json());
      expect(ownerBrands.data.some((brand) => brand.id === owner.brandId)).toBe(false);

      const ownerBrandResponse = await request.get(`${owner.appUrl}/api/brands/${owner.brandId}`, {
        headers: ownerHeaders,
        failOnStatusCode: false,
      });
      expect(ownerBrandResponse.status()).toBe(404);
      const ownerPreviewResponse = await request.get(
        `${owner.appUrl}/api/brands/${owner.brandId}/deletion-preview`,
        { headers: ownerHeaders, failOnStatusCode: false },
      );
      expect(ownerPreviewResponse.status()).toBe(404);

      const hiddenArticleResponse = await request.get(`${owner.appUrl}/api/articles/${articleId}`, {
        headers: ownerHeaders,
        failOnStatusCode: false,
      });
      expect(hiddenArticleResponse.status()).toBe(404);

      const otherPreviewResponse = await request.get(
        `${other.appUrl}/api/brands/${owner.brandId}/deletion-preview`,
        { headers: otherHeaders, failOnStatusCode: false },
      );
      expect(otherPreviewResponse.status()).toBe(404);
    } finally {
      if (articleId && owner) {
        await request.delete(`${owner.appUrl}/api/articles/${articleId}`, {
          headers: localHeaders(owner),
          failOnStatusCode: false,
        });
      }
      if (owner) await deleteLocalAccount(request, owner);
      if (other) await deleteLocalAccount(request, other);
    }
  });
});
