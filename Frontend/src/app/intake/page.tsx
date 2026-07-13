"use client";

/**
 * /intake — WORKFLOW-CORE-INTAKE-MATTER-OPENING-1
 *
 * Canonical internal intake surface: the intake queue (backend-derived
 * readiness, blockers and next steps) plus a controlled step-based new-matter
 * wizard. The wizard calls the existing safe endpoints sequentially
 * (client → case → responsibility → opening tasks → deadline); combined
 * client+case creation is intentionally NOT atomic because case creation has
 * SharePoint side effects (documented limitation). Nothing is persisted in the
 * browser; the backend remains the source of truth. No conflict clearance is
 * recorded anywhere — the conflict step is a truthful unavailable notice.
 */

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AuthenticatedApp } from "@/components/AuthenticatedApp";
import { AdminBadge, AdminButton, AdminPanel, AdminSectionHeader } from "@/components/adminiculum/ui";
import {
  addCaseCollaborator,
  assignCase,
  createCase,
  createClient,
  createOpeningTasks,
  getIntakeQueue,
  getUsers,
  lookupClients,
  updateCase,
  type ClientLookupCandidate,
  type IntakeQueueResponse,
  type User,
} from "@/lib/api";

const MATTER_TYPES = [
  { value: "CONTRACT_REVIEW", label: "Szerződés véleményezés" },
  { value: "CONTRACT_DRAFTING", label: "Szerződés szerkesztés" },
  { value: "LITIGATION", label: "Peres ügy" },
  { value: "CORPORATE", label: "Társasági jog" },
  { value: "EMPLOYMENT", label: "Munkajog" },
  { value: "REAL_ESTATE", label: "Ingatlan" },
  { value: "OTHER", label: "Egyéb" },
];

const OPENING_TASK_OPTIONS = [
  { code: "VERIFY_CLIENT_DETAILS", title: "Ügyfél alapadatok ellenőrzése" },
  { code: "RECORD_CLIENT_ROLE", title: "Ügyfél szerep rögzítése az ügyben" },
  { code: "COMPLETE_CONFLICT_REVIEW", title: "Összeférhetetlenségi ellenőrzés elvégzése (manuális, rendszeren kívüli)" },
  { code: "CONFIRM_RESPONSIBLE_LAWYER", title: "Felelős ügyvéd megerősítése" },
  { code: "COLLECT_INITIAL_DOCUMENTS", title: "Kezdeti dokumentumok bekérése" },
  { code: "REVIEW_INITIAL_DOCUMENTS", title: "Kezdeti dokumentumok áttekintése" },
  { code: "CONFIRM_SCOPE_AND_NEXT_STEP", title: "Megbízási terjedelem és következő lépés megerősítése" },
  { code: "SET_INITIAL_DEADLINE", title: "Kezdő határidő beállítása" },
];

const WIZARD_STEPS = ["Ügyfél", "Ügy", "Felelősség", "Összeférhetetlenség", "Nyitási terv", "Áttekintés"] as const;

type WizardState = {
  clientMode: "EXISTING" | "NEW";
  selectedClient: { id: string; displayName: string } | null;
  newClientName: string;
  newClientEmail: string;
  newClientPhone: string;
  matterType: string;
  clientRole: string;
  description: string;
  responsibleLawyerId: string;
  collaboratorIds: string[];
  selectedTaskCodes: string[];
  initialDeadline: string;
};

const INITIAL_WIZARD: WizardState = {
  clientMode: "EXISTING",
  selectedClient: null,
  newClientName: "",
  newClientEmail: "",
  newClientPhone: "",
  matterType: "OTHER",
  clientRole: "",
  description: "",
  responsibleLawyerId: "",
  collaboratorIds: [],
  selectedTaskCodes: [],
  initialDeadline: "",
};

const inputClass =
  "w-full rounded-[5px] border border-[rgba(22,32,26,0.20)] bg-white px-3 py-2 text-[13px] text-[#16201A] focus:border-[#082817] focus:outline-none focus:ring-1 focus:ring-[#082817]";

function IntakePageContent() {
  return (
    <div className="mx-auto max-w-[1200px] space-y-4">
      <NewMatterWizard />
      <IntakeQueuePanel />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Intake queue
// ---------------------------------------------------------------------------

function IntakeQueuePanel() {
  const [queue, setQueue] = useState<IntakeQueueResponse | null>(null);
  const [scope, setScope] = useState<"MY_INTAKES" | "MY_CASES" | "TEAM">("MY_INTAKES");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "NEEDS_ATTENTION" | "READY">("ALL");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setQueue(await getIntakeQueue({ scope, status: statusFilter, limit: 50 }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Az ügyfelvételi sor nem tölthető be.");
    } finally {
      setLoading(false);
    }
  }, [scope, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <AdminPanel className="overflow-hidden">
      <AdminSectionHeader
        eyebrow="Ügyfelvétel"
        title="Beérkezési sor"
        subtitle="Beérkezési állapotban lévő ügyek — backend-számított készenléttel és hiányokkal."
        action={
          <div className="flex gap-2">
            <select
              className={inputClass}
              value={scope}
              onChange={(event) => setScope(event.target.value as typeof scope)}
              aria-label="Sor hatóköre"
            >
              <option value="MY_INTAKES">Saját beérkezések</option>
              <option value="MY_CASES">Saját ügyek</option>
              {queue?.availability.teamScope ? <option value="TEAM">Teljes csapat</option> : null}
            </select>
            <select
              className={inputClass}
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
              aria-label="Szűrő"
            >
              <option value="ALL">Mind</option>
              <option value="NEEDS_ATTENTION">Figyelmet igényel</option>
              <option value="READY">Aktiválható</option>
            </select>
          </div>
        }
      />

      {queue ? (
        <div className="flex flex-wrap gap-2 border-b border-[rgba(22,32,26,0.10)] px-4 py-2.5">
          <AdminBadge tone="neutral">Összes: {queue.summary.total}</AdminBadge>
          <AdminBadge tone="green">Aktiválható: {queue.summary.readyForActivation}</AdminBadge>
          <AdminBadge tone="amber">Hiányos: {queue.summary.blocked}</AdminBadge>
          <AdminBadge tone="burgundy">Felelős ügyvéd nélkül: {queue.summary.missingResponsibleLawyer}</AdminBadge>
        </div>
      ) : null}

      <div className="px-4 py-3">
        {loading ? (
          <p className="text-[12px] text-[#7A8479]">Betöltés…</p>
        ) : error ? (
          <p className="text-[12px] text-[#8B2A2A]">{error}</p>
        ) : !queue || queue.items.length === 0 ? (
          <p className="text-[12px] italic text-[#7A8479]">Nincs beérkezési állapotban lévő ügy ebben a nézetben.</p>
        ) : (
          <ul className="space-y-2">
            {queue.items.map((item) => (
              <li key={item.caseId} className="rounded-[6px] border border-[rgba(22,32,26,0.10)] px-3 py-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <Link
                      href={item.href}
                      className="text-[13px] font-semibold text-[#16201A] underline-offset-2 hover:underline"
                    >
                      {item.displayName}
                    </Link>
                    <p className="text-[11px] text-[#7A8479]">
                      {item.reference} · {item.client?.displayName || "Nincs ügyfél"} ·{" "}
                      {item.responsibleLawyer?.displayName || "Nincs felelős ügyvéd"}
                    </p>
                  </div>
                  {item.readiness.readyForActivation ? (
                    <AdminBadge tone="green" dot>
                      Aktiválható
                    </AdminBadge>
                  ) : (
                    <AdminBadge tone="amber" dot>
                      {item.readiness.completedRequiredItems}/{item.readiness.totalRequiredItems} kész
                    </AdminBadge>
                  )}
                </div>
                {item.nextStep ? (
                  <p className="mt-1 text-[11.5px] text-[#3D4842]">
                    <span className="font-semibold">Következő lépés:</span> {item.nextStep.label}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </AdminPanel>
  );
}

// ---------------------------------------------------------------------------
// New matter wizard
// ---------------------------------------------------------------------------

type WizardResultLine = { label: string; ok: boolean; detail?: string };

function NewMatterWizard() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [state, setState] = useState<WizardState>(INITIAL_WIZARD);
  const [users, setUsers] = useState<User[]>([]);
  const [lookupQuery, setLookupQuery] = useState("");
  const [candidates, setCandidates] = useState<ClientLookupCandidate[]>([]);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ caseId: string | null; lines: WizardResultLine[] } | null>(null);

  useEffect(() => {
    if (!open) return;
    getUsers()
      .then(setUsers)
      .catch(() => setUsers([]));
  }, [open]);

  const patch = useCallback((changes: Partial<WizardState>) => {
    setState((previous) => ({ ...previous, ...changes }));
  }, []);

  const runLookup = useCallback(async () => {
    if (lookupQuery.trim().length < 2) return;
    setLookupBusy(true);
    try {
      const response = await lookupClients(lookupQuery.trim());
      setCandidates(response.candidates);
    } catch {
      setCandidates([]);
    } finally {
      setLookupBusy(false);
    }
  }, [lookupQuery]);

  const clientReady =
    state.clientMode === "EXISTING" ? Boolean(state.selectedClient) : Boolean(state.newClientName.trim());
  const matterReady = Boolean(state.description.trim() && state.clientRole.trim());

  const stepReady = useMemo(() => {
    if (step === 0) return clientReady;
    if (step === 1) return matterReady;
    return true;
  }, [step, clientReady, matterReady]);

  const submit = useCallback(async () => {
    setSubmitting(true);
    const lines: WizardResultLine[] = [];
    let caseId: string | null = null;
    try {
      // 1. Client (existing or new) — never both, never merged.
      let clientId: string;
      let clientName: string;
      if (state.clientMode === "EXISTING") {
        if (!state.selectedClient) throw new Error("Nincs kiválasztott ügyfél.");
        clientId = state.selectedClient.id;
        clientName = state.selectedClient.displayName;
        lines.push({ label: `Meglévő ügyfél kiválasztva: ${clientName}`, ok: true });
      } else {
        const created = await createClient({
          name: state.newClientName.trim(),
          email: state.newClientEmail.trim() || undefined,
          phone: state.newClientPhone.trim() || undefined,
        });
        clientId = created.id;
        clientName = created.name;
        lines.push({ label: `Új ügyfél létrehozva: ${clientName}`, ok: true });
      }

      // 2. Case (backend chooses the safe initial intake status).
      const createdCase = await createCase({
        clientName,
        clientId,
        matterType: state.matterType,
        description: state.description.trim(),
        clientRole: state.clientRole.trim(),
      });
      caseId = createdCase.id;
      lines.push({ label: `Ügy létrehozva: ${createdCase.caseNumber}`, ok: true });

      // 3. Responsibility (explicit human selection only).
      if (state.responsibleLawyerId) {
        try {
          await assignCase(caseId, { userId: state.responsibleLawyerId, role: "OWNER_LAWYER" });
          lines.push({ label: "Felelős ügyvéd kijelölve.", ok: true });
        } catch (err) {
          lines.push({
            label: "Felelős ügyvéd kijelölése sikertelen.",
            ok: false,
            detail: err instanceof Error ? err.message : undefined,
          });
        }
      }
      for (const collaboratorId of state.collaboratorIds) {
        try {
          await addCaseCollaborator(caseId, collaboratorId);
          lines.push({ label: "Munkatárs hozzáadva.", ok: true });
        } catch (err) {
          lines.push({
            label: "Munkatárs hozzáadása sikertelen.",
            ok: false,
            detail: err instanceof Error ? err.message : undefined,
          });
        }
      }

      // 4. Opening tasks (explicitly selected only).
      if (state.selectedTaskCodes.length > 0) {
        try {
          const tasks = await createOpeningTasks(
            caseId,
            state.selectedTaskCodes.map((code) => ({ code }))
          );
          lines.push({ label: `${tasks.created.length} nyitó feladat létrehozva.`, ok: true });
        } catch (err) {
          lines.push({
            label: "Nyitó feladatok létrehozása sikertelen.",
            ok: false,
            detail: err instanceof Error ? err.message : undefined,
          });
        }
      }

      // 5. Initial deadline — the existing Case.deadline field (explicit date only).
      if (state.initialDeadline) {
        try {
          await updateCase(caseId, { deadline: state.initialDeadline });
          lines.push({ label: "Kezdő ügyhatáridő beállítva.", ok: true });
        } catch (err) {
          lines.push({
            label: "Határidő beállítása sikertelen.",
            ok: false,
            detail: err instanceof Error ? err.message : undefined,
          });
        }
      }
    } catch (err) {
      lines.push({
        label: caseId ? "A folyamat részben sikerült." : "Az ügy létrehozása sikertelen.",
        ok: false,
        detail: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setResult({ caseId, lines });
      setSubmitting(false);
    }
  }, [state]);

  const reset = useCallback(() => {
    setState(INITIAL_WIZARD);
    setStep(0);
    setResult(null);
    setCandidates([]);
    setLookupQuery("");
  }, []);

  if (!open) {
    return (
      <AdminPanel className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div>
          <p className="text-[13px] font-semibold text-[#16201A]">Új ügy felvétele</p>
          <p className="text-[11.5px] text-[#7A8479]">
            Lépésenkénti ügyfelvétel: ügyfél → ügy → felelősség → nyitási terv → áttekintés.
          </p>
        </div>
        <AdminButton variant="primary" onClick={() => setOpen(true)}>
          Új ügy indítása
        </AdminButton>
      </AdminPanel>
    );
  }

  if (result) {
    return (
      <AdminPanel className="overflow-hidden">
        <AdminSectionHeader eyebrow="Ügyfelvétel" title="Eredmény" />
        <ul className="space-y-1 px-4 py-3">
          {result.lines.map((line, index) => (
            <li key={index} className={`text-[12.5px] ${line.ok ? "text-[#123B27]" : "text-[#8B2A2A]"}`}>
              {line.ok ? "✓" : "✗"} {line.label}
              {line.detail ? <span className="text-[11px] text-[#7A8479]"> ({line.detail})</span> : null}
            </li>
          ))}
        </ul>
        <div className="flex gap-2 border-t border-[rgba(22,32,26,0.10)] px-4 py-3">
          {result.caseId ? (
            <Link href={`/cases/${encodeURIComponent(result.caseId)}`}>
              <AdminButton variant="primary" size="sm">
                Ügy megnyitása
              </AdminButton>
            </Link>
          ) : null}
          <AdminButton size="sm" onClick={reset}>
            Új felvétel
          </AdminButton>
          <AdminButton
            size="sm"
            variant="ghost"
            onClick={() => {
              reset();
              setOpen(false);
            }}
          >
            Bezárás
          </AdminButton>
        </div>
      </AdminPanel>
    );
  }

  return (
    <AdminPanel className="overflow-hidden">
      <AdminSectionHeader
        eyebrow="Ügyfelvétel"
        title={`Új ügy — ${WIZARD_STEPS[step]}`}
        subtitle={`${step + 1}/${WIZARD_STEPS.length} lépés`}
        action={
          <AdminButton
            size="sm"
            variant="ghost"
            onClick={() => {
              reset();
              setOpen(false);
            }}
          >
            Mégse
          </AdminButton>
        }
      />

      <div className="flex flex-wrap gap-1 border-b border-[rgba(22,32,26,0.10)] px-4 py-2">
        {WIZARD_STEPS.map((label, index) => (
          <span
            key={label}
            className={`rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold ${
              index === step
                ? "bg-[#082817] text-[#F4EFDB]"
                : index < step
                  ? "bg-[#E2E8DA] text-[#123B27]"
                  : "bg-[#FBF6E7] text-[#7A8479]"
            }`}
          >
            {index + 1}. {label}
          </span>
        ))}
      </div>

      <div className="space-y-3 px-4 py-4">
        {step === 0 ? (
          <div className="space-y-3">
            <div className="flex gap-2">
              <AdminButton
                size="sm"
                variant={state.clientMode === "EXISTING" ? "primary" : "neutral"}
                onClick={() => patch({ clientMode: "EXISTING" })}
              >
                Meglévő ügyfél
              </AdminButton>
              <AdminButton
                size="sm"
                variant={state.clientMode === "NEW" ? "primary" : "neutral"}
                onClick={() => patch({ clientMode: "NEW", selectedClient: null })}
              >
                Új ügyfél
              </AdminButton>
            </div>

            {state.clientMode === "EXISTING" ? (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input
                    className={inputClass}
                    placeholder="Ügyfél keresése (min. 2 karakter)…"
                    value={lookupQuery}
                    onChange={(event) => setLookupQuery(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") void runLookup();
                    }}
                  />
                  <AdminButton size="sm" disabled={lookupBusy || lookupQuery.trim().length < 2} onClick={() => void runLookup()}>
                    Keresés
                  </AdminButton>
                </div>
                {candidates.length > 0 ? (
                  <ul className="space-y-1.5">
                    {candidates.map((candidate) => (
                      <li
                        key={candidate.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-[6px] border border-[rgba(22,32,26,0.10)] px-3 py-2"
                      >
                        <div>
                          <p className="text-[12.5px] font-semibold text-[#16201A]">{candidate.displayName}</p>
                          <p className="text-[11px] text-[#7A8479]">{candidate.email || "nincs e-mail"}</p>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {candidate.matchSignals.map((signal) => (
                              <AdminBadge key={signal} tone={signal === "SIMILAR_NAME" ? "amber" : "blue"}>
                                {signal === "SIMILAR_NAME" ? "Hasonló név — emberi ellenőrzés szükséges" : signal}
                              </AdminBadge>
                            ))}
                          </div>
                        </div>
                        <AdminButton
                          size="xs"
                          variant={state.selectedClient?.id === candidate.id ? "primary" : "neutral"}
                          onClick={() => patch({ selectedClient: { id: candidate.id, displayName: candidate.displayName } })}
                        >
                          {state.selectedClient?.id === candidate.id ? "Kiválasztva" : "Kiválasztás"}
                        </AdminButton>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[11.5px] italic text-[#7A8479]">
                    {lookupBusy
                      ? "Keresés…"
                      : "Nincs találat vagy még nem futott keresés. A találat-egyezés nem duplikátum-megerősítés."}
                  </p>
                )}
              </div>
            ) : (
              <div className="grid gap-2 sm:grid-cols-3">
                <input
                  className={inputClass}
                  placeholder="Ügyfél neve *"
                  value={state.newClientName}
                  onChange={(event) => patch({ newClientName: event.target.value })}
                />
                <input
                  className={inputClass}
                  placeholder="E-mail"
                  value={state.newClientEmail}
                  onChange={(event) => patch({ newClientEmail: event.target.value })}
                />
                <input
                  className={inputClass}
                  placeholder="Telefon"
                  value={state.newClientPhone}
                  onChange={(event) => patch({ newClientPhone: event.target.value })}
                />
                <p className="text-[11px] italic text-[#7A8479] sm:col-span-3">
                  Új ügyfél létrehozása nem azonosítás-ellenőrzés. Duplikátum-gyanú esetén használja a keresést —
                  automatikus összevonás nincs.
                </p>
              </div>
            )}
          </div>
        ) : null}

        {step === 1 ? (
          <div className="grid gap-2 sm:grid-cols-2">
            <select
              className={inputClass}
              value={state.matterType}
              onChange={(event) => patch({ matterType: event.target.value })}
              aria-label="Ügytípus"
            >
              {MATTER_TYPES.map((matterType) => (
                <option key={matterType.value} value={matterType.value}>
                  {matterType.label}
                </option>
              ))}
            </select>
            <input
              className={inputClass}
              placeholder="Ügyfél szerep (pl. MEGBÍZÓ, VEVŐ) *"
              value={state.clientRole}
              onChange={(event) => patch({ clientRole: event.target.value })}
            />
            <textarea
              className={`${inputClass} sm:col-span-2`}
              rows={3}
              placeholder="Rövid belső ügyleírás *"
              value={state.description}
              onChange={(event) => patch({ description: event.target.value })}
            />
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-2">
            <label className="block text-[11px] font-semibold text-[#3D4842]" htmlFor="intake-lawyer">
              Felelős ügyvéd (emberi döntés — nincs automatikus javaslat)
            </label>
            <select
              id="intake-lawyer"
              className={inputClass}
              value={state.responsibleLawyerId}
              onChange={(event) => patch({ responsibleLawyerId: event.target.value })}
            >
              <option value="">— Később kerül kijelölésre —</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name} ({user.role})
                </option>
              ))}
            </select>
            <p className="text-[11px] font-semibold text-[#3D4842]">Munkatársak</p>
            <div className="grid gap-1 sm:grid-cols-2">
              {users.map((user) => (
                <label key={user.id} className="flex items-center gap-2 text-[12px] text-[#16201A]">
                  <input
                    type="checkbox"
                    checked={state.collaboratorIds.includes(user.id)}
                    onChange={(event) =>
                      patch({
                        collaboratorIds: event.target.checked
                          ? [...new Set([...state.collaboratorIds, user.id])]
                          : state.collaboratorIds.filter((id) => id !== user.id),
                      })
                    }
                  />
                  {user.name}
                </label>
              ))}
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="rounded-[6px] border border-dashed border-[rgba(22,32,26,0.20)] bg-[#FBF6E7] px-3 py-3">
            <p className="text-[12.5px] font-semibold text-[#16201A]">Összeférhetetlenségi ellenőrzés — nem elérhető</p>
            <p className="mt-1 text-[12px] leading-relaxed text-[#3D4842]">
              Az összeférhetetlenségi ellenőrzés nincs strukturáltan rögzítve ebben a rendszerben, ezért itt nem
              jelölhető „elvégzettnek”. A manuális ellenőrzés elvégzése és dokumentálása a rendszeren kívüli emberi
              felelősség. A meglévő ügyfél- és ügykeresés segítheti az áttekintést, de a keresési találat vagy annak
              hiánya nem jelent összeférhetetlenségi megfelelést.
            </p>
          </div>
        ) : null}

        {step === 4 ? (
          <div className="space-y-3">
            <p className="text-[11px] font-semibold text-[#3D4842]">
              Nyitó feladatok (csak a kifejezetten kiválasztottak jönnek létre — automatikus létrehozás nincs)
            </p>
            <div className="grid gap-1 sm:grid-cols-2">
              {OPENING_TASK_OPTIONS.map((option) => (
                <label key={option.code} className="flex items-start gap-2 text-[12px] text-[#16201A]">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={state.selectedTaskCodes.includes(option.code)}
                    onChange={(event) =>
                      patch({
                        selectedTaskCodes: event.target.checked
                          ? [...new Set([...state.selectedTaskCodes, option.code])]
                          : state.selectedTaskCodes.filter((code) => code !== option.code),
                      })
                    }
                  />
                  {option.title}
                </label>
              ))}
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#3D4842]" htmlFor="intake-deadline">
                Kezdő ügyhatáridő (a meglévő ügyhatáridő-mező; kifejezett dátum — nincs szövegből kinyerés)
              </label>
              <input
                id="intake-deadline"
                type="date"
                className={inputClass}
                value={state.initialDeadline}
                onChange={(event) => patch({ initialDeadline: event.target.value })}
              />
            </div>
          </div>
        ) : null}

        {step === 5 ? (
          <div className="space-y-2 text-[12.5px] text-[#16201A]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7A8479]">Pontosan ez jön létre:</p>
            <ul className="space-y-1">
              <li>
                • Ügyfél:{" "}
                {state.clientMode === "EXISTING"
                  ? `meglévő — ${state.selectedClient?.displayName}`
                  : `új — ${state.newClientName}`}
              </li>
              <li>
                • Ügy: {MATTER_TYPES.find((matterType) => matterType.value === state.matterType)?.label} · szerep:{" "}
                {state.clientRole || "—"}
              </li>
              <li>• Felelős ügyvéd: {users.find((user) => user.id === state.responsibleLawyerId)?.name || "később"}</li>
              <li>• Munkatársak: {state.collaboratorIds.length} fő</li>
              <li>• Nyitó feladatok: {state.selectedTaskCodes.length} db</li>
              <li>• Kezdő határidő: {state.initialDeadline || "nincs"}</li>
            </ul>
            <p className="text-[11px] italic text-[#7A8479]">
              Nem elérhető és ezért nem jön létre: összeférhetetlenségi bejegyzés, megbízás-elfogadási állapot, felek /
              ellenérdekű felek strukturált rögzítése. Külső rendszer nem kerül megszólításra; ügyfélértesítés nem
              történik. Az ügy beérkezési állapotban jön létre — az aktiválás külön, kifejezett lépés.
            </p>
          </div>
        ) : null}
      </div>

      <div className="flex items-center justify-between border-t border-[rgba(22,32,26,0.10)] px-4 py-3">
        <AdminButton size="sm" variant="ghost" disabled={step === 0 || submitting} onClick={() => setStep((current) => Math.max(0, current - 1))}>
          ← Vissza
        </AdminButton>
        {step < WIZARD_STEPS.length - 1 ? (
          <AdminButton size="sm" variant="primary" disabled={!stepReady} onClick={() => setStep((current) => current + 1)}>
            Tovább →
          </AdminButton>
        ) : (
          <AdminButton size="sm" variant="primary" disabled={submitting || !clientReady || !matterReady} onClick={() => void submit()}>
            {submitting ? "Létrehozás…" : "Létrehozás"}
          </AdminButton>
        )}
      </div>
    </AdminPanel>
  );
}

export default function IntakePage() {
  return (
    <AuthenticatedApp section="cases">
      <Suspense fallback={<div className="p-4 text-[12px] text-[#7A8479]">Betöltés…</div>}>
        <IntakePageContent />
      </Suspense>
    </AuthenticatedApp>
  );
}
