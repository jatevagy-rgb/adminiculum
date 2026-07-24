"use client";

/**
 * Case intake dialog (CASE-INTAKE-REDESIGN-1 / VISUAL-CORRECTION-1).
 *
 * No stepper and no wizard semantics: quick intake is always visible and
 * sufficient on its own, everything optional sits in one collapsed accordion,
 * and creation is a single POST /cases/intake.
 *
 * Visual contract: exactly one scroll surface (the modal body). The communication
 * list lives in its own drawer, so the form never nests a second scrollbar, and
 * surfaces follow the tonal ladder in intakeStyles rather than stacking
 * near-identical white cards.
 */
import { useEffect, useState } from "react";
import { getClientList, getUsers, type Client, type User, type CaseIntakeResult } from "@/lib/api";
import { useCaseIntakeForm } from "./useCaseIntakeForm";
import {
  Section, CaseBasicsSection, CaseStartingContextSection, CaseDeadlineSection,
  CaseCommunicationSummary, CaseParticipantsSection, CaseInitialTasksSection,
  field, label, FieldError,
} from "./CaseIntakeSections";
import { CaseCommunicationPickerDrawer } from "./CaseCommunicationPickerDrawer";
import { intake, ACCENT_BG, ACCENT_TEXT } from "./intakeStyles";

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
  const [pickerOpen, setPickerOpen] = useState(false);
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
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !submitting && !pickerOpen) onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, submitting, pickerOpen]);

  if (!open) return null;

  return (
    <>
      <div className={intake.overlay} role="presentation">
        <div className="flex h-full items-start justify-center p-0 sm:p-6">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Új ügy"
            data-testid="case-intake-dialog"
            className={intake.shell}
          >
            {/* Strong sticky header — no explanatory subtitle. */}
            <header data-testid="intake-sticky-header" className={intake.header}>
              <h2 className={intake.headerTitle}>Új ügy</h2>
              <div className="flex shrink-0 items-center gap-2">
                <button type="button" className={intake.secondaryAction} onClick={onClose} disabled={submitting}>
                  Mégse
                </button>
                <button
                  type="button"
                  data-testid="intake-submit"
                  className={intake.primaryAction}
                  onClick={() => void form.submit()}
                  disabled={submitting}
                >
                  {submitting ? "Létrehozás…" : "Ügy létrehozása"}
                </button>
              </div>
            </header>

            {/* The single scroll surface. */}
            <div data-testid="intake-body" className={intake.body}>
              {serverError ? (
                <div role="alert" data-testid="intake-server-error" className="mb-3 rounded-md border border-[rgba(168,68,42,0.35)] bg-[#FBEBE7] px-3 py-2 text-[12.5px] font-semibold text-[#A8442A]">
                  {serverError}
                </div>
              ) : null}

              <div className="space-y-3">
                <Section title="Ügy alapadatai" accent="petrol">
                  <CaseBasicsSection
                    state={state} errors={errors} clients={clients} users={users} onPatch={patch}
                    clientsLoading={clientsLoading} clientsError={clientsError}
                  />
                </Section>

                {/* Operational field, subtly highlighted rather than boxed again. */}
                <div className={`${intake.area} border-l-[3px] border-[#1F5A66]`}>
                  <label className={label} htmlFor="ci-next-quick">
                    Első következő ügyvédi lépés<span className={intake.required}>*</span>
                  </label>
                  <input
                    id="ci-next-quick"
                    data-testid="intake-next-step-quick"
                    className={field}
                    value={state.startingContext.nextStep}
                    onChange={(e) => patchContext("nextStep", e.target.value)}
                  />
                  <FieldError message={errors.nextStep} />
                </div>

                <CaseCommunicationSummary
                  state={state} errors={errors}
                  onOpenPicker={() => setPickerOpen(true)}
                  onLater={form.setCommunicationLater}
                />

                {/* Detailed settings: a distinct secondary surface, not a pale footer. */}
                <div className={form.detailedOpen ? intake.accordionOpen : undefined}>
                  <button
                    type="button"
                    data-testid="intake-detailed-toggle"
                    aria-expanded={form.detailedOpen}
                    onClick={() => form.setDetailedOpen(!form.detailedOpen)}
                    className={form.detailedOpen ? "flex w-full items-center justify-between px-4 py-3 text-left" : `${intake.accordion} flex items-center justify-between`}
                  >
                    <span className="min-w-0">
                      <span className={`${intake.sectionTitle} ${ACCENT_TEXT.petrol}`}>
                        <span aria-hidden="true" className={`inline-block h-3 w-[3px] shrink-0 rounded-full ${ACCENT_BG.petrol}`} />
                        Részletes beállítás
                      </span>
                      <span className="mt-0.5 block text-[12px] text-[#5C6660]">
                        Határidő, résztvevők és induló feladatok
                      </span>
                    </span>
                    <span aria-hidden="true" data-testid="intake-detailed-chevron" className={`shrink-0 text-[13px] font-bold ${ACCENT_TEXT.petrol}`}>
                      {form.detailedOpen ? "▲" : "▼"}
                    </span>
                  </button>

                  {form.detailedOpen ? (
                    <div data-testid="intake-detailed" className="space-y-3 border-t border-[rgba(31,90,102,0.22)] p-3">
                      <Section title="Induló helyzet" accent="petrol">
                        <CaseStartingContextSection state={state} errors={errors} onPatchContext={patchContext} includeNextStep={false} />
                      </Section>
                      <Section title="Fontos határidő" accent="ochre">
                        <CaseDeadlineSection
                          state={state} errors={errors} users={users} absolute={absoluteDeadline}
                          onPatch={patch} onPatchDeadline={patchDeadline}
                        />
                      </Section>
                      <Section title="Résztvevők" accent="petrol">
                        <CaseParticipantsSection
                          state={state} errors={errors} users={users}
                          onAdd={form.addParticipant} onUpdate={form.updateParticipant} onRemove={form.removeParticipant}
                        />
                      </Section>
                      <Section title="Induló feladatok" accent="ochre">
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
        </div>
      </div>

      {/* Separate surface: keeps the list out of the intake form entirely. */}
      <CaseCommunicationPickerDrawer
        open={pickerOpen}
        clientId={state.clientId}
        selectedIds={state.communicationThreadIds}
        primaryId={state.primaryCommunicationThreadId}
        onCancel={() => setPickerOpen(false)}
        onConfirm={(ids, primary) => {
          form.setCommunicationSelection(ids, primary);
          setPickerOpen(false);
        }}
      />
    </>
  );
}
