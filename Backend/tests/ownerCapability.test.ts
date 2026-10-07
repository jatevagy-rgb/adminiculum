import { isCaseClientOwnerEnabled } from '../src/modules/case-workspace/capabilities';
import { savedOwnerPersonId } from '../src/modules/case-workspace/owner.service';
import { requireCaseClientOwner, requireDurableWorkspace } from '../src/modules/case-workspace/routes';

const originalOwner = process.env.ENABLE_CASE_CLIENT_OWNER;
const originalTiles = process.env.ENABLE_DURABLE_CASE_WORKSPACE;
afterAll(() => {
  if (originalOwner === undefined) delete process.env.ENABLE_CASE_CLIENT_OWNER; else process.env.ENABLE_CASE_CLIENT_OWNER = originalOwner;
  if (originalTiles === undefined) delete process.env.ENABLE_DURABLE_CASE_WORKSPACE; else process.env.ENABLE_DURABLE_CASE_WORKSPACE = originalTiles;
});

test.each([[false, false], [false, true], [true, false], [true, true]])('owner %s and tiles %s have independent guards', async (owner, tiles) => {
  process.env.ENABLE_CASE_CLIENT_OWNER = String(owner);
  process.env.ENABLE_DURABLE_CASE_WORKSPACE = String(tiles);
  expect(isCaseClientOwnerEnabled()).toBe(owner);
  for (const [guard, enabled] of [[requireCaseClientOwner, owner], [requireDurableWorkspace, tiles]] as const) {
    const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    guard({} as any, res, next);
    expect(next).toHaveBeenCalledTimes(enabled ? 1 : 0);
    if (!enabled) expect(res.status).toHaveBeenCalledWith(503);
  }
  if (!owner) {
    const db = { caseClientOwner: { findUnique: jest.fn() } };
    expect(await savedOwnerPersonId(db as any, 'case', 'client')).toBeNull();
    expect(db.caseClientOwner.findUnique).not.toHaveBeenCalled();
  }
});

test('legacy tiles flag alone never implicitly enables owner tables or writes', () => {
  delete process.env.ENABLE_CASE_CLIENT_OWNER;
  process.env.ENABLE_DURABLE_CASE_WORKSPACE = 'true';
  expect(isCaseClientOwnerEnabled()).toBe(false);
});
