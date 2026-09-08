CREATE TYPE "HourlyRateMode" AS ENUM ('EXPLICIT_RATE', 'INHERIT_CLIENT');

CREATE TABLE "hourly_rate_versions" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "clientId" TEXT NOT NULL REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "caseId" TEXT REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "effectiveFrom" DATE NOT NULL,
  "currency" VARCHAR(3) NOT NULL,
  "hourlyRate" DECIMAL(19,4),
  "mode" "HourlyRateMode" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdById" TEXT NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "hourly_rate_currency_check" CHECK ("currency" = 'HUF'),
  CONSTRAINT "hourly_rate_state_check" CHECK (
    ("mode" = 'EXPLICIT_RATE' AND "hourlyRate" IS NOT NULL AND "hourlyRate" > 0 AND "hourlyRate" <> 'NaN'::numeric)
    OR ("mode" = 'INHERIT_CLIENT' AND "caseId" IS NOT NULL AND "hourlyRate" IS NULL)
  )
);

-- NULL caseId must not permit duplicate client defaults.
CREATE UNIQUE INDEX "hourly_rate_client_date_unique" ON "hourly_rate_versions"("clientId", "effectiveFrom") WHERE "caseId" IS NULL;
CREATE UNIQUE INDEX "hourly_rate_case_date_unique" ON "hourly_rate_versions"("caseId", "effectiveFrom") WHERE "caseId" IS NOT NULL;
CREATE INDEX "hourly_rate_versions_clientId_caseId_effectiveFrom_idx" ON "hourly_rate_versions"("clientId", "caseId", "effectiveFrom");

CREATE FUNCTION enforce_hourly_rate_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Hourly rate history is append-only' USING ERRCODE = '23514';
  END IF;
  IF NEW."caseId" IS NOT NULL THEN
    -- Serialize against a concurrent reassignment of the case to another client.
    PERFORM 1 FROM "cases" WHERE "id" = NEW."caseId" AND "clientId" = NEW."clientId" FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Rate case must belong to client' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "hourly_rate_history_guard" BEFORE INSERT OR UPDATE OR DELETE ON "hourly_rate_versions"
FOR EACH ROW EXECUTE FUNCTION enforce_hourly_rate_history();

CREATE FUNCTION protect_case_rate_client() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."clientId" IS DISTINCT FROM OLD."clientId" AND EXISTS (
    SELECT 1 FROM "hourly_rate_versions" WHERE "caseId" = OLD."id"
  ) THEN
    RAISE EXCEPTION 'Case with rate history cannot change client' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "case_rate_client_guard" BEFORE UPDATE OF "clientId" ON "cases"
FOR EACH ROW EXECUTE FUNCTION protect_case_rate_client();
