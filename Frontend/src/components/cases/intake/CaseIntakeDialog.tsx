"use client";

/**
 * Case intake dialog (CASE-INTAKE-REDESIGN-1).
 *
 * Replaces the six-step wizard. There is no stepper and no wizard semantics: the
 * quick intake is always visible and sufficient on its own, and everything
 * optional lives in one collapsed detailed area. Creation is a single
 * POST /cases/intake, so the matter and its whole starting context are created
 * atomically or not at all.
 */
import { useEffect, useState } from "react";
import { getClientList, getUsers, type Client, type User, type CaseIntakeResult } from "@/lib/api";
import { AdminButton } from "@/components/adminiculum/ui";
import { useCaseIntakeForm } from "./useCaseIntakeForm";
import {
  Section, CaseBasicsSection, CaseStartingContextSection, CaseDeadlineSection,
  CaseCommunicationPicker, CaseParticipantsSection, CaseInitialTasksSection,
  field, label, FieldError,
} from "./CaseIntakeSections";

export function CaseIntakeDialog({
  open, onClose, onCreated, initialClientId,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (result: CaseIntakeResult) => void;
  initialClientId?: string;
}) {
  const [clients, setClients] = useState<Client[]>([]);
  const [clientsLoading, setClientsLoading] = useState(true);
  const [clientsError, setClientsError] = useState<string | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const form = useCaseIntakeForm(onCreated);
  const { state, patch, patchContext, patchDeadline, errors, serverError, submitting, absoluteDeadline } = form;

  useEffect(() => {
    if (!open) return;
    let active = true;
    // One typed adapter owns the envelope; a malformed payload is an error state,
    // never a silently empty selector.
    setClientsLoading(true);
    setClientsError(null);
    getClientList()
      .then((list) => { if (active) setClients(list); })
      .catch((err) => {
        if (!active) return;
        setClients([]);
        setClientsError(err instanceof Error && err.name === 'MalformedResponseError'
          ? err.message
          : 'Az ügyféllista nem tölthető be.');
      })
      .finally(() => { if (active) setClientsLoading(false); });
    getUsers().then((u) => { if (active) setUsers(u); }).catch(() => { if (active) setUsers([]); });
    return () => { active = false; };
  }, [open]);

  useEffect(() => {
    if (open && initialClientId) patch("clientId", initialClientId);
  }, [open, initialClientId, patch]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !submitting) onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, submitting]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] overflow-y-auto bg-[rgba(17,24,20,0.45)] p-3 sm:p-6" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Új ügy"
        data-testid="case-intake-dialog"
        className="mx-auto w-full max-w-[900px] overflow-hidden rounded-xl bg-[var(--adm-ivory-50)] shadow-[0_30px_80px_rgba(0,42,35,0.28)]"
      >
        {/* Sticky header: the title and the create action stay visible while scrolling. */}
        <header
          data-testid="intake-sticky-header"
          className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--adm-border)] bg-white px-4 py-3"
        >
          <div className="min-w-0">
            <h2 className="font-serif text-[22px] font-semibold leading-tight text-[var(--adm-text)]">Új ügy</h2>
            <p className="text-[11.5px] text-[var(--adm-text-muted)]">A kötelező mezőkkel az ügy azonnal létrehozható.</p>
          </div>
          <div className="flex shrink-0 gap-2">
            <AdminButton variant="neutral" size="sm" onClick={onClose} disabled={submitting}>Mégse</AdminButton>
            <AdminButton variant="primary" size="sm" data-testid="intake-submit" onClick={() => void form.submit()} disabled={submitting}>
              {submitting ? "Létrehozás…" : "Ügy létrehozása"}
            </AdminButton>
          </div>
        </header>

        <div className="space-y-3 p-4">
          {serverError ? (
            <div role="alert" data-testid="intake-server-error" className="rounded-md bg-[#FBEBE7] px-3 py-2 text-[12px] font-semibold text-[#A8442A]">
              {serverError}
            </div>
          ) : null}

          {/* ---- Quick intake: always visible, sufficient on its own ---- */}
          <Section title="Gyors ügyindítás">
            <CaseBasicsSection state={state} errors={errors} clients={clients} users={users} onPatch={patch} clientsLoading={clientsLoading} clientsError={clientsError} />
            <div className="mt-3">
              <label className={label} htmlFor="ci-next-quick">Első következő ügyvédi lépés</label>
              <input
                id="ci-next-quick"
                data-testid="intake-next-step-quick"
                className={field}
                value={state.startingContext.nextStep}
                onChange={(e) => patchContext("nextStep", e.target.value)}
              />
              <FieldError message={errors.nextStep} />
            </div>
            <div className="mt-3">
              <p className={label}>Kapcsolódó kommunikáció</p>
              <div className="mt-1">
                <CaseCommunicationPicker
                  state={state} errors={errors}
                  onToggle={form.toggleThread} onSetPrimary={form.setPrimaryThread} onLater={form.setCommunicationLater}
                />
              </div>
            </div>
          </Section>

          {/* ---- Detailed configuration: collapsed by default ---- */}
          <div className="rounded-lg bg-white shadow-[0_1px_2px_rgba(22,32,26,0.06)]">
            <button
              type="button"
              data-testid="intake-detailed-toggle"
              aria-expanded={form.detailedOpen}
              onClick={() => form.setDetailedOpen(!form.detailedOpen)}
              className="flex w-full items-center justify-between px-3 py-2.5 text-left"
            >
              <span className="font-serif text-[15px] font-semibold text-[var(--adm-text)]">Részletes beállítás</span>
              <span className="text-[11px] font-semibold text-[var(--adm-text-muted)]">
                {form.detailedOpen ? "Bezárás" : "Opcionális — induló helyzet, határidő, résztvevők, feladatok"}
              </span>
            </button>

            {form.detailedOpen ? (
              <div data-testid="intake-detailed" className="space-y-3 border-t border-[var(--adm-border)] p-3">
                <Section title="Induló helyzet">
                  <CaseStartingContextSection state={state} errors={errors} onPatchContext={patchContext} includeNextStep={false} />
                </Section>
                <Section title="Fontos határidő">
                  <CaseDeadlineSection
                    state={state} errors={errors} users={users} absolute={absoluteDeadline}
                    onPatch={patch} onPatchDeadline={patchDeadline}
                  />
                </Section>
                <Section title="Résztvevők">
                  <CaseParticipantsSection
                    state={state} errors={errors} users={users}
                    onAdd={form.addParticipant} onUpdate={form.updateParticipant} onRemove={form.removeParticipant}
                  />
                </Section>
                <Section title="Induló feladatok">
                  <CaseInitialTasksSection
                    state={state} errors={errors} users={users}
                    onAdd={form.addTask} onUpdate={form.updateTask} onRemove={form.removeTask}
                  />
                </Section>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
