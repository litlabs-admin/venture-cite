import type { Request, Response, NextFunction, RequestHandler } from "express";

// Wraps an async handler so any thrown error / rejected promise is
// forwarded to Express's global error handler (server/app.ts), which
// logs via Pino, captures Sentry for status >= 500, and returns the
// standard { success: false, error } shape. Additive: handlers that
// already use try/catch + sendError keep working untouched. The
// wrapper only fires for errors that escape the handler's own catch.
//
// Lives in its own file (rather than alongside sendError in
// routesShared) so utility route modules can import it without
// dragging in the singleton OpenAI client that routesShared
// instantiates at module load time.
export const asyncHandler =
  <T>(fn: (req: Request, res: Response, next: NextFunction) => Promise<T> | T): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
