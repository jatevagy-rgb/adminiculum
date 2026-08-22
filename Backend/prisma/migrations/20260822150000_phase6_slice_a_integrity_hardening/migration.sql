-- Phase 6 Slice A post-merge integrity hardening.
-- The original Slice A migration is intentionally immutable.

ALTER TABLE "client_facts" DROP CONSTRAINT "client_facts_money_pair_check";
ALTER TABLE "client_facts" ADD CONSTRAINT "client_facts_money_pair_check"
  CHECK (
    ("moneyAmount" IS NULL AND "moneyCurrency" IS NULL)
    OR (
      "moneyAmount" IS NOT NULL
      AND "moneyCurrency" IS NOT NULL
      AND "moneyCurrency" ~ '^[A-Z]{3}$'
    )
  );

ALTER TABLE "legal_source_captures" ADD CONSTRAINT "legal_source_captures_sourceSha256_format_check"
  CHECK ("sourceSha256" ~ '^[0-9a-f]{64}$');

ALTER TABLE "legal_source_versions" DROP CONSTRAINT "legal_source_versions_supersededById_fkey";
CREATE UNIQUE INDEX "legal_source_versions_id_legalSourceId_key"
  ON "legal_source_versions"("id", "legalSourceId");
ALTER TABLE "legal_source_versions" ADD CONSTRAINT "legal_source_versions_no_self_supersession_check"
  CHECK ("supersededById" IS NULL OR "id" <> "supersededById");
ALTER TABLE "legal_source_versions" ADD CONSTRAINT "legal_source_versions_supersededById_legalSourceId_fkey"
  FOREIGN KEY ("supersededById", "legalSourceId")
REFERENCES "legal_source_versions"("id", "legalSourceId")
  ON DELETE NO ACTION ON UPDATE CASCADE
  DEFERRABLE INITIALLY DEFERRED;
