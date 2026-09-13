-- ============================================================================
-- GROW PRODUCT COMPLETION (additive only)
-- Completes the evidence-sufficiency state set (6/6), the research-evidence
-- metadata contract (origin / bounded claim / evidence type / supported
-- interventions + outcomes), and stores the selected intervention codes on the
-- recommendation candidate. All new columns are nullable or have defaults, so
-- legacy rows remain valid. No destructive migration.
-- ============================================================================

-- AddEnumValue (SufficiencyDecision 4 -> 6)
ALTER TYPE "SufficiencyDecision" ADD VALUE IF NOT EXISTS 'CONFLICTING_EVIDENCE';
ALTER TYPE "SufficiencyDecision" ADD VALUE IF NOT EXISTS 'HUMAN_DOMAIN_REVIEW';

-- AlterTable (research_evidence metadata contract)
ALTER TABLE "research_evidence"
  ADD COLUMN "origin" TEXT,
  ADD COLUMN "boundedClaim" TEXT,
  ADD COLUMN "evidenceType" TEXT,
  ADD COLUMN "supportedInterventions" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "supportedOutcomes" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable (recommendation candidate intervention codes)
ALTER TABLE "recommendation_candidates"
  ADD COLUMN "interventionCodes" TEXT[] DEFAULT ARRAY[]::TEXT[];
