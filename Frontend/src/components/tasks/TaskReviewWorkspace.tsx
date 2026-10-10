"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AdminButton } from "@/components/adminiculum/ui";
import { CompactState, SafePanelError } from "@/components/adminiculum/OperationalPrimitives";
import { WorkflowDialog } from "@/components/tasks/WorkflowDialog";
import { ClientAccent } from "@/components/clients/ClientAccent";
import {
  StableMutationAttempt,
  approveTaskSubmission,
  isStaleReviewError,
  isUncertainMutationError,
  readTaskSubmissionReview,
  readTaskSubmissionWorkflow,
  recordTaskExternalCompletion,
  returnTaskSubmission,
  type TaskReviewQueueItem,
  type TaskSubmissionReviewDetail,
  type TaskSubmissionWorkflow,
} from "@/lib/taskLifecycleApi";
import { EXTERNAL_ACTION_LABELS, taskWorkflowErrorMessage } from "@/lib/taskWorkflowPresentation";
import { TaskReviewCockpitContent } from "@/components/tasks/TaskReviewCockpitContent";
import { reviewTimeState } from "@/lib/taskReviewCockpit";

type ReturnForm = {
  note: string;
  requestedCorrections: string;
  requiresFullReview: boolean;
  correctionDeadline: string;
};

const EMPTY_RETURN_FORM: ReturnForm = {
  note: "",
  requestedCorrections: "",
  requiresFullReview: true,
  correctionDeadline: "",
};

export function TaskReviewWorkspace({
  item,
  onClose,
  onQueueChanged,
}: {
  item: Pick<TaskReviewQueueItem, "taskId" | "submissionId"> & Partial<Pick<TaskReviewQueueItem, "title" | "case">>;
  onClose: () => void;
  onQueueChanged: () => Promise<void> | void;
}) {
  const [review, setReview] = useState<TaskSubmissionReviewDetail | null>(null);
  const [workflow, setWorkflow] = useState<TaskSubmissionWorkflow | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [changedNotice, setChangedNotice] = useState<string | null>(null);
  const [returnDialogOpen, setReturnDialogOpen] = useState(false);
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [externalDialogOpen, setExternalDialogOpen] = useState(false);
  const [returnForm, setReturnForm] = useState<ReturnForm>(EMPTY_RETURN_FORM);
  const [approvalNote, setApprovalNote] = useState("");
  const decisionTrigger = useRef<HTMLButtonElement | null>(null);
  const returnAttempt = useRef(new StableMutationAttempt("return"));
  const approveAttempt = useRef(new StableMutationAttempt("approve"));
  const externalAttempt = useRef(new StableMutationAttempt("external-completion"));

  const identity = item.taskId + ":" + item.submissionId;
  const activeIdentity = useRef(identity);
  activeIdentity.current = identity;
  const loadGeneration = useRef(0);

  const loadReview = useCallback(async (): Promise<TaskSubmissionReviewDetail | null> => {
    if (!item.submissionId) return null;
    const generation = ++loadGeneration.current;
    const requestedIdentity = item.taskId + ":" + item.submissionId;
    const isCurrent = () => generation === loadGeneration.current && activeIdentity.current === requestedIdentity;
    setIsLoading(true);
    setError(null);
    try {
      const [detailResult, workflowResult] = await Promise.allSettled([
        readTaskSubmissionReview(item.taskId, item.submissionId),
        readTaskSubmissionWorkflow(item.taskId),
      ]);
      if (!isCurrent()) return null;
      if (detailResult.status === "rejected") throw detailResult.reason;
      const detail = detailResult.value;
      setReview(detail);
      setWorkflow(workflowResult.status === "fulfilled" ? workflowResult.value : null);
      return detail;
    } catch (loadError) {
      if (isCurrent()) { setReview(null); setWorkflow(null); setError(taskWorkflowErrorMessage(loadError)); }
      return null;
    } finally {
      if (isCurrent()) setIsLoading(false);
    }
  }, [item.submissionId, item.taskId]);

  useEffect(() => {
    setReview(null);
    setWorkflow(null);
    setChangedNotice(null);
    setReturnDialogOpen(false);
    setApproveDialogOpen(false);
    setExternalDialogOpen(false);
    setReturnForm(EMPTY_RETURN_FORM);
    setApprovalNote("");
    setBusyAction(null);
    returnAttempt.current = new StableMutationAttempt("return");
    approveAttempt.current = new StableMutationAttempt("approve");
    externalAttempt.current = new StableMutationAttempt("external-completion");
    void loadReview();
    return () => { loadGeneration.current += 1; };
  }, [loadReview]);

  const returnInvalid = !returnForm.note.trim() || !returnForm.requestedCorrections.trim();

  const handleStaleOrTimeout = async (actionError: unknown) => {
    if (isStaleReviewError(actionError)) {
      setChangedNotice("A Review időközben megváltozott. Az adatokat újratöltöttük; a döntést nem írtuk felül.");
      await loadReview();
      return true;
    }
    if (isUncertainMutationError(actionError)) {
      setChangedNotice("A válasz nem érkezett meg biztosan. Az aktuális backend állapotot újraolvastuk.");
      await loadReview();
      return true;
    }
    return false;
  };

  const returnForCorrection = async () => {
    if (!review || review.task.id !== item.taskId || review.submission.id !== item.submissionId || returnInvalid || !review.permittedActions.return || busyAction || isLoading) return;
    const actionIdentity = identity;
    setBusyAction("return");
    setError(null);
    setChangedNotice(null);
    try {
      await returnTaskSubmission(item.taskId, review.submission.id, review.reviewVersion, returnAttempt.current.key(), {
        note: returnForm.note,
        requestedCorrections: returnForm.requestedCorrections,
        requiresFullReview: returnForm.requiresFullReview,
        correctionDeadline: returnForm.correctionDeadline || undefined,
      });
      if (activeIdentity.current !== actionIdentity) return;
      returnAttempt.current.complete();
      setReturnDialogOpen(false);
      setReturnForm(EMPTY_RETURN_FORM);
      await onQueueChanged();
      if (activeIdentity.current === actionIdentity) onClose();
    } catch (actionError) {
      if (activeIdentity.current !== actionIdentity) return;
      if (!(await handleStaleOrTimeout(actionError))) setError(taskWorkflowErrorMessage(actionError));
    } finally {
      if (activeIdentity.current === actionIdentity) setBusyAction(null);
    }
  };

  const approve = async () => {
    if (!review || review.task.id !== item.taskId || review.submission.id !== item.submissionId || !review.permittedActions.approve || busyAction || isLoading) return;
    const actionIdentity = identity;
    setBusyAction("approve");
    setError(null);
    setChangedNotice(null);
    try {
      const result = await approveTaskSubmission(item.taskId, review.submission.id, review.reviewVersion, approveAttempt.current.key(), approvalNote);
      if (activeIdentity.current !== actionIdentity) return;
      approveAttempt.current.complete();
      setApproveDialogOpen(false);
      setApprovalNote("");
      setReview(result.review);
      await onQueueChanged();
    } catch (actionError) {
      if (activeIdentity.current !== actionIdentity) return;
      if (!(await handleStaleOrTimeout(actionError))) setError(taskWorkflowErrorMessage(actionError));
    } finally {
      if (activeIdentity.current === actionIdentity) setBusyAction(null);
    }
  };

  const completeExternalAction = async () => {
    if (!review?.submission.externalActionType || review.task.id !== item.taskId || review.submission.id !== item.submissionId || !review.permittedActions.recordExternalCompletion || busyAction || isLoading) return;
    const actionIdentity = identity;
    setBusyAction("external-completion");
    setError(null);
    setChangedNotice(null);
    try {
      const result = await recordTaskExternalCompletion(item.taskId, review.submission.id, externalAttempt.current.key(), {
        actionType: review.submission.externalActionType,
      });
      if (activeIdentity.current !== actionIdentity) return;
      externalAttempt.current.complete();
      setExternalDialogOpen(false);
      setReview(result.review);
      await onQueueChanged();
    } catch (actionError) {
      if (activeIdentity.current !== actionIdentity) return;
      if (!(await handleStaleOrTimeout(actionError))) setError(taskWorkflowErrorMessage(actionError));
    } finally {
      if (activeIdentity.current === actionIdentity) setBusyAction(null);
    }
  };

  return (
    <section className="min-w-0 rounded-[var(--adm-radius-lg)] border border-[var(--adm-border)] bg-white" aria-labelledby="review-workspace-title">
      <header className="relative flex items-start justify-between gap-4 border-b border-[var(--adm-border)] px-4 py-3 pl-5">
        <ClientAccent colorKey={review?.client.clientColorKey || item.case?.clientColorKey} className="absolute inset-y-0 left-0 w-1" />
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--adm-text-muted)]">Ügyvédi döntési munkatér</p>
          <h2 id="review-workspace-title" className="mt-1 truncate font-serif text-[22px] text-[var(--adm-text)]">{review?.task.title || item.title || "Leadás ellenőrzése"}</h2>
          <p className="mt-1 text-[11px] text-[var(--adm-text-muted)]">{review ? review.case.caseNumber + " · " + review.client.displayName : item.case ? item.case.caseNumber + " · " + item.case.clientName : "Pontos leadás betöltése"}</p>
        </div>
        <button type="button" onClick={onClose} className="rounded px-2 text-xl text-[var(--adm-text-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2" aria-label="Review részlet bezárása">×</button>
      </header>

      <div className="space-y-4 p-4">
        {error ? <div role="alert" aria-live="assertive"><CompactState tone="error" title="A review művelet nem fejeződött be." detail={error} action={<AdminButton size="sm" variant="neutral" onClick={() => void loadReview()}>Review újratöltése</AdminButton>} /></div> : null}
        {changedNotice ? <div role="status" className="rounded border border-[var(--adm-ochre-500)]/40 bg-[var(--adm-sand-100)] px-3 py-2 text-[11px] text-[var(--adm-text)]">{changedNotice}</div> : null}
        {isLoading ? <CompactState title="A review részletei betöltődnek…" /> : null}
        {!isLoading && !review ? <SafePanelError onRetry={() => void loadReview()} /> : null}

        {review && review.task.id === item.taskId && review.submission.id === item.submissionId && !isLoading ? <TaskReviewCockpitContent key={review.submission.id} review={review} workflow={workflow}
          externalAction={review.submission.status === "APPROVED" && review.submission.externalActionRequired && !review.submission.externalCompletedAt ? <CompactState title="Külső lépésre vár" detail={"A Leadás jóváhagyott, de a feladat még nincs lezárva. Rögzítendő: " + (EXTERNAL_ACTION_LABELS[review.submission.externalActionType || ""] || "külső művelet")} action={review.permittedActions.recordExternalCompletion ? <AdminButton variant="primary" onClick={(event) => { decisionTrigger.current = event.currentTarget; externalAttempt.current.begin(); setExternalDialogOpen(true); }}>Külső lépés teljesítésének rögzítése</AdminButton> : undefined} /> : null}
          actions={(review.permittedActions.return || review.permittedActions.approve) ? <div className="flex flex-wrap justify-end gap-2"><AdminButton variant="danger" disabled={!review.permittedActions.return || !!busyAction} onClick={(event) => { decisionTrigger.current = event.currentTarget; returnAttempt.current.begin(); setReturnDialogOpen(true); }}>Visszaküldés</AdminButton><AdminButton variant="primary" disabled={!review.permittedActions.approve || !!busyAction} onClick={(event) => { decisionTrigger.current = event.currentTarget; approveAttempt.current.begin(); setApproveDialogOpen(true); }}>Jóváhagyás</AdminButton></div> : null}
        /> : null}
      </div>

      <WorkflowDialog returnFocusRef={decisionTrigger} open={returnDialogOpen} title="Leadás visszaküldése" description="A döntés és a kért javítások változatlan review-előzményként maradnak meg." primaryLabel="Visszaküldés" primaryDisabled={returnInvalid || isLoading || !review?.permittedActions.return} busy={busyAction === "return"} destructive onClose={() => { if (busyAction !== "return") setReturnDialogOpen(false); }} onConfirm={() => void returnForCorrection()}>
        <div className="space-y-4"><label className="block text-[11px] font-semibold text-[var(--adm-text-muted)]">Review megjegyzés<textarea autoFocus maxLength={4000} rows={3} value={returnForm.note} onChange={(event) => setReturnForm((current) => ({ ...current, note: event.target.value }))} className="adm-board-field mt-1 w-full px-3 py-2 text-[12px]" />{!returnForm.note.trim() ? <span className="mt-1 block text-[10px] text-[var(--adm-terracotta-700)]">A review megjegyzés kötelező.</span> : null}</label><label className="block text-[11px] font-semibold text-[var(--adm-text-muted)]">Kért javítások<textarea maxLength={8000} rows={5} value={returnForm.requestedCorrections} onChange={(event) => setReturnForm((current) => ({ ...current, requestedCorrections: event.target.value }))} className="adm-board-field mt-1 w-full px-3 py-2 text-[12px]" />{!returnForm.requestedCorrections.trim() ? <span className="mt-1 block text-[10px] text-[var(--adm-terracotta-700)]">A kért javítások megadása kötelező.</span> : null}</label><label className="flex items-center gap-2 text-[11px] font-semibold text-[var(--adm-text)]"><input type="checkbox" checked={returnForm.requiresFullReview} onChange={(event) => setReturnForm((current) => ({ ...current, requiresFullReview: event.target.checked }))} /> Teljes review szükséges az új revisionnél</label><label className="block text-[11px] font-semibold text-[var(--adm-text-muted)]">Javítási határidő (opcionális)<input type="date" value={returnForm.correctionDeadline} onChange={(event) => setReturnForm((current) => ({ ...current, correctionDeadline: event.target.value }))} className="adm-board-field mt-1 w-full px-3 py-2 text-[12px]" /></label></div>
      </WorkflowDialog>

      <WorkflowDialog returnFocusRef={decisionTrigger} open={approveDialogOpen} title="Leadás jóváhagyása" description="A jóváhagyás rendes esetben lezárja a feladatot. Külső lépésnél a feladat csak annak külön rögzítése után zárul le." primaryLabel="Jóváhagyás" primaryDisabled={isLoading || !review?.permittedActions.approve} busy={busyAction === "approve"} onClose={() => { if (busyAction !== "approve") setApproveDialogOpen(false); }} onConfirm={() => void approve()}>
        {review ? <div className="space-y-4"><dl className="grid gap-3 text-[12px] sm:grid-cols-2"><div><dt className="text-[var(--adm-text-muted)]">Revision</dt><dd className="font-semibold">{review.submission.revisionNumber}. verzió</dd></div><div><dt className="text-[var(--adm-text-muted)]">Beküldő</dt><dd className="font-semibold">{review.submission.submittedBy?.displayName || "Nincs adat"}</dd></div><div><dt className="text-[var(--adm-text-muted)]">Eredmények</dt><dd className="font-semibold">{review.outputs.length} dokumentum</dd></div><div><dt className="text-[var(--adm-text-muted)]">Munkaidő</dt><dd className="font-semibold">{reviewTimeState(review).label}</dd></div><div className="sm:col-span-2"><dt className="text-[var(--adm-text-muted)]">Külső lépés</dt><dd className="font-semibold">{review.submission.externalActionRequired ? EXTERNAL_ACTION_LABELS[review.submission.externalActionType || ""] || "Szükséges" : "Nem szükséges; a feladat lezárul"}</dd></div></dl><label className="block text-[11px] font-semibold text-[var(--adm-text-muted)]">Jóváhagyási megjegyzés (opcionális)<textarea maxLength={4000} rows={3} value={approvalNote} onChange={(event) => setApprovalNote(event.target.value)} className="adm-board-field mt-1 w-full px-3 py-2 text-[12px]" /></label></div> : null}
      </WorkflowDialog>

      <WorkflowDialog returnFocusRef={decisionTrigger} open={externalDialogOpen} title="Külső lépés teljesítésének rögzítése" description="A rendszer csak a teljesítés metaadatát rögzíti; nem hajt végre küldést, aláírást vagy benyújtást." primaryLabel="Teljesítés rögzítése" primaryDisabled={isLoading || !review?.permittedActions.recordExternalCompletion} busy={busyAction === "external-completion"} onClose={() => { if (busyAction !== "external-completion") setExternalDialogOpen(false); }} onConfirm={() => void completeExternalAction()}>
        <div className="rounded border border-[var(--adm-border)] bg-[var(--adm-surface)] p-4 text-[12px]"><p className="text-[var(--adm-text-muted)]">Megerősítendő külső lépés</p><p className="mt-1 font-semibold">{EXTERNAL_ACTION_LABELS[review?.submission.externalActionType || ""] || "Nincs típusadat"}</p></div>
      </WorkflowDialog>
    </section>
  );
}
