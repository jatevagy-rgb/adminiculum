-- PUB-1: additive workforce publication snapshots for Grow ImprovementOpportunity.
-- Customer projection remains fail-closed until PUB-2. No backfill or destructive SQL.

CREATE TABLE "client_improvement_opportunity_publications" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "status" "ClientPublicationStatus" NOT NULL DEFAULT 'DRAFT',
    "currentRevisionId" TEXT,
    "preparedById" TEXT NOT NULL,
    "approvedById" TEXT,
    "publishedById" TEXT,
    "revokedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "supersededAt" TIMESTAMP(3),
    "supersededById" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_improvement_opportunity_publications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "client_improvement_opportunity_publication_revisions" (
    "id" TEXT NOT NULL,
    "publicationId" TEXT NOT NULL,
    "revisionNumber" INTEGER NOT NULL,
    "clientSafeTitle" TEXT NOT NULL,
    "clientSafeSummary" TEXT NOT NULL,
    "clientSafeDirection" TEXT,
    "sourceFingerprint" VARCHAR(64) NOT NULL,
    "audienceSnapshot" JSONB NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_improvement_opportunity_publication_revisions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "grow_opp_pub_client_status_idx" ON "client_improvement_opportunity_publications"("clientId", "status");
CREATE INDEX "grow_opp_pub_workspace_status_idx" ON "client_improvement_opportunity_publications"("workspaceId", "status");
CREATE INDEX "grow_opp_pub_opp_status_idx" ON "client_improvement_opportunity_publications"("opportunityId", "status");
CREATE UNIQUE INDEX "grow_opp_pub_opp_ws_key" ON "client_improvement_opportunity_publications"("opportunityId", "workspaceId");
CREATE INDEX "grow_opp_pub_rev_pub_idx" ON "client_improvement_opportunity_publication_revisions"("publicationId");
CREATE UNIQUE INDEX "grow_opp_pub_rev_pub_rev_key" ON "client_improvement_opportunity_publication_revisions"("publicationId", "revisionNumber");

ALTER TABLE "client_improvement_opportunity_publication_revisions" ADD CONSTRAINT "client_improvement_opportunity_publication_revisions_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "client_improvement_opportunity_publications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "client_publication_events" ADD COLUMN "improvementOpportunityPublicationId" TEXT;
CREATE INDEX "client_publication_events_improvementOpportunityPublicationId_idx" ON "client_publication_events"("improvementOpportunityPublicationId");
