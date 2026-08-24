import { Prisma } from '@prisma/client';
import { withProposalConfirmationRetry } from '../src/modules/compliance/complianceProposalService';

describe('Phase 7B confirmation retry ownership', () => {
  const serializationError = () => new Prisma.PrismaClientKnownRequestError('serialization failure', { code: 'P2034', clientVersion: 'test' });

  it('retries the whole serializable unit up to three total attempts', async () => {
    let calls = 0;
    const db = { $transaction: async () => { calls += 1; if (calls < 3) throw serializationError(); return 'ok'; } } as any;
    await expect(withProposalConfirmationRetry(db, async () => 'unused')).resolves.toBe('ok');
    expect(calls).toBe(3);
  });

  it('stops after retry exhaustion', async () => {
    let calls = 0;
    const db = { $transaction: async () => { calls += 1; throw serializationError(); } } as any;
    await expect(withProposalConfirmationRetry(db, async () => 'unused')).rejects.toMatchObject({ code: 'P2034' });
    expect(calls).toBe(3);
  });

  it('does not retry unrelated errors', async () => {
    let calls = 0;
    const db = { $transaction: async () => { calls += 1; throw new Error('business failure'); } } as any;
    await expect(withProposalConfirmationRetry(db, async () => 'unused')).rejects.toThrow('business failure');
    expect(calls).toBe(1);
  });
});
