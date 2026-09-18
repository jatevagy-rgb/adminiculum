/**
 * Compliance document upload — canonical Case resolver (no database).
 *
 * Proves the resolve-or-create contract and its concurrency policy without a
 * database: canonical reuse/ambiguous/create decisions, bounded serializable
 * retry, re-query-before-recreate, P2002 scoped ONLY to Case.caseNumber, and
 * retry exhaustion.
 */
import { Prisma } from '@prisma/client';
import { describe, expect, it, jest, beforeEach } from '@jest/globals';

jest.mock('../src/modules/client-interaction/base', () => {
  const actual = jest.requireActual('../src/modules/client-interaction/base') as Record<string, unknown>;
  return {
    __esModule: true,
    ...actual,
    requireInternal: jest.fn(),
    assertClientReadAccess: jest.fn(async () => undefined),
  };
});

jest.mock('../src/modules/cases/services', () => ({
  __esModule: true,
  default: { createCase: jest.fn() },
}));

import casesService from '../src/modules/cases/services';
import { InteractionError } from '../src/modules/client-interaction/base';
import {
  COMPLIANCE_CASE_MAX_RETRIES,
  isCaseNumberUniqueCollision,
  isCaseResolutionSerializationFailure,
  resolveOrCreateComplianceCase,
} from '../src/modules/compliance/complianceCaseResolver';

/* eslint-disable @typescript-eslint/no-explicit-any */
const createCase: any = casesService.createCase;

function p2002(target: string[]): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
    meta: { target },
  });
}

function p2034(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Transaction failed', { code: 'P2034', clientVersion: 'test' });
}

function fakeDb(caseRowsPerAttempt: Array<Array<{ id: string }>>) {
  let attempt = 0;
  const tx = {
    caseTypeDefinition: { findMany: jest.fn(async () => [{ id: 'ctd-compliance' }]) },
    workPackageTemplate: { findFirst: jest.fn(async () => ({ id: 'wpt-1' })) },
    case: {
      findMany: jest.fn(async () => {
        const rows = caseRowsPerAttempt[Math.min(attempt - 1, caseRowsPerAttempt.length - 1)] ?? [];
        return rows;
      }),
    },
    client: { findUnique: jest.fn(async () => ({ name: 'Acme Kft.' })) },
  };
  const db = {
    $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) => {
      attempt += 1;
      return fn(tx);
    }),
    __tx: tx,
    __attempts: () => attempt,
  };
  return db;
}

const ACTOR = { userId: 'user-1', role: 'ADMIN' };

beforeEach(() => {
  createCase.mockReset();
});

describe('Compliance Case classifier helpers', () => {
  it('K. scopes P2002 retry to Case.caseNumber only', () => {
    expect(isCaseNumberUniqueCollision(p2002(['caseNumber']))).toBe(true);
    expect(isCaseNumberUniqueCollision(p2002(['email']))).toBe(false);
    expect(isCaseNumberUniqueCollision(new Error('nope'))).toBe(false);
  });

  it('N. recognises serialization failures', () => {
    expect(isCaseResolutionSerializationFailure(p2034())).toBe(true);
    expect(isCaseResolutionSerializationFailure({ code: '40001' })).toBe(true);
    expect(isCaseResolutionSerializationFailure(new Error('unrelated'))).toBe(false);
  });
});

describe('resolveOrCreateComplianceCase', () => {
  it('A. reuses the single eligible compliance case', async () => {
    const db = fakeDb([[{ id: 'case-existing' }]]);
    const result = await resolveOrCreateComplianceCase(ACTOR, 'client-1', db as never);

    expect(result).toEqual({ caseId: 'case-existing', caseCreated: false, caseReused: true });
    expect(createCase).not.toHaveBeenCalled();
  });

  it('B. creates one canonical unnumbered case when none is eligible', async () => {
    createCase.mockResolvedValueOnce({ id: 'case-new', caseNumber: 'CASE-2026-001' });
    const db = fakeDb([[]]);
    const result = await resolveOrCreateComplianceCase(ACTOR, 'client-1', db as never);

    expect(result).toEqual({ caseId: 'case-new', caseCreated: true, caseReused: false });
    expect(createCase).toHaveBeenCalledTimes(1);
  });

  it('C. refuses to guess when more than one case is eligible (no side effect)', async () => {
    const db = fakeDb([[{ id: 'a' }, { id: 'b' }]]);
    await expect(resolveOrCreateComplianceCase(ACTOR, 'client-1', db as never)).rejects.toMatchObject({
      code: 'COMPLIANCE_CASE_AMBIGUOUS',
    });
    expect(createCase).not.toHaveBeenCalled();
    expect(db.__attempts()).toBe(1);
  });

  it('L. retries a Case.caseNumber collision, re-queries, and reuses the concurrently created case', async () => {
    createCase.mockRejectedValueOnce(p2002(['caseNumber']));
    const db = fakeDb([[], [{ id: 'case-concurrent' }]]);
    const result = await resolveOrCreateComplianceCase(ACTOR, 'client-1', db as never);

    expect(result).toEqual({ caseId: 'case-concurrent', caseCreated: false, caseReused: true });
    // The retry attempted a create exactly once and then re-queried (2 transactions).
    expect(createCase).toHaveBeenCalledTimes(1);
    expect(db.__attempts()).toBe(2);
  });

  it('M. does NOT retry an unrelated P2002', async () => {
    createCase.mockRejectedValueOnce(p2002(['email']));
    const db = fakeDb([[]]);
    await expect(resolveOrCreateComplianceCase(ACTOR, 'client-1', db as never)).rejects.toMatchObject({ code: 'P2002' });
    expect(db.__attempts()).toBe(1);
  });

  it('N. exhausts at MAX_RETRIES on repeated serialization failures', async () => {
    createCase.mockRejectedValue(p2034());
    const db = fakeDb([[], [], [], []]);
    await expect(resolveOrCreateComplianceCase(ACTOR, 'client-1', db as never)).rejects.toMatchObject({
      code: 'COMPLIANCE_CASE_RESOLUTION_RETRY_EXHAUSTED',
    });
    expect(db.__attempts()).toBe(COMPLIANCE_CASE_MAX_RETRIES);
  });

  it('surfaces a caller-visible bounded conflict without retrying', async () => {
    const db = fakeDb([[{ id: 'a' }, { id: 'b' }]]);
    await expect(resolveOrCreateComplianceCase(ACTOR, 'client-1', db as never)).rejects.toBeInstanceOf(InteractionError);
    expect(db.__attempts()).toBe(1);
  });
});
