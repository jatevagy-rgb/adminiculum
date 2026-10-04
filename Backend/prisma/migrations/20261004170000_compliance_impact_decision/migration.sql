-- CreateEnum
CREATE TYPE "ComplianceImpactDecisionKind" AS ENUM ('NO_ACTION', 'REEVALUATE', 'REMEDIATION', 'RULE_REVIEW');

-- CreateTable
CREATE TABLE "compliance_impact_decisions" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "observationId" TEXT NOT NULL,
    "legalSourceVersionId" TEXT NOT NULL,
    "sourceRevision" VARCHAR(64) NOT NULL,
    "requestDigest" VARCHAR(64) NOT NULL,
    "kind" "ComplianceImpactDecisionKind" NOT NULL,
    "note" VARCHAR(2000) NOT NULL,
    "decidedById" TEXT NOT NULL,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "provenance" JSONB NOT NULL,
    "result" JSONB NOT NULL,

    CONSTRAINT "compliance_impact_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "compliance_impact_decisions_observationId_idx" ON "compliance_impact_decisions"("observationId");

-- CreateIndex
CREATE UNIQUE INDEX "impact_decision_client_observation_revision_key" ON "compliance_impact_decisions"("clientId", "observationId", "sourceRevision");

-- AddForeignKey
ALTER TABLE "compliance_impact_decisions" ADD CONSTRAINT "compliance_impact_decisions_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_impact_decisions" ADD CONSTRAINT "compliance_impact_decisions_observationId_fkey" FOREIGN KEY ("observationId") REFERENCES "legal_source_observations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_impact_decisions" ADD CONSTRAINT "compliance_impact_decisions_legalSourceVersionId_fkey" FOREIGN KEY ("legalSourceVersionId") REFERENCES "legal_source_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_impact_decisions" ADD CONSTRAINT "compliance_impact_decisions_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
