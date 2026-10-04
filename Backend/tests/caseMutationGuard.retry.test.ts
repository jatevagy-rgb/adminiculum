import { Prisma } from '@prisma/client';
import { isRetryableCaseTransactionError, withCaseWorkGuard } from '../src/modules/cases/caseMutationGuard';

const known = (code: string, meta?: Record<string, unknown>) => new Prisma.PrismaClientKnownRequestError('test', { code, clientVersion: '5.22.0', meta });

describe('case transaction retry classification and ownership', () => {
  it.each([
    [known('P2034'), true],
    [known('P2010', { code: '40001' }), true],
    [known('P2010', { code: '23514', message: '40001' }), false],
    [known('P2010', { code: '25P02' }), false],
    [known('P2010', { code: '40P01' }), false],
    [new Error('40001'), false],
    [{ code: 'P2010', meta: { code: '40001' } }, false],
  ])('uses structured known errors only (%#)', (error, expected) => {
    expect(isRetryableCaseTransactionError(error)).toBe(expected);
  });

  it('does not retry within an aborted caller-owned transaction', async () => {
    const error = known('P2010', { code: '40001' });
    const tx = { $queryRaw: jest.fn().mockRejectedValue(error) };
    const operation = jest.fn();
    await expect(withCaseWorkGuard(tx as any, 'case', operation)).rejects.toBe(error);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(operation).not.toHaveBeenCalled();
  });
});
