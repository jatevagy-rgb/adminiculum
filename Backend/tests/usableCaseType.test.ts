const prismaMock = { caseTypeDefinition: { findMany: jest.fn() }, $transaction: jest.fn() };
jest.mock('../src/prisma/prisma.service', () => ({ prisma: prismaMock }));
jest.mock('../src/middleware/auth', () => ({ authenticate: jest.fn() }));
import router from '../src/modules/work-package-admin/routes';
import { createUsableCaseType } from '../src/modules/work-package-admin/service';

describe('usable case type HTTP contract (no database)', () => {
  beforeEach(() => jest.clearAllMocks());
  it.each(['LAWYER', 'COLLAB_LAWYER', 'TRAINEE', 'LEGAL_ASSISTANT', 'CLIENT', undefined])('denies %s at the actual route/service boundary before database access', async (role) => {
    const route = router.stack.find((layer: any) => layer.route?.path === '/case-types/usable') as any;
    expect(route.route.methods.post).toBe(true);
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    await route.route.stack[0].handle({ user: { userId: 'test-user', role }, body: { name: 'Forbidden' } }, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
  it.each([undefined, '', '   ', 'x'.repeat(201)])('rejects invalid human names without opening a transaction', async (name) => {
    await expect(createUsableCaseType({ userId: 'admin', role: 'ADMIN' }, { name })).rejects.toMatchObject({ status: 400 });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});
