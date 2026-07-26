"use client";

/**
 * Intake section components (CASE-INTAKE-REDESIGN-1).
 *
 * Replaces the six-step wizard. Each section owns one responsibility and reads
 * from the canonical form state, so no section keeps a private copy of a value.
 * Helper text is short and only where the meaning is genuinely ambiguous — the
 * old per-field explanatory paragraphs are gone.
 */
import { useEffect, useMemo, useState } from "react";
import { type Client, type User } from "@/lib/api";
import { AdminButton } from "@/components/adminiculum/ui";
import { intake, ACCENT_BG, ACCENT_TEXT } from "./intakeStyles";
import {
  DEADLINE_TYPE_OPTIONS, RELATIVE_UNIT_OPTIONS, REMINDER_OPTIONS,
  type IntakeState, type IntakeErrors, type ParticipantRow, type TaskRow, type RelativeUnit,
} from "./useCaseIntakeForm";

export const field = intake.field;
export const label = intake.label;

export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p role="alert" className="mt-1 text-[11px] font-semibold text-[#A8442A]">{message}</p>;
}

export function Section({ title, accent = "petrol", children }: { title: string; accent?: string; children: React.ReactNode }) {
  return (
    <section className={intake.area}>
      <h3 className={`${intake.sectionTitle} ${ACCENT_TEXT[accent] || ACCENT_TEXT.petrol}`}>
        <span aria-hidden="true" className={`inline-block h-3 w-[3px] shrink-0 rounded-full ${ACCENT_BG[accent] || ACCENT_BG.petrol}`} />
        {title}
      </h3>
      <div className="mt-2.5">{children}</div>
    </section>
  );
}

/** Client, name, type, responsible lawyer, role. */
export function CaseBasicsSection({
  state, errors, clients, users, onPatch, clientsLoading, clientsError,
}: {
  state: IntakeState; errors: IntakeErrors; clients: Client[]; users: User[];
  onPatch: <K extends keyof IntakeState>(k: K, v: IntakeState[K]) => void;
  clientsLoading?: boolean; clientsError?: string | null;
}) {
  return (
    <div data-testid="intake-basics" className={intake.grid}>
      <div>
        <label className={label} htmlFor="ci-client">Ügyfél</label>
        <select
          id="ci-client"
          data-testid="intake-client-select"
          className={field}
          value={state.clientId}
          disabled={clientsLoading || Boolean(clientsError)}
          onChange={(e) => onPatch("clientId", e.target.value)}
        >
          <option value="">
            {clientsLoading ? "Ügyfelek betöltése…" : clientsError ? "Nem elérhető" : "Válassz ügyfelet…"}
          </option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {/* Loading, genuinely empty and broken-response are distinct states. */}
        {clientsError ? (
          <p role="alert" data-testid="intake-clients-error" className="mt-1 text-[11px] font-semibold text-[#A8442A]">{clientsError}</p>
        ) : !clientsLoading && clients.length === 0 ? (
          <p data-testid="intake-clients-empty" className="mt-1 text-[11px] text-[var(--adm-text-muted)]">Nincs rögzített ügyfél.</p>
        ) : null}
        <FieldError message={errors.clientId} />
      </div>
      <div>
        <label className={label} htmlFor="ci-title">Ügy megnevezése</label>
        <input id="ci-title" className={field} value={state.title} onChange={(e) => onPatch("title", e.target.value)} />
        <FieldError message={errors.title} />
      </div>
      <div>
        <label className={label} htmlFor="ci-type">Ügytípus</label>
        <select id="ci-type" className={field} value={state.matterType} onChange={(e) => onPatch("matterType", e.target.value)}>
          <option value="">Válassz típust…</option>
          {["CONTRACT_REVIEW", "CONTRACT_DRAFTING", "LITIGATION", "CORPORATE", "IP", "OTHER"].map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <FieldError message={errors.matterType} />
      </div>
      <div>
        <label className={label} htmlFor="ci-lawyer">Felelős ügyvéd</label>
        <select id="ci-lawyer" className={field} value={state.assignedLawyerId} onChange={(e) => onPatch("assignedLawyerId", e.target.value)}>
          <option value="">Válassz felelőst…</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <FieldError message={errors.assignedLawyerId} />
      </div>
      <div className="sm:col-span-2">
        <label className={label} htmlFor="ci-role">Ügyfél szerepe</label>
        <input id="ci-role" className={field} value={state.clientRole} onChange={(e) => onPatch("clientRole", e.target.value)} placeholder="Opcionális" />
      </div>
    </div>
  );
}

/** The five structured intake answers — never one generic textarea. */
export function CaseStartingContextSection({
  state, errors, onPatchContext, includeNextStep = true,
}: {
  state: IntakeState; errors: IntakeErrors;
  onPatchContext: (k: keyof IntakeState["startingContext"], v: string) => void;
  includeNextStep?: boolean;
}) {
  const rows: Array<{ key: keyof IntakeState["startingContext"]; label: string; id: string }> = [
    { key: "originReason", label: "Miért indult az ügy?", id: "ci-origin" },
    { key: "currentSituation", label: "Mi a jelenlegi helyzet?", id: "ci-situation" },
    { key: "clientExpectation", label: "Mit vár az ügyfél?", id: "ci-expectation" },
    { key: "urgentAction", label: "Van-e sürgős teendő?", id: "ci-urgent" },
  ];
  return (
    <div data-testid="intake-starting-context" className="grid grid-cols-1 gap-2.5">
      {rows.map((r) => (
        <div key={r.key}>
          <label className={label} htmlFor={r.id}>{r.label}</label>
          <textarea id={r.id} rows={2} className={field} value={state.startingContext[r.key]} onChange={(e) => onPatchContext(r.key, e.target.value)} />
        </div>
      ))}
      {includeNextStep ? (
        <div>
          <label className={label} htmlFor="ci-next-detailed">Mi az első következő ügyvédi lépés?</label>
          <input id="ci-next-detailed" className={field} value={state.startingContext.nextStep} onChange={(e) => onPatchContext("nextStep", e.target.value)} />
          <FieldError message={errors.nextStep} />
        </div>
      ) : null}
    </div>
  );
}

/** Deadline: asked first, two modes only, always showing the resolved moment. */
export function CaseDeadlineSection({
  state, errors, users, absolute, onPatch, onPatchDeadline,
}: {
  state: IntakeState; errors: IntakeErrors; users: User[]; absolute: Date | null;
  onPatch: <K extends keyof IntakeState>(k: K, v: IntakeState[K]) => void;
  onPatchDeadline: (k: keyof IntakeState["deadline"], v: string) => void;
}) {
  const quick = (days: number, hour = 17) => {
    const d = new Date();
    if (days === 5) { // end of week (Friday)
      const delta = (5 - d.getDay() + 7) % 7;
      d.setDate(d.getDate() + (delta === 0 ? 0 : delta));
    } else d.setDate(d.getDate() + days);
    onPatchDeadline("date", d.toISOString().slice(0, 10));
    onPatchDeadline("time", `${String(hour).padStart(2, "0")}:00`);
  };

  return (
    <div data-testid="intake-deadline">
      <p className={label}>Van már ismert fontos határidő?</p>
      <div className="mt-1 flex gap-2">
        <AdminButton size="xs" variant={state.hasDeadline ? "neutral" : "primary"} onClick={() => onPatch("hasDeadline", false)}>Nincs</AdminButton>
        <AdminButton size="xs" variant={state.hasDeadline ? "primary" : "neutral"} onClick={() => onPatch("hasDeadline", true)}>Igen, hozzáadom</AdminButton>
      </div>

      {state.hasDeadline ? (
        <div data-testid="intake-deadline-editor" className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={label} htmlFor="ci-dl-title">Határidő megnevezése</label>
            <input id="ci-dl-title" className={field} value={state.deadline.title} onChange={(e) => onPatchDeadline("title", e.target.value)} />
            <FieldError message={errors.deadlineTitle} />
          </div>
          <div>
            <label className={label} htmlFor="ci-dl-type">Határidő típusa</label>
            <select id="ci-dl-type" className={field} value={state.deadline.deadlineType} onChange={(e) => onPatchDeadline("deadlineType", e.target.value)}>
              {DEADLINE_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className={label} htmlFor="ci-dl-responsible">Felelős</label>
            <select id="ci-dl-responsible" className={field} value={state.deadline.responsibleId} onChange={(e) => onPatchDeadline("responsibleId", e.target.value)}>
              <option value="">Nincs</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>

          {/* Exactly two modes. */}
          <div className="sm:col-span-2">
            <div className="flex gap-2">
              <AdminButton size="xs" data-testid="dl-mode-absolute" variant={state.deadline.mode === "ABSOLUTE" ? "primary" : "neutral"} onClick={() => onPatchDeadline("mode", "ABSOLUTE")}>Konkrét időpont</AdminButton>
              <AdminButton size="xs" data-testid="dl-mode-relative" variant={state.deadline.mode === "RELATIVE" ? "primary" : "neutral"} onClick={() => onPatchDeadline("mode", "RELATIVE")}>Ennyi idő múlva</AdminButton>
            </div>

            {state.deadline.mode === "ABSOLUTE" ? (
              <div data-testid="dl-absolute" className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div>
                  <label className={label} htmlFor="ci-dl-date">Dátum</label>
                  <input id="ci-dl-date" type="date" className={field} value={state.deadline.date} onChange={(e) => onPatchDeadline("date", e.target.value)} />
                  <FieldError message={errors.deadlineDate} />
                </div>
                <div>
                  <label className={label} htmlFor="ci-dl-time">Időpont</label>
                  <input id="ci-dl-time" type="time" className={field} value={state.deadline.time} onChange={(e) => onPatchDeadline("time", e.target.value)} />
                </div>
                <div className="sm:col-span-2 flex flex-wrap gap-1.5">
                  <AdminButton size="xs" variant="neutral" onClick={() => quick(0)}>Ma</AdminButton>
                  <AdminButton size="xs" variant="neutral" onClick={() => quick(1)}>Holnap</AdminButton>
                  <AdminButton size="xs" variant="neutral" onClick={() => quick(5)}>Hét vége</AdminButton>
                  <AdminButton size="xs" variant="neutral" onClick={() => quick(7)}>Jövő hét</AdminButton>
                </div>
              </div>
            ) : (
              <div data-testid="dl-relative" className="mt-2 flex flex-wrap items-end gap-2">
                <div className="w-24">
                  <label className={label} htmlFor="ci-dl-value">Mennyi</label>
                  <input id="ci-dl-value" type="number" min={1} className={field} value={state.deadline.relativeValue} onChange={(e) => onPatchDeadline("relativeValue", e.target.value)} />
                </div>
                <div className="w-32">
                  <label className={label} htmlFor="ci-dl-unit">Egység</label>
                  <select id="ci-dl-unit" className={field} value={state.deadline.relativeUnit} onChange={(e) => onPatchDeadline("relativeUnit", e.target.value as RelativeUnit)}>
                    {RELATIVE_UNIT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <FieldError message={errors.deadlineRelative} />
              </div>
            )}

            {/* The resolved moment is always visible, in both modes. */}
            <p data-testid="dl-absolute-preview" className="mt-2 text-[11.5px] font-semibold text-[#1F5A66]">
              {absolute ? `Számított határidő: ${absolute.toLocaleString("hu-HU", { dateStyle: "long", timeStyle: "short" })}` : "Számított határidő: —"}
            </p>
          </div>

          <div>
            <label className={label} htmlFor="ci-dl-reminder">Emlékeztető</label>
            <select id="ci-dl-reminder" className={field} value={state.deadline.reminderMinutes} onChange={(e) => onPatchDeadline("reminderMinutes", e.target.value)}>
              {REMINDER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Compact communication summary row. The selectable list lives on its own
 * drawer surface, so the intake form keeps exactly one scroll surface.
 */
export function CaseCommunicationSummary({
  state, errors, onOpenPicker, onLater,
}: {
  state: IntakeState; errors: IntakeErrors;
  onOpenPicker: () => void; onLater: (later: boolean) => void;
}) {
  const count = state.communicationThreadIds.length;
  const summary = state.communicationLater
    ? "Később kerül hozzárendelésre"
    : count === 0
      ? "Nincs kiválasztva"
      : count === 1
        ? "1 elsődleges beszélgetés kiválasztva"
        : `1 elsődleges és ${count - 1} további beszélgetés kiválasztva`;

  return (
    <div data-testid="intake-communication">
      <div className={intake.commRow}>
        <div className="min-w-0">
          <p className={`${intake.sectionTitle} ${ACCENT_TEXT.terracotta}`}>
            <span aria-hidden="true" className={`inline-block h-3 w-[3px] shrink-0 rounded-full ${ACCENT_BG.terracotta}`} />
            Kapcsolódó kommunikáció
          </p>
          <p data-testid="comm-summary" className="mt-0.5 text-[12.5px] text-[#2C3A31]">{summary}</p>
        </div>
        {/* Full width on mobile so the controls wrap below the summary instead
            of overflowing the sheet; inline from sm up. */}
        <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
          <label className="flex items-center gap-1.5 text-[12px] font-medium text-[#2C3A31]">
            <input data-testid="comm-later" type="checkbox" checked={state.communicationLater} onChange={(e) => onLater(e.target.checked)} />
            Később kapcsolom hozzá
          </label>
          <button
            type="button"
            data-testid="comm-open-picker"
            onClick={onOpenPicker}
            disabled={state.communicationLater}
            className={`${intake.secondaryAction} ml-auto sm:ml-0`}
          >
            Kommunikáció kiválasztása
          </button>
        </div>
      </div>
      <FieldError message={errors.communication} />
    </div>
  );
}

/** Participants always carry a role. */
export function CaseParticipantsSection({
  state, errors, users, onAdd, onUpdate, onRemove,
}: {
  state: IntakeState; errors: IntakeErrors; users: User[];
  onAdd: (kind: ParticipantRow["kind"]) => void;
  onUpdate: (key: string, p: Partial<ParticipantRow>) => void;
  onRemove: (key: string) => void;
}) {
  return (
    <div data-testid="intake-participants">
      <div className="flex flex-wrap gap-2">
        <AdminButton size="xs" variant="neutral" onClick={() => onAdd("INTERNAL")}>+ Belső munkatárs</AdminButton>
        <AdminButton size="xs" variant="neutral" onClick={() => onAdd("EXTERNAL")}>+ Külső résztvevő</AdminButton>
      </div>
      {state.participants.length === 0 ? (
        <p className="mt-2 text-[11.5px] text-[var(--adm-text-muted)]">Nincs további résztvevő.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {state.participants.map((p) => (
            <li key={p.key} data-testid="participant-row" className="rounded-md border border-[var(--adm-border)] p-2">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {p.kind === "INTERNAL" ? (
                  <select className={field} value={p.userId} onChange={(e) => onUpdate(p.key, { userId: e.target.value })} aria-label="Munkatárs">
                    <option value="">Válassz munkatársat…</option>
                    {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                ) : (
                  <input className={field} placeholder="Név" value={p.name} onChange={(e) => onUpdate(p.key, { name: e.target.value })} aria-label="Név" />
                )}
                <input data-testid="participant-role" className={field} placeholder="Szerep (kötelező)" value={p.role} onChange={(e) => onUpdate(p.key, { role: e.target.value })} aria-label="Szerep" />
                {p.kind === "EXTERNAL" ? (
                  <select className={field} value={p.side} onChange={(e) => onUpdate(p.key, { side: e.target.value })} aria-label="Oldal">
                    <option value="CLIENT">Ügyfél oldal</option>
                    <option value="OPPOSING">Ellenérdekű</option>
                    <option value="NEUTRAL">Semleges</option>
                    <option value="OTHER">Egyéb</option>
                  </select>
                ) : <span />}
              </div>
              <div className="mt-1 flex items-center justify-between">
                <FieldError message={errors[`participant-${p.key}`]} />
                <button type="button" onClick={() => onRemove(p.key)} className="text-[10.5px] font-semibold text-[#A8442A] hover:underline">Eltávolítás</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export const TASK_PRESETS = [
  "Iratok bekérése", "Meghatalmazás előkészítése", "Jogi kutatás",
  "Ellenfél felszólítása", "Beadványtervezet elkészítése",
];

/** Presets create ordinary editable rows — never hard-coded records. */
export function CaseInitialTasksSection({
  state, errors, users, onAdd, onUpdate, onRemove,
}: {
  state: IntakeState; errors: IntakeErrors; users: User[];
  onAdd: (title?: string) => void;
  onUpdate: (key: string, p: Partial<TaskRow>) => void;
  onRemove: (key: string) => void;
}) {
  return (
    <div data-testid="intake-tasks">
      <div className="flex flex-wrap gap-1.5">
        <AdminButton size="xs" variant="neutral" onClick={() => onAdd()}>+ Feladat</AdminButton>
        {TASK_PRESETS.map((p) => (
          <AdminButton key={p} size="xs" variant="muted" data-testid="task-preset" onClick={() => onAdd(p)}>{p}</AdminButton>
        ))}
      </div>
      {state.tasks.length === 0 ? (
        <p className="mt-2 text-[11.5px] text-[var(--adm-text-muted)]">Nincs induló feladat.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {state.tasks.map((t) => (
            <li key={t.key} data-testid="task-row" className="rounded-md border border-[var(--adm-border)] p-2">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
                <input className={`${field} sm:col-span-2`} placeholder="Feladat megnevezése" value={t.title} onChange={(e) => onUpdate(t.key, { title: e.target.value })} aria-label="Feladat" />
                <select className={field} value={t.assignedToId} onChange={(e) => onUpdate(t.key, { assignedToId: e.target.value })} aria-label="Felelős">
                  <option value="">Felelős nincs</option>
                  {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
                <input type="date" className={field} value={t.dueDate} onChange={(e) => onUpdate(t.key, { dueDate: e.target.value })} aria-label="Határidő" />
              </div>
              <div className="mt-1 flex items-center justify-between gap-2">
                <select className={`${field} mt-0 w-32`} value={t.priority} onChange={(e) => onUpdate(t.key, { priority: e.target.value })} aria-label="Prioritás">
                  {["LOW", "MEDIUM", "HIGH", "URGENT"].map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
                <FieldError message={errors[`task-${t.key}`]} />
                <button type="button" data-testid="task-remove" onClick={() => onRemove(t.key)} className="text-[10.5px] font-semibold text-[#A8442A] hover:underline">Eltávolítás</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
