import { Prisma } from '@prisma/client';

type ErrorBody = {
  error: string;
  field?: string;
  message: string;
  code?: string;
};

export function buildPrismaErrorResponse(error: unknown): { status: number; body: ErrorBody } | null {
  if (error instanceof Prisma.PrismaClientValidationError) {
    const msg = error.message || 'Invalid request payload';
    const fieldMatch = msg.match(/Argument `([^`]+)`/);
    const enumMatch = msg.match(/Invalid value for argument `([^`]+)`/);

    return {
      status: 400,
      body: {
        error: 'Validation error',
        field: enumMatch?.[1] || fieldMatch?.[1],
        message: msg,
      },
    };
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      return {
        status: 409,
        body: {
          error: 'Conflict',
          code: error.code,
          message: 'Unique constraint violation',
        },
      };
    }

    if (error.code === 'P2025') {
      return {
        status: 404,
        body: {
          error: 'Not found',
          code: error.code,
          message: 'Requested record was not found',
        },
      };
    }

    if (error.code === 'P2003') {
      return {
        status: 400,
        body: {
          error: 'Validation error',
          code: error.code,
          message: 'Relation constraint failed',
        },
      };
    }
  }

  return null;
}

