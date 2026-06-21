import { NextFunction, Request, Response } from 'express';
import {
  isDatabaseFoundationEnabled,
  requireDatabaseFoundation,
  sendFeatureUnavailable,
} from '../src/middleware/featureAvailability';

function createResponse() {
  const response = {
    status: jest.fn(),
    json: jest.fn(),
  };
  response.status.mockReturnValue(response);
  return response as unknown as Response & {
    status: jest.Mock;
    json: jest.Mock;
  };
}

describe('feature availability middleware', () => {
  afterEach(() => {
    delete process.env.ENABLE_TEST_DATABASE_FOUNDATION;
  });

  it('uses the standard unavailable response without leaking database details', () => {
    const response = createResponse();

    sendFeatureUnavailable(response, {
      feature: 'TEST_FEATURE',
      message: 'Test persistence is not available.',
      nextStep: 'Complete reconciliation before enabling this feature.',
    });

    expect(response.status).toHaveBeenCalledWith(501);
    expect(response.json).toHaveBeenCalledWith({
      status: 501,
      code: 'FEATURE_NOT_AVAILABLE',
      message: 'Test persistence is not available.',
      feature: 'TEST_FEATURE',
      reason: 'DATABASE_FOUNDATION_NOT_DEPLOYED',
      nextStep: 'Complete reconciliation before enabling this feature.',
    });

    const serialized = JSON.stringify(response.json.mock.calls[0][0]).toLowerCase();
    expect(serialized).not.toContain('prisma');
    expect(serialized).not.toContain('table');
    expect(serialized).not.toContain('stack');
  });

  it('blocks requests when the database foundation flag is disabled', () => {
    const response = createResponse();
    const next = jest.fn() as NextFunction;
    const middleware = requireDatabaseFoundation({
      feature: 'TEST_FEATURE',
      enabled: () => isDatabaseFoundationEnabled('ENABLE_TEST_DATABASE_FOUNDATION'),
    });

    middleware({} as Request, response, next);

    expect(response.status).toHaveBeenCalledWith(501);
    expect(next).not.toHaveBeenCalled();
  });

  it('continues when the database foundation flag is explicitly enabled', () => {
    process.env.ENABLE_TEST_DATABASE_FOUNDATION = 'true';
    const response = createResponse();
    const next = jest.fn() as NextFunction;
    const middleware = requireDatabaseFoundation({
      feature: 'TEST_FEATURE',
      enabled: () => isDatabaseFoundationEnabled('ENABLE_TEST_DATABASE_FOUNDATION'),
    });

    middleware({} as Request, response, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(response.status).not.toHaveBeenCalled();
  });
});
