import type { OfficeDocumentFamilyMember } from "@/lib/complianceCenterApi";

export async function resolveComplianceDocumentUrl(
  member: OfficeDocumentFamilyMember,
  exactVersion: boolean,
  reads: {
    document: (id: string) => Promise<{ id?: string; caseId: string } | null>;
    case: (id: string) => Promise<{ id: string; clientId?: string }>;
    versions: (id: string) => Promise<{ documentId: string; versions: Array<{ id: string; documentId: string; versionNumber: number }> }>;
  },
): Promise<string | null> {
  const document = await reads.document(member.documentId);
  if (!document || document.id !== member.documentId || !document.caseId) return null;
  const owner = await reads.case(document.caseId);
  if (owner.id !== document.caseId || owner.clientId !== member.clientId) return null;
  if (exactVersion) {
    const result = await reads.versions(document.id);
    if (result.documentId !== document.id || !result.versions.some((version) =>
      version.id === member.documentVersionId &&
      version.documentId === document.id &&
      version.versionNumber === member.version
    )) return null;
  }
  const params = new URLSearchParams({ documentId: document.id });
  if (exactVersion) params.set("versionId", member.documentVersionId);
  return `/cases/${encodeURIComponent(owner.id)}/documents?${params.toString()}`;
}
