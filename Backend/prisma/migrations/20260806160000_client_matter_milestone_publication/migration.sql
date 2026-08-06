-- Customer-safe milestone publication.
--
-- Additive only. Stores the mutable workforce milestone draft on the matter
-- publication, and the immutable published customer-safe milestone snapshot plus
-- derived progress on the immutable publication revision. No existing row is
-- altered and no customer visibility is broadened: a draft is never
-- customer-visible, and progress is derived only from published milestone
-- weights inside an immutable revision.

ALTER TABLE "client_matter_publications"
  ADD COLUMN "milestoneDraftSnapshot" JSONB;

ALTER TABLE "client_matter_publication_revisions"
  ADD COLUMN "milestonesSnapshot" JSONB,
  ADD COLUMN "progressPercentage" INTEGER;
