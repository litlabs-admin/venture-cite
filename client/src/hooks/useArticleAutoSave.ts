import { useEffect, useRef } from "react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// Single auto-save channel for an article. Replaces the legacy 4-way race
// (form-field debounce + content debounce + job-poll patch + rewrite-success
// patch + analyze-success patch + save-article-success patch). Every write
// to a draft article goes through this hook so version conflicts are caught
// in one place.
//
// Usage:
//   const autoSave = useArticleAutoSave(articleId, expectedVersion);
//   autoSave.queue({ keywords: ["a","b"] });   // debounced PATCH
//   autoSave.queue({ content: "..." });        // separate debounce timer
//
// Two timers (one for form fields, one for content) so a fast typing pause
// in one field doesn't reset the other. Both flush serially through the
// same `inflight` ref so a second flush can't race a first.
//
// On 409 we surface a toast with a Reload button — the user has to decide
// whether to discard their local changes. We can't auto-merge.

type Patch = Record<string, unknown>;

const FORM_DEBOUNCE_MS = 1500;
const CONTENT_DEBOUNCE_MS = 2000;

export function useArticleAutoSave(
  articleId: string | null,
  expectedVersion: number | null,
  onVersionBumped?: (newVersion: number) => void,
) {
  const { toast } = useToast();
  const formTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contentTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queued = useRef<Patch>({});
  const inflight = useRef<Promise<void>>(Promise.resolve());
  const expectedVersionRef = useRef<number | null>(expectedVersion);

  useEffect(() => {
    expectedVersionRef.current = expectedVersion;
  }, [expectedVersion]);

  const flush = (): Promise<void> => {
    if (!articleId) return Promise.resolve();
    if (Object.keys(queued.current).length === 0) return Promise.resolve();

    const patch = queued.current;
    queued.current = {};

    inflight.current = inflight.current
      .then(async () => {
        const body =
          expectedVersionRef.current !== null
            ? { ...patch, expectedVersion: expectedVersionRef.current }
            : patch;
        const resp = await apiRequest("PUT", `/api/articles/${articleId}`, body);
        if (resp.status === 409) {
          // Read the latest content the server has so the user can compare.
          // We don't auto-overwrite; the toast asks them to reload.
          toast({
            title: "Article changed elsewhere",
            description:
              "Someone else (or you in another tab) edited this article. Reload to see the latest content.",
            variant: "destructive",
          });
          return;
        }
        const json = await resp.json();
        if (json?.article?.version !== undefined && onVersionBumped) {
          onVersionBumped(json.article.version);
          expectedVersionRef.current = json.article.version;
        }
      })
      .catch(() => {
        // Network errors are silently swallowed. The next queued patch
        // will retry the cumulative state.
      });

    return inflight.current;
  };

  return {
    /** Debounce-PATCH form fields (anything other than content). */
    queueForm(patch: Patch) {
      Object.assign(queued.current, patch);
      if (formTimer.current) clearTimeout(formTimer.current);
      formTimer.current = setTimeout(() => {
        flush();
      }, FORM_DEBOUNCE_MS);
    },
    /** Debounce-PATCH the content textarea on a separate timer. */
    queueContent(content: string) {
      queued.current.content = content;
      if (contentTimer.current) clearTimeout(contentTimer.current);
      contentTimer.current = setTimeout(() => {
        flush();
      }, CONTENT_DEBOUNCE_MS);
    },
    /** Flush any pending changes immediately. Returns a promise. */
    flushNow() {
      if (formTimer.current) clearTimeout(formTimer.current);
      if (contentTimer.current) clearTimeout(contentTimer.current);
      return flush();
    },
    /** Cancel pending writes (e.g. on unmount). */
    cancel() {
      if (formTimer.current) clearTimeout(formTimer.current);
      if (contentTimer.current) clearTimeout(contentTimer.current);
      queued.current = {};
    },
  };
}
