"use client";

import { useState } from "react";
import { recordCaseTime } from "@/lib/caseTimeBillingApi";
import type { CaseWorkspace } from "@/lib/api";

type WorkspaceTask = CaseWorkspace["tasks"][number];

const WORK_TYPES = [
  { value: "TANÁCSADÁS", label: "Tanácsadás" },
  { value: "IRATELENÉS", label: "Iratmunka" },
  { value: "FELÜLVIZSGÁLAT", label: "Felülvizsgálat" },
  { value: "KOMMUNIKÁCIÓ", label: "Kommunikáció" },
  { value: "KUTATÁS", label: "Kutatás" },
  { value: "EGYÉB", label: "Egyéb" },
];

const today = () => new Date().toISOString().slice(0, 10);

export function CaseTimeEntryDialog({
  caseId,
  tasks,
  onClose,
  onSaved,
}: {
  caseId: string;
  tasks: WorkspaceTask[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [minutes, setMinutes] = useState(30);
  const [description, setDescription] = useState("");
  const [workType, setWorkType] = useState(WORK_TYPES[0].value);
  const [taskId, setTaskId] = useState("");
  const [workDate, setWorkDate] = useState(today);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!description.trim() || minutes <= 0 || saving) return;
    setSaving(true);
    setError(null);
    try {
      await recordCaseTime({
        caseId,
        taskId: taskId || undefined,
        workType,
        description: description.trim(),
        minutes,
        workDate,
      });
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Az idő rögzítése nem sikerült.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4" role="dialog" aria-modal="true" aria-labelledby="case-time-entry-title">
      <div className="w-full max-w-lg border border-[var(--adm-border)] bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-[var(--adm-border)] px-5 py-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--adm-green-800)]">Ügy</p>
            <h2 id="case-time-entry-title" className="mt-1 font-serif text-xl font-semibold text-[var(--adm-text)]">Idő rögzítése</h2>
          </div>
          <button type="button" onClick={onClose} disabled={saving} aria-label="Bezárás" className="text-xl leading-none text-[var(--adm-text-muted)] hover:text-[var(--adm-text)]">×</button>
        </div>
        <div className="space-y-4 p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-[11px] font-semibold text-[var(--adm-text)]">
              Időtartam (perc)
              <input aria-label="Időtartam percben" type="number" min={1} step={1} value={minutes} onChange={(event) => setMinutes(Number(event.target.value) || 0)} className="adm-board-field mt-1 w-full px-3 py-2 text-[12px]" />
            </label>
            <label className="text-[11px] font-semibold text-[var(--adm-text)]">
              Munkanap
              <input aria-label="Munkanap" type="date" value={workDate} onChange={(event) => setWorkDate(event.target.value)} className="adm-board-field mt-1 w-full px-3 py-2 text-[12px]" />
            </label>
          </div>
          <label className="block text-[11px] font-semibold text-[var(--adm-text)]">
            Tevékenység
            <select aria-label="Tevékenység" value={workType} onChange={(event) => setWorkType(event.target.value)} className="adm-board-field mt-1 w-full px-3 py-2 text-[12px]">
              {WORK_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
            </select>
          </label>
          <label className="block text-[11px] font-semibold text-[var(--adm-text)]">
            Kapcsolt feladat <span className="font-normal text-[var(--adm-text-muted)]">(opcionális)</span>
            <select aria-label="Kapcsolt feladat" value={taskId} onChange={(event) => setTaskId(event.target.value)} className="adm-board-field mt-1 w-full px-3 py-2 text-[12px]">
              <option value="">Nincs kapcsolt feladat</option>
              {tasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}
            </select>
          </label>
          <label className="block text-[11px] font-semibold text-[var(--adm-text)]">
            Leírás
            <textarea aria-label="Idő leírása" value={description} onChange={(event) => setDescription(event.target.value)} rows={3} className="adm-board-field mt-1 w-full px-3 py-2 text-[12px]" placeholder="Mit végeztél az ügyben?" />
          </label>
          {error ? <p role="alert" className="border border-[#e3c5c0] bg-[#fff8f6] px-3 py-2 text-[11px] text-[var(--adm-terracotta-700)]">{error}</p> : null}
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={onClose} disabled={saving} className="border border-[var(--adm-border)] px-3 py-2 text-[11px] font-semibold text-[var(--adm-text)]">Mégse</button>
            <button type="button" onClick={() => void save()} disabled={saving || minutes <= 0 || !description.trim()} className="bg-[var(--adm-green-800)] px-3 py-2 text-[11px] font-semibold text-white disabled:opacity-50">{saving ? "Mentés…" : "Idő mentése"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

