import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { getAccessToken } from "./authStore";

export class ApiError extends Error {
  status: number;
  body: unknown;
  bodyText: string;

  constructor(status: number, bodyText: string, body: unknown) {
    // Keep the legacy "<status>: <text>" prefix so any older string-matching
    // callers still work during the migration.
    const message =
      body &&
      typeof body === "object" &&
      "error" in (body as any) &&
      typeof (body as any).error === "string"
        ? (body as any).error
        : bodyText || `Request failed with status ${status}`;
    super(`${status}: ${message}`);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
    this.bodyText = bodyText;
  }
}

export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError;
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const raw = await res.text();
    let body: unknown = null;
    if (raw) {
      try {
        body = JSON.parse(raw);
      } catch {
        body = raw;
      }
    }
    throw new ApiError(res.status, raw || res.statusText, body);
  }
}

async function buildHeaders(hasBody: boolean): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};
  if (hasBody) headers["Content-Type"] = "application/json";
  const token = await getAccessToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
  options?: { signal?: AbortSignal },
): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: await buildHeaders(data !== undefined),
    body: data ? JSON.stringify(data) : undefined,
    signal: options?.signal,
  });

  await throwIfResNotOk(res);
  return res;
}

// Build a URL from a React Query queryKey. The first segment is the base URL
// (which may already contain a query string). Subsequent primitive segments
// are appended as path parts; object segments are merged into query params.
// Null/undefined/empty segments are skipped so pages with conditional
// selection don't send requests like `/api/foo/undefined`.
function urlFromQueryKey(queryKey: readonly unknown[]): string {
  if (queryKey.length === 0) throw new Error("Empty queryKey");
  const [base, ...rest] = queryKey;
  let url = String(base);
  const pathParts: string[] = [];
  const params: Record<string, string> = {};
  for (const seg of rest) {
    if (seg === undefined || seg === null || seg === "") continue;
    if (typeof seg === "object") {
      for (const [k, v] of Object.entries(seg as Record<string, unknown>)) {
        if (v === undefined || v === null || v === "") continue;
        params[k] = String(v);
      }
    } else {
      pathParts.push(String(seg));
    }
  }
  if (pathParts.length) {
    url += (url.endsWith("/") ? "" : "/") + pathParts.join("/");
  }
  const qs = new URLSearchParams(params).toString();
  if (qs) url += (url.includes("?") ? "&" : "?") + qs;
  return url;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: { on401: UnauthorizedBehavior }) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(urlFromQueryKey(queryKey), {
      headers: await buildHeaders(false),
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      // Opt-in per-query. A global `true` caused duplicate fetches racing
      // with imperative setQueryData/refetch in mutations.
      refetchOnWindowFocus: false,
      staleTime: 30_000,
      // Wave 6.5: retry transient failures with exponential backoff. 401s
      // should not retry (user lost session — re-retrying just hammers the
      // endpoint). 4xx in general is a client error; retrying won't help.
      // Only retry on network errors and 5xx.
      retry: (failureCount, error: unknown) => {
        if (failureCount >= 2) return false;
        const status =
          error && typeof error === "object" && "status" in error
            ? Number((error as { status?: number }).status)
            : undefined;
        if (status !== undefined && status >= 400 && status < 500) return false;
        return true;
      },
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
    },
    mutations: {
      retry: false,
    },
  },
});
