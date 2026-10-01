-- CreateTable
CREATE TABLE "anonymized_source_bindings" (
    "artifactId" TEXT NOT NULL,
    "sourceDocumentId" TEXT NOT NULL,
    "sourceDocumentVersionId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "artifactRevision" INTEGER NOT NULL DEFAULT 1,
    "sourceDigest" TEXT NOT NULL,
    "profileDigest" TEXT NOT NULL,
    "artifactDigest" TEXT NOT NULL,
    "rulesRevision" TEXT NOT NULL,
    "scanProvider" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "anonymized_source_bindings_pkey" PRIMARY KEY ("artifactId")
);

-- AddForeignKey
ALTER TABLE "anonymized_source_bindings" ADD CONSTRAINT "anonymized_source_bindings_artifactId_fkey" FOREIGN KEY ("artifactId") REFERENCES "anonymous_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anonymized_source_bindings" ADD CONSTRAINT "anonymized_source_bindings_sourceDocumentId_sourceDocument_fkey" FOREIGN KEY ("sourceDocumentId", "sourceDocumentVersionId") REFERENCES "document_versions"("documentId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anonymized_source_bindings" ADD CONSTRAINT "anonymized_source_bindings_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anonymized_source_bindings" ADD CONSTRAINT "anonymized_source_bindings_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- A bound artifact is immutable; response/rehydration fields remain independently writable.
CREATE FUNCTION wf10_bound_artifact_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM anonymized_source_bindings WHERE "artifactId"=OLD.id) AND
 (NEW.content IS DISTINCT FROM OLD.content OR NEW."redactedItems" IS DISTINCT FROM OLD."redactedItems" OR NEW."sourceDocId" IS DISTINCT FROM OLD."sourceDocId" OR NEW."caseId" IS DISTINCT FROM OLD."caseId") THEN
 RAISE EXCEPTION 'Bound anonymization requires a new artifact' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER wf10_bound_artifact_immutable BEFORE UPDATE ON anonymous_documents FOR EACH ROW EXECUTE FUNCTION wf10_bound_artifact_immutable();
