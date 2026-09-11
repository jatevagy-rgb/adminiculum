-- Client lifecycle archive (additive, reversible): an archived client is
-- excluded from normal active lists/lookups while every linked record —
-- cases, documents, communications, billing, portal identity — is preserved.
ALTER TABLE "clients" ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "clients" ADD COLUMN "archivedById" TEXT;
