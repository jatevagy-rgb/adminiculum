-- Additive: the customer can declare that a requested document/information is
-- NOT available, inside the existing canonical ClientSubmission workflow. Uses
-- the existing SUBMITTED semantics — no enum change, no table rewrite.
--
-- customerUnavailableDeclaredAt : when the declaration was recorded (nullable)
-- customerUnavailableReasonSafe  : optional bounded customer-safe reason (nullable)
--
-- Both are nullable with no backfill; existing rows are unaffected. The office
-- sees the declaration through the existing internal submission review queue.

ALTER TABLE "client_submissions"
    ADD COLUMN "customerUnavailableReasonSafe" TEXT,
    ADD COLUMN "customerUnavailableDeclaredAt" TIMESTAMP(3);
