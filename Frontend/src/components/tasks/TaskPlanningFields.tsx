"use client";

import { useEffect, useMemo, useState } from "react";
import { taskPlanningApi, type TaskDefinitionDTO } from "@/lib/taskPlanningApi";
import type { User } from "@/lib/api";

export interface TaskPlanningValue {
  taskDefinitionId: string | null;
  taskTypeLabel: string | null;
  saveToCatalogue: boolean;
  plannedReviewerId: string | null;
  collaboratorUserIds: string[];
}

export const EMPTY_TASK_PLANNING: TaskPlanningValue = {
  taskDefinitionId: null,
  taskTypeLabel: null,
  saveToCatalogue: false,
  plannedReviewerId: null,
  collaboratorUserIds: [],
};

interface TaskPlanningFieldsProps {
  /** Client of the selected case — scopes the catalogue to client + firm-wide entries. */
  clientId: string | null;
  /** Users eligible as planned reviewer / collaborators (must have case access — backend enforces). */
  users: User[];
  /** The chosen executor — reviewer can never equal the worker. */
  assigneeId: string | null;
  value: TaskPlanningValue;
  onChange: (next: Partial<TaskPlanningValue>) => void;
}

/**
 * Additive planning fields for task creation: catalogue pick, free label,
 * explicit save-to-catalogue, planned reviewer, parallel collaborators.
 * Roles are metadata only — the backend grants no case access through them.
 */
export function TaskPlanningFields({ clientId, users, assigneeId, value, onChange }: TaskPlanningFieldsProps) {
  const [definitions, setDefinitions] = useState<TaskDefinitionDTO[]>([]);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let active = true;
    taskPlanningApi
      .listDefinitions(clientId || undefined)
      .then((res) => {
        if (active) setDefinitions(res.items);
      })
      .catch(() => {
        if (active) setLoadError(true);
      });
    return () => {
      active = false;
    };
  }, [clientId]);

  const selectedDefinition = useMemo(
    () => definitions.find((d) => d.id === value.taskDefinitionId) || null,
    [definitions, value.taskDefinitionId],
  );

  const reviewerCandidates = users.filter((u) => u.id !== assigneeId);
  const collaboratorCandidates = users.filter((u) => u.id !== assigneeId && u.id !== value.plannedReviewerId);

  const toggleCollaborator = (userId: string) => {
    const has = value.collaboratorUserIds.includes(userId);
    onChange({
      collaboratorUserIds: has
        ? value.collaboratorUserIds.filter((id) => id !== userId)
        : [...value.collaboratorUserIds, userId],
    });
  };

  return (
    <div className="space-y-3 rounded-[var(--adm-radius-sm)] border border-[var(--adm-border)] bg-[var(--adm-surface)] p-3" data-testid="task-planning-fields">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--adm-text-muted)]">Típus és munkaszerepek</p>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-[11px] font-semibold text-[var(--adm-text-muted)]">
          Feladattípus-katalógus
          <select
            value={value.taskDefinitionId || ""}
            onChange={(event) => onChange({ taskDefinitionId: event.target.value || null, taskTypeLabel: event.target.value ? null : value.taskTypeLabel })}
            className="adm-board-field mt-1 w-full px-3 py-2 text-[12px]"
          >
            <option value="">Nincs katalógus-típus</option>
            {definitions.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}{d.defaultEstimatedMinutes ? ` · kb. ${d.defaultEstimatedMinutes} p` : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-[11px] font-semibold text-[var(--adm-text-muted)]">
          Szabad megnevezés
          <input
            value={value.taskTypeLabel || ""}
            onChange={(event) => onChange({ taskTypeLabel: event.target.value || null })}
            placeholder={selectedDefinition ? "A katalógus megnevezése mentődik" : "pl. Szerződés-határidő ellenőrzése"}
            disabled={!!value.taskDefinitionId}
            className="adm-board-field mt-1 w-full px-3 py-2 text-[12px] disabled:opacity-50"
          />
        </label>
      </div>

      {!value.taskDefinitionId && value.taskTypeLabel?.trim() ? (
        <label className="flex items-center gap-2 text-[11px] text-[var(--adm-text)]">
          <input type="checkbox" checked={value.saveToCatalogue} onChange={(event) => onChange({ saveToCatalogue: event.target.checked })} />
          Mentés a katalógusba újrafelhasználható típusként
        </label>
      ) : null}

      {selectedDefinition ? (
        <p className="text-[10.5px] text-[var(--adm-text-muted)]">
          A katalógus alapértékei alkalmazódnak{selectedDefinition.defaultEstimatedMinutes ? ` (becslés: ${selectedDefinition.defaultEstimatedMinutes} p)` : ""}; egy egyéni becslés felülírja. A későbbi katalógusmódosítás nem írja át a már létrehozott feladatokat.
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-[11px] font-semibold text-[var(--adm-text-muted)]">
          Tervezett reviewer (opcionális)
          <select
            value={value.plannedReviewerId || ""}
            onChange={(event) => onChange({ plannedReviewerId: event.target.value || null })}
            className="adm-board-field mt-1 w-full px-3 py-2 text-[12px]"
          >
            <option value="">Nincs</option>
            {reviewerCandidates.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </label>
        <fieldset className="block text-[11px] font-semibold text-[var(--adm-text-muted)]">
          <legend className="text-[11px] font-semibold text-[var(--adm-text-muted)]">Párhuzamos közreműködők (opcionális)</legend>
          <div className="mt-1 max-h-24 space-y-1 overflow-y-auto rounded border border-[var(--adm-border)] bg-white p-2">
            {collaboratorCandidates.length === 0 ? <p className="text-[10px] text-[var(--adm-text-muted)]">Nincs további jelölt.</p> : null}
            {collaboratorCandidates.map((u) => (
              <label key={u.id} className="flex items-center gap-2 text-[11px] font-normal text-[var(--adm-text)]">
                <input type="checkbox" checked={value.collaboratorUserIds.includes(u.id)} onChange={() => toggleCollaborator(u.id)} />
                {u.name}
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      <p className="text-[10px] text-[var(--adm-text-muted)]">
        A reviewer és a közreműködők nem kapnak ügy-hozzáférést a szerep által; csak meglévő ügy-hozzáféréssel jelölhetők ki. A reviewer nem lehet a feladat végrehajtója.
      </p>
      {loadError ? <p className="text-[10.5px] text-[var(--adm-terracotta-700)]">A katalógus nem tölthető be — a feladat így is létrehozható.</p> : null}
    </div>
  );
}
