/**
 * Client Portal Interaction feature gates.
 *
 * The master switch CLIENT_PORTAL_ACTIONS_ENABLED must be able to disable EVERY
 * client mutation immediately. Each capability additionally requires its own
 * granular gate. Every gate defaults OFF and is only "on" when its env value is
 * exactly "true". Unrelated Outlook/webhook/integration gates are never read
 * here.
 */

export type ClientInteractionCapability =
  | 'QUESTIONS'
  | 'DOCUMENT_REQUESTS'
  | 'DATA_REQUESTS'
  | 'DOCUMENT_UPLOADS'
  | 'EMAIL_NOTIFICATIONS'
  | 'SUBMISSION_REVIEW';

const CAPABILITY_ENV: Record<ClientInteractionCapability, string> = {
  QUESTIONS: 'CLIENT_PORTAL_QUESTIONS_ENABLED',
  DOCUMENT_REQUESTS: 'CLIENT_PORTAL_DOCUMENT_REQUESTS_ENABLED',
  DATA_REQUESTS: 'CLIENT_PORTAL_DATA_REQUESTS_ENABLED',
  DOCUMENT_UPLOADS: 'CLIENT_PORTAL_DOCUMENT_UPLOADS_ENABLED',
  EMAIL_NOTIFICATIONS: 'CLIENT_PORTAL_EMAIL_NOTIFICATIONS_ENABLED',
  SUBMISSION_REVIEW: 'CLIENT_PORTAL_SUBMISSION_REVIEW_ENABLED',
};

function flag(env: NodeJS.ProcessEnv, name: string): boolean {
  return String(env[name] || '').trim().toLowerCase() === 'true';
}

/** The emergency master control for every client mutation. */
export function isMasterActionsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return flag(env, 'CLIENT_PORTAL_ACTIONS_ENABLED');
}

/**
 * A capability is enabled only when the master switch AND its own granular gate
 * are both on. Turning the master switch off disables every capability at once.
 */
export function isCapabilityEnabled(
  capability: ClientInteractionCapability,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return isMasterActionsEnabled(env) && flag(env, CAPABILITY_ENV[capability]);
}

export class ClientInteractionGateError extends Error {
  status = 403;
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

/** Throw a 403 when the capability (or the master switch) is disabled. */
export function requireCapability(
  capability: ClientInteractionCapability,
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (!isMasterActionsEnabled(env)) {
    throw new ClientInteractionGateError('CLIENT_PORTAL_ACTIONS_DISABLED', 'Client portal actions are disabled.');
  }
  if (!isCapabilityEnabled(capability, env)) {
    throw new ClientInteractionGateError(`${CAPABILITY_ENV[capability]}_DISABLED`, `Capability ${capability} is disabled.`);
  }
}
