-- Additive only. Historical acceptance is deliberately not inferred/backfilled.
ALTER TABLE "client_submissions" ADD COLUMN "complianceAcceptance" JSONB;
ALTER TABLE "client_submission_files" ADD COLUMN "acceptedDocumentVersionId" TEXT;
ALTER TABLE "client_submission_files" ADD CONSTRAINT "submission_file_accepted_version_fk"
  FOREIGN KEY ("acceptedDocumentVersionId") REFERENCES "document_versions"("id") ON DELETE RESTRICT;
