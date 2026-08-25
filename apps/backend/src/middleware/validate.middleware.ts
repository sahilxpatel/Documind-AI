import { NextFunction, Request, Response } from 'express';
import { ZodType } from 'zod';

/**
 * Validates request body/query/params against a Zod schema.
 *
 * Parsed output replaces the raw request values so controllers receive coerced
 * types (numbers instead of strings) and trimmed/normalised strings.
 *
 * Failures are passed to `next` rather than answered inline, so the single error
 * handler in error.middleware.ts owns the response shape for every 400.
 */
export const validate =
  (schema: ZodType) => async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = (await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      })) as {
        body?: unknown;
        query?: unknown;
        params?: unknown;
      };

      if (parsed.body !== undefined) req.body = parsed.body;
      // Express 5 exposes req.query via a getter, so assign defensively.
      if (parsed.query !== undefined) {
        Object.defineProperty(req, 'query', {
          value: parsed.query,
          writable: true,
          configurable: true,
        });
      }
      if (parsed.params !== undefined) {
        req.params = parsed.params as Request['params'];
      }

      return next();
    } catch (error) {
      return next(error);
    }
  };
