-- CreateTable
CREATE TABLE "case_client_owners" (
    "caseId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "personId" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "updatedById" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "case_client_owners_pkey" PRIMARY KEY ("caseId")
);

-- CreateTable
CREATE TABLE "case_client_owner_events" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "personId" TEXT,
    "revision" INTEGER NOT NULL,
    "actorId" TEXT,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "case_client_owner_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "case_client_owner_events_caseId_revision_key" ON "case_client_owner_events"("caseId", "revision");

-- AddForeignKey
ALTER TABLE "case_client_owners" ADD CONSTRAINT "case_client_owners_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_client_owners" ADD CONSTRAINT "case_client_owners_personId_fkey" FOREIGN KEY ("personId") REFERENCES "organization_persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_client_owner_events" ADD CONSTRAINT "case_client_owner_events_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- Preserve assignment attribution while invalidating the current pointer on scope change.
CREATE FUNCTION wf10_invalidate_case_owner() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE changed record;
BEGIN
  IF NEW."clientId" IS DISTINCT FROM OLD."clientId" THEN
    UPDATE case_client_owners SET "personId"=NULL,"clientId"=NEW."clientId",revision=revision+1,"updatedAt"=now()
      WHERE "caseId"=NEW.id RETURNING * INTO changed;
    IF FOUND THEN
      INSERT INTO case_client_owner_events(id,"caseId","clientId","personId",revision,"actorId",reason,"createdAt")
      VALUES (gen_random_uuid()::text,changed."caseId",changed."clientId",NULL,changed.revision,NULL,'CASE_CLIENT_CHANGED',now());
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER wf10_case_owner_scope AFTER UPDATE OF "clientId" ON cases FOR EACH ROW EXECUTE FUNCTION wf10_invalidate_case_owner();
CREATE FUNCTION wf10_invalidate_person_owner() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE changed record;
BEGIN
  IF TG_OP='DELETE' OR NEW."clientId" IS DISTINCT FROM OLD."clientId" OR NEW."employmentStatus" IS DISTINCT FROM OLD."employmentStatus" OR NEW."startDate" IS DISTINCT FROM OLD."startDate" OR NEW."endDate" IS DISTINCT FROM OLD."endDate" THEN
    FOR changed IN UPDATE case_client_owners SET "personId"=NULL,revision=revision+1,"updatedAt"=now() WHERE "personId"=OLD.id RETURNING * LOOP
      INSERT INTO case_client_owner_events(id,"caseId","clientId","personId",revision,"actorId",reason,"createdAt")
      VALUES (gen_random_uuid()::text,changed."caseId",changed."clientId",NULL,changed.revision,NULL,'PERSON_ELIGIBILITY_CHANGED',now());
    END LOOP;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER wf10_person_owner_scope BEFORE UPDATE OF "clientId","employmentStatus","startDate","endDate" OR DELETE ON organization_persons FOR EACH ROW EXECUTE FUNCTION wf10_invalidate_person_owner();
ALTER TABLE case_client_owners ADD CONSTRAINT case_client_owners_revision CHECK(revision>0);
