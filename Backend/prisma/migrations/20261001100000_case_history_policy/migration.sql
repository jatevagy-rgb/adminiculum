-- CreateTable
CREATE TABLE "case_history_policies" (
    "caseId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "draftNumber" INTEGER NOT NULL,
    "publishedNumber" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "case_history_policies_pkey" PRIMARY KEY ("caseId")
);

-- CreateTable
CREATE TABLE "case_history_policy_revisions" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdById" TEXT NOT NULL,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "publishedById" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "case_history_policy_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "case_history_policy_revisions_caseId_number_key" ON "case_history_policy_revisions"("caseId", "number");

-- AddForeignKey
ALTER TABLE "case_history_policies" ADD CONSTRAINT "case_history_policies_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_history_policy_revisions" ADD CONSTRAINT "case_history_policy_revisions_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "case_history_policies"("caseId") ON DELETE RESTRICT ON UPDATE CASCADE;
