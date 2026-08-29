import { NextFunction, Request, Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { requireWorkforceUser } from '../src/middleware/workforceAuthorization';

function invokeWorkforce(role: string | undefined) {
  const response = { status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as Response;
  const next = jest.fn() as NextFunction;
  requireWorkforceUser({ user: role ? { userId: 'actor', role } : undefined } as Request, response, next);
  return { response, next };
}

describe('work package operational route boundary', () => {
  it('denies client portal identities before case authorization', () => {
    const { response, next } = invokeWorkforce('CLIENT');
    expect(next).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(403);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'WORKFORCE_ACCESS_REQUIRED' }));
  });

  it('allows workforce roles to proceed to canonical case authorization', () => {
    const { next } = invokeWorkforce('LAWYER');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('places workforce and exact case authorization ahead of every operational route', () => {
    const routes = fs.readFileSync(path.resolve(__dirname, '../src/modules/cases/routes.ts'), 'utf8');
    for (const method of ['router.get', 'router.patch', 'router.post']) {
      expect(routes).toContain(`${method}('/:caseId/work-package`);
    }
    expect(routes).toContain("authenticate, requireWorkforceUser, requireCaseReadAccess");
    expect(routes).toContain("authenticate, requireWorkforceUser, requireCaseManageAccess");
  });
});
