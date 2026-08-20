import { test, expect } from "@playwright/test";
import { z } from "zod";
import {
  createLocalAccount,
  deleteLocalAccount,
  localE2EConfig,
  localHeaders,
} from "./support/local-fixtures";

const articleSchema = z.object({ id: z.string().min(1), version: z.number() });
const distributionSchema = z.object({
  id: z.string().min(1),
  articleId: z.string().min(1),
  platform: z.string().min(1),
  status: z.string(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  platformPostId: z.string().nullable(),
});
const articleResponseSchema = z.object({ success: z.literal(true), article: articleSchema });
const distributionsResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(distributionSchema),
});

test.describe("local distribution CRUD", () => {
  test.skip(
    !localE2EConfig(),
    "Set loopback E2E_LOCAL_APP_URL and E2E_LOCAL_SUPABASE_* variables.",
  );

  test("creates, updates, and reloads local distribution rows", async ({ request }) => {
    let account: Awaited<ReturnType<typeof createLocalAccount>> | null = null;
    let otherAccount: Awaited<ReturnType<typeof createLocalAccount>> | null = null;
    let articleId: string | null = null;

    try {
      account = await createLocalAccount(request, "distribution-flow");
      otherAccount = await createLocalAccount(request, "distribution-flow-other");
      const headers = localHeaders(account);
      const otherHeaders = localHeaders(otherAccount);
      const articleResponse = await request.post(`${account.appUrl}/api/articles`, {
        headers,
        data: {
          brandId: account.brandId,
          title: "Local distribution article",
          content: "# Local distribution\n\nThis article uses no provider call.",
          excerpt: "A local distribution fixture.",
          industry: "software",
          contentType: "article",
          keywords: ["local", "distribution"],
        },
        failOnStatusCode: false,
      });
      expect(articleResponse.status()).toBe(200);
      const article = articleResponseSchema.parse(await articleResponse.json()).article;
      articleId = article.id;

      const createResponse = await request.post(`${account.appUrl}/api/distributions`, {
        headers,
        data: { articleId, platforms: ["LinkedIn", "Medium"] },
        failOnStatusCode: false,
      });
      expect(createResponse.status()).toBe(200);
      const created = distributionsResponseSchema.parse(await createResponse.json());
      expect(created.data).toHaveLength(2);
      expect(created.data.every((row) => row.status === "pending")).toBe(true);
      expect(created.data.every((row) => row.platformPostId === null)).toBe(true);

      const first = created.data[0];
      expect(first).toBeDefined();
      if (!first) throw new Error("The distribution fixture returned no first row");
      const editedCopy = "Edited local LinkedIn copy. Persist this exact response.";
      const foreignUpdateResponse = await request.patch(
        `${account.appUrl}/api/distribute/entry/${first.id}`,
        {
          headers: otherHeaders,
          data: { content: "Foreign distribution edit" },
          failOnStatusCode: false,
        },
      );
      expect(foreignUpdateResponse.status()).toBe(404);

      const updateResponse = await request.patch(
        `${account.appUrl}/api/distribute/entry/${first.id}`,
        {
          headers,
          data: { content: editedCopy },
          failOnStatusCode: false,
        },
      );
      expect(updateResponse.status()).toBe(200);
      const updated = z
        .object({ success: z.literal(true), data: distributionSchema })
        .parse(await updateResponse.json()).data;
      expect(updated.metadata).toEqual({ content: editedCopy });
      expect(updated.platformPostId).toBeNull();

      const reloadResponse = await request.get(`${account.appUrl}/api/distributions/${articleId}`, {
        headers,
        failOnStatusCode: false,
      });
      expect(reloadResponse.status()).toBe(200);
      const reloaded = distributionsResponseSchema.parse(await reloadResponse.json());
      const persisted = reloaded.data.find((row) => row.id === first.id);
      expect(persisted).toBeDefined();
      expect(persisted?.metadata).toEqual({ content: editedCopy });
      expect(persisted?.status).toBe("pending");
      expect(persisted?.platformPostId).toBeNull();
    } finally {
      if (articleId && account) {
        const deleteResponse = await request.delete(`${account.appUrl}/api/articles/${articleId}`, {
          headers: localHeaders(account),
          failOnStatusCode: false,
        });
        expect(deleteResponse.status()).toBe(200);
      }
      if (account) await deleteLocalAccount(request, account);
      if (otherAccount) await deleteLocalAccount(request, otherAccount);
    }
  });
});
