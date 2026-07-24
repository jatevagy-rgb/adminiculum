"use client";

/**
 * Canonical intake form state (CASE-INTAKE-REDESIGN-1).
 *
 * One source of truth for every field. The first next legal step appears in both
 * quick intake and the detailed starting context, but there is exactly ONE stored
 * value (`startingContext.nextStep`) — the two inputs are views of it, so opening
 * the detailed section can never fork the state.
 *
 * Submission is a single POST /cases/intake. There is no fallback to the legacy
 * endpoint and no follow-up writes: the server transaction is what guarantees a
 * matter is never half-created.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import { createCaseIntake, caseIntakeErrorMessage, type CaseIntakePayload, type CaseIntakeResult } from "@/lib/api";

export type DeadlineMode = "ABSOLUTE" | "RELATIVE";
export type RelativeUnit = "MINUTE" | "HOUR" | "DAY" | "WEEK";

export const DEADLINE_TYPE_OPTIONS = [
  { value: "STATUTORY", label: "Jogszabályi / eljárási" },
  { value: "CLIENT_COMMITMENT", label: "Ügyfélnek vállalt" },
  { value: "INTERNAL", label: "Belső munkahatáridő" },
  { value: "NEXT_ACTION", label: "Következő teendő" },
  { value: "OTHER", label: "Egyéb" },
] as const;

export const RELATIVE_UNIT_OPTIONS: Array<{ value: RelativeUnit; label: string }> = [
  { value: "MINUTE", label: "perc" },
  { value: "HOUR", label: "óra" },
  { value: "DAY", label: "nap" },
  { value: "WEEK", label: "hét" },
];

/** Backend accepts a single reminder, so the UI offers exactly one select. */
export const REMINDER_OPTIONS = [
  { value: "", label: "Nincs emlékeztető" },
  { value: "15", label: "15 perccel előtte" },
  { value: "60", label: "1 órával előtte" },
  { value: "1440", label: "1 nappal előtte" },
  { value: "2880", label: "2 nappal előtte" },
  { value: "10080", label: "1 héttel előtte" },
];

const UNIT_MS: Record<RelativeUnit, number> = {
  MINUTE: 60_000, HOUR: 3_600_000, DAY: 86_400_000, WEEK: 604_800_000,
};

export interface ParticipantRow {
  key: string;
  kind: "INTERNAL" | "EXTERNAL";
  userId: string;          // internal
  name: string;            // external
  role: string;            // required for both
  side: string;            // external
  organization: string;
}
export interface TaskRow {
  key: string;
  title: string;
  assignedToId: string;
  dueDate: string;
  priority: string;
}

export interface IntakeState {
  clientId: string;
  title: string;
  matterType: string;
  clientRole: string;
  assignedLawyerId: string;
  startingContext: {
    originReason: string;
    currentSituation: string;
    clientExpectation: string;
    urgentAction: string;
    nextStep: string;
  };
  hasDeadline: boolean;
  deadline: {
    title: string;
    deadlineType: string;
    mode: DeadlineMode;
    date: string;
    time: string;
    relativeValue: string;
    relativeUnit: RelativeUnit;
    reminderMinutes: string;
    responsibleId: string;
  };
  communicationThreadIds: string[];
  primaryCommunicationThreadId: string;
  communicationLater: boolean;
  participants: ParticipantRow[];
  tasks: TaskRow[];
}

const newKey = () => Math.random().toString(36).slice(2, 10);

export const emptyIntakeState = (): IntakeState => ({
  clientId: "", title: "", matterType: "", clientRole: "", assignedLawyerId: "",
  startingContext: { originReason: "", currentSituation: "", clientExpectation: "", urgentAction: "", nextStep: "" },
  hasDeadline: false,
  deadline: {
    title: "", deadlineType: "NEXT_ACTION", mode: "ABSOLUTE",
    date: "", time: "", relativeValue: "3", relativeUnit: "DAY",
    reminderMinutes: "", responsibleId: "",
  },
  communicationThreadIds: [], primaryCommunicationThreadId: "", communicationLater: false,
  participants: [], tasks: [],
});

/** Resolve the deadline to an absolute moment for display. Mirrors the server. */
export function computeAbsoluteDeadline(d: IntakeState["deadline"], now: Date = new Date()): Date | null {
  if (d.mode === "RELATIVE") {
    const amount = Number(d.relativeValue);
    if (!Number.isInteger(amount) || amount <= 0) return null;
    return new Date(now.getTime() + amount * UNIT_MS[d.relativeUnit]);
  }
  if (!d.date) return null;
  const parsed = new Date(`${d.date}T${d.time || "09:00"}:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export type IntakeErrors = Partial<Record<string, string>>;

export function useCaseIntakeForm(onCreated: (result: CaseIntakeResult) => void) {
  const [state, setState] = useState<IntakeState>(emptyIntakeState);
  const [detailedOpen, setDetailedOpen] = useState(false);
  const [errors, setErrors] = useState<IntakeErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // A ref, not the state value: two clicks in the same tick both read the same
  // stale `submitting` closure, so state alone cannot stop a double submit.
  const inFlight = useRef(false);

  const patch = useCallback(<K extends keyof IntakeState>(key: K, value: IntakeState[K]) => {
    setState((s) => ({ ...s, [key]: value }));
  }, []);
  const patchContext = useCallback((key: keyof IntakeState["startingContext"], value: string) => {
    setState((s) => ({ ...s, startingContext: { ...s.startingContext, [key]: value } }));
  }, []);
  const patchDeadline = useCallback((key: keyof IntakeState["deadline"], value: string) => {
    setState((s) => ({ ...s, deadline: { ...s.deadline, [key]: value } }));
  }, []);

  // ---- participants -----------------------------------------------------
  const addParticipant = useCallback((kind: ParticipantRow["kind"]) => {
    setState((s) => ({
      ...s,
      participants: [...s.participants, { key: newKey(), kind, userId: "", name: "", role: "", side: kind === "EXTERNAL" ? "OPPOSING" : "CLIENT", organization: "" }],
    }));
  }, []);
  const updateParticipant = useCallback((key: string, p: Partial<ParticipantRow>) => {
    setState((s) => ({ ...s, participants: s.participants.map((r) => (r.key === key ? { ...r, ...p } : r)) }));
  }, []);
  const removeParticipant = useCallback((key: string) => {
    setState((s) => ({ ...s, participants: s.participants.filter((r) => r.key !== key) }));
  }, []);

  // ---- tasks ------------------------------------------------------------
  const addTask = useCallback((title = "") => {
    setState((s) => ({ ...s, tasks: [...s.tasks, { key: newKey(), title, assignedToId: "", dueDate: "", priority: "MEDIUM" }] }));
  }, []);
  const updateTask = useCallback((key: string, p: Partial<TaskRow>) => {
    setState((s) => ({ ...s, tasks: s.tasks.map((r) => (r.key === key ? { ...r, ...p } : r)) }));
  }, []);
  const removeTask = useCallback((key: string) => {
    setState((s) => ({ ...s, tasks: s.tasks.filter((r) => r.key !== key) }));
  }, []);

  // ---- communication ----------------------------------------------------
  const toggleThread = useCallback((id: string) => {
    setState((s) => {
      const selected = s.communicationThreadIds.includes(id);
      const next = selected ? s.communicationThreadIds.filter((x) => x !== id) : [...s.communicationThreadIds, id];
      return {
        ...s,
        communicationThreadIds: next,
        // The primary must always remain within the selection.
        primaryCommunicationThreadId: next.includes(s.primaryCommunicationThreadId) ? s.primaryCommunicationThreadId : (next[0] || ""),
        communicationLater: next.length > 0 ? false : s.communicationLater,
      };
    });
  }, []);
  const setPrimaryThread = useCallback((id: string) => {
    setState((s) => (s.communicationThreadIds.includes(id) ? { ...s, primaryCommunicationThreadId: id } : s));
  }, []);
  /** Commit a staged selection from the picker drawer in one update. */
  const setCommunicationSelection = useCallback((ids: string[], primary: string) => {
    setState((s) => ({
      ...s,
      communicationThreadIds: ids,
      // The primary must always be one of the selected threads.
      primaryCommunicationThreadId: ids.includes(primary) ? primary : (ids[0] || ""),
      communicationLater: ids.length > 0 ? false : s.communicationLater,
    }));
  }, []);

  const setCommunicationLater = useCallback((later: boolean) => {
    setState((s) => ({
      ...s,
      communicationLater: later,
      communicationThreadIds: later ? [] : s.communicationThreadIds,
      primaryCommunicationThreadId: later ? "" : s.primaryCommunicationThreadId,
    }));
  }, []);

  const absoluteDeadline = useMemo(
    () => (state.hasDeadline ? computeAbsoluteDeadline(state.deadline) : null),
    [state.hasDeadline, state.deadline],
  );

  const validate = useCallback((): IntakeErrors => {
    const e: IntakeErrors = {};
    if (!state.clientId) e.clientId = "Válassz ügyfelet.";
    if (!state.title.trim()) e.title = "Az ügy megnevezése kötelező.";
    if (!state.matterType) e.matterType = "Válassz ügytípust.";
    if (!state.assignedLawyerId) e.assignedLawyerId = "Válassz felelős ügyvédet.";
    if (!state.startingContext.nextStep.trim()) e.nextStep = "Add meg az első következő lépést.";
    if (!state.communicationLater && state.communicationThreadIds.length === 0) {
      e.communication = "Válassz kapcsolódó levelezést, vagy jelöld a későbbi hozzárendelést.";
    }
    if (state.hasDeadline) {
      if (!state.deadline.title.trim()) e.deadlineTitle = "A határidő megnevezése kötelező.";
      if (state.deadline.mode === "RELATIVE") {
        const v = Number(state.deadline.relativeValue);
        if (!Number.isInteger(v) || v <= 0) e.deadlineRelative = "Adj meg pozitív egész számot.";
      } else if (!state.deadline.date) {
        e.deadlineDate = "Válassz dátumot.";
      }
    }
    state.participants.forEach((p) => {
      // A participant is never just a name — the role is required.
      if (!p.role.trim()) e[`participant-${p.key}`] = "A szerep megadása kötelező.";
      if (p.kind === "INTERNAL" && !p.userId) e[`participant-${p.key}`] = "Válassz felhasználót.";
      if (p.kind === "EXTERNAL" && !p.name.trim()) e[`participant-${p.key}`] = "A név megadása kötelező.";
    });
    state.tasks.forEach((t) => {
      if (!t.title.trim()) e[`task-${t.key}`] = "A feladat megnevezése kötelező.";
    });
    return e;
  }, [state]);

  const buildPayload = useCallback((): CaseIntakePayload => {
    const ctx = state.startingContext;
    const payload: CaseIntakePayload = {
      clientId: state.clientId,
      title: state.title.trim(),
      matterType: state.matterType || "OTHER",
      clientRole: state.clientRole || null,
      assignedLawyerId: state.assignedLawyerId || null,
      startingContext: {
        originReason: ctx.originReason.trim() || null,
        currentSituation: ctx.currentSituation.trim() || null,
        clientExpectation: ctx.clientExpectation.trim() || null,
        urgentAction: ctx.urgentAction.trim() || null,
        nextStep: ctx.nextStep.trim() || null,
      },
      communicationThreadIds: state.communicationLater ? [] : state.communicationThreadIds,
      primaryCommunicationThreadId: state.communicationLater ? null : (state.primaryCommunicationThreadId || null),
    };

    const internal = state.participants.filter((p) => p.kind === "INTERNAL" && p.userId);
    if (internal.length) payload.participants = internal.map((p) => ({ userId: p.userId, role: p.role.trim().toUpperCase() }));

    const external = state.participants.filter((p) => p.kind === "EXTERNAL" && p.name.trim());
    if (external.length) {
      payload.externalParticipants = external.map((p) => ({
        name: p.name.trim(), role: p.role.trim(), side: p.side,
        organization: p.organization.trim() || null,
      }));
    }

    // No deadline selected means no deadline object is sent at all.
    if (state.hasDeadline) {
      const d = state.deadline;
      const base = {
        title: d.title.trim(),
        deadlineType: d.deadlineType as CaseIntakePayload["deadlines"] extends Array<infer T> ? T extends { deadlineType: infer D } ? D : never : never,
        reminderMinutesBefore: d.reminderMinutes ? Number(d.reminderMinutes) : null,
        responsibleId: d.responsibleId || null,
      };
      payload.deadlines = [
        d.mode === "RELATIVE"
          ? { ...base, inputMode: "RELATIVE" as const, relativeValue: Number(d.relativeValue), relativeUnit: d.relativeUnit }
          : { ...base, inputMode: "ABSOLUTE" as const, dueAt: (computeAbsoluteDeadline(d) as Date).toISOString() },
      ];
    }

    const tasks = state.tasks.filter((t) => t.title.trim());
    if (tasks.length) {
      payload.initialTasks = tasks.map((t) => ({
        title: t.title.trim(),
        assignedToId: t.assignedToId || null,
        dueDate: t.dueDate || null,
        priority: t.priority || "MEDIUM",
      }));
    }
    return payload;
  }, [state]);

  const submit = useCallback(async () => {
    if (inFlight.current) return; // double-submit guard (synchronous)
    const e = validate();
    setErrors(e);
    setServerError(null);
    if (Object.keys(e).length > 0) {
      // Validation failures inside the collapsed area must be visible.
      if (Object.keys(e).some((k) => k.startsWith("participant-") || k.startsWith("task-") || k.startsWith("deadline"))) {
        setDetailedOpen(true);
      }
      return;
    }
    inFlight.current = true;
    setSubmitting(true);
    try {
      const result = await createCaseIntake(buildPayload());
      onCreated(result);
    } catch (err) {
      setServerError(caseIntakeErrorMessage(err));
      inFlight.current = false;
      setSubmitting(false);
    }
  }, [validate, buildPayload, onCreated]);

  return {
    state, setState, patch, patchContext, patchDeadline,
    detailedOpen, setDetailedOpen,
    errors, serverError, submitting,
    absoluteDeadline,
    addParticipant, updateParticipant, removeParticipant,
    addTask, updateTask, removeTask,
    toggleThread, setPrimaryThread, setCommunicationLater, setCommunicationSelection,
    submit, validate, buildPayload,
  };
}
