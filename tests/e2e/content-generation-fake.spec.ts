import { test, expect, type APIResponse, type Page } from "@playwright/test";
import { getBearerToken } from "./support/bearer-token";
import {
  createLocalAccount,
  deleteLocalAccount,
  localE2EConfig,
  localFakeGenerationEnabled,
  primeLocalPage,
} from "./support/local-fixtures";

test.skip(
  !!process.env.E2E_BASE_URL || !localE2EConfig() || !localFakeGenerationEnabled(),
  "The deterministic provider requires explicit loopback E2E_LOCAL_* settings",
);

type ApiResult<T> = { response: APIResponse; body: T };

async function api<T>(
  page: Page,
  method: "DELETE" | "GET" | "POST",
  path: string,
  data?: unknown,
): Promise<ApiResult<T>> {
  const token = await getBearerToken(page);
  const response = await page.request.fetch(path, {
    method,
    headers: { authorization: `Bearer ${token}` },
    data,
  });
  return { response, body: (await response.json()) as T };
}

async function createDraft(
  page: Page,
  keywords: string[],
): Promise<{ id: string; brandId: string }> {
  const brands = await api<{
    success: boolean;
    data: Array<{ id: string; industry: string | null }>;
  }>(page, "GET", "/api/brands");
  const brand = brands.body.data[0];
  if (!brand) {
    test.skip(true, "The local E2E account needs one brand fixture");
    throw new Error("The local E2E account needs one brand fixture");
  }

  const draft = await api<{ success: boolean; data: { id: string; brandId: string } }>(
    page,
    "POST",
    "/api/articles/draft",
    {
      brandId: brand.id,
      industry: brand.industry ?? "Software",
      keywords,
      contentType: "article",
    },
  );
  expect(draft.response.status()).toBe(200);
  expect(draft.body.success).toBe(true);
  return draft.body.data;
}

async function removeArticle(page: Page, id: string): Promise<void> {
  const result = await api<{ success: boolean }>(page, "DELETE", `/api/articles/${id}`);
  expect([200, 404]).toContain(result.response.status());
}

async function driveUntilTerminal(page: Page, jobId: string): Promise<string> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await api(page, "POST", `/api/content-jobs/${jobId}/advance`);
    const state = await api<{
      success: boolean;
      data: { status: string; done: boolean; errorMessage: string | null };
    }>(page, "GET", `/api/content-jobs/${jobId}/state`);
    expect(state.body.success).toBe(true);
    if (state.body.data.done) return state.body.data.status;
    await page.waitForTimeout(100);
  }
  throw new Error(`Fake content job ${jobId} did not reach a terminal state`);
}

test.describe("local fake content generation", () => {
  test("enqueues, advances, persists the article and revision", async ({ page, request }) => {
    const account = await createLocalAccount(request, "generation-success");
    let draft: { id: string; brandId: string } | null = null;

    try {
      await primeLocalPage(page, account);
      await page.goto("/dashboard");
      draft = await createDraft(page, ["local fake generation"]);
      await page.goto(`/content/${draft.id}`);
      await expect(page.getByTestId("button-generate-content")).toBeEnabled();

      const generateResponse = page.waitForResponse(
        (response) =>
          response.url().includes(`/api/articles/${draft.id}/generate`) &&
          response.request().method() === "POST",
      );
      await page.getByTestId("button-generate-content").click();
      const generated = await generateResponse;
      const generatedBody = (await generated.json()) as {
        success: boolean;
        data: { jobId: string; status: string };
      };
      expect(generated.status()).toBe(200);
      expect(generatedBody).toMatchObject({ success: true, data: { status: "pending" } });

      await expect(page.getByTestId("cancel-generation-button")).toBeVisible();
      const status = await driveUntilTerminal(page, generatedBody.data.jobId);
      expect(status).toBe("succeeded");

      const article = await api<{
        success: boolean;
        article: {
          status: string;
          title: string | null;
          content: string | null;
          aiGenerated: boolean;
        };
      }>(page, "GET", `/api/articles/${draft.id}`);
      expect(article.body).toMatchObject({
        success: true,
        article: { status: "ready", aiGenerated: true },
      });
      expect(article.body.article.title).toContain("Local fake article");
      expect(article.body.article.content).toContain("deterministic local content provider");

      const revisions = await api<{
        success: boolean;
        data: Array<{ articleId: string; content: string; source: string }>;
      }>(page, "GET", `/api/articles/${draft.id}/revisions`);
      expect(revisions.body.success).toBe(true);
      expect(revisions.body.data.some((revision) => revision.articleId === draft.id)).toBe(true);
      expect(
        revisions.body.data.some((revision) => revision.content.includes("Local fake article")),
      ).toBe(true);

      await expect(page.locator("textarea")).toHaveValue(/Local fake article/);
    } finally {
      if (draft) await removeArticle(page, draft.id);
      await deleteLocalAccount(request, account);
    }
  });

  test("cancels a running fake generation and resets the draft", async ({ page, request }) => {
    const account = await createLocalAccount(request, "generation-cancel");
    let draft: { id: string; brandId: string } | null = null;

    try {
      await primeLocalPage(page, account);
      await page.goto("/dashboard");
      draft = await createDraft(page, ["[cancel-local-generation]"]);
      await page.goto(`/content/${draft.id}`);
      await expect(page.getByTestId("button-generate-content")).toBeEnabled();
      const generateResponse = page.waitForResponse(
        (response) =>
          response.url().includes(`/api/articles/${draft.id}/generate`) &&
          response.request().method() === "POST",
      );
      await page.getByTestId("button-generate-content").click();
      const generated = await generateResponse;
      const generatedBody = (await generated.json()) as {
        success: boolean;
        data: { jobId: string; status: string };
      };
      expect(generatedBody).toMatchObject({ success: true, data: { status: "pending" } });
      await expect(page.getByTestId("cancel-generation-button")).toBeVisible();

      await page.getByTestId("cancel-generation-button").click();
      await expect(page.getByTestId("button-generate-content")).toBeVisible();

      const article = await api<{
        success: boolean;
        article: { status: string; content: string | null };
      }>(page, "GET", `/api/articles/${draft.id}`);
      expect(article.body).toMatchObject({ success: true, article: { status: "draft" } });
      expect(article.body.article.content).toBe("");

      const job = await api<{ success: boolean; data: { status: string } }>(
        page,
        "GET",
        `/api/content-jobs/${generatedBody.data.jobId}`,
      );
      expect(job.body).toMatchObject({ success: true, data: { status: "cancelled" } });
    } finally {
      if (draft) await removeArticle(page, draft.id);
      await deleteLocalAccount(request, account);
    }
  });
});
