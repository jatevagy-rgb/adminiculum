"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AdminButton, AdminStatusPill } from "@/components/adminiculum/ui";
import { CompactState, SafePanelError } from "@/components/adminiculum/OperationalPrimitives";
import { WorkflowDialog } from "@/components/tasks/WorkflowDialog";
import { getCaseDocuments, getTimeEntries, type DocumentItem, type TimeEntry } from "@/lib/api";
import {
  StableMutationAttempt,
  attachTaskSubmissionDocument,
  attachTaskSubmissionTimeEntry,
  createTaskSubmissionDraft,
  detachTaskSubmissionDocument,
  detachTaskSubmissionTimeEntry,
  isUncertainMutationError,
  listEligibleTaskReviewers,
  readTaskSubmissionWorkflow,
  recordTaskExternalCompletion,
  reviseTaskSubmission,
  submitTaskSubmissionForReview,
  updateTaskSubmissionDraft,
  type EligibleReviewer,
  type SubmissionReadinessCode,
  type TaskLifecycleListItem,
  type TaskSubmission,
  type TaskSubmissionWorkflow,
} from "@/lib/taskLifecycleApi";
import {
  ATTENTION_LABELS,
  DOCUMENT_ROLE_LABELS,
  EXTERNAL_ACTION_LABELS,
  READINESS_COMPLETED_LABELS,
  READINESS_LABELS,
  WARNING_LABELS,
  formatDate,
  formatDateTime,
  formatMinutes,
  latestReturnedRevision,
  nextActionLabel,
  nextActorLabel,
  PRIORITY_LABELS,
  submissionDisabledReason,
  submissionStatusLabel,
  taskStatusLabel,
  taskWorkflowErrorMessage,
} from "@/lib/taskWorkflowPresentation";

type DraftForm = {
  workSummary: string;
  remainingIssues: string;
  reviewerNote: string;
  requestedAttention: string;
  assignedReviewerId: string;
  externalActionRequired: boolean;
  externalActionType: string;
  zeroTimeConfirmed: boolean;
};

const EMPTY_FORM: DraftForm = {
  workSummary: "",
  remainingIssues: "",
  reviewerNote: "",
  requestedAttention: "",
  assignedReviewerId: "",
  externalActionRequired: false,
  externalActionType: "",
  zeroTimeConfirmed: false,
};

const CORE_READINESS_CODES: SubmissionReadinessCode[] = [
  "WORK_SUMMARY_REQUIRED",
  "REVIEW_ATTENTION_REQUIRED",
  "REVIEWER_REQUIRED",
  "OUTPUT_REQUIRED",
  "TIME_ENTRY_OR_ZERO_CONFIRMATION_REQUIRED",
  "TASK_STATE_NOT_SUBMITTABLE",
];

const reviewerPreferenceLabels: Record<EligibleReviewer["preference"], string> = {
  TASK_SUPERVISOR: "Feladat kijelölője",
  CASE_RESPONSIBLE_LAWYER: "Ügy felelős ügyvédje",
  CASE_CREATOR: "Ügy létrehozója",
  CASE_COLLABORATOR: "Ügy résztvevője",
  PRIVILEGED: "Kijelölt vezető reviewer",
};

const DRAWER_FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "a[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function formFromDraft(draft: TaskSubmission | null): DraftForm {
  if (!draft) return EMPTY_FORM;
  return {
    workSummary: draft.workSummary || "",
    remainingIssues: draft.remainingIssues || "",
    reviewerNote: draft.reviewerNote || "",
    requestedAttention: draft.requestedAttention || "",
    assignedReviewerId: draft.assignedReviewer?.id || "",
    externalActionRequired: draft.externalActionRequired,
    externalActionType: draft.externalActionType || "",
    zeroTimeConfirmed: draft.zeroTimeConfirmed,
  };
}

function submissionTone(status?: string | null): "green" | "gold" | "burgundy" | "neutral" | "blue" {
  const value = String(status || "").toUpperCase();
  if (value === "APPROVED") return "green";
  if (value === "SUBMITTED") return "gold";
  if (value === "RETURNED") return "burgundy";
  if (value === "DRAFT") return "blue";
  return "neutral";
}

export function TaskSubmissionWorkspace({
  item,
  onClose,
  onWorkflowChanged,
}: {
  item: TaskLifecycleListItem;
  onClose: () => void;
  onWorkflowChanged: () => Promise<void> | void;
}) {
  const [workflow, setWorkflow] = useState<TaskSubmissionWorkflow | null>(null);
  const [reviewers, setReviewers] = useState<EligibleReviewer[]>([]);
  const [reviewerDirectoryAvailable, setReviewerDirectoryAvailable] = useState(true);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [supportWarnings, setSupportWarnings] = useState<string[]>([]);
  const [form, setForm] = useState<DraftForm>(EMPTY_FORM);
  const [isDirty, setIsDirty] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "failed">("saved");
  const [documentId, setDocumentId] = useState("");
  const [documentRole, setDocumentRole] = useState("PRIMARY_OUTPUT");
  const [timeEntryId, setTimeEntryId] = useState("");
  const [selectedRevisionId, setSelectedRevisionId] = useState<string | null>(null);
  const [submitDialogOpen, setSubmitDialogOpen] = useState(false);
  const [externalDialogOpen, setExternalDialogOpen] = useState(false);
  const submitAttempt = useRef(new StableMutationAttempt("submit"));
  const reviseAttempt = useRef(new StableMutationAttempt("revise"));
  const externalAttempt = useRef(new StableMutationAttempt("external-completion"));
  const drawerRef = useRef<HTMLElement | null>(null);
  const priorFocusRef = useRef<HTMLElement | null>(null);

  const applyWorkflow = useCallback((next: TaskSubmissionWorkflow) => {
    setWorkflow(next);
    setForm(formFromDraft(next.activeDraft));
    setIsDirty(false);
    setSaveState("saved");
    setSelectedRevisionId((current) => current || next.activeDraft?.id || next.latestSubmittedRevision?.id || next.submissions[0]?.id || null);
  }, []);

  const loadWorkflow = useCallback(async (): Promise<TaskSubmissionWorkflow | null> => {
    setIsLoading(true);
    setError(null);
    try {
      const next = await readTaskSubmissionWorkflow(item.id);
      applyWorkflow(next);
      const [reviewerResult, documentResult, timeResult] = await Promise.allSettled([
        listEligibleTaskReviewers(item.id),
        getCaseDocuments(next.task.caseId),
        next.task.matterId ? getTimeEntries({ matterId: next.task.matterId }) : Promise.resolve([] as TimeEntry[]),
      ]);
      const reviewerAvailable = reviewerResult.status === "fulfilled";
      setReviewerDirectoryAvailable(reviewerAvailable);
      setReviewers(reviewerAvailable ? reviewerResult.value : []);
      setDocuments(documentResult.status === "fulfilled" ? documentResult.value : []);
      setTimeEntries(timeResult.status === "fulfilled" ? timeResult.value : []);
      setSupportWarnings([
        ...(reviewerAvailable ? [] : ["A jogosult reviewerek listája most nem tölthető be. A már mentett reviewer állapotát a backend továbbra is ellenőrzi."]),
        ...(documentResult.status === "fulfilled" ? [] : ["Az ügy dokumentumlistája most nem tölthető be; kapcsolás előtt frissítse az adatokat."]),
        ...(timeResult.status === "fulfilled" ? [] : ["A kapcsolható munkaórák listája most nem tölthető be; kapcsolás előtt frissítse az adatokat."]),
      ]);
      return next;
    } catch (loadError) {
      setError(taskWorkflowErrorMessage(loadError));
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [applyWorkflow, item.id]);

  useEffect(() => {
    setSelectedRevisionId(null);
    void loadWorkflow();
  }, [loadWorkflow]);

  useEffect(() => {
    priorFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    drawerRef.current?.querySelector<HTMLElement>(DRAWER_FOCUSABLE_SELECTOR)?.focus();
    return () => priorFocusRef.current?.focus();
  }, []);

  useEffect(() => {
    if (submitDialogOpen || externalDialogOpen) return;
    const drawer = drawerRef.current;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busyAction) {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !drawer) return;
      const focusable = Array.from(drawer.querySelectorAll<HTMLElement>(DRAWER_FOCUSABLE_SELECTOR));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [busyAction, externalDialogOpen, onClose, submitDialogOpen]);

  const draft = workflow?.activeDraft || null;
  const displayedRevision = useMemo(
    () => workflow?.submissions.find((submission) => submission.id === selectedRevisionId) || draft || workflow?.latestSubmittedRevision || null,
    [draft, selectedRevisionId, workflow],
  );
  const selectedReviewerEligible = !form.assignedReviewerId
    || !reviewerDirectoryAvailable
    || reviewers.some((reviewer) => reviewer.id === form.assignedReviewerId);
  const linkedDocumentIds = new Set(draft?.documents.map((entry) => entry.documentId) || []);
  const eligibleDocuments = documents.filter((entry) => !linkedDocumentIds.has(entry.id));
  const linkedTimeIds = new Set(draft?.timeEntries.map((entry) => entry.timeEntryId) || []);
  const eligibleTimeEntries = timeEntries.filter((entry) => {
    if (linkedTimeIds.has(entry.id)) return false;
    return !entry.taskId || entry.taskId === item.id;
  });
  const returned = workflow ? latestReturnedRevision(workflow.submissions) : null;
  const latestApproved = workflow?.submissions.find((submission) => String(submission.status).toUpperCase() === "APPROVED") || null;
  const submitDisabledReason = workflow?.readiness
    ? submissionDisabledReason(
      workflow.readiness.ready,
      isDirty,
      reviewerDirectoryAvailable,
      selectedReviewerEligible,
      workflow.permittedActions.submit,
    )
    : "A backend readiness még nem érhető el.";

  const updateForm = <K extends keyof DraftForm>(key: K, value: DraftForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setIsDirty(true);
    if (saveState === "failed") setSaveState("saved");
  };

  const saveDraft = async () => {
    if (!workflow?.activeDraft || !workflow.permittedActions.editDraft) return;
    setBusyAction("save");
    setSaveState("saving");
    setError(null);
    try {
      const next = await updateTaskSubmissionDraft(item.id, workflow.activeDraft.id, {
        workSummary: form.workSummary,
        remainingIssues: form.remainingIssues,
        reviewerNote: form.reviewerNote,
        requestedAttention: form.requestedAttention || null,
        assignedReviewerId: form.assignedReviewerId || undefined,
        externalActionRequired: form.externalActionRequired,
        externalActionType: form.externalActionRequired ? form.externalActionType || null : null,
        zeroTimeConfirmed: form.zeroTimeConfirmed,
      });
      applyWorkflow(next);
      await onWorkflowChanged();
    } catch (saveError) {
      setSaveState("failed");
      setError(taskWorkflowErrorMessage(saveError));
    } finally {
      setBusyAction(null);
    }
  };

  const createDraft = async () => {
    setBusyAction("create-draft");
    setError(null);
    try {
      const next = await createTaskSubmissionDraft(item.id);
      applyWorkflow(next);
      await onWorkflowChanged();
    } catch (actionError) {
      setError(taskWorkflowErrorMessage(actionError));
    } finally {
      setBusyAction(null);
    }
  };

  const linkDocument = async () => {
    if (!draft || !documentId) return;
    setBusyAction("attach-document");
    setError(null);
    try {
      const next = await attachTaskSubmissionDocument(item.id, draft.id, documentId, documentRole);
      applyWorkflow(next);
      setDocumentId("");
      await onWorkflowChanged();
    } catch (actionError) {
      setError(taskWorkflowErrorMessage(actionError));
    } finally {
      setBusyAction(null);
    }
  };

  const unlinkDocument = async (linkedDocumentId: string) => {
    if (!draft) return;
    setBusyAction(`detach-document:${linkedDocumentId}`);
    setError(null);
    try {
      applyWorkflow(await detachTaskSubmissionDocument(item.id, draft.id, linkedDocumentId));
      await onWorkflowChanged();
    } catch (actionError) {
      setError(taskWorkflowErrorMessage(actionError));
    } finally {
      setBusyAction(null);
    }
  };

  const linkTimeEntry = async () => {
    if (!draft || !timeEntryId) return;
    setBusyAction("attach-time");
    setError(null);
    try {
      const next = await attachTaskSubmissionTimeEntry(item.id, draft.id, timeEntryId);
      applyWorkflow(next);
      setTimeEntryId("");
      await onWorkflowChanged();
    } catch (actionError) {
      setError(taskWorkflowErrorMessage(actionError));
    } finally {
      setBusyAction(null);
    }
  };

  const unlinkTimeEntry = async (linkedTimeEntryId: string) => {
    if (!draft) return;
    setBusyAction(`detach-time:${linkedTimeEntryId}`);
    setError(null);
    try {
      applyWorkflow(await detachTaskSubmissionTimeEntry(item.id, draft.id, linkedTimeEntryId));
      await onWorkflowChanged();
    } catch (actionError) {
      setError(taskWorkflowErrorMessage(actionError));
    } finally {
      setBusyAction(null);
    }
  };

  const submitForReview = async () => {
    if (!draft) return;
    setBusyAction("submit");
    setError(null);
    try {
      const result = await submitTaskSubmissionForReview(item.id, draft.id, submitAttempt.current.key());
      applyWorkflow(result.workflow);
      submitAttempt.current.complete();
      setSubmitDialogOpen(false);
      await onWorkflowChanged();
    } catch (actionError) {
      setError(taskWorkflowErrorMessage(actionError));
      if (isUncertainMutationError(actionError)) {
        const reread = await loadWorkflow();
        if (reread && !reread.activeDraft) {
          submitAttempt.current.complete();
          setSubmitDialogOpen(false);
          await onWorkflowChanged();
        }
      }
    } finally {
      setBusyAction(null);
    }
  };

  const createRevision = async () => {
    if (!returned) return;
    reviseAttempt.current.key();
    setBusyAction("revise");
    setError(null);
    try {
      await reviseTaskSubmission(item.id, returned.id, reviseAttempt.current.key());
      reviseAttempt.current.complete();
      await loadWorkflow();
      await onWorkflowChanged();
    } catch (actionError) {
      setError(taskWorkflowErrorMessage(actionError));
      if (isUncertainMutationError(actionError)) await loadWorkflow();
    } finally {
      setBusyAction(null);
    }
  };

  const recordExternalCompletion = async () => {
    if (!latestApproved?.externalActionType) return;
    setBusyAction("external-completion");
    setError(null);
    try {
      await recordTaskExternalCompletion(item.id, latestApproved.id, externalAttempt.current.key(), {
        actionType: latestApproved.externalActionType,
      });
      externalAttempt.current.complete();
      setExternalDialogOpen(false);
      await loadWorkflow();
      await onWorkflowChanged();
    } catch (actionError) {
      setError(taskWorkflowErrorMessage(actionError));
      if (isUncertainMutationError(actionError)) await loadWorkflow();
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/20" role="presentation">
      <section ref={drawerRef} role="dialog" aria-modal="true" aria-labelledby="task-workspace-title" className="h-full w-full max-w-[860px] overflow-y-auto border-l border-[var(--adm-border)] bg-[var(--adm-surface)] shadow-2xl">
        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-[var(--adm-border)] bg-white px-5 py-4">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--adm-text-muted)]">Feladat és Leadás</p>
            <h2 id="task-workspace-title" className="mt-1 truncate font-serif text-[24px] text-[var(--adm-text)]">{item.title}</h2>
            <p className="mt-1 text-[11px] text-[var(--adm-text-muted)]">{item.case.caseNumber} · {item.case.clientName}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded px-2 text-2xl text-[var(--adm-text-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2" aria-label="Feladat munkatér bezárása">×</button>
        </header>

        <div className="space-y-4 p-4 sm:p-5">
          {error ? <div role="alert" aria-live="assertive"><CompactState tone="error" title="A művelet nem fejeződött be." detail={error} action={<AdminButton size="sm" variant="neutral" onClick={() => void loadWorkflow()}>Adatok újratöltése</AdminButton>} /></div> : null}
          {supportWarnings.length > 0 ? <div role="status" className="rounded border border-[var(--adm-ochre-500)]/40 bg-[var(--adm-sand-100)] px-3 py-2 text-[11px] text-[var(--adm-text)]"><ul className="list-disc space-y-1 pl-4">{supportWarnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></div> : null}
          {isLoading ? <CompactState title="A feladat munkatere betöltődik…" /> : null}
          {!isLoading && !workflow ? <SafePanelError onRetry={() => void loadWorkflow()} /> : null}

          {workflow ? (
            <>
              <section className="rounded-[var(--adm-radius-lg)] border border-[var(--adm-border)] bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">Feladatállapot</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <AdminStatusPill tone="blue">{taskStatusLabel(workflow.task.status)}</AdminStatusPill>
                      <AdminStatusPill tone={submissionTone(draft?.status || workflow.latestSubmittedRevision?.status)}>
                        {submissionStatusLabel(draft?.status || workflow.latestSubmittedRevision?.status, draft?.revisionNumber || workflow.latestSubmittedRevision?.revisionNumber)}
                      </AdminStatusPill>
                    </div>
                  </div>
                  <div className="text-right text-[11px] text-[var(--adm-text-muted)]">
                    <p>Következő lépés</p>
                    <p className="mt-1 font-semibold text-[var(--adm-text)]">{nextActionLabel(workflow.nextActionCode) || "Nincs biztonságos művelet"}</p>
                  </div>
                </div>
                <dl className="mt-4 grid gap-x-5 gap-y-2 text-[11px] sm:grid-cols-2 lg:grid-cols-3">
                  <div><dt className="text-[var(--adm-text-muted)]">Ügy / ügyfél</dt><dd className="mt-0.5 font-semibold"><Link href={`/cases/${workflow.task.case.id}`} className="hover:underline">{workflow.task.case.caseNumber}</Link> · {workflow.task.case.client.name}</dd></div>
                  <div><dt className="text-[var(--adm-text-muted)]">Felelős</dt><dd className="mt-0.5 font-semibold">{workflow.task.assignee?.displayName || "Nincs kijelölve"}</dd></div>
                  <div><dt className="text-[var(--adm-text-muted)]">Prioritás / határidő</dt><dd className="mt-0.5 font-semibold">{PRIORITY_LABELS[workflow.task.priority] || "Nincs prioritásadat"} · {formatDate(workflow.task.dueDate)}</dd></div>
                  <div><dt className="text-[var(--adm-text-muted)]">Reviewer</dt><dd className="mt-0.5 font-semibold">{workflow.currentReviewer?.displayName || "Nincs kijelölve"}</dd></div>
                  <div><dt className="text-[var(--adm-text-muted)]">Következő szereplő</dt><dd className="mt-0.5 font-semibold">{nextActorLabel(workflow)}</dd></div>
                  <div><dt className="text-[var(--adm-text-muted)]">Munkacsomag</dt><dd className="mt-0.5 font-semibold">{workflow.task.matterId ? workflow.task.case.title : "Nincs kapcsolt munkacsomag"}</dd></div>
                </dl>
                {workflow.task.description ? <p className="mt-4 border-t border-[var(--adm-border)] pt-3 text-[12px] leading-5 text-[var(--adm-text-muted)]">{workflow.task.description}</p> : null}
                {item.sourceCommunicationId ? <p className="mt-3 text-[11px]"><Link href={`/notifications?communicationId=${encodeURIComponent(item.sourceCommunicationId)}`} className="font-semibold text-[var(--adm-blue-700)] hover:underline">Kapcsolt kommunikáció megnyitása</Link></p> : null}
              </section>

              {!draft && workflow.permittedActions.createDraft ? (
                <CompactState title="Még nincs Leadás piszkozat." detail="Hozzon létre piszkozatot, majd kapcsolja hozzá az eredményt, a munkaidőt és a reviewert." action={<AdminButton variant="primary" disabled={busyAction === "create-draft"} onClick={() => void createDraft()}>Leadás piszkozat létrehozása</AdminButton>} />
              ) : null}

              {!draft && workflow.permittedActions.reviseReturned && returned ? (
                <CompactState tone="error" title={`A ${returned.revisionNumber}. verzió javításra visszaérkezett.`} detail="A korábbi verzió változatlan marad. A javítás új revisionben folytatható." action={<AdminButton variant="primary" disabled={busyAction === "revise"} onClick={() => { reviseAttempt.current.begin(); void createRevision(); }}>Javítás folytatása</AdminButton>} />
              ) : null}

              {draft ? (
                <section className="rounded-[var(--adm-radius-lg)] border border-[var(--adm-border)] bg-white">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--adm-border)] px-4 py-3">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">Leadás</p>
                      <h3 className="font-serif text-[20px] text-[var(--adm-text)]">Leadás piszkozat · {draft.revisionNumber}. verzió</h3>
                    </div>
                    <p className={`text-[11px] font-semibold ${saveState === "failed" ? "text-[var(--adm-terracotta-700)]" : isDirty ? "text-[var(--adm-ochre-700)]" : "text-[var(--adm-text-muted)]"}`} aria-live="polite">
                      {saveState === "saving" ? "Mentés…" : saveState === "failed" ? "Mentés sikertelen" : isDirty ? "Nem mentett módosítások" : `Mentve · ${formatDateTime(draft.updatedAt)}`}
                    </p>
                  </div>
                  <div className="grid gap-4 p-4 lg:grid-cols-2">
                    <label className="block text-[11px] font-semibold text-[var(--adm-text-muted)] lg:col-span-2">Elvégzett munka összefoglalása<textarea rows={4} value={form.workSummary} onChange={(event) => updateForm("workSummary", event.target.value)} disabled={!workflow.permittedActions.editDraft} className="adm-board-field mt-1 w-full px-3 py-2 text-[12px] disabled:bg-[var(--adm-surface)]" /></label>
                    <label className="block text-[11px] font-semibold text-[var(--adm-text-muted)]">Nyitott pontok<textarea rows={3} value={form.remainingIssues} onChange={(event) => updateForm("remainingIssues", event.target.value)} disabled={!workflow.permittedActions.editDraft} className="adm-board-field mt-1 w-full px-3 py-2 text-[12px] disabled:bg-[var(--adm-surface)]" /></label>
                    <label className="block text-[11px] font-semibold text-[var(--adm-text-muted)]">Megjegyzés a reviewernek<textarea rows={3} value={form.reviewerNote} onChange={(event) => updateForm("reviewerNote", event.target.value)} disabled={!workflow.permittedActions.editDraft} className="adm-board-field mt-1 w-full px-3 py-2 text-[12px] disabled:bg-[var(--adm-surface)]" /></label>
                    <label className="block text-[11px] font-semibold text-[var(--adm-text-muted)]">Review típusa<select value={form.requestedAttention} onChange={(event) => updateForm("requestedAttention", event.target.value)} disabled={!workflow.permittedActions.editDraft} className="adm-board-field mt-1 w-full px-3 py-2 text-[12px] disabled:bg-[var(--adm-surface)]"><option value="">Válasszon típust</option>{Object.entries(ATTENTION_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                    <label className="block text-[11px] font-semibold text-[var(--adm-text-muted)]">Reviewer<select value={form.assignedReviewerId} onChange={(event) => updateForm("assignedReviewerId", event.target.value)} disabled={!workflow.permittedActions.assignReviewer} className="adm-board-field mt-1 w-full px-3 py-2 text-[12px] disabled:bg-[var(--adm-surface)]"><option value="">Válasszon reviewert</option>{reviewers.map((reviewer) => <option key={reviewer.id} value={reviewer.id}>{reviewer.displayName} · {reviewerPreferenceLabels[reviewer.preference]}</option>)}</select></label>
                    {reviewerDirectoryAvailable && !selectedReviewerEligible ? <div role="alert" className="lg:col-span-2 rounded border border-[#e3c5c0] bg-[#fff8f6] px-3 py-2 text-[11px] text-[var(--adm-terracotta-700)]">A korábban kiválasztott reviewer már nem jogosult. Válasszon másik reviewert.</div> : null}
                    <div className="lg:col-span-2 grid gap-3 rounded border border-[var(--adm-border)] bg-[var(--adm-surface)] p-3 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
                      <label className="flex items-center gap-2 text-[11px] font-semibold text-[var(--adm-text)]"><input type="checkbox" checked={form.externalActionRequired} onChange={(event) => { updateForm("externalActionRequired", event.target.checked); if (!event.target.checked) updateForm("externalActionType", ""); }} disabled={!workflow.permittedActions.editDraft} /> Külső lépés szükséges jóváhagyás után</label>
                      <select aria-label="Külső lépés típusa" value={form.externalActionType} onChange={(event) => updateForm("externalActionType", event.target.value)} disabled={!workflow.permittedActions.editDraft || !form.externalActionRequired} className="adm-board-field px-3 py-2 text-[12px] disabled:bg-white"><option value="">Válasszon külső lépést</option>{Object.entries(EXTERNAL_ACTION_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--adm-border)] px-4 py-3">
                    <p className="text-[11px] text-[var(--adm-text-muted)]">Nincs automatikus mentés: a módosítások csak a gombbal kerülnek a backendbe.</p>
                    <AdminButton variant="neutral" disabled={!isDirty || busyAction === "save" || !workflow.permittedActions.editDraft} onClick={() => void saveDraft()}>Piszkozat mentése</AdminButton>
                  </div>
                </section>
              ) : null}

              {draft ? (
                <div className="grid gap-4 lg:grid-cols-2">
                  <section className="rounded-[var(--adm-radius-lg)] border border-[var(--adm-border)] bg-white p-4">
                    <h3 className="font-serif text-[18px] text-[var(--adm-text)]">Eredménydokumentumok</h3>
                    <div className="mt-3 space-y-2">
                      {draft.documents.length === 0 ? <p className="text-[11px] text-[var(--adm-text-muted)]">Még nincs kapcsolt dokumentum.</p> : draft.documents.map((entry) => (
                        <div key={entry.id} className="rounded border border-[var(--adm-border)] bg-[var(--adm-surface)] p-3">
                          <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-[12px] font-semibold text-[var(--adm-text)]">{entry.document.name}</p><p className="mt-1 text-[10px] text-[var(--adm-text-muted)]">{DOCUMENT_ROLE_LABELS[entry.role] || "Dokumentum"} · {entry.document.category} · v{entry.document.currentVersion}</p></div>{workflow.permittedActions.attachDocument ? <button type="button" onClick={() => void unlinkDocument(entry.documentId)} disabled={busyAction === `detach-document:${entry.documentId}`} className="text-[10px] font-semibold text-[var(--adm-terracotta-700)] hover:underline">Eltávolítás</button> : null}</div>
                          <Link href={`/cases/${workflow.task.caseId}/documents?documentId=${encodeURIComponent(entry.documentId)}`} className="mt-2 inline-flex text-[10px] font-semibold text-[var(--adm-blue-700)] hover:underline">Dokumentum megnyitása</Link>
                        </div>
                      ))}
                    </div>
                    {workflow.permittedActions.attachDocument ? <div className="mt-3 grid gap-2"><select aria-label="Kapcsolandó dokumentum" value={documentId} onChange={(event) => setDocumentId(event.target.value)} className="adm-board-field px-3 py-2 text-[11px]"><option value="">Válasszon ügydokumentumot</option>{eligibleDocuments.map((entry) => <option key={entry.id} value={entry.id}>{entry.fileName} · {entry.documentType}</option>)}</select><select aria-label="Dokumentumszerep" value={documentRole} onChange={(event) => setDocumentRole(event.target.value)} className="adm-board-field px-3 py-2 text-[11px]">{Object.entries(DOCUMENT_ROLE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><AdminButton size="sm" variant="neutral" disabled={!documentId || busyAction === "attach-document"} onClick={() => void linkDocument()}>Dokumentum kapcsolása</AdminButton></div> : null}
                  </section>

                  <section className="rounded-[var(--adm-radius-lg)] border border-[var(--adm-border)] bg-white p-4">
                    <div className="flex items-start justify-between gap-3"><div><h3 className="font-serif text-[18px] text-[var(--adm-text)]">Kapcsolt munkaidő</h3><p className="mt-1 text-[11px] text-[var(--adm-text-muted)]">Összesen: {formatMinutes(draft.linkedTimeMinutes)}</p></div>{workflow.task.matterId ? <Link href={`/time-entries?caseId=${encodeURIComponent(workflow.task.caseId)}&matterId=${encodeURIComponent(workflow.task.matterId)}`} className="text-[10px] font-semibold text-[var(--adm-blue-700)] hover:underline">Munkaóra rögzítése</Link> : null}</div>
                    <div className="mt-3 space-y-2">{draft.timeEntries.length === 0 ? <p className="text-[11px] text-[var(--adm-text-muted)]">Még nincs kapcsolt munkaóra.</p> : draft.timeEntries.map((entry) => <div key={entry.id} className="flex items-center justify-between gap-3 rounded border border-[var(--adm-border)] bg-[var(--adm-surface)] p-3"><div><p className="text-[11px] font-semibold">{entry.timeEntry.workType} · {formatMinutes(entry.timeEntry.minutes)}</p><p className="mt-1 text-[10px] text-[var(--adm-text-muted)]">{formatDate(entry.timeEntry.workDate)} · {entry.timeEntry.billable ? "Elszámolható" : "Nem elszámolható"}</p></div>{workflow.permittedActions.attachTimeEntry ? <button type="button" onClick={() => void unlinkTimeEntry(entry.timeEntryId)} disabled={busyAction === `detach-time:${entry.timeEntryId}`} className="text-[10px] font-semibold text-[var(--adm-terracotta-700)] hover:underline">Eltávolítás</button> : null}</div>)}</div>
                    {workflow.permittedActions.attachTimeEntry && workflow.task.matterId ? <div className="mt-3 grid gap-2"><select aria-label="Kapcsolandó munkaóra" value={timeEntryId} onChange={(event) => setTimeEntryId(event.target.value)} className="adm-board-field px-3 py-2 text-[11px]"><option value="">Válasszon rögzített munkaórát</option>{eligibleTimeEntries.map((entry) => <option key={entry.id} value={entry.id}>{formatDate(entry.workDate)} · {entry.workType} · {formatMinutes(entry.minutes)}</option>)}</select><AdminButton size="sm" variant="neutral" disabled={!timeEntryId || busyAction === "attach-time"} onClick={() => void linkTimeEntry()}>Munkaóra kapcsolása</AdminButton></div> : null}
                    {workflow.permittedActions.editDraft ? <label className="mt-4 flex items-start gap-2 rounded border border-[var(--adm-border)] bg-[var(--adm-surface)] p-3 text-[11px]"><input type="checkbox" className="mt-0.5" checked={form.zeroTimeConfirmed} disabled={draft.timeEntries.length > 0} onChange={(event) => updateForm("zeroTimeConfirmed", event.target.checked)} /><span><strong>Nincs rögzítendő munkaidő.</strong><span className="mt-1 block text-[var(--adm-text-muted)]">Kapcsolt pozitív munkaóra mellett ez nem választható.</span></span></label> : null}
                  </section>
                </div>
              ) : null}

              {draft && workflow.readiness ? (
                <section className="rounded-[var(--adm-radius-lg)] border border-[var(--adm-border)] bg-white p-4" aria-labelledby="readiness-title">
                  <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 id="readiness-title" className="font-serif text-[18px] text-[var(--adm-text)]">Review-ra küldési ellenőrzés</h3><p className="mt-1 text-[11px] text-[var(--adm-text-muted)]">A backend readiness eredménye az irányadó.</p></div><AdminStatusPill tone={workflow.readiness.ready && !isDirty ? "green" : "amber"}>{workflow.readiness.ready && !isDirty ? "Küldhető" : "Még nem küldhető"}</AdminStatusPill></div>
                  <ul className="mt-3 grid gap-2 sm:grid-cols-2">{CORE_READINESS_CODES.map((code) => { const missing = workflow.readiness?.missingPrerequisites.includes(code) || workflow.readiness?.blockingErrors.includes(code); return <li key={code} className={`rounded border px-3 py-2 text-[11px] ${missing ? "border-[#e3c5c0] bg-[#fff8f6] text-[var(--adm-terracotta-700)]" : "border-[var(--adm-border)] bg-[var(--adm-sage-100)]/45 text-[var(--adm-green-900)]"}`}><span className="mr-2 font-bold" aria-hidden="true">{missing ? "×" : "✓"}</span>{missing ? READINESS_LABELS[code] : READINESS_COMPLETED_LABELS[code] || READINESS_LABELS[code]}</li>; })}</ul>
                  {Array.from(new Set([...workflow.readiness.missingPrerequisites, ...workflow.readiness.blockingErrors])).filter((code) => !CORE_READINESS_CODES.includes(code)).map((code) => <p key={code} role="alert" className="mt-2 rounded border border-[#e3c5c0] bg-[#fff8f6] px-3 py-2 text-[11px] text-[var(--adm-terracotta-700)]">{READINESS_LABELS[code]}</p>)}
                  {workflow.readiness.warnings.map((code) => <p key={code} className="mt-2 rounded border border-[var(--adm-ochre-500)]/30 bg-[var(--adm-sand-100)] px-3 py-2 text-[11px] text-[var(--adm-text)]">{WARNING_LABELS[code]}</p>)}
                  {isDirty ? <p className="mt-2 text-[11px] font-semibold text-[var(--adm-ochre-700)]">Mentse a helyi módosításokat az új readiness ellenőrzéshez.</p> : null}
                  <div className="mt-4 flex flex-wrap items-center justify-end gap-3">{submitDisabledReason ? <span id="submit-disabled-reason" className="text-[10px] text-[var(--adm-text-muted)]">{submitDisabledReason}</span> : null}<AdminButton variant="primary" disabled={Boolean(submitDisabledReason)} aria-describedby={submitDisabledReason ? "submit-disabled-reason" : undefined} title={submitDisabledReason || undefined} onClick={() => { submitAttempt.current.begin(); setSubmitDialogOpen(true); }}>Review-ra küldés</AdminButton></div>
                </section>
              ) : null}

              {!draft && workflow.permittedActions.reviewSubmitted && workflow.latestSubmittedRevision ? <CompactState title={`A ${workflow.latestSubmittedRevision.revisionNumber}. verzió review-ra vár.`} detail="A döntési műveletek csak a Review részletben érhetők el." action={<Link href={`/reviews?taskId=${item.id}&submissionId=${workflow.latestSubmittedRevision.id}`} className="adm-link-button adm-link-button-primary px-3 py-2 text-[11px]">Review megnyitása</Link>} /> : null}

              {!draft && workflow.permittedActions.recordExternalCompletion && latestApproved ? <CompactState title="Külső lépésre vár" detail={`Jóváhagyva; még rögzítendő: ${EXTERNAL_ACTION_LABELS[latestApproved.externalActionType || ""] || "külső művelet"}. Ez a felület csak a teljesítés metaadatát rögzíti.`} action={<AdminButton variant="primary" onClick={() => { externalAttempt.current.begin(); setExternalDialogOpen(true); }}>Külső lépés teljesítésének rögzítése</AdminButton>} /> : null}

              <section className="rounded-[var(--adm-radius-lg)] border border-[var(--adm-border)] bg-white p-4">
                <h3 className="font-serif text-[18px] text-[var(--adm-text)]">Revision történet</h3>
                {workflow.submissions.length === 0 ? <p className="mt-2 text-[11px] text-[var(--adm-text-muted)]">Még nincs Leadás revision.</p> : <div className="mt-3 grid gap-2 sm:grid-cols-2">{[...workflow.submissions].sort((left, right) => right.revisionNumber - left.revisionNumber).map((submission) => <button key={submission.id} type="button" onClick={() => setSelectedRevisionId(submission.id)} className={`rounded border p-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${displayedRevision?.id === submission.id ? "border-[var(--adm-green-800)] bg-[var(--adm-sage-100)]/35" : "border-[var(--adm-border)] bg-[var(--adm-surface)]"}`}><div className="flex items-center justify-between gap-2"><span className="text-[12px] font-semibold">{submission.revisionNumber}. verzió</span><AdminStatusPill tone={submissionTone(submission.status)}>{submissionStatusLabel(submission.status)}</AdminStatusPill></div><p className="mt-2 text-[10px] text-[var(--adm-text-muted)]">Beküldve: {formatDateTime(submission.submittedAt)} · {submission.submittedBy?.displayName || submission.createdBy.displayName}</p><p className="mt-1 text-[10px] text-[var(--adm-text-muted)]">{submission.documentCount} dokumentum · {formatMinutes(submission.linkedTimeMinutes)}</p></button>)}</div>}
                {displayedRevision ? <div className="mt-4 rounded border border-[var(--adm-border)] bg-[var(--adm-surface)] p-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-[12px] font-semibold">{displayedRevision.revisionNumber}. verzió biztonságos részlete</p><p className="text-[10px] text-[var(--adm-text-muted)]">Létrehozva: {formatDateTime(displayedRevision.createdAt)}</p></div><dl className="mt-3 grid gap-3 text-[11px] sm:grid-cols-2"><div><dt className="text-[var(--adm-text-muted)]">Elvégzett munka</dt><dd className="mt-1 whitespace-pre-wrap font-medium">{displayedRevision.workSummary || "Nincs megadva"}</dd></div><div><dt className="text-[var(--adm-text-muted)]">Nyitott pontok</dt><dd className="mt-1 whitespace-pre-wrap font-medium">{displayedRevision.remainingIssues || "Nincs megadva"}</dd></div><div><dt className="text-[var(--adm-text-muted)]">Reviewer</dt><dd className="mt-1 font-medium">{displayedRevision.assignedReviewer.displayName}</dd></div><div><dt className="text-[var(--adm-text-muted)]">Review típusa</dt><dd className="mt-1 font-medium">{ATTENTION_LABELS[displayedRevision.requestedAttention || ""] || "Nincs megadva"}</dd></div></dl>{displayedRevision.reviewDecision ? <div className="mt-3 border-t border-[var(--adm-border)] pt-3"><p className="text-[11px] font-semibold">{displayedRevision.reviewDecision.decision === "RETURNED" ? "Visszaküldve" : "Jóváhagyva"} · {displayedRevision.reviewDecision.reviewer.displayName} · {formatDateTime(displayedRevision.reviewDecision.createdAt)}</p>{displayedRevision.reviewDecision.note ? <p className="mt-2 whitespace-pre-wrap text-[11px] text-[var(--adm-text-muted)]">{displayedRevision.reviewDecision.note}</p> : null}{displayedRevision.reviewDecision.requestedCorrections ? <p className="mt-2 whitespace-pre-wrap rounded border border-[#e3c5c0] bg-white p-3 text-[11px] text-[var(--adm-terracotta-700)]"><strong>Kért javítások:</strong> {displayedRevision.reviewDecision.requestedCorrections}</p> : null}</div> : null}</div> : null}
              </section>
            </>
          ) : null}
        </div>
      </section>

      <WorkflowDialog open={submitDialogOpen} title="Review-ra küldés" description="A beküldött revision változatlan lesz. Sikert csak a backend visszaigazolása után jelez a felület." primaryLabel="Review-ra küldés" primaryDisabled={!workflow?.permittedActions.submit || isDirty} busy={busyAction === "submit"} onClose={() => { if (busyAction !== "submit") setSubmitDialogOpen(false); }} onConfirm={() => void submitForReview()}>
        {draft ? <dl className="grid gap-3 text-[12px] sm:grid-cols-2"><div><dt className="text-[var(--adm-text-muted)]">Feladat</dt><dd className="font-semibold">{workflow?.task.title}</dd></div><div><dt className="text-[var(--adm-text-muted)]">Revision</dt><dd className="font-semibold">{draft.revisionNumber}. verzió</dd></div><div><dt className="text-[var(--adm-text-muted)]">Reviewer</dt><dd className="font-semibold">{draft.assignedReviewer.displayName}</dd></div><div><dt className="text-[var(--adm-text-muted)]">Review típusa</dt><dd className="font-semibold">{ATTENTION_LABELS[draft.requestedAttention || ""] || "Nincs megadva"}</dd></div><div><dt className="text-[var(--adm-text-muted)]">Eredmények</dt><dd className="font-semibold">{draft.documentCount} dokumentum</dd></div><div><dt className="text-[var(--adm-text-muted)]">Munkaidő</dt><dd className="font-semibold">{draft.zeroTimeConfirmed ? "Nulla idő megerősítve" : formatMinutes(draft.linkedTimeMinutes)}</dd></div><div className="sm:col-span-2"><dt className="text-[var(--adm-text-muted)]">Külső lépés</dt><dd className="font-semibold">{draft.externalActionRequired ? EXTERNAL_ACTION_LABELS[draft.externalActionType || ""] || "Szükséges" : "Nem szükséges"}</dd></div></dl> : null}
      </WorkflowDialog>

      <WorkflowDialog open={externalDialogOpen} title="Külső lépés teljesítésének rögzítése" description="Ez csak a korábban jóváhagyott külső művelet teljesítésének metaadatát rögzíti. A rendszer nem küld e-mailt, nem ír alá és nem nyújt be dokumentumot." primaryLabel="Teljesítés rögzítése" busy={busyAction === "external-completion"} onClose={() => { if (busyAction !== "external-completion") setExternalDialogOpen(false); }} onConfirm={() => void recordExternalCompletion()}>
        <div className="rounded border border-[var(--adm-border)] bg-[var(--adm-surface)] p-4 text-[12px]"><p className="text-[var(--adm-text-muted)]">Megerősítendő külső lépés</p><p className="mt-1 font-semibold">{EXTERNAL_ACTION_LABELS[latestApproved?.externalActionType || ""] || "Nincs típusadat"}</p></div>
      </WorkflowDialog>
    </div>
  );
}
