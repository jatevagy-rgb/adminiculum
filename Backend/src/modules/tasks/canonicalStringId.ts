import { NextFunction, Request, Response } from 'express';

const MAX_CANONICAL_ID_LENGTH = 200;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;

export function parseCanonicalStringId(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  if (
    normalized.length === 0
    || normalized.length > MAX_CANONICAL_ID_LENGTH
    || CONTROL_CHARACTER_PATTERN.test(normalized)
  ) {
    return null;
  }

  return normalized;
}

export function requireCanonicalStringParams(...names: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    for (const name of names) {
      if (parseCanonicalStringId(req.params[name]) === null) {
        res.status(400).json({ status: 400, code: 'INVALID_ID', message: `${name} must be a valid identifier.` });
        return;
      }
    }
    next();
  };
}
