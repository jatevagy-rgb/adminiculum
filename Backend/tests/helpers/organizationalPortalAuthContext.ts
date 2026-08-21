/**
 * PHASE 5 TEST FOUNDATION — authorization-context helpers.
 *
 * Provides deterministic helper builders for the various customer authorization
 * states used by Phase-5 regression tests. These helpers DO NOT bypass canonical
 * resolvers — they construct the exact session/identity/membership inputs that
 * flow through resolvePortalWorkspace / resolveActiveCustomerGrant /
 * resolveParticipantAccess and expose the CustomerContext / ParticipantAccess
 * results for assertions.
 */
import { PrismaClient } from '@prisma/client';
import { CustomerContext, resolveActiveCustomerGrant } from '../../src/modules/client-interaction/base';
import { ParticipantAccess, resolveParticipantAccess } from '../../src/modules/client-workspace/organizationalAccessPolicy';
import { ClientPortalSession } from '../../src/middleware/clientPortalAuth';

export type Db = PrismaClient;

/** Build a ClientPortalSession for an identity (used by customer routes). */
export function sessionFor(
  clientPortalIdentityId: string,
  email: string,
  status = 'ACTIVE',
  emailVerified = true,
): ClientPortalSession {
  return {
    identityType: 'CLIENT_PORTAL',
    issuer: 'https://issuer.invalid/',
    audience: 'api',
    subject: `sub-${clientPortalIdentityId}`,
    clientPortalIdentityId,
    normalizedEmail: email,
    displayName: 'Fixture Customer',
    accountType: 'ORGANIZATION_MEMBER',
    status,
    emailVerified,
    sessionContext: 'CUSTOMER_IDENTITY_PROVIDER',
  };
}

/**
 * Resolve the ACTIVE customer grant for an authorized organizational customer
 * via the canonical resolver. Returns the CustomerContext.
 */
export async function authorizedCustomerContext(
  db: Db,
  clientPortalIdentityId: string,
  caseId: string,
  workspaceId: string,
): Promise<CustomerContext> {
  return resolveActiveCustomerGrant(clientPortalIdentityId, caseId, workspaceId, db);
}

/**
 * Resolve the full typed participant access (canonical). Returns ParticipantAccess.
 */
export async function authorizedParticipantAccess(
  db: Db,
  clientPortalIdentityId: string,
  caseId: string,
  workspaceId: string,
): Promise<ParticipantAccess> {
  return resolveParticipantAccess(clientPortalIdentityId, caseId, workspaceId, db);
}
