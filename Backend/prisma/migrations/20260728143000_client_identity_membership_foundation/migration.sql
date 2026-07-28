-- Client identity, registration and organization membership foundation.
-- Additive only: no credential, password hash, reset code, access token, or refresh token storage.

CREATE TYPE "ClientPortalIdentityProvider" AS ENUM ('ENTRA_EXTERNAL_ID', 'OTHER_OIDC');
CREATE TYPE "ClientPortalAccountType" AS ENUM ('INDIVIDUAL', 'ORGANIZATION_MEMBER');
CREATE TYPE "ClientPortalIdentityStatus" AS ENUM ('REGISTERED', 'EMAIL_VERIFICATION_PENDING', 'MEMBERSHIP_PENDING', 'ACTIVE', 'SUSPENDED', 'REVOKED');
CREATE TYPE "ClientOrganizationGroupStatus" AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE "ClientOrganizationMembershipRequestStatus" AS ENUM ('DRAFT', 'EMAIL_VERIFICATION_PENDING', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'CANCELLED');
CREATE TYPE "ClientOrganizationMembershipStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'REVOKED');
CREATE TYPE "ClientPortalInvitationStatus" AS ENUM ('ACTIVE', 'USED', 'REVOKED', 'EXPIRED');

ALTER TYPE "ClientActionRequestType" ADD VALUE IF NOT EXISTS 'DATA_FORM';
ALTER TYPE "ClientActionRequestType" ADD VALUE IF NOT EXISTS 'QUESTION_RESPONSE';
ALTER TYPE "ClientActionRequestType" ADD VALUE IF NOT EXISTS 'CORRECTION_REQUEST';
ALTER TYPE "ClientActionRequestType" ADD VALUE IF NOT EXISTS 'MISSING_DOCUMENT_REQUEST';

ALTER TABLE "client_portal_grants" ADD COLUMN "clientPortalIdentityId" TEXT;
ALTER TABLE "client_portal_grants" ALTER COLUMN "clientUserId" DROP NOT NULL;

CREATE TABLE "client_portal_identities" (
  "id" TEXT NOT NULL,
  "provider" "ClientPortalIdentityProvider" NOT NULL,
  "issuer" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "normalizedEmail" TEXT NOT NULL,
  "emailVerifiedAt" TIMESTAMP(3),
  "displayName" TEXT NOT NULL,
  "accountType" "ClientPortalAccountType" NOT NULL,
  "status" "ClientPortalIdentityStatus" NOT NULL DEFAULT 'EMAIL_VERIFICATION_PENDING',
  "lastLoginAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "client_portal_identities_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "client_organization_groups" (
  "id" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "descriptionSafe" TEXT,
  "status" "ClientOrganizationGroupStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "client_organization_groups_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "client_organization_membership_requests" (
  "id" TEXT NOT NULL,
  "clientPortalIdentityId" TEXT NOT NULL,
  "requestedClientId" TEXT,
  "requestedOrganizationName" TEXT,
  "requestedGroupId" TEXT,
  "requestedGroupName" TEXT,
  "corporateEmail" TEXT,
  "roleDescriptionSafe" TEXT,
  "status" "ClientOrganizationMembershipRequestStatus" NOT NULL DEFAULT 'DRAFT',
  "submittedAt" TIMESTAMP(3),
  "reviewedById" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "rejectionReasonSafe" TEXT,
  "invitationId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "client_organization_membership_requests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "client_organization_memberships" (
  "id" TEXT NOT NULL,
  "clientPortalIdentityId" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "groupId" TEXT,
  "status" "ClientOrganizationMembershipStatus" NOT NULL DEFAULT 'ACTIVE',
  "approvedFromRequestId" TEXT NOT NULL,
  "approvedById" TEXT NOT NULL,
  "approvedAt" TIMESTAMP(3) NOT NULL,
  "suspendedAt" TIMESTAMP(3),
  "suspendedById" TEXT,
  "revokedAt" TIMESTAMP(3),
  "revokedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "client_organization_memberships_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "client_portal_invitations" (
  "id" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "groupId" TEXT,
  "intendedEmail" TEXT,
  "tokenHash" TEXT NOT NULL,
  "status" "ClientPortalInvitationStatus" NOT NULL DEFAULT 'ACTIVE',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdById" TEXT NOT NULL,
  "usedByIdentityId" TEXT,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "client_portal_invitations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "client_portal_identities_issuer_subject_key" ON "client_portal_identities"("issuer", "subject");
CREATE UNIQUE INDEX "client_portal_identities_normalizedEmail_key" ON "client_portal_identities"("normalizedEmail");
CREATE INDEX "client_portal_identities_status_accountType_idx" ON "client_portal_identities"("status", "accountType");

CREATE UNIQUE INDEX "client_organization_groups_clientId_name_key" ON "client_organization_groups"("clientId", "name");
CREATE INDEX "client_organization_groups_clientId_status_idx" ON "client_organization_groups"("clientId", "status");

CREATE INDEX "client_organization_membership_requests_clientPortalIdentityId_status_idx" ON "client_organization_membership_requests"("clientPortalIdentityId", "status");
CREATE INDEX "client_organization_membership_requests_requestedClientId_status_idx" ON "client_organization_membership_requests"("requestedClientId", "status");
CREATE INDEX "client_organization_membership_requests_requestedGroupId_idx" ON "client_organization_membership_requests"("requestedGroupId");
CREATE INDEX "client_organization_membership_requests_invitationId_idx" ON "client_organization_membership_requests"("invitationId");

CREATE UNIQUE INDEX "client_organization_memberships_approvedFromRequestId_key" ON "client_organization_memberships"("approvedFromRequestId");
CREATE INDEX "client_organization_memberships_clientPortalIdentityId_status_idx" ON "client_organization_memberships"("clientPortalIdentityId", "status");
CREATE INDEX "client_organization_memberships_clientId_status_idx" ON "client_organization_memberships"("clientId", "status");
CREATE INDEX "client_organization_memberships_groupId_status_idx" ON "client_organization_memberships"("groupId", "status");

CREATE UNIQUE INDEX "client_portal_invitations_tokenHash_key" ON "client_portal_invitations"("tokenHash");
CREATE INDEX "client_portal_invitations_clientId_status_idx" ON "client_portal_invitations"("clientId", "status");
CREATE INDEX "client_portal_invitations_groupId_idx" ON "client_portal_invitations"("groupId");
CREATE INDEX "client_portal_invitations_intendedEmail_status_idx" ON "client_portal_invitations"("intendedEmail", "status");
CREATE INDEX "client_portal_grants_clientPortalIdentityId_status_idx" ON "client_portal_grants"("clientPortalIdentityId", "status");
CREATE UNIQUE INDEX "client_portal_one_active_identity_grant_idx" ON "client_portal_grants"("clientPortalIdentityId", "clientId", "caseId") WHERE "status" = 'ACTIVE' AND "clientPortalIdentityId" IS NOT NULL;
