import { Prisma } from '@prisma/client';

// Marker used when a value that could contain raw legal text is deliberately omitted.
export const WORKSPACE_TEXT_REDACTED = '[WORKSPACE_TEXT_REDACTED]';

// Content-free log context for privacy-sensitive document routes that handle raw
// `documents.workspaceText` (which may hold raw legal document text). It never logs
// the caught error object, its `message`, its `meta`, or its stack, and never logs
// request/Prisma payloads — any of those can serialize raw legal text or query
// parameters. It logs only content-free metadata plus the error *name* and (for known
// Prisma errors) the error *code*.
export function safeWorkspaceTextLogContext(input: {
  action: string;
  result: string;
  documentId?: string;
  caseId?: string;
  actorId?: string;
  error?: unknown;
}): Record<string, string> {
  const ctx: Record<string, string> = {
    action: input.action,
    result: input.result,
  };
  if (input.documentId) ctx.documentId = input.documentId;
  if (input.caseId) ctx.caseId = input.caseId;
  if (input.actorId) ctx.actorId = input.actorId;

  if (input.error !== undefined) {
    const err = input.error;
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      ctx.errorName = 'PrismaClientKnownRequestError';
      ctx.errorCode = err.code;
    } else if (err instanceof Error) {
      ctx.errorName = err.name || 'Error';
    } else {
      ctx.errorName = 'UnknownError';
    }
    // Deliberately NOT logged: error.message, error.meta, error.stack — these can echo
    // raw workspace text or query parameters.
  }

  return ctx;
}
