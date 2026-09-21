"use client";

/**
 * Post-create task responsibility controls.
 *
 * Two canonical capabilities gate the panel independently:
 *  - Reassign: the case responsibility projection's `canAssignWork`
 *    (POST /tasks/:id/reassign re-checks canUserActOnTask + canAssign).
 *  - Planned reviewer + collaborators: the internal-role gate the task-role
 *    endpoints enforce (GET/PUT/DELETE /tasks/:id/collaborators,
 *    PUT /tasks/:id/planned-reviewer).
 *
 * Every mutation goes through the existing canonical wrapper and candidates
 * come from the authoritative case-scoped projection
 * (GET /cases/:caseId/responsible-candidates) — no ad-hoc user lookup. The
 * backend keeps the final say on authorization and eligibility; failures are
 * surfaced with the shared workflow error messages.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminButton } from "@/components/adminiculum/ui";
import {
  getCaseResponsibleCandidates,
  getCaseResponsibility,
  getCurrentUser,
  reassignTask,
  type CaseResponsibilityResponse,
} from "@/lib/api";
import { taskPlanningApi, type TaskCollaboratorDTO } from "@/lib/taskPlanningApi";
import { taskWorkflowErrorMessage } from "@/lib/taskWorkflowPresentation";
import {
  canManageTaskRoles,
  canReassignTask,
  candidateLabel,
  collaboratorCandidates,
  plannedReviewerCandidates,
  reassignCandidates,
  splitCandidateGroups,
  type ResponsibilityCandidate,
} from "@/lib/taskResponsibility";

export interface TaskResponsibilityPanelProps {
  taskId: string;
  caseId: string;
  currentAssigneeId?: string | null;
  currentAssigneeName?: string | null;
  plannedReviewerId?: string | null;
  plannedReviewerName?: string | null;
  onChanged?: () => void | Promise<void>;
}

function CandidateOptions({
  candidates,
  all,
}: {
  candidates: ReadonlyArray<ResponsibilityCandidate>;
  all: ReadonlyArray<ResponsibilityCandidate>;
}) {
  const groups = splitCandidateGroups(candidates);
  return (
    <>
      {groups.primary.map((candidate) => (
        <option key={candidate.id} value={candidate.id}>{candidateLabel(candidate, all)}</option>
      ))}
      {groups.privileged.length ? (
        <optgroup label="Partner / admin">
          {groups.privileged.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>{candidateLabel(candidate, all)}</option>
          ))}
        </optgroup>
      ) : null}
    </>
  );
}

export function TaskResponsibilityPanel({
  taskId,
  caseId,
  currentAssigneeId,
  currentAssigneeName,
  plannedReviewerId,
  plannedReviewerName,
  onChanged,
}: TaskResponsibilityPanelProps) {
  const [role, setRole] = useState<string | null>(null);
  const [capabilities, setCapabilities] = useState<CaseResponsibilityResponse["capabilities"] | null>(null);
  const [candidates, setCandidates] = useState<ResponsibilityCandidate[]>([]);
  const [collaborators, setCollaborators] = useState<TaskCollaboratorDTO[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadWarning, setLoadWarning] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reassignTo, setReassignTo] = useState("");
  const [reviewerSelection, setReviewerSelection] = useState<string>(plannedReviewerId || "");
  const [collaboratorPick, setCollaboratorPick] = useState("");

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setLoadWarning(null);
    setError(null);
    setNotice(null);
    setReassignTo("");
    setCollaboratorPick("");
    void (async () => {
      // The current user's role decides whether the role-management endpoints
      // may even be called; a forbidden collaborator request must never fire.
      const me = await getCurrentUser().catch(() => null);
      if (!active) return;
      const meRole = me?.role ?? null;
      setRole(meRole);
      const [responsibility, candidateList, collaboratorList] = await Promise.allSettled([
        getCaseResponsibility(caseId),
        getCaseResponsibleCandidates(caseId),
        canManageTaskRoles(meRole)
          ? taskPlanningApi.listCollaborators(taskId)
          : Promise.resolve({ items: [] as TaskCollaboratorDTO[] }),
      ]);
      if (!active) return;
      setCapabilities(responsibility.status === "fulfilled" ? responsibility.value.capabilities : null);
      setCandidates(candidateList.status === "fulfilled" ? candidateList.value.items : []);
      setCollaborators(collaboratorList.status === "fulfilled" ? collaboratorList.value.items : []);
      const warnings: string[] = [];
      if (candidateList.status !== "fulfilled") warnings.push("A kiválasztható munkatársak listája most nem tölthető be.");
      if (responsibility.status !== "fulfilled") warnings.push("A feladatátadási jogosultság most nem ellenőrizhető.");
      if (canManageTaskRoles(meRole) && collaboratorList.status !== "fulfilled") {
        warnings.push("A közreműködők listája most nem tölthető be.");
      }
      setLoadWarning(warnings.length ? warnings.join(" ") : null);
      setIsLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [caseId, taskId]);

  useEffect(() => {
    setReviewerSelection(plannedReviewerId || "");
  }, [plannedReviewerId, taskId]);

  const reloadCollaborators = useCallback(async () => {
    try {
      const result = await taskPlanningApi.listCollaborators(taskId);
      setCollaborators(result.items);
    } catch (reloadError) {
      setError(taskWorkflowErrorMessage(reloadError));
    }
  }, [taskId]);

  const runMutation = useCallback(
    async (actionKey: string, action: () => Promise<unknown>, successMessage: string) => {
      if (busyAction) return;
      setBusyAction(actionKey);
      setError(null);
      setNotice(null);
      try {
        await action();
      } catch (mutationError) {
        setError(taskWorkflowErrorMessage(mutationError));
        setBusyAction(null);
        return;
      }
      setNotice(successMessage);
      try {
        await onChanged?.();
      } catch {
        setLoadWarning("A módosítás megtörtént, de a nézet frissítése nem sikerült.");
      } finally {
        setBusyAction(null);
      }
    },
    [busyAction, onChanged],
  );

  const assigneeName = currentAssigneeName
    || (currentAssigneeId ? candidates.find((candidate) => candidate.id === currentAssigneeId)?.name : null)
    || (currentAssigneeId ? "Kijelölt felelős" : "Nincs kijelölve");
  const reviewerName = plannedReviewerName
    || (plannedReviewerId ? candidates.find((candidate) => candidate.id === plannedReviewerId)?.name : null)
    || (plannedReviewerId ? "Kijelölt reviewer" : null);

  const reassignOptions = useMemo(
    () => reassignCandidates(candidates, currentAssigneeId),
    [candidates, currentAssigneeId],
  );
  const reviewerOptions = useMemo(
    () => plannedReviewerCandidates(candidates, currentAssigneeId),
    [candidates, currentAssigneeId],
  );
  const collaboratorOptions = useMemo(
    () =>
      collaboratorCandidates(candidates, {
        assigneeId: currentAssigneeId,
        plannedReviewerId: reviewerSelection || plannedReviewerId,
        existingUserIds: collaborators.map((collaborator) => collaborator.userId),
      }),
    [candidates, collaborators, currentAssigneeId, plannedReviewerId, reviewerSelection],
  );

  const manageRoles = canManageTaskRoles(role);
  const reassignAllowed = canReassignTask(capabilities);
  const reviewerChanged = (reviewerSelection || "") !== (plannedReviewerId || "");

  const changeAssignee = () => {
    if (!reassignTo) return;
    const target = reassignTo;
    void runMutation("reassign", async () => {
      await reassignTask(taskId, target);
      setReassignTo("");
    }, "A feladat felelőse módosult.");
  };

  const saveReviewer = () => {
    const next = reviewerSelection || null;
    void runMutation("planned-reviewer", async () => {
      await taskPlanningApi.setPlannedReviewer(taskId, next);
    }, next ? "A tervezett reviewer mentve." : "A tervezett reviewer törölve.");
  };

  const addCollaborator = () => {
    if (!collaboratorPick) return;
    const target = collaboratorPick;
    void runMutation("add-collaborator", async () => {
      await taskPlanningApi.addCollaborator(taskId, target);
      setCollaboratorPick("");
      await reloadCollaborators();
    }, "A közreműködő hozzáadva.");
  };

  const removeCollaborator = (userId: string) => {
    void runMutation(`remove-collaborator:${userId}`, async () => {
      await taskPlanningApi.removeCollaborator(taskId, userId);
      await reloadCollaborators();
    }, "A közreműködő eltávolítva.");
  };

  // Authorization-aware rendering: while the capabilities are unknown, and
  // whenever neither canonical capability allows an action, nothing renders.
  if (isLoading) return null;
  if (!manageRoles && !reassignAllowed) return null;

  return (
    <section
      className="rounded-[var(--adm-radius-lg)] border border-[var(--adm-border)] bg-white p-4"
      aria-labelledby="task-responsibility-title"
      data-testid="task-responsibility-panel"
      data-manage-roles={manageRoles ? "true" : "false"}
      data-reassign-allowed={reassignAllowed ? "true" : "false"}
    >
      <h3 id="task-responsibility-title" className="font-serif text-[18px] text-[var(--adm-text)]">Felelősség és munkaszerepek</h3>
      <p className="mt-1 text-[11px] text-[var(--adm-text-muted)]">A felelős és a munkaszerepek a feladat létrehozása után is módosíthatók, ha erre jogosultsága van. A szerepek nem adnak ügy-hozzáférést.</p>

      {loadWarning ? <p className="mt-2 text-[10.5px] text-[var(--adm-ochre-700)]">{loadWarning}</p> : null}
      {error ? <p role="alert" className="mt-2 rounded border border-[#e3c5c0] bg-[#fff8f6] px-3 py-2 text-[11px] text-[var(--adm-terracotta-700)]">{error}</p> : null}
      {notice ? <p role="status" className="mt-2 text-[10.5px] font-semibold text-[var(--adm-green-900)]">{notice}</p> : null}

      <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">Felelős</p>
          <p className="mt-1 text-[12px] font-semibold text-[var(--adm-text)]">{assigneeName}</p>
          {reassignAllowed ? (
            reassignOptions.length === 0 ? (
              <p className="mt-2 text-[10.5px] text-[var(--adm-text-muted)]">Nincs más jelölhető munkatárs ennél az ügynél.</p>
            ) : (
              <div className="mt-2 space-y-2">
                <label className="block text-[10.5px] font-semibold text-[var(--adm-text-muted)]">
                  Új felelős
                  <select
                    aria-label="Új felelős"
                    value={reassignTo}
                    onChange={(event) => setReassignTo(event.target.value)}
                    disabled={busyAction !== null}
                    className="adm-board-field mt-1 w-full px-3 py-2 text-[11px] disabled:bg-[var(--adm-surface)]"
                  >
                    <option value="">Válasszon munkatársat</option>
                    <CandidateOptions candidates={reassignOptions} all={candidates} />
                  </select>
                </label>
                <AdminButton size="sm" variant="neutral" disabled={!reassignTo || busyAction !== null} onClick={changeAssignee}>
                  {busyAction === "reassign" ? "Átadás…" : "Felelős átadása"}
                </AdminButton>
              </div>
            )
          ) : (
            <p className="mt-2 text-[10.5px] text-[var(--adm-text-muted)]">A feladat átadásához nincs jogosultsága ennél az ügynél.</p>
          )}
        </div>

        {manageRoles ? (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">Tervezett reviewer</p>
            <p className="mt-1 text-[12px] font-semibold text-[var(--adm-text)]">{reviewerName || "Nincs tervezett reviewer"}</p>
            <label className="mt-2 block text-[10.5px] font-semibold text-[var(--adm-text-muted)]">
              Reviewer
              <select
                aria-label="Tervezett reviewer"
                value={reviewerSelection}
                onChange={(event) => setReviewerSelection(event.target.value)}
                disabled={busyAction !== null}
                className="adm-board-field mt-1 w-full px-3 py-2 text-[11px] disabled:bg-[var(--adm-surface)]"
              >
                <option value="">Nincs tervezett reviewer</option>
                <CandidateOptions candidates={reviewerOptions} all={candidates} />
              </select>
            </label>
            <div className="mt-2">
              <AdminButton size="sm" variant="neutral" disabled={!reviewerChanged || busyAction !== null} onClick={saveReviewer}>
                {busyAction === "planned-reviewer" ? "Mentés…" : "Reviewer mentése"}
              </AdminButton>
            </div>
            <p className="mt-1 text-[10px] text-[var(--adm-text-muted)]">A reviewer nem lehet a feladat felelőse. Üres választással a tervezett reviewer törlődik.</p>
          </div>
        ) : null}

        {manageRoles ? (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">Párhuzamos közreműködők</p>
            {collaborators.length === 0 ? (
              <p className="mt-1 text-[11px] text-[var(--adm-text-muted)]">Nincs közreműködő.</p>
            ) : (
              <ul className="mt-1 space-y-1">
                {collaborators.map((collaborator) => (
                  <li key={collaborator.userId} className="flex items-center justify-between gap-2 rounded border border-[var(--adm-border)] bg-[var(--adm-surface)] px-2 py-1">
                    <span className="truncate text-[11px] font-semibold text-[var(--adm-text)]">{collaborator.user?.name || "Munkatárs"}</span>
                    <button
                      type="button"
                      disabled={busyAction !== null}
                      onClick={() => removeCollaborator(collaborator.userId)}
                      className="shrink-0 text-[10px] font-semibold text-[var(--adm-terracotta-700)] hover:underline disabled:opacity-50"
                    >
                      Eltávolítás
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {collaboratorOptions.length === 0 ? (
              <p className="mt-2 text-[10.5px] text-[var(--adm-text-muted)]">Nincs további jogosult munkatárs.</p>
            ) : (
              <div className="mt-2 space-y-2">
                <label className="block text-[10.5px] font-semibold text-[var(--adm-text-muted)]">
                  Közreműködő hozzáadása
                  <select
                    aria-label="Közreműködő hozzáadása"
                    value={collaboratorPick}
                    onChange={(event) => setCollaboratorPick(event.target.value)}
                    disabled={busyAction !== null}
                    className="adm-board-field mt-1 w-full px-3 py-2 text-[11px] disabled:bg-[var(--adm-surface)]"
                  >
                    <option value="">Válasszon munkatársat</option>
                    <CandidateOptions candidates={collaboratorOptions} all={candidates} />
                  </select>
                </label>
                <AdminButton size="sm" variant="neutral" disabled={!collaboratorPick || busyAction !== null} onClick={addCollaborator}>
                  {busyAction === "add-collaborator" ? "Hozzáadás…" : "Hozzáadás"}
                </AdminButton>
              </div>
            )}
          </div>
        ) : null}
      </div>

      <p className="mt-3 text-[10px] text-[var(--adm-text-muted)]">
        A szerepekhez a kiválasztott munkatársnak már rendelkeznie kell ügy-hozzáféréssel. A rendszer minden módosítást a mentés előtt ellenőriz.
      </p>
    </section>
  );
}
