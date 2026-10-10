import type { TaskDocumentsResponse } from "./api";
import type { TaskSubmissionWorkflow } from "./taskLifecycleApi";

/** Keep general task links and immutable submitted outputs on separate sources. */
export function selectTaskDocumentSections(
  linkedDocuments: TaskDocumentsResponse["documents"],
  workflow: Pick<TaskSubmissionWorkflow, "submissions"> | null,
) {
  return {
    linkedDocuments,
    submittedOutputs: workflow?.submissions
      .filter((submission) => Boolean(submission.submittedAt))
      .flatMap((submission) => submission.documents.map((document) => ({ submission, document }))) || [],
  };
}
