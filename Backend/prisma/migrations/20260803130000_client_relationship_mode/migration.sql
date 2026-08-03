CREATE TYPE "ClientRelationshipMode" AS ENUM ('PORTAL_CENTRIC', 'EMAIL_CENTRIC', 'CONNECTED_SYSTEM');

ALTER TABLE "clients"
  ADD COLUMN "relationshipMode" "ClientRelationshipMode" NOT NULL DEFAULT 'PORTAL_CENTRIC',
  ADD COLUMN "portalAccessEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "connectedSystemState" VARCHAR(80);
