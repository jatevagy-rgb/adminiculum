import {
  isDatabaseFoundationEnabled,
  requireDatabaseFoundation,
} from '../../middleware/featureAvailability';
import {
  CLIENT_PORTAL_ENABLE_FLAG,
  CLIENT_PORTAL_FEATURE,
  CLIENT_PORTAL_NOT_ENABLED_REASON,
  CLIENT_PORTAL_OWNERSHIP_MODEL_FLAG,
  CLIENT_PORTAL_RUNTIME_READY_FLAG,
} from './types';

export function isClientPortalRuntimeReady(): boolean {
  return (
    isDatabaseFoundationEnabled(CLIENT_PORTAL_ENABLE_FLAG) &&
    isDatabaseFoundationEnabled(CLIENT_PORTAL_OWNERSHIP_MODEL_FLAG) &&
    isDatabaseFoundationEnabled(CLIENT_PORTAL_RUNTIME_READY_FLAG)
  );
}

export const requireClientPortalRuntimeReady = requireDatabaseFoundation({
  feature: CLIENT_PORTAL_FEATURE,
  enabled: isClientPortalRuntimeReady,
  message: 'The client portal is not available in this environment.',
  reason: CLIENT_PORTAL_NOT_ENABLED_REASON,
  nextStep:
    'Client portal requires a separate client-user ownership model and runtime readiness review before it can be enabled.',
});
