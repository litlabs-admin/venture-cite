import { test, expect } from "@playwright/test";
import { z } from "zod";
import {
  createLocalAccount,
  deleteLocalAccount,
  localE2EConfig,
  localFakeGenerationEnabled,
  localHeaders,
  primeLocalPage,
} from "./support/local-fixtures";

const articleEnvelopeSchema = z.object({
  success: z.literal(true),
  article: z.object({
    id: z.string().min(1),
    title: z.string().nullable(),
    content: z.string().nullable(),
    status: z.string(),
    version: z.number(),
  }),
});

const draftEnvelopeSchema = z.object({
  success: z.literal(true),
  data: z.object({ id: z.string().min(1), status: z.string() }),
});

const stateEnvelopeSchema = z.object({
  success: z.literal(true),
  data: z.object({ status: z.string(), done: z.boolean(), errorMessage: z.string().nullable() }),
});

const revisionsEnvelopeSchema = z.object({
  success: z.literal(true),
  data: z.array(
    z.object({
      id: z.string().min(1),
      articleId: z.string().min(1),
      content: z.string(),
      source: z.string(),
    }),
  ),
});

test.describe("local article CRUD", () => {
  test.skip(
    !localE2EConfig() || !localFakeGenerationEnabled(),
    "Set loopback E2E_LOCAL_* variables and E2E_LOCAL_FAKE_GENERATION=1.",
  );

  test("creates, edits, reloads, lists revisions, and restores an article", async ({
    request,
    page,
  }) => {
    test.setTimeout(180_000);
    let account: Awaited<ReturnType<typeof createLocalAccount>> | null = null;
    let otherAccount: Awaited<ReturnType<typeof createLocalAccount>> | null = null;
    let articleId: string | null = null;

    try {
      account = await createLocalAccount(request, "article-flow");
      otherAccount = await createLocalAccount(request, "article-flow-other");
      const owner = account;
      const other = otherAccount;
      const headers = localHeaders(owner);
      const otherHeaders = localHeaders(other);
      const draftResponse = await request.post(`${account.appUrl}/api/articles/draft`, {
        headers,
        data: {
          brandId: account.brandId,
          title: "Local article draft",
          industry: "software",
          contentType: "article",
          contentStyle: "b2c",
        },
        failOnStatusCode: false,
      });
      expect(draftResponse.status()).toBe(200);
      const draft = draftEnvelopeSchema.parse(await draftResponse.json());
      articleId = draft.data.id;

      const generateResponse = await request.post(
        `${account.appUrl}/api/articles/${articleId}/generate`,
        {
          headers,
          data: {
            keywords: "local article CRUD",
            industry: "software",
            type: "article",
            contentStyle: "b2c",
          },
          failOnStatusCode: false,
        },
      );
      expect(generateResponse.status()).toBe(200);
      const generateBody = z
        .object({ success: z.literal(true), data: z.object({ jobId: z.string().min(1) }) })
        .parse(await generateResponse.json());

      let jobCompleted = false;
      for (let attempt = 0; attempt < 40; attempt += 1) {
        const advanceResponse = await request.post(
          `${account.appUrl}/api/content-jobs/${generateBody.data.jobId}/advance`,
          { headers, failOnStatusCode: false },
        );
        expect(advanceResponse.status()).toBe(200);
        const stateResponse = await request.get(
          `${account.appUrl}/api/content-jobs/${generateBody.data.jobId}/state`,
          { headers, failOnStatusCode: false },
        );
        expect(stateResponse.status()).toBe(200);
        const state = stateEnvelopeSchema.parse(await stateResponse.json());
        if (state.data.done) {
          expect(state.data.status).toBe("succeeded");
          jobCompleted = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      expect(jobCompleted).toBe(true);

      const createdResponse = await request.get(`${account.appUrl}/api/articles/${articleId}`, {
        headers,
        failOnStatusCode: false,
      });
      expect(createdResponse.status()).toBe(200);
      const readyArticle = articleEnvelopeSchema.parse(await createdResponse.json());
      expect(readyArticle.article.status).toBe("ready");
      expect(readyArticle.article.content).toContain("Local fake article");

      const suppressToursResponse = await request.patch(`${account.appUrl}/api/tours/state`, {
        headers,
        data: { op: "suppress", tourId: "*" },
        failOnStatusCode: false,
      });
      expect(suppressToursResponse.status()).toBe(200);

      await primeLocalPage(page, account);
      await page.goto(`${account.appUrl}/articles`);
      await page.getByRole("button", { name: "View / Edit", exact: true }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await expect(dialog.locator("h2").first()).toContainText(readyArticle.article.title ?? "");

      const editedTitle = "Local article edited";
      const editedContent = "# Edited locally\n\nThis content proves the edit persisted.";
      await dialog.getByRole("button", { name: "Edit", exact: true }).click();
      await dialog.locator("input").fill(editedTitle);
      await dialog.getByTestId("markdown-editor-textarea").fill(editedContent);
      const saveResponsePromise = page.waitForResponse(
        (response) =>
          response.request().method() === "PUT" &&
          response.url() === `${account.appUrl}/api/articles/${articleId}`,
      );
      await dialog.getByRole("button", { name: "Save", exact: true }).click();
      const saveResponse = await saveResponsePromise;
      expect(saveResponse.status()).toBe(200);

      const reloadResponse = await request.get(`${account.appUrl}/api/articles/${articleId}`, {
        headers,
        failOnStatusCode: false,
      });
      expect(reloadResponse.status()).toBe(200);
      const reloaded = articleEnvelopeSchema.parse(await reloadResponse.json());
      expect(reloaded.article.title).toBe(editedTitle);
      expect(reloaded.article.content).toBe(editedContent);

      await dialog.getByRole("button", { name: "Versions", exact: true }).click();
      await expect(
        dialog.getByText("Comparing this revision against the current article."),
      ).toBeVisible();

      const revisionsResponse = await request.get(
        `${account.appUrl}/api/articles/${articleId}/revisions`,
        { headers, failOnStatusCode: false },
      );
      expect(revisionsResponse.status()).toBe(200);
      const revisions = revisionsEnvelopeSchema.parse(await revisionsResponse.json());
      expect(revisions.data.length).toBeGreaterThan(0);
      expect(revisions.data[0]?.articleId).toBe(articleId);
      const originalRevision = revisions.data[revisions.data.length - 1];
      expect(originalRevision).toBeDefined();
      if (!originalRevision) throw new Error("The generated article has no revision");
      expect(originalRevision.content).toContain("Local fake article");

      const restoreResponse = await request.post(
        `${account.appUrl}/api/articles/${articleId}/revisions/${originalRevision.id}/restore`,
        {
          headers,
          data: { expectedVersion: reloaded.article.version },
          failOnStatusCode: false,
        },
      );
      expect(restoreResponse.status()).toBe(200);
      const restored = articleEnvelopeSchema.parse(await restoreResponse.json());
      expect(restored.article.content).toBe(originalRevision.content);
      expect(restored.article.version).toBeGreaterThan(reloaded.article.version);

      const restoredResponse = await request.get(`${account.appUrl}/api/articles/${articleId}`, {
        headers,
        failOnStatusCode: false,
      });
      expect(restoredResponse.status()).toBe(200);
      const persisted = articleEnvelopeSchema.parse(await restoredResponse.json());
      expect(persisted.article.content).toBe(originalRevision.content);

      const crossTenantWrite = await request.put(`${owner.appUrl}/api/articles/${articleId}`, {
        headers: otherHeaders,
        data: { title: "Cross-tenant write must fail" },
        failOnStatusCode: false,
      });
      expect(crossTenantWrite.status()).toBe(404);

      const crossTenantRestore = await request.post(
        `${owner.appUrl}/api/articles/${articleId}/revisions/${originalRevision.id}/restore`,
        {
          headers: otherHeaders,
          data: { expectedVersion: persisted.article.version },
          failOnStatusCode: false,
        },
      );
      expect(crossTenantRestore.status()).toBe(404);
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
