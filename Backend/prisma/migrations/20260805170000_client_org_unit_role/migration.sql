-- Organizational-unit role on organization membership.
--
-- Additive only. Records a person's responsibility WITHIN an organizational unit
-- (member / contact / approver / manager) separately from their portal
-- membership role and from any case access. No existing row is altered beyond
-- receiving the MEMBER default, and no access is broadened: a unit role grants
-- nothing on its own.

CREATE TYPE "ClientOrganizationUnitRole" AS ENUM ('MEMBER', 'CONTACT', 'APPROVER', 'MANAGER');

ALTER TABLE "client_organization_memberships"
  ADD COLUMN "unitRole" "ClientOrganizationUnitRole" NOT NULL DEFAULT 'MEMBER';
