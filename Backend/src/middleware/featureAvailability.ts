import { NextFunction, Request, Response } from 'express';

export interface FeatureUnavailableOptions {
  feature: string;
  message?: string;
  nextStep?: string;
  reason?: string;
}

export interface DatabaseFoundationGuardOptions extends FeatureUnavailableOptions {
  enabled: () => boolean;
}

export function isDatabaseFoundationEnabled(environmentVariable: string): boolean {
  return process.env[environmentVariable] === 'true';
}

/** Persistence may exist while compliance behavior remains explicitly off. */
export function isComplianceEngineEnabled(): boolean {
  return process.env.ENABLE_COMPLIANCE_ENGINE === 'true';
}

export function sendFeatureUnavailable(
  res: Response,
  options: FeatureUnavailableOptions
): void {
  res.status(501).json({
    status: 501,
    code: 'FEATURE_NOT_AVAILABLE',
    message: options.message || `${options.feature} is not available in this environment.`,
    feature: options.feature,
    reason: options.reason || 'DATABASE_FOUNDATION_NOT_DEPLOYED',
    ...(options.nextStep ? { nextStep: options.nextStep } : {}),
  });
}

export function requireDatabaseFoundation(options: DatabaseFoundationGuardOptions) {
  return (_req: Request, res: Response, next: NextFunction): void => {
    if (!options.enabled()) {
      sendFeatureUnavailable(res, options);
      return;
    }
    next();
  };
}
