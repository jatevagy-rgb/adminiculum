"use client";

/**
 * Team + per-person task planning leaf for case creation (WORD_WF02 W03-W04).
 *
 * INTERNAL COMPONENT INTERFACE — not a permission or backend contract. Server
 * permissions remain authoritative; this leaf only shapes what the creation
 * flow sends through the existing canonical writes (`createCase`,
 * `addCaseCollaborator`, `createTask`).
 *
 * The responsible lawyer is presented distinctly from the working team: the
 * lawyer can never appear as a plain collaborator checkbox, and their name is
 * shown as the separate final-responsible label. Task assignees, however, may
 * include the responsible lawyer (the worker can be the responsible lawyer).
 *
 * Save-to-catalogue is an explicit per-row opt-in; the parent sends it through
 * the canonical `createTask` planning contract (taskDefinitionClientId +
 * saveToCatalogue + taskTypeLabel).
 */
import { AdminButton } from "@/components/adminiculum/ui";
import type { PlanningCandidate } from "@/components/tasks/TaskPlanningFields";
import { DueDatePresetPicker, EMPTY_DUE_SELECTION, type DueSelection } from "./DueDatePresetPicker";

export interface PlannedTaskRow {
  key: string;
  title: string;
  assignedToId: string;
  priority: string;
  due: DueSelection;
  saveToCatalogue: boolean;
}

export interface TeamTaskPlan {
  collaboratorUserIds: string[];
  tasks: PlannedTaskRow[];
}

export const EMPTY_TEAM_TASK_PLAN: TeamTaskPlan = { collaboratorUserIds: [], tasks: [] };

let rowSeq = 0;
export function newPlannedTask(): PlannedTaskRow {
  rowSeq += 1;
  return {
    key: `plan-${Date.now().toString(36)}-${rowSeq}`,
    title: "",
    assignedToId: "",
    priority: "MEDIUM",
    due: EMPTY_DUE_SELECTION,
    saveToCatalogue: false,
  };
}

/** The plan is submittable only when every added task row has a title. */
export function teamPlanHasErrors(plan: TeamTaskPlan): boolean {
  return plan.tasks.some((task) => !task.title.trim());
}

const labelCls = "text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--adm-text-muted)]";
const inputCls =
  "mt-1 w-full rounded-md border border-[var(--adm-border)] bg-white px-3 py-2 text-[13px] text-[var(--adm-text)] focus:border-[var(--adm-green-800)] focus:outline-none disabled:opacity-60";

export function TeamTaskPlanningSection({
  users,
  responsibleLawyerId,
  value,
  onChange,
  showErrors = false,
}: {
  /** Case-eligible workforce candidates (authoritative source chosen by the host). */
  users: ReadonlyArray<PlanningCandidate>;
  /** The final responsible lawyer — shown separately, excluded from the team. */
  responsibleLawyerId: string | null;
  value: TeamTaskPlan;
  onChange: (next: TeamTaskPlan) => void;
  /** Surface per-row validation errors (set after a blocked submit attempt). */
  showErrors?: boolean;
}) {
  const lawyer = responsibleLawyerId ? users.find((u) => u.id === responsibleLawyerId) ?? null : null;
  const collaboratorCandidates = users.filter((u) => u.id !== responsibleLawyerId);

  const toggleCollaborator = (userId: string) => {
    const has = value.collaboratorUserIds.includes(userId);
    onChange({
      ...value,
      collaboratorUserIds: has ? value.collaboratorUserIds.filter((id) => id !== userId) : [...value.collaboratorUserIds, userId],
    });
  };

  const addTask = () => onChange({ ...value, tasks: [...value.tasks, newPlannedTask()] });
  const updateTask = (key: string, patch: Partial<PlannedTaskRow>) =>
    onChange({ ...value, tasks: value.tasks.map((t) => (t.key === key ? { ...t, ...patch } : t)) });
  const removeTask = (key: string) => onChange({ ...value, tasks: value.tasks.filter((t) => t.key !== key) });

  return (
    <div data-testid="team-task-planning" className="space-y-4">
      {/* Responsible lawyer, distinct from the working team. */}
      <div data-testid="responsible-lawyer-note" className="flex flex-wrap items-center gap-2 rounded-md border border-[rgba(31,90,102,0.28)] bg-[var(--adm-surface)] px-3 py-2">
        <span className={labelCls}>Felelős ügyvéd</span>
        <span className="text-[12.5px] font-semibold text-[var(--adm-blue-700)]">{lawyer ? lawyer.name : "nincs kiválasztva"}</span>
        <span className="w-full text-[11px] text-[var(--adm-text-muted)] sm:w-auto">
          A felelős ügyvéd nem szerepel a munkacsapat listáján; feladat-végrehajtóként később kijelölhető.
        </span>
      </div>

      {/* Working team (collaborators). */}
      <fieldset>
        <legend className={labelCls}>Munkacsapat</legend>
        {collaboratorCandidates.length === 0 ? (
          <p className="mt-1 text-[11.5px] text-[var(--adm-text-muted)]">Nincs felvehető további munkatárs.</p>
        ) : (
          <div className="mt-1 grid grid-cols-1 gap-x-3 gap-y-1 sm:grid-cols-2">
            {collaboratorCandidates.map((user) => (
              <label key={user.id} data-testid="collaborator-option" className="flex min-h-[40px] items-center gap-2 text-[12px] text-[var(--adm-text)]">
                <input
                  type="checkbox"
                  data-testid={`collaborator-${user.id}`}
                  checked={value.collaboratorUserIds.includes(user.id)}
                  onChange={() => toggleCollaborator(user.id)}
                />
                {user.name}
              </label>
            ))}
          </div>
        )}
      </fieldset>

      {/* Per-person tasks with due presets and optional catalogue save. */}
      <div>
        <div className="flex items-center justify-between gap-2">
          <span className={labelCls}>Feladatok</span>
          <AdminButton size="xs" variant="neutral" type="button" onClick={addTask} data-testid="plan-add-task">
            + Feladat
          </AdminButton>
        </div>
        {value.tasks.length === 0 ? (
          <p className="mt-1 text-[11.5px] text-[var(--adm-text-muted)]">Nincs induló feladat.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {value.tasks.map((task) => {
              const titleError = showErrors && !task.title.trim() ? "A feladat megnevezése kötelező." : undefined;
              return (
                <li key={task.key} data-testid="planned-task-row" className="rounded-md border border-[var(--adm-border)] bg-[var(--adm-surface)] p-2.5">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
                    <div className="sm:col-span-2">
                      <label className={labelCls} htmlFor={`${task.key}-title`}>Feladat megnevezése</label>
                      <input
                        id={`${task.key}-title`}
                        data-testid="planned-task-title"
                        className={inputCls}
                        placeholder="pl. Iratok bekérése"
                        value={task.title}
                        onChange={(event) => updateTask(task.key, { title: event.target.value })}
                      />
                      {titleError ? (
                        <p role="alert" className="mt-1 text-[11px] font-semibold text-[var(--adm-terracotta-700)]">{titleError}</p>
                      ) : null}
                    </div>
                    <div>
                      <label className={labelCls} htmlFor={`${task.key}-assignee`}>Felelős</label>
                      <select
                        id={`${task.key}-assignee`}
                        data-testid="planned-task-assignee"
                        className={inputCls}
                        value={task.assignedToId}
                        onChange={(event) => updateTask(task.key, { assignedToId: event.target.value })}
                      >
                        <option value="">Nincs kijelölve</option>
                        {users.map((u) => (
                          <option key={u.id} value={u.id}>{u.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={labelCls} htmlFor={`${task.key}-priority`}>Prioritás</label>
                      <select
                        id={`${task.key}-priority`}
                        className={inputCls}
                        value={task.priority}
                        onChange={(event) => updateTask(task.key, { priority: event.target.value })}
                      >
                        {["LOW", "MEDIUM", "HIGH", "URGENT"].map((p) => (
                          <option key={p} value={p}>{p}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <DueDatePresetPicker
                    idPrefix={task.key}
                    value={task.due}
                    onChange={(due) => updateTask(task.key, { due })}
                  />

                  {task.title.trim() ? (
                    <label className="mt-2 flex min-h-[40px] items-center gap-2 text-[11.5px] text-[var(--adm-text)]">
                      <input
                        type="checkbox"
                        data-testid="planned-task-save-catalogue"
                        checked={task.saveToCatalogue}
                        onChange={(event) => updateTask(task.key, { saveToCatalogue: event.target.checked })}
                      />
                      Mentés újrafelhasználható feladattípusként
                    </label>
                  ) : null}

                  <div className="mt-1 flex justify-end">
                    <button type="button" data-testid="planned-task-remove" onClick={() => removeTask(task.key)} className="text-[10.5px] font-semibold text-[var(--adm-terracotta-700)] hover:underline">
                      Eltávolítás
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
