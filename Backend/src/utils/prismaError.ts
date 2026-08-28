// ============================================================================
// Prisma Error Response Helper
// ============================================================================
// Builds user-friendly error responses from Prisma errors

interface PrismaErrorResponse {
  status: number;
  body: {
    error: string;
    details?: string;
    code?: string;
  };
}

/**
 * Builds a formatted error response from Prisma errors
 * Returns null if the error is not a Prisma error
 */
export function buildPrismaErrorResponse(error: unknown): PrismaErrorResponse | null {
  // Check if it's a Prisma error by looking for common Prisma error properties
  const err = error as any;
  
  // Check for Prisma error code (e.g., P2002, P2025)
  if (err.code && typeof err.code === 'string' && err.code.startsWith('P')) {
    const code = err.code;
    
    // Handle unique constraint violation
    if (code === 'P2002') {
      return {
        status: 409,
        body: {
          error: 'Unique constraint violation',
          details: err.meta?.target ? `Field(s) ${err.meta.target.join(', ')} already exist` : 'Record already exists',
          code
        }
      };
    }
    
    // Handle record not found
    if (code === 'P2025') {
      return {
        status: 404,
        body: {
          error: 'Record not found',
          details: err.meta?.modelName ? `${err.meta.modelName} record not found` : 'Record not found',
          code
        }
      };
    }
    
    // Handle foreign key constraint violation
    if (code === 'P2003') {
      return {
        status: 400,
        body: {
          error: 'Foreign key constraint violation',
          details: 'Related record does not exist',
          code
        }
      };
    }
    
    // Handle required relation not present
    if (code === 'P2015') {
      return {
        status: 400,
        body: {
          error: 'Related record not found',
          details: err.meta?.relationName ? `Related ${err.meta.relationName} not found` : 'Related record not found',
          code
        }
      };
    }
    
    // Handle data validation error
    if (code === 'P2012') {
      return {
        status: 400,
        body: {
          error: 'Data validation error',
          // Never surface the raw Prisma meta message (may carry internal paths).
          details: 'Invalid data provided',
          code
        }
      };
    }

    // Default Prisma error handling. Never surface the raw Prisma error text
    // (may carry column/constraint/query internals).
    return {
      status: 400,
      body: {
        error: 'Database error',
        details: 'An error occurred while processing your request',
        code
      }
    };
  }

  // Check for generic Prisma client error (name property). Never surface the
  // raw Prisma error text.
  if (err.name === 'PrismaClientKnownRequestError' || err.name === 'PrismaClientValidationError') {
    return {
      status: 400,
      body: {
        error: 'Prisma error',
        details: 'Database operation failed',
        code: err.code
      }
    };
  }
  
  // Not a Prisma error
  return null;
}
