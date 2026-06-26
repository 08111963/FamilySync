import type { Request } from 'express';

/**
 * Returns a route parameter as a single guaranteed string.
 *
 * Express 5's type definitions declare route params as `string | string[]`.
 * Path parameters are always present (the route would not match otherwise) and
 * are always single values, so this narrows the type safely without changing
 * runtime behaviour. If a value is ever an array, the first element is used.
 */
export function getParam(req: Request, name: string): string {
  const value = req.params[name];
  if (Array.isArray(value)) {
    return value[0] ?? '';
  }
  return value;
}

/**
 * Returns a query-string value as a single string or undefined.
 *
 * Express 5 types query values as `string | string[] | ParsedQs | ...`. This
 * keeps only single string values and discards arrays/objects, returning
 * undefined when the value is absent or not a plain string.
 */
export function getQuery(req: Request, name: string): string | undefined {
  const value = req.query[name];
  return typeof value === 'string' ? value : undefined;
}
