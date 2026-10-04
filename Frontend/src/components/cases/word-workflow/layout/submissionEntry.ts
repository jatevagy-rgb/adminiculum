import { attachTaskSubmissionDocument, createTaskSubmissionDraft, readTaskSubmissionWorkflow } from "@/lib/taskLifecycleApi";

export const submissionEntryApi = { read: readTaskSubmissionWorkflow, create: createTaskSubmissionDraft, attach: attachTaskSubmissionDocument };

/** Explicit user action only. Never substitutes the current version or replaces an attachment. */
export async function prepareExactVersionSubmission(
  identity: { caseId: string; taskId: string; documentId: string; versionId: string },
  api = submissionEntryApi,
) {
  let workflow = await api.read(identity.taskId);
  if (workflow.task.caseId !== identity.caseId || workflow.task.id !== identity.taskId) throw new Error("A feladat nem ehhez az ügyhöz tartozik.");
  if (!workflow.activeDraft) {
    if (!workflow.permittedActions.createDraft) throw new Error("Ehhez a feladathoz most nem készíthető leadási tervezet. Nyissa meg a meglévő leadást.");
    workflow = await api.create(identity.taskId);
  }
  const draft = workflow.activeDraft;
  if (!draft) throw new Error("Nem jött létre leadási tervezet.");
  const existing = draft.documents.find((entry) => entry.documentId === identity.documentId);
  if (existing) {
    if (existing.documentVersionId !== identity.versionId) throw new Error("A tervezetben már másik verzió szerepel ebből a dokumentumból. Ellenőrizze a meglévő leadásban; nem cseréltük le.");
    return workflow;
  }
  if (!workflow.permittedActions.attachDocument) throw new Error("A verzió csatolásához nincs jogosultság. A leadási tervezet megőrződött.");
  return api.attach(identity.taskId, draft.id, identity.documentId, "PRIMARY_OUTPUT", identity.versionId);
}
