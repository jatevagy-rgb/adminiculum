-- CreateMigration: add_case_collaborators
-- Adding CaseCollaborator model for case collaborator tracking
BEGIN;

CREATE TABLE "case_collaborators" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "caseId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'COLLABORATOR',
    "addedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT "case_collaborators_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "case_collaborators_caseId_userId_key" UNIQUE ("caseId", "userId"),
    CONSTRAINT "case_collaborators_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "case_collaborators_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "case_collaborators_caseId_index" ON "case_collaborators"("caseId");
CREATE INDEX "case_collaborators_userId_index" ON "case_collaborators"("userId");

COMMIT;