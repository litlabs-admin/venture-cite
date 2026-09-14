import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { apiRequest } from "@/lib/queryClient";
import type { V2LiveResult, V2ScreenState } from "@/v2/contracts/screen";
import type {
  ContentTaskActions,
  ContentTaskData,
  ContentValue,
  DraftSection,
  EditorStep,
} from "./ContentTaskEditor";

const workTaskSchema = z
  .object({
    id: z.string(),
    brandId: z.string(),
    taskKey: z.string(),
    type: z.string(),
    state: z.string(),
    revision: z.number().int(),
    title: z.string(),
    buyerNeed: z.string().nullable(),
    points: z.number().int().nullable(),
    completionRule: z
      .object({ required: z.array(z.string()).optional() })
      .nullable()
      .optional(),
    evidence: z.array(z.unknown()).optional(),
  })
  .passthrough();

const taskDetailResponseSchema = z.object({ success: z.literal(true), data: workTaskSchema });
const taskListResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({ items: z.array(workTaskSchema), nextCursor: z.string().nullable() }),
});

const articleSchema = z
  .object({
    id: z.string(),
    brandId: z.string(),
    title: z.string().nullable(),
    content: z.string().nullable(),
    version: z.number().int(),
    status: z.string(),
    externalUrl: z.string().nullable(),
    updatedAt: z.string(),
    citationCount: z.number().int().nullable().optional(),
  })
  .passthrough();

const articlesResponseSchema = z.object({ success: z.literal(true), data: z.array(articleSchema) });

type RawTask = z.infer<typeof workTaskSchema>;
type RawArticle = z.infer<typeof articleSchema>;

export type ContentTaskApiPayload = {
  taskPayload: unknown;
  articlePayload: unknown;
};

export type ContentTaskFetchInput = {
  brandId: string;
  taskId?: string;
  signal?: AbortSignal;
};

export async function fetchContentTaskApi({
  brandId,
  taskId,
  signal,
}: ContentTaskFetchInput): Promise<ContentTaskApiPayload> {
  const taskPath = taskId
    ? `/api/brands/${encodeURIComponent(brandId)}/work/tasks/${encodeURIComponent(taskId)}`
    : `/api/brands/${encodeURIComponent(brandId)}/work/tasks?taskType=improve_page_for_buyer_need&limit=1`;
  const taskResponse = await apiRequest("GET", taskPath, undefined, { signal });
  const articleResponse = await apiRequest(
    "GET",
    `/api/articles?brandId=${encodeURIComponent(brandId)}&status=draft,ready&limit=50`,
    undefined,
    { signal },
  );

  const taskPayload: unknown = await taskResponse.json();
  const articlePayload: unknown = await articleResponse.json();
  return { taskPayload, articlePayload };
}

function readTask(payload: unknown): RawTask | undefined {
  const detail = taskDetailResponseSchema.safeParse(payload);
  if (detail.success) return detail.data.data;
  const list = taskListResponseSchema.safeParse(payload);
  return list.success ? list.data.data.items[0] : undefined;
}

function readArticles(payload: unknown): readonly RawArticle[] {
  const parsed = articlesResponseSchema.safeParse(payload);
  return parsed.success ? parsed.data.data : [];
}

function measured<T>(value: T): ContentValue<T> {
  return { kind: "measured", value };
}

function unavailable<T>(reason: string): ContentValue<T> {
  return { kind: "not-measured", reason };
}

function stringValue(value: string | null, reason: string): ContentValue<string> {
  return value && value.trim() ? measured(value) : unavailable(reason);
}

function stepData(state: string): {
  steps: readonly EditorStep[];
  editorState: "edit" | "edit_page" | "verify";
} {
  const verificationActive = state === "submitted" || state === "waiting_for_observation";
  const verificationComplete = state === "verified";
  const editComplete = verificationActive || verificationComplete;
  return {
    editorState: verificationActive || verificationComplete ? "verify" : "edit_page",
    steps: [
      { label: "Review brief", caption: "Completed", status: "completed" },
      {
        label: "Edit page",
        caption: editComplete ? "Completed" : "Active",
        status: editComplete ? "completed" : "active",
      },
      {
        label: "Verify publication",
        caption: verificationComplete ? "Completed" : verificationActive ? "Active" : "Pending",
        status: verificationComplete ? "completed" : verificationActive ? "active" : "pending",
      },
    ],
  };
}

function requirementLabels(
  required: readonly string[] | undefined,
): ContentValue<readonly string[]> {
  if (!required || required.length === 0) {
    return unavailable("The task does not include completion requirements.");
  }
  const labels = required.map((item) => {
    if (item === "content_change") return "Publish the updated page";
    if (item === "confirmation") return "Confirm the claims";
    return item;
  });
  return measured(labels);
}

function parseArticleContent(content: string | null): {
  sections: readonly DraftSection[];
  footnotes: ContentValue<readonly string[]>;
  citationCount: ContentValue<number>;
} {
  if (!content || !content.trim()) {
    return {
      sections: [],
      footnotes: unavailable("The draft body is not available."),
      citationCount: unavailable("The draft citation count is not available."),
    };
  }

  const sections: DraftSection[] = [];
  const footnotes: string[] = [];
  let paragraphLines: string[] = [];
  let bullets: string[] = [];

  function flushParagraph() {
    if (paragraphLines.length > 0) {
      sections.push({ kind: "paragraph", text: measured(paragraphLines.join(" ")) });
      paragraphLines = [];
    }
  }

  function flushBullets() {
    if (bullets.length > 0) {
      sections.push({ kind: "bullets", items: bullets.map(measured) });
      bullets = [];
    }
  }

  for (const sourceLine of content.split(/\r?\n/)) {
    const line = sourceLine.trim();
    const heading = /^(#{2,6})\s+(.+)$/.exec(line);
    const bullet = /^[-*]\s+(.+)$/.exec(line);
    const footnote = /^\[\d+\]\s+(.+)$/.exec(line);
    if (!line) {
      flushParagraph();
      flushBullets();
      continue;
    }
    if (heading) {
      flushParagraph();
      flushBullets();
      sections.push({ kind: "heading", text: measured(heading[2]) });
      continue;
    }
    if (bullet) {
      flushParagraph();
      bullets.push(bullet[1]);
      continue;
    }
    if (footnote) {
      flushParagraph();
      flushBullets();
      footnotes.push(line);
      continue;
    }
    flushBullets();
    paragraphLines.push(line);
  }
  flushParagraph();
  flushBullets();

  const citationMatches = content.match(/\[\d+\]/g) ?? [];
  return {
    sections,
    footnotes: measured(footnotes),
    citationCount: measured(citationMatches.length),
  };
}

function draftStatus(status: string): string {
  if (status === "failed") return "Draft save failed";
  if (status === "generating") return "Draft generating";
  return "Draft saved";
}

export function mapContentTaskResponse<TBoard extends "buyer-guide" | "services">(
  board: TBoard,
  payload: ContentTaskApiPayload,
  brandId: string,
): ContentTaskData<TBoard> | undefined {
  const task = readTask(payload.taskPayload);
  if (!task || task.brandId !== brandId || task.type !== "improve_page_for_buyer_need")
    return undefined;

  const articleId = task.taskKey.startsWith("content:bofu:")
    ? task.taskKey.slice("content:bofu:".length)
    : "";
  const article = readArticles(payload.articlePayload).find(
    (item) => item.brandId === brandId && item.id === articleId,
  );
  const parsedContent = parseArticleContent(article?.content ?? null);
  const body = stringValue(article?.content ?? null, "The draft body is not available.");
  const questions =
    board === "buyer-guide"
      ? measured(
          parsedContent.sections
            .filter(
              (section): section is Extract<DraftSection, { kind: "bullets" }> =>
                section.kind === "bullets",
            )
            .flatMap((section) =>
              section.items.flatMap((item) => (item.kind === "measured" ? [item.value] : [])),
            ),
        )
      : unavailable<readonly string[]>(
          "Buyer questions are not part of the services-page task contract.",
        );
  const steps = stepData(task.state);
  const editorState =
    board === "buyer-guide" && steps.editorState !== "verify" ? "edit" : steps.editorState;
  const requirements = requirementLabels(task.completionRule?.required);
  const points =
    typeof task.points === "number"
      ? measured<number>(task.points)
      : unavailable<number>("The live policy has not supplied the reward.");

  return {
    board,
    brandId,
    task: {
      id: task.id,
      revision: task.revision,
      title: measured(task.title),
      state: editorState,
      steps: steps.steps,
      buyerNeed: stringValue(task.buyerNeed, "The task has no buyer need."),
      sourceEvidence: unavailable("Task-bound source evidence is not available yet."),
      completionRequirements: requirements,
      pointsAfterVerification: points,
    },
    draft: {
      articleId: article ? measured(article.id) : unavailable("No draft article is linked yet."),
      status: article
        ? measured(draftStatus(article.status))
        : unavailable("The draft status is not available."),
      title: stringValue(article?.title ?? null, "The draft title is not available."),
      body,
      questions,
      sections: parsedContent.sections,
      savedAt: stringValue(article?.updatedAt ?? null, "The draft save time is not available."),
      footnotes: parsedContent.footnotes,
      citationCount:
        article?.citationCount !== undefined && article.citationCount !== null
          ? measured(article.citationCount)
          : parsedContent.citationCount,
    },
    publication: {
      url: stringValue(article?.externalUrl ?? null, "The published URL is not available."),
      verified: unavailable("The publication checker is not available."),
    },
    toast: measured("Draft saved. Publication is not yet verified."),
  };
}

export type AdapterResolution<TData> =
  | { status: "loading" }
  | { status: "error" }
  | { status: "not-measured" }
  | { status: "ready"; data: TData; dataUpdatedAt: string };

export function resolveContentTaskResult<TData>(
  input: AdapterResolution<TData>,
  errorMessage: string,
): V2LiveResult<TData> {
  if (input.status === "loading") return { state: { kind: "loading" } };
  if (input.status === "error") return { state: { kind: "error", message: errorMessage } };
  if (input.status === "not-measured") {
    return { state: { kind: "not-measured", reason: "No brand is selected." } };
  }

  const updatedAt = Date.parse(input.dataUpdatedAt);
  if (Number.isFinite(updatedAt) && Date.now() - updatedAt > 30_000) {
    const staleState: Extract<V2ScreenState, { kind: "stale" }> = {
      kind: "stale",
      reason: "The latest editor data is stale.",
      asOf: input.dataUpdatedAt,
    };
    return { state: staleState, data: input.data };
  }
  return { state: { kind: "ready" }, data: input.data };
}

/**
 * "Draft saved" - persists the edited body through the real article
 * endpoint (`PUT /api/articles/:id`, `server/routes/articles.ts`), not just
 * a local status label. No optimistic locking here: this editor has no
 * concept of `expectedVersion` from a concurrent editor today, so a write
 * simply replaces the content, the same way the plain textarea it is
 * standing in for would.
 */
export function useSaveArticleDraft() {
  const queryClient = useQueryClient();
  return useMutation<unknown, Error, { articleId: string; content: string }>({
    mutationFn: async ({ articleId, content }) => {
      const response = await apiRequest("PUT", `/api/articles/${encodeURIComponent(articleId)}`, {
        content,
      });
      return response.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["v2", "my-work", "content-task"],
      });
      void queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] === "v2" });
      void queryClient.invalidateQueries({ queryKey: [`/api/articles`] });
    },
  });
}

export type SubmitContentTaskInput = {
  taskId: string;
  expectedRevision: number;
  changeId: string;
  pageUrl: string;
  buyerNeed: string;
};

/**
 * "Continue to publication check" - moves the task from editing to
 * `submitted` through the real `submit` command
 * (`POST .../work/tasks/:taskId/commands`, `server/routes/work.ts`), with a
 * `content_change` evidence reference built from the draft actually being
 * edited (the article id, its published URL, the task's own buyer need) -
 * never a placeholder. The command endpoint enforces the transition; this
 * function only assembles the one evidence kind this screen can vouch for.
 */
export function useSubmitContentTask(brandId: string) {
  const queryClient = useQueryClient();
  return useMutation<unknown, Error, SubmitContentTaskInput>({
    mutationFn: async ({ taskId, expectedRevision, changeId, pageUrl, buyerNeed }) => {
      const response = await apiRequest(
        "POST",
        `/api/brands/${encodeURIComponent(brandId)}/work/tasks/${encodeURIComponent(taskId)}/commands`,
        {
          expectedRevision,
          command: {
            kind: "submit",
            evidence: [
              {
                kind: "content_change",
                label: "Published page change",
                changeId,
                pageUrl,
                buyerNeed,
                publishedAt: new Date().toISOString(),
              },
            ],
          },
        },
      );
      return response.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] === "v2" });
    },
  });
}

function contentValue(value: ContentValue<string>): string | undefined {
  return value.kind === "measured" ? value.value : undefined;
}

/**
 * The `saveDraft`/`submit` pair `ContentTaskEditor` renders, built from
 * whichever board (`b06` or `b19`) is currently mounted. Shared here so the
 * two boards - two Screens over the one editor - do not each reinvent what
 * "blocked" means: the submit control is closed until there is a linked
 * article with a real, http(s) published URL, because that is exactly what
 * `content_change` evidence requires (`server/routes/work.ts`
 * `evidenceReferenceSchema`) and a call missing it is one the server would
 * reject.
 */
export function useContentTaskActions(
  brandId: string,
  data: ContentTaskData<"buyer-guide"> | ContentTaskData<"services"> | undefined,
): ContentTaskActions {
  const saveDraft = useSaveArticleDraft();
  const submit = useSubmitContentTask(brandId);

  const articleId = data ? contentValue(data.draft.articleId) : undefined;
  const pageUrl = data ? contentValue(data.publication.url) : undefined;
  const buyerNeed = data ? (contentValue(data.task.buyerNeed) ?? data.board) : undefined;
  const blocked = !data || !articleId || !pageUrl || !buyerNeed;

  return {
    saveDraft: {
      pending: saveDraft.isPending,
      error: saveDraft.isError ? saveDraft.error.message : undefined,
      run: (content: string) => {
        if (!articleId) return;
        saveDraft.mutate({ articleId, content });
      },
    },
    submit: {
      pending: submit.isPending,
      blocked,
      reason: blocked
        ? "This draft has no published URL yet, so it cannot be submitted for a publication check."
        : submit.isError
          ? `That submission was not saved: ${submit.error.message}`
          : undefined,
      run: () => {
        if (!data || !articleId || !pageUrl || !buyerNeed) return;
        submit.mutate({
          taskId: data.task.id,
          expectedRevision: data.task.revision,
          changeId: articleId,
          pageUrl,
          buyerNeed,
        });
      },
    },
  };
}
