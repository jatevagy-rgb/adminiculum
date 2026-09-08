-- Additive client-side task requester provenance. Legacy tasks remain valid.
ALTER TABLE "tasks" ADD COLUMN "requestedByOrganizationPersonId" TEXT;

CREATE INDEX "tasks_requestedByOrganizationPersonId_idx"
  ON "tasks"("requestedByOrganizationPersonId");

ALTER TABLE "tasks"
  ADD CONSTRAINT "tasks_requestedByOrganizationPersonId_fkey"
  FOREIGN KEY ("requestedByOrganizationPersonId")
  REFERENCES "organization_persons"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;
