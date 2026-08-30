"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getCaseWorkPackage,
  updateCaseWorkPackageItem,
  createCaseWorkPackageTask,
  getUsers,
  type CaseWorkPackageOperational,
  type CaseWorkPackageOperationalItem,
  type User,
} from "@/lib/api";
import { AdminButton, AdminBadge } from "@/components/adminiculum/ui";

const ELIGIBLE_WORKFORCE_ROLES = new Set([
  "ADMIN",
  "PARTNER",
  "LAWYER",
  "COLLAB_LAWYER",
  "TRAINEE",
  "LEGAL_ASSISTANT",
]);

const ERROR_MESSAGES: Record<string, string> = {
  COMPLETED_ITEM_IMMUTABLE: "A befejezett munkamodul nem nyitható újra.",
  DISABLED_ITEM_IMMUTABLE: "A letiltott munkamodul nem aktiválható újra.",
  REQUIRED_ITEM_CANNOT_DISABLE: "A kötelező munkamodul nem hagyható ki.",
  ACTIVE_TASKS_BLOCK_COMPLETE: "A modulhoz tartozó nyitott feladatokat előbb le kell zárni.",
  ACTIVE_TASKS_BLOCK_DISABLE: "A modulhoz tartozó nyitott feladatokat előbb le kell zárni.",
  RESPONSIBLE_NOT_CASE_ELIGIBLE: "A kiválasztott személy nem jogosult az ügyben felelősként eljárni.",
  WORK_PACKAGE_REVISION_CONFLICT: "A munkacsomag állapota módosult. Kérjük, frissítsd az oldalt.",
  ITEM_DISABLED: "Letiltott modulhoz nem hozható létre feladat.",
  ITEM_COMPLETED: "Befejezett modulhoz nem hozható létre feladat.",
  TASK_CREATE_CONFLICT: "A feladat létrehozása ütközés miatt nem sikerült. Próbáld újra.",
};

function mapErrorMessage(error: unknown): string {
  const msg = error instanceof Error ? error.message : "";
  for (const [code, hungarian] of Object.entries(ERROR_MESSAGES)) {
    if (msg.includes(code)) return hungarian;
  }
  return "A művelet sikertelen. Kérjük, próbáld újra.";
}

type Props = {
  caseId: string;
  onTaskCreated?: () => void;
};

export function CaseWorkPackagePanel({ caseId, onTaskCreated }: Props) {
  const [pack, setPack] = useState<CaseWorkPackageOperational | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyItem, setBusyItem] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Inline task creation state per item
  const [openTaskItemId, setOpenTaskItemId] = useState<string | null>(null);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDueDate, setTaskDueDate] = useState("");

  // Inline note editing state per item
  const [editingNoteItemId, setEditingNoteItemId] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [wp, userList] = await Promise.all([
        getCaseWorkPackage(caseId),
        getUsers().catch(() => []),
      ]);
      setPack(wp);
      setUsers(
        userList.filter(
          (u) =>
            ELIGIBLE_WORKFORCE_ROLES.has(String(u.role || "").toUpperCase()) &&
            u.status !== "INACTIVE" &&
            u.isActive !== false,
        ),
      );
    } catch {
      setError("A munkacsomag betöltése nem sikerült.");
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleStatusChange(item: CaseWorkPackageOperationalItem, newStatus: "COMPLETED" | "DISABLED") {
    if (!pack || busyItem) return;
    setBusyItem(item.id);
    setError(null);
    try {
      const result = await updateCaseWorkPackageItem(caseId, item.id, {
        expectedRevision: pack.revision,
        status: newStatus,
      });
      setPack((prev) => {
        if (!prev) return null;
        const nextItems = prev.items.map((i) =>
          i.id === item.id ? { ...i, status: result.item.status } : i,
        );
        const active = nextItems.filter((i) => i.status !== "DISABLED");
        const completed = active.filter((i) => i.status === "COMPLETED").length;
        return {
          ...prev,
          revision: result.revision,
          progress: {
            ...prev.progress,
            completed,
            remaining: active.length - completed,
          },
          items: nextItems,
        };
      });
    } catch (err) {
      setError(mapErrorMessage(err));
    } finally {
      setBusyItem(null);
    }
  }

  async function handleResponsibleChange(item: CaseWorkPackageOperationalItem, responsibleUserId: string | null) {
    if (!pack || busyItem) return;
    setBusyItem(item.id);
    setError(null);
    try {
      const result = await updateCaseWorkPackageItem(caseId, item.id, {
        expectedRevision: pack.revision,
        responsibleUserId,
      });
      setPack((prev) => {
        if (!prev) return null;
        const nextItems = prev.items.map((i) =>
          i.id === item.id ? { ...i, responsible: result.item.responsible } : i,
        );
        return { ...prev, revision: result.revision, items: nextItems };
      });
    } catch (err) {
      setError(mapErrorMessage(err));
    } finally {
      setBusyItem(null);
    }
  }

  async function handleSaveNote(item: CaseWorkPackageOperationalItem) {
    if (!pack || busyItem) return;
    setBusyItem(item.id);
    setError(null);
    try {
      const result = await updateCaseWorkPackageItem(caseId, item.id, {
        expectedRevision: pack.revision,
        note: noteText.trim() || null,
      });
      setPack((prev) => {
        if (!prev) return null;
        const nextItems = prev.items.map((i) =>
          i.id === item.id ? { ...i, note: result.item.note } : i,
        );
        return { ...prev, revision: result.revision, items: nextItems };
      });
      setEditingNoteItemId(null);
    } catch (err) {
      setError(mapErrorMessage(err));
    } finally {
      setBusyItem(null);
    }
  }

  async function handleCreateTask(item: CaseWorkPackageOperationalItem) {
    if (!pack || busyItem || !taskTitle.trim()) return;
    setBusyItem(item.id);
    setError(null);
    try {
      const result = await createCaseWorkPackageTask(caseId, item.id, {
        title: taskTitle.trim(),
        dueDate: taskDueDate || undefined,
      });
      setPack((prev) => {
        if (!prev) return null;
        const nextItems = prev.items.map((i) => {
          if (i.id !== item.id) return i;
          const exists = i.tasks.some((t) => t.id === result.task.id);
          const nextTasks = exists
            ? i.tasks
            : [
                ...i.tasks,
                {
                  id: result.task.id,
                  title: result.task.title,
                  status: result.task.status,
                  assignedToId: result.task.assignedToId,
                  dueDate: result.task.dueDate,
                },
              ];
          return { ...i, tasks: nextTasks };
        });
        return { ...prev, items: nextItems };
      });
      setTaskTitle("");
      setTaskDueDate("");
      setOpenTaskItemId(null);
      onTaskCreated?.();
    } catch (err) {
      setError(mapErrorMessage(err));
    } finally {
      setBusyItem(null);
    }
  }

  if (loading) {
    return (
      <section className="rounded-lg border border-[rgba(22,32,26,0.10)] bg-white p-4 text-[13px] text-[var(--adm-text-muted)]">
        Munkacsomag betöltése…
      </section>
    );
  }

  // Legacy case without a work package — quiet truthful empty state
  if (!pack) {
    return null;
  }

  const { progress, items, source } = pack;
  const isAllComplete = progress.totalActive > 0 && progress.completed === progress.totalActive;

  return (
    <section
      aria-label="Munka az ügyön"
      data-testid="case-work-package-panel"
      className="rounded-lg border border-[rgba(22,32,26,0.12)] bg-white shadow-[0_1px_2px_rgba(22,32,26,0.06)]"
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[rgba(22,32,26,0.08)] px-4 py-3 bg-[#FAFBF9]">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-block h-3 w-[3px] shrink-0 rounded-full bg-[#1F5A66]" />
            <h2 className="font-serif text-[18px] font-semibold text-[#16201A]">Munka az ügyön</h2>
            {source && (
              <span className="text-[11px] font-medium text-[var(--adm-text-muted)]">
                ({source.name} v{source.version})
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[11px] text-[var(--adm-text-muted)]">
            Az ügyhöz rögzített munkamodulok és operatív feladatok.
          </p>
        </div>

        {/* Progress summary */}
        <div className="flex items-center gap-2">
          {isAllComplete ? (
            <AdminBadge tone="green" dot>Minden teendő kész</AdminBadge>
          ) : (
            <span className="text-[12px] font-semibold text-[#1F5A66] bg-[#1F5A66]/10 px-2.5 py-1 rounded-md">
              {progress.completed} / {progress.totalActive} teendő kész
            </span>
          )}
        </div>
      </div>

      {/* Error alert */}
      {error && (
        <div className="border-b border-[#A8442A]/20 bg-[#FBF0EC] px-4 py-2 text-[12px] text-[#A8442A]">
          {error}
        </div>
      )}

      {/* Items list */}
      <div className="divide-y divide-[rgba(22,32,26,0.06)]">
        {items.map((item) => {
          const isBusy = busyItem === item.id;
          const isCompleted = item.status === "COMPLETED";
          const isDisabled = item.status === "DISABLED";
          const isActive = item.status === "ACTIVE";

          return (
            <article
              key={item.id}
              data-testid={`wp-item-${item.id}`}
              className={`p-3.5 transition-colors ${isDisabled ? "bg-[#FAFBF9] opacity-60" : "hover:bg-[#FDFEFC]"}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3
                      className={`text-[13.5px] font-semibold ${
                        isCompleted
                          ? "text-[#526056] line-through decoration-[#526056]/50"
                          : isDisabled
                            ? "text-[var(--adm-text-muted)]"
                            : "text-[#16201A]"
                      }`}
                    >
                      {item.title}
                    </h3>
                    <AdminBadge tone={item.required ? "blue" : "neutral"}>
                      {item.required ? "Kötelező" : "Opcionális"}
                    </AdminBadge>
                    <AdminBadge
                      tone={isCompleted ? "green" : isDisabled ? "neutral" : "gold"}
                      dot
                    >
                      {isCompleted ? "Kész" : isDisabled ? "Kihagyva" : "Folyamatban"}
                    </AdminBadge>
                  </div>
                  {item.description && (
                    <p className="mt-1 text-[11.5px] text-[var(--adm-text-muted)] leading-relaxed">
                      {item.description}
                    </p>
                  )}
                </div>

                {/* Responsible select */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-[11px] text-[var(--adm-text-muted)]">Felelős:</span>
                  <select
                    aria-label={`${item.title} felelőse`}
                    value={item.responsible?.id || ""}
                    disabled={isBusy || isDisabled || isCompleted}
                    onChange={(e) => void handleResponsibleChange(item, e.target.value || null)}
                    className="rounded border border-[rgba(22,32,26,0.18)] bg-white px-2 py-0.5 text-[11.5px] text-[#16201A] disabled:bg-[#FAFBF9] disabled:text-[var(--adm-text-muted)] focus:border-[#1F5A66] focus:outline-none"
                  >
                    <option value="">Nincs kijelölve</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name || u.email}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Note (if present or editing) */}
              {item.note && editingNoteItemId !== item.id && (
                <div className="mt-2 flex items-start justify-between rounded bg-[#F4F6F4] px-2.5 py-1.5 text-[11px] text-[#2C3A31]">
                  <span>
                    <strong className="font-semibold">Megjegyzés:</strong> {item.note}
                  </span>
                  {!isCompleted && !isDisabled && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingNoteItemId(item.id);
                        setNoteText(item.note || "");
                      }}
                      className="ml-2 text-[10px] text-[#1F5A66] hover:underline"
                    >
                      Szerkesztés
                    </button>
                  )}
                </div>
              )}

              {/* Note editor */}
              {editingNoteItemId === item.id && (
                <div className="mt-2 flex gap-2">
                  <input
                    type="text"
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    placeholder="Megjegyzés rögzítése…"
                    className="min-w-0 flex-1 rounded border border-[rgba(22,32,26,0.20)] bg-white px-2.5 py-1 text-[12px] text-[#16201A] focus:border-[#1F5A66] focus:outline-none"
                  />
                  <AdminButton
                    size="xs"
                    variant="primary"
                    disabled={isBusy}
                    onClick={() => void handleSaveNote(item)}
                  >
                    Mentés
                  </AdminButton>
                  <AdminButton
                    size="xs"
                    variant="neutral"
                    onClick={() => setEditingNoteItemId(null)}
                  >
                    Mégse
                  </AdminButton>
                </div>
              )}

              {/* Tasks list inside item */}
              {item.tasks.length > 0 && (
                <div className="mt-2 space-y-1 pl-2 border-l-2 border-[#1F5A66]/20">
                  {item.tasks.map((task) => (
                    <div
                      key={task.id}
                      className="flex items-center justify-between text-[11.5px] text-[#2C3A31] py-0.5"
                    >
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="text-[9px] text-[#1F5A66]">●</span>
                        <span className="truncate">{task.title}</span>
                      </div>
                      <span className="text-[10px] font-medium text-[var(--adm-text-muted)]">
                        {task.status === "DONE" || task.status === "COMPLETED" ? "Kész" : "Nyitott"}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Action row */}
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                {isActive && (
                  <>
                    <AdminButton
                      size="xs"
                      variant="primary"
                      disabled={isBusy}
                      onClick={() => void handleStatusChange(item, "COMPLETED")}
                    >
                      Készre állítás
                    </AdminButton>

                    {!item.required && (
                      <AdminButton
                        size="xs"
                        variant="neutral"
                        disabled={isBusy}
                        onClick={() => void handleStatusChange(item, "DISABLED")}
                      >
                        Kihagyás
                      </AdminButton>
                    )}

                    <AdminButton
                      size="xs"
                      variant="neutral"
                      disabled={isBusy}
                      onClick={() => {
                        setOpenTaskItemId(openTaskItemId === item.id ? null : item.id);
                        setTaskTitle("");
                        setTaskDueDate("");
                      }}
                    >
                      + Feladat
                    </AdminButton>

                    {!item.note && editingNoteItemId !== item.id && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingNoteItemId(item.id);
                          setNoteText("");
                        }}
                        className="text-[11px] text-[var(--adm-text-muted)] hover:text-[#1F5A66] hover:underline"
                      >
                        + Megjegyzés
                      </button>
                    )}
                  </>
                )}
              </div>

              {/* Inline task creator */}
              {openTaskItemId === item.id && (
                <div className="mt-2.5 rounded border border-[#1F5A66]/30 bg-[#F4F6F4] p-2.5">
                  <p className="mb-1.5 text-[11px] font-semibold text-[#1F5A66]">
                    Új feladat a modulhoz:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <input
                      autoFocus
                      type="text"
                      value={taskTitle}
                      onChange={(e) => setTaskTitle(e.target.value)}
                      placeholder="Feladat megnevezése *"
                      className="min-w-0 flex-1 rounded border border-[rgba(22,32,26,0.20)] bg-white px-2.5 py-1 text-[12px] text-[#16201A] focus:border-[#1F5A66] focus:outline-none"
                    />
                    <input
                      type="date"
                      value={taskDueDate}
                      onChange={(e) => setTaskDueDate(e.target.value)}
                      className="rounded border border-[rgba(22,32,26,0.20)] bg-white px-2 py-1 text-[12px] text-[#16201A] focus:border-[#1F5A66] focus:outline-none"
                    />
                    <AdminButton
                      size="xs"
                      variant="primary"
                      disabled={isBusy || !taskTitle.trim()}
                      onClick={() => void handleCreateTask(item)}
                    >
                      {isBusy ? "Létrehozás…" : "Létrehozás"}
                    </AdminButton>
                    <AdminButton
                      size="xs"
                      variant="neutral"
                      onClick={() => setOpenTaskItemId(null)}
                    >
                      Mégse
                    </AdminButton>
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
