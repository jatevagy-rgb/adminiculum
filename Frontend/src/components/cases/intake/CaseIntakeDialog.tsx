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
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { getCaseCreationOptions, getClientList, getUsers, getWorkflowTemplates, uploadCaseDocument, type CaseCreationOption, type Client, type User, type CaseIntakeResult, type WorkflowTemplateSummary } from "@/lib/api";
import { useCaseIntakeForm } from "./useCaseIntakeForm";
import {
  Section, CaseBasicsSection, CaseStartingContextSection, CaseDeadlineSection,
  CaseCommunicationSummary, CaseParticipantsSection, CaseInitialTasksSection, CaseWorkflowSection,
  CaseInitialDocumentsSection, type StagedDoc,
  field, label, FieldError,
} from "./CaseIntakeSections";

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error || new Error("Fájl beolvasása sikertelen."));
    reader.readAsDataURL(file);
  });
}
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
  const [creationOptions, setCreationOptions] = useState<CaseCreationOption[]>([]);
  const [workflowTemplates, setWorkflowTemplates] = useState<WorkflowTemplateSummary[]>([]);
  const [workflowTemplatesLoading, setWorkflowTemplatesLoading] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  // Fix G — staged initial documents. Files are uploaded through the canonical
  // document service AFTER the case exists; a durable per-file result drives
  // success/failure + retry. The case is created once; retry only re-uploads.
  const [stagedDocs, setStagedDocs] = useState<StagedDoc[]>([]);
  const [createdResult, setCreatedResult] = useState<CaseIntakeResult | null>(null);
  const [docPhase, setDocPhase] = useState<"idle" | "creating" | "uploading" | "partial">("idle");
  const stageDocs = useCallback((files: FileList | null) => {
    if (!files) return;
    const additions: StagedDoc[] = Array.from(files).map((file) => ({
      key: Math.random().toString(36).slice(2, 10),
      file, name: file.name, size: file.size, type: file.type || "application/octet-stream", status: "staged",
    }));
    setStagedDocs((prev) => [...prev, ...additions]);
  }, []);
  const removeStagedDoc = useCallback((key: string) => setStagedDocs((prev) => prev.filter((d) => d.key !== key)), []);
  // Upload every not-yet-done staged doc. Returns true when all are durable.
  const uploadStaged = useCallback(async (caseId: string): Promise<boolean> => {
    const targets = stagedDocs.filter((d) => d.status !== "done");
    let allOk = true;
    for (const doc of targets) {
      setStagedDocs((prev) => prev.map((d) => (d.key === doc.key ? { ...d, status: "uploading", error: undefined } : d)));
      try {
        const base64 = await fileToBase64(doc.file);
        const uploaded = await uploadCaseDocument({ caseId, fileName: doc.name, fileContentBase64: base64, mimeType: doc.type });
        setStagedDocs((prev) => prev.map((d) => (d.key === doc.key ? { ...d, status: "done", documentId: uploaded.id } : d)));
      } catch (err) {
        allOk = false;
        setStagedDocs((prev) => prev.map((d) => (d.key === doc.key ? { ...d, status: "error", error: err instanceof Error ? err.message : "Feltöltés sikertelen." } : d)));
      }
    }
    return allOk;
  }, [stagedDocs]);
  // Post-create hook: upload staged docs after the case exists. false keeps the
  // dialog open (partial failure) so the user can retry only the failed files.
  const onAfterCreate = useCallback(async (result: CaseIntakeResult): Promise<boolean> => {
    setCreatedResult(result);
    if (stagedDocs.length === 0) return true;
    setDocPhase("uploading");
    const ok = await uploadStaged(result.case.id);
    setDocPhase(ok ? "idle" : "partial");
    return ok;
  }, [stagedDocs, uploadStaged]);
  // Portal target: the app shell's content column sets `backdrop-filter`, which
  // makes it a containing block for `position: fixed`. Rendering into <body>
  // lets the overlay cover the true viewport instead of just the content pane —
  // without it the modal is confined beside the sidebar and, on mobile, crushed
  // into a sliver with horizontal overflow.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  // Lock background scroll while the modal is open. The overlay is a fixed layer,
  // so without this the page behind it still scrolls — on narrow viewports the
  // wide cases list bleeds a horizontal scrollbar under the sheet.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);
  const form = useCaseIntakeForm(onCreated, onAfterCreate);
  // Retry only the failed uploads; the case is already created (createdResult).
  const retryFailedUploads = useCallback(async () => {
    if (!createdResult) return;
    setDocPhase("uploading");
    const ok = await uploadStaged(createdResult.case.id);
    if (ok) { setDocPhase("idle"); onCreated(createdResult); } else { setDocPhase("partial"); }
  }, [createdResult, uploadStaged, onCreated]);
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
    getCaseCreationOptions().then((res) => { if (active) setCreationOptions(res.items || []); }).catch(() => { if (active) setCreationOptions([]); });
    setWorkflowTemplatesLoading(true);
    getWorkflowTemplates()
      .then((res) => { if (active) setWorkflowTemplates(res.items || []); })
      .catch(() => { if (active) setWorkflowTemplates([]); })
      .finally(() => { if (active) setWorkflowTemplatesLoading(false); });
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

  if (!open || !mounted) return null;

  return createPortal(
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
                  {submitting ? (docPhase === "uploading" ? "Dokumentumok feltöltése…" : "Létrehozás…") : "Ügy létrehozása"}
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

              {docPhase === "partial" ? (
                <div role="alert" data-testid="intake-doc-partial" className="mb-3 rounded-md border border-[#E7D7A0] bg-[#FFF8E1] px-3 py-2 text-[12.5px] text-[#7a5f18]">
                  Az ügy létrejött, de {stagedDocs.filter((d) => d.status === "error").length} induló dokumentum feltöltése nem sikerült.
                  <div className="mt-2 flex gap-2">
                    <button type="button" data-testid="intake-doc-retry" className={intake.secondaryAction} disabled={submitting} onClick={() => void retryFailedUploads()}>Újrapróbálkozás</button>
                    <button type="button" className={intake.secondaryAction} disabled={submitting} onClick={() => { if (createdResult) onCreated(createdResult); }}>Folytatás dokumentum nélkül</button>
                  </div>
                </div>
              ) : null}

              <div className="space-y-3">
                <Section title="Ügy alapadatai" accent="petrol">
                  <CaseBasicsSection
                    state={state} errors={errors} clients={clients} users={users} creationOptions={creationOptions} onPatch={patch}
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
                      <Section title="Munkafolyamat" accent="petrol">
                        <CaseWorkflowSection
                          templates={workflowTemplates} templatesLoading={workflowTemplatesLoading}
                          state={state} users={users}
                          onSelectTemplate={form.setWorkflowTemplate} onSetAssignee={form.setWorkflowAssignee}
                        />
                      </Section>
                      <Section title="Induló feladatok" accent="ochre">
                        <CaseInitialTasksSection
                          state={state} errors={errors} users={users}
                          onAdd={form.addTask} onUpdate={form.updateTask} onRemove={form.removeTask}
                        />
                      </Section>
                      <Section title="Induló dokumentumok" accent="petrol">
                        <CaseInitialDocumentsSection
                          docs={stagedDocs} onStage={stageDocs} onRemove={removeStagedDoc}
                          uploading={docPhase === "uploading"}
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
    </>,
    document.body,
  );
}
