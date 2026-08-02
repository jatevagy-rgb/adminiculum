"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminBadge, AdminButton } from "@/components/adminiculum/ui";
import { getCases, type CaseListItem, type Client } from "@/lib/api";
import {
  localizedInteractionStatus,
  workforceInteractionApi,
  type ClientFieldType,
  type ClientRequestType,
  type CreateClientRequestDraftInput,
} from "@/lib/clientInteractionApi";

type ComposerProps = {
  cases?: CaseListItem[];
  clients?: Client[];
  initialCaseId?: string;
  onChanged?: () => Promise<void> | void;
};

type DraftField = NonNullable<CreateClientRequestDraftInput["fields"]>[number];

const requestTypes: Array<[ClientRequestType, string]> = [
  ["DOCUMENT_UPLOAD", "Dokumentum feltöltése"],
  ["INFORMATION_REQUEST", "Információ bekérése"],
  ["DATA_FORM", "Strukturált adatbekérés"],
  ["QUESTION_RESPONSE", "Kérdés / válasz"],
  ["CORRECTION_REQUEST", "Javítás kérése"],
  ["MISSING_DOCUMENT_REQUEST", "Hiányzó dokumentum bekérése"],
];

const fieldTypes: Array<[ClientFieldType, string]> = [
  ["SHORT_TEXT", "Rövid szöveg"], ["LONG_TEXT", "Hosszú szöveg"], ["DATE", "Dátum"],
  ["NUMBER", "Szám"], ["EMAIL", "E-mail"], ["PHONE", "Telefon"], ["ADDRESS", "Cím"],
  ["SINGLE_CHOICE", "Egy választás"], ["MULTIPLE_CHOICE", "Több választás"], ["YES_NO", "Igen / nem"],
];

const emptyField = (): DraftField => ({ label: "", helpText: "", type: "SHORT_TEXT", required: false, order: 0 });

export function validateRequestFields(fields: DraftField[]): string | null {
  if (fields.some((field) => !field.label.trim())) return "Minden adatmezőnek kell ügyfélbiztos címke.";
  for (const field of fields) {
    if ((field.type === "SINGLE_CHOICE" || field.type === "MULTIPLE_CHOICE") && (!field.options?.length || new Set(field.options).size !== field.options.length)) {
      return "A választási lehetőségek nem lehetnek üresek vagy ismétlődők.";
    }
  }
  return null;
}

export function buildClientRequestDraftPayload(input: {
  clientId: string;
  caseId: string;
  type: ClientRequestType;
  title: string;
  instructions: string;
  why: string;
  required: boolean;
  dueAt: string;
  fields: DraftField[];
  documentSpec: Record<string, unknown>;
}): CreateClientRequestDraftInput {
  return {
    clientId: input.clientId,
    caseId: input.caseId,
    type: input.type,
    clientSafeTitle: input.title.trim(),
    clientSafeInstructions: `${input.instructions.trim()}${input.why.trim() ? `\n\nMiért szükséges: ${input.why.trim()}` : ""}`,
    required: input.required,
    dueAt: input.dueAt || null,
    fields: input.type === "DATA_FORM" ? input.fields.map((field, index) => ({ ...field, order: index, options: field.options?.filter(Boolean) })) : undefined,
    documentSpec: input.type === "DOCUMENT_UPLOAD" || input.type === "MISSING_DOCUMENT_REQUEST" ? input.documentSpec : undefined,
  };
}

export function ClientRequestComposer({ cases: suppliedCases, clients = [], initialCaseId, onChanged }: ComposerProps) {
  const [cases, setCases] = useState<CaseListItem[]>(suppliedCases || []);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [type, setType] = useState<ClientRequestType>("DOCUMENT_UPLOAD");
  const [caseId, setCaseId] = useState(initialCaseId || "");
  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [why, setWhy] = useState("");
  const [required, setRequired] = useState(true);
  const [dueAt, setDueAt] = useState("");
  const [fields, setFields] = useState<DraftField[]>([]);
  const [documentSpec, setDocumentSpec] = useState({
    acceptedMimeTypes: ["application/pdf", "image/jpeg", "image/png"],
    maxFileCount: 1,
    maxFileSizeBytes: 10 * 1024 * 1024,
    totalSizeBytes: 20 * 1024 * 1024,
    mobilePhotoAccepted: true,
    frontBackRequired: false,
    replacementAllowed: true,
    internalReviewRequired: true,
  });

  useEffect(() => {
    if (!suppliedCases && open) void getCases(1, 100).then((result) => setCases(result.data));
  }, [open, suppliedCases]);

  const selectedCase = useMemo(() => cases.find((item) => item.id === caseId), [cases, caseId]);
  const selectedClientId = selectedCase?.clientId || "";
  const canSubmit = Boolean(caseId && selectedClientId && title.trim() && instructions.trim());
  const reset = () => {
    setType("DOCUMENT_UPLOAD"); setCaseId(initialCaseId || ""); setTitle(""); setInstructions(""); setWhy("");
    setRequired(true); setDueAt(""); setFields([]); setFeedback(null); setOpen(false);
  };
  const updateField = (index: number, patch: Partial<DraftField>) => setFields((current) => current.map((field, i) => i === index ? { ...field, ...patch } : field));
  const moveField = (index: number, delta: number) => setFields((current) => {
    const target = index + delta;
    if (target < 0 || target >= current.length) return current;
    const next = [...current];
    [next[index], next[target]] = [next[target], next[index]];
    return next.map((field, order) => ({ ...field, order }));
  });
  const submitDraft = async (publish: boolean) => {
    if (!canSubmit || busy) return;
    const fieldError = type === "DATA_FORM" ? validateRequestFields(fields) : null;
    if (fieldError) { setFeedback(fieldError); return; }
    setBusy(true); setFeedback(null);
    try {
      const payload = buildClientRequestDraftPayload({ clientId: selectedClientId, caseId, type, title, instructions, why, required, dueAt, fields, documentSpec });
      const draft = await workforceInteractionApi.createRequestDraft(payload);
      if (publish) await workforceInteractionApi.publishRequest(draft.id, draft.revision);
      setFeedback(publish ? "Kérés közzétéve." : "Tervezet mentve. Az ügyfél nem látja.");
      await onChanged?.();
      if (publish) reset();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message.slice(0, 220) : "A kérés mentése nem sikerült.");
    } finally { setBusy(false); }
  };

  return (
    <div data-testid="client-request-composer">
      <AdminButton data-testid="new-client-request" variant="gold" onClick={() => setOpen(true)}>Új ügyfélkérés</AdminButton>
      {open ? (
        <div role="dialog" aria-modal="true" aria-labelledby="client-request-title" className="fixed inset-0 z-50 overflow-y-auto bg-black/30 p-4">
          <div className="mx-auto mt-8 grid max-w-3xl gap-4 rounded-2xl border border-[var(--adm-border)] bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--adm-gold)]">Ügyfélportál</p><h2 id="client-request-title" className="font-serif text-2xl font-semibold">Új ügyfélkérés</h2><p className="text-xs text-[var(--adm-text-muted)]">A mentett tervezet még nem látható az ügyfélnek. A közzététel külön, kifejezett lépés.</p></div><AdminButton variant="muted" onClick={reset}>Bezárás</AdminButton></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-xs font-semibold">Ügy (case) *<select value={caseId} disabled={Boolean(initialCaseId)} onChange={(event) => setCaseId(event.target.value)} className="rounded-lg border p-2 text-sm"><option value="">— Válasszon ügyet —</option>{cases.map((item) => <option key={item.id} value={item.id}>{item.caseNumber} · {item.title}</option>)}</select></label>
              <label className="grid gap-1 text-xs font-semibold">Ügyfél<select value={selectedCase?.clientId || ""} disabled className="rounded-lg border bg-stone-50 p-2 text-sm"><option value="">{selectedCase?.clientName || "A case alapján"}</option></select></label>
              <label className="grid gap-1 text-xs font-semibold">Kérés típusa<select value={type} onChange={(event) => setType(event.target.value as ClientRequestType)} className="rounded-lg border p-2 text-sm">{requestTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label className="grid gap-1 text-xs font-semibold">Ügyfélbiztos cím <input value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)} className="rounded-lg border p-2 text-sm" /></label>
              <label className="grid gap-1 text-xs font-semibold sm:col-span-2">Ügyfélnek szóló útmutató<textarea value={instructions} maxLength={4000} onChange={(event) => setInstructions(event.target.value)} className="min-h-20 rounded-lg border p-2 text-sm" /></label>
              <label className="grid gap-1 text-xs font-semibold">Miért szükséges?<textarea value={why} maxLength={1000} onChange={(event) => setWhy(event.target.value)} className="min-h-16 rounded-lg border p-2 text-sm" /></label>
              <label className="grid gap-1 text-xs font-semibold">Ügyfélbiztos határidő<input type="date" value={dueAt} onChange={(event) => setDueAt(event.target.value)} className="rounded-lg border p-2 text-sm" /></label>
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={required} onChange={(event) => setRequired(event.target.checked)} /> Kötelező bekérés</label>
            {(type === "DOCUMENT_UPLOAD" || type === "MISSING_DOCUMENT_REQUEST") ? <div className="grid gap-3 rounded-xl border bg-stone-50 p-3 sm:grid-cols-2"><p className="font-semibold sm:col-span-2">Dokumentumkövetelmények</p><label className="text-xs">Maximum fájlszám<input type="number" min="1" max="20" value={documentSpec.maxFileCount} onChange={(event) => setDocumentSpec((current) => ({ ...current, maxFileCount: Number(event.target.value) }))} className="mt-1 w-full rounded border p-2" /></label><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={documentSpec.frontBackRequired} onChange={(event) => setDocumentSpec((current) => ({ ...current, frontBackRequired: event.target.checked }))} /> Első és hátsó oldal szükséges</label><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={documentSpec.mobilePhotoAccepted} onChange={(event) => setDocumentSpec((current) => ({ ...current, mobilePhotoAccepted: event.target.checked }))} /> Mobilfotó elfogadott</label><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={documentSpec.replacementAllowed} onChange={(event) => setDocumentSpec((current) => ({ ...current, replacementAllowed: event.target.checked }))} /> Csere engedélyezett</label><p className="text-xs text-[var(--adm-text-muted)] sm:col-span-2">Engedélyezett formátumok: PDF, JPG/JPEG, PNG. A fájlméret- és MIME-ellenőrzés szerveroldali.</p></div> : null}
            {type === "DATA_FORM" ? <div className="grid gap-3 rounded-xl border bg-stone-50 p-3"><div className="flex items-center justify-between"><p className="font-semibold">Strukturált adatmezők</p><AdminButton variant="neutral" onClick={() => setFields((current) => [...current, { ...emptyField(), order: current.length }])}>+ Mező</AdminButton></div>{fields.map((field, index) => <div key={index} className="grid gap-2 rounded border bg-white p-3 sm:grid-cols-[1fr_1fr_auto]"><input aria-label={`Mező ${index + 1} címkéje`} placeholder="Ügyfélbiztos címke" value={field.label} onChange={(event) => updateField(index, { label: event.target.value })} className="rounded border p-2 text-sm" /><select aria-label={`Mező ${index + 1} típusa`} value={field.type} onChange={(event) => updateField(index, { type: event.target.value as ClientFieldType })} className="rounded border p-2 text-sm">{fieldTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><div className="flex gap-1"><AdminButton variant="muted" disabled={index === 0} aria-label={`Mező ${index + 1} feljebb`} onClick={() => moveField(index, -1)}>↑</AdminButton><AdminButton variant="muted" disabled={index === fields.length - 1} aria-label={`Mező ${index + 1} lejjebb`} onClick={() => moveField(index, 1)}>↓</AdminButton><AdminButton variant="muted" onClick={() => setFields((current) => current.filter((_, i) => i !== index))}>Törlés</AdminButton></div><input aria-label={`Mező ${index + 1} súgója`} placeholder="Súgó (opcionális)" value={field.helpText || ""} onChange={(event) => updateField(index, { helpText: event.target.value })} className="rounded border p-2 text-sm sm:col-span-2" /><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={Boolean(field.required)} onChange={(event) => updateField(index, { required: event.target.checked })} /> Kötelező</label>{field.type === "SINGLE_CHOICE" || field.type === "MULTIPLE_CHOICE" ? <input aria-label={`Mező ${index + 1} opciói`} placeholder="Opciók vesszővel" value={(field.options || []).join(", ")} onChange={(event) => updateField(index, { options: event.target.value.split(",").map((value) => value.trim()).filter(Boolean) })} className="rounded border p-2 text-sm sm:col-span-3" /> : null}</div>)}{!fields.length ? <p className="text-xs text-[var(--adm-text-muted)]">A közzétételhez adj legalább egy adatmezőt.</p> : null}</div> : null}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3"><div className="flex items-center gap-2 text-xs text-[var(--adm-text-muted)]"><AdminBadge tone="neutral">Tervezet</AdminBadge><span>Értesítés: standard portál-értesítés, teljes tartalom nélkül</span></div><div className="flex gap-2"><AdminButton variant="neutral" disabled={!canSubmit || busy} onClick={() => void submitDraft(false)}>Tervezet mentése</AdminButton><AdminButton variant="gold" disabled={!canSubmit || busy || (type === "DATA_FORM" && !fields.length)} onClick={() => void submitDraft(true)}>Mentés és közzététel</AdminButton></div></div>
            {feedback ? <p role="status" className="text-sm text-[var(--adm-text-muted)]">{feedback}</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
