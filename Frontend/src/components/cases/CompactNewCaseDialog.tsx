"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { intake, ACCENT_BG, ACCENT_TEXT } from "./intake/intakeStyles";
import {
  createCase,
  getCaseCreationOptions,
  getClientList,
  getUsers,
  getCurrentUser,
  createUsableCaseType,
  type CaseCreationOption,
  type Client,
  type User,
} from "@/lib/api";

type Props = {
  open: boolean;
  onClose: () => void;
  initialClientId?: string;
  sourceCommunicationId?: string;
  initialTitle?: string;
  initialDescription?: string;
};

const ELIGIBLE_WORKFORCE_ROLES = new Set([
  "ADMIN",
  "PARTNER",
  "LAWYER",
  "COLLAB_LAWYER",
  "TRAINEE",
  "LEGAL_ASSISTANT",
]);

export function CompactNewCaseDialog({ open, onClose, initialClientId, sourceCommunicationId, initialTitle, initialDescription }: Props) {
  const router = useRouter();

  const [clients, setClients] = useState<Client[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [creationOptions, setCreationOptions] = useState<CaseCreationOption[]>([]);
  const [canManageTypes, setCanManageTypes] = useState(false);
  const [typeName, setTypeName] = useState("");
  const [savingType, setSavingType] = useState(false);
  const openSession = useRef(0);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [clientId, setClientId] = useState(initialClientId || "");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [caseTypeDefinitionId, setCaseTypeDefinitionId] = useState("");
  const [assignedLawyerId, setAssignedLawyerId] = useState("");
  const [deadline, setDeadline] = useState("");
  const [selectedModuleKeys, setSelectedModuleKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    const session = ++openSession.current;
    setLoading(true);
    setError(null);
    setSavingType(false);
    Promise.all([getClientList(), getCaseCreationOptions(), getUsers().catch(() => []), getCurrentUser().catch(() => null)])
      .then(([c, o, u, actor]) => {
        if (session !== openSession.current) return;
        setClients(c);
        setCreationOptions(o.items || []);
        setCanManageTypes(actor?.role === "ADMIN" || actor?.role === "PARTNER");
        setUsers(u.filter((user) => ELIGIBLE_WORKFORCE_ROLES.has(String(user.role || "").toUpperCase()) && user.status !== "INACTIVE"));
      })
      .catch(() => { if (session === openSession.current) setError("Adatok betöltése sikertelen."); })
      .finally(() => { if (session === openSession.current) setLoading(false); });
    return () => { openSession.current += 1; };
  }, [open]);

  useEffect(() => {
    if (initialClientId) setClientId(initialClientId);
    if (initialTitle !== undefined) setTitle(initialTitle);
    if (initialDescription !== undefined) setDescription(initialDescription);
  }, [initialClientId, initialTitle, initialDescription]);

  const selectedOption = useMemo(
    () => creationOptions.find((o) => o.caseTypeDefinition.id === caseTypeDefinitionId) || null,
    [creationOptions, caseTypeDefinitionId],
  );

  const templateItems = useMemo(() => {
    if (!selectedOption?.template) return [];
    return [...selectedOption.template.items].sort((a, b) => a.order - b.order || a.moduleKey.localeCompare(b.moduleKey));
  }, [selectedOption]);

  useEffect(() => {
    if (!selectedOption?.template) {
      setSelectedModuleKeys(new Set());
      return;
    }
    const defaultKeys = new Set(selectedOption.template.items.map((item) => item.moduleKey));
    setSelectedModuleKeys(defaultKeys);
    setTypeName(selectedOption.caseTypeDefinition.name);
  }, [selectedOption]);

  const canSubmit = Boolean(clientId && title.trim() && selectedOption?.template && !submitting && !savingType);
  const matchingTypes = creationOptions.filter((option) => option.caseTypeDefinition.name.toLocaleLowerCase("hu-HU") === typeName.trim().toLocaleLowerCase("hu-HU"));

  function changeTypeName(value: string) {
    setTypeName(value);
    const matches = creationOptions.filter((option) => option.caseTypeDefinition.name.toLocaleLowerCase("hu-HU") === value.trim().toLocaleLowerCase("hu-HU"));
    setCaseTypeDefinitionId(matches.length === 1 ? matches[0].caseTypeDefinition.id : "");
  }

  async function saveType() {
    if (!canManageTypes || savingType || !typeName.trim()) return;
    const session = openSession.current;
    setSavingType(true);
    setError(null);
    try {
      const option = await createUsableCaseType(typeName.trim());
      if (session !== openSession.current) return;
      setCreationOptions((current) => [...current.filter((item) => item.caseTypeDefinition.id !== option.caseTypeDefinition.id), option]);
      setCaseTypeDefinitionId(option.caseTypeDefinition.id);
      setTypeName(option.caseTypeDefinition.name);
    } catch (err) {
      if (session !== openSession.current) return;
      setError(err && typeof err === "object" && "code" in err && err.code === "CASE_TYPE_NAME_EXISTS"
        ? "Ez az ügytípus már létezik. Válaszd ki, vagy ellenőrizd az aktiválását a Beállításokban."
        : "Az ügytípus mentése sikertelen. Próbáld újra.");
    } finally {
      if (session === openSession.current) setSavingType(false);
    }
  }

  function toggleModule(key: string, isOptional: boolean) {
    if (!isOptional) return;
    setSelectedModuleKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const client = clients.find((c) => c.id === clientId);
      const result = await createCase({
        clientName: client?.name || "",
        clientId,
        matterType: selectedOption?.caseTypeDefinition.slug || "OTHER",
        caseTypeDefinitionId,
        selectedModuleKeys: Array.from(selectedModuleKeys),
        title: title.trim(),
        description: description.trim() || undefined,
        assignedLawyerId: assignedLawyerId || undefined,
        deadline: deadline || undefined,
        sourceCommunicationId,
      });
      onClose();
      router.push(`/cases/${result.id}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("CASE_TYPE_NOT_FOUND")) setError("A kiválasztott ügytípus nem található.");
      else if (msg.includes("CASE_TYPE_INACTIVE")) setError("A kiválasztott ügytípus inaktív.");
      else if (msg.includes("ACTIVE_WORK_PACKAGE_NOT_FOUND")) setError("Nem található aktív munkacsomag sablon az ügytípushoz.");
      else if (msg.includes("REQUIRED_MODULE_NOT_SELECTED")) setError("Kötelező modul nem hagyható ki.");
      else if (msg.includes("MODULE_NOT_IN_TEMPLATE")) setError("Érvénytelen modul kiválasztás.");
      else if (msg.includes("INVALID_RESPONSIBLE_LAWYER")) setError("A kiválasztott felelős nem jogosult ügyvédi feladatok ellátására.");
      else if (msg.includes("Client not found")) setError("A megadott ügyfél nem található.");
      else setError("Létrehozás sikertelen. Próbáld újra.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return createPortal(
    <div className={intake.overlay} onClick={onClose}>
      <div
        className={intake.shell}
        style={{ maxWidth: 680 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={intake.header}>
          <h2 className={intake.headerTitle}>Új ügy</h2>
          <button type="button" onClick={onClose} className="text-[22px] leading-none text-[var(--adm-text-muted)] hover:text-[var(--adm-text)]">
            &times;
          </button>
        </div>

        <form className={intake.body} onSubmit={handleSubmit}>
          {loading && (
            <div className="flex items-center justify-center py-12">
              <span className="text-[13px] text-[var(--adm-text-muted)]">Betöltés…</span>
            </div>
          )}

          {error && (
            <div className="mb-3 rounded-md border border-[#A8442A]/30 bg-[#FBF0EC] px-3 py-2 text-[12px] text-[#A8442A]">
              {error}
            </div>
          )}

          {!loading && (
            <>
              {creationOptions.length === 0 && !canManageTypes && (
                <div role="alert" className="mb-3 rounded-md border border-[#DCCCA6] bg-[#FFF9E9] px-3 py-3 text-[12px] text-[var(--adm-text)]">
                  Még nincs választható ügytípus.
                  <span className="mt-1 block text-[11px] text-[var(--adm-text-muted)]">
                    Kérj egy ügytípust az iroda adminisztrátorától vagy partnerétől.
                  </span>
                </div>
              )}
              {/* Client + Title */}
              <div className={`${intake.area} mb-3`}>
                <div className={intake.grid}>
                  <label className={intake.label}>
                    Ügyfél <span className={intake.required}>*</span>
                    <select value={clientId} onChange={(e) => setClientId(e.target.value)} className={intake.field} required>
                      <option value="">Válassz ügyfelet…</option>
                      {clients.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </label>
                  <label className={intake.label}>
                    Ügy neve / tárgya <span className={intake.required}>*</span>
                    <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className={intake.field} placeholder="Pl. Szerződés felülvizsgálat" required />
                  </label>
                </div>
              </div>

              <label className={intake.label}>
                Leírás / utasítás
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} className={intake.field} rows={3} />
              </label>

              {/* Case Type + Responsible Lawyer */}
              <div className={`${intake.area} mb-3`}>
                <div className={intake.grid}>
                  <div className={intake.label}>
                    <label htmlFor="new-case-type">Ügytípus <span className={intake.required}>*</span></label>
                    {canManageTypes ? <>
                      <input id="new-case-type" list="case-type-suggestions" value={typeName} onChange={(e) => changeTypeName(e.target.value)} disabled={savingType} className={intake.field} placeholder="Válassz vagy írj új ügytípust…" autoComplete="off" required />
                      <datalist id="case-type-suggestions">{creationOptions.map((option) => <option key={option.caseTypeDefinition.id} value={option.caseTypeDefinition.name} />)}</datalist>
                      {matchingTypes.length > 1 && <select aria-label="Azonos nevű ügytípusok" value={caseTypeDefinitionId} onChange={(e) => setCaseTypeDefinitionId(e.target.value)} className={intake.field} required>
                        <option value="">Válassz a mentett ügytípusok közül…</option>
                        {matchingTypes.map((option) => <option key={option.caseTypeDefinition.id} value={option.caseTypeDefinition.id}>{option.caseTypeDefinition.name} · {option.caseTypeDefinition.description || option.template?.name}</option>)}
                      </select>}
                      {typeName.trim() && matchingTypes.length === 0 && !selectedOption && <button type="button" onClick={saveType} disabled={savingType} className={`${intake.secondaryAction} mt-2`}>
                        {savingType ? "Mentés…" : `+ „${typeName.trim()}” mentése új ügytípusként`}
                      </button>}
                    </> : <select id="new-case-type" value={caseTypeDefinitionId} onChange={(e) => setCaseTypeDefinitionId(e.target.value)} className={intake.field} required>
                      <option value="">Válassz ügytípust…</option>
                      {creationOptions.map((o) => (
                        <option key={o.caseTypeDefinition.id} value={o.caseTypeDefinition.id}>
                          {o.caseTypeDefinition.name}
                        </option>
                      ))}
                    </select>}
                  </div>
                  <label className={intake.label}>
                    Felelős ügyvéd
                    <select value={assignedLawyerId} onChange={(e) => setAssignedLawyerId(e.target.value)} className={intake.field}>
                      <option value="">Válassz felelőst (opcionális)…</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>{u.name || u.email}</option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>

              {/* Deadline */}
              <div className={`${intake.area} mb-3`}>
                <div className={intake.grid}>
                  <label className={intake.label}>
                    Határidő
                    <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className={intake.field} />
                  </label>
                </div>
              </div>

              {/* Work Package Modules */}
              {selectedOption?.template && templateItems.length > 0 && (
                <div className={`${intake.area} mb-3`}>
                  <div className="mb-2 flex items-center gap-2">
                    <span className={`${intake.sectionTitle} ${ACCENT_TEXT.petrol || "text-[#1F5A66]"}`}>
                      <span className={`inline-block h-3 w-[3px] shrink-0 rounded-full ${ACCENT_BG.petrol || "bg-[#1F5A66]"}`} />
                      Munkacsomag
                    </span>
                    <span className="text-[11px] text-[var(--adm-text-muted)]">
                      {selectedOption.template.name}
                    </span>
                  </div>
                  <p className="mb-2 text-[11px] text-[var(--adm-text-muted)]">
                    A kiválasztott ügytípus ajánlott munkamoduljai. A kötelező modulok nem eltávolíthatók.
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {templateItems.map((item) => {
                      const selected = selectedModuleKeys.has(item.moduleKey);
                      const locked = !item.isOptional;
                      return (
                        <button
                          key={item.moduleKey}
                          type="button"
                          disabled={locked}
                          onClick={() => toggleModule(item.moduleKey, item.isOptional)}
                          className={[
                            "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                            locked
                              ? "border-[#1F5A66]/30 bg-[#1F5A66]/10 text-[#1F5A66] cursor-default"
                              : selected
                                ? "border-[#1D5138]/40 bg-[#1D5138]/10 text-[#1D5138]"
                                : "border-[rgba(16,22,19,0.18)] bg-white text-[var(--adm-text-muted)] hover:bg-[var(--adm-surface)]",
                          ].join(" ")}
                          title={item.description || item.label}
                        >
                          {item.label || item.moduleLabel || item.moduleType}
                          {locked && <span className="text-[9px] opacity-60">●</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {!selectedOption?.template && caseTypeDefinitionId && (
                <div className={`${intake.area} mb-3 border-[#A8442A]/30 bg-[#FBF0EC]`}>
                  <p className="text-[12px] text-[#A8442A]">
                    A kiválasztott ügytípushoz nem tartozik aktív munkacsomag sablon.
                  </p>
                </div>
              )}

              {/* Submit */}
              <div className="flex items-center justify-end gap-2 pt-1">
                <button type="button" onClick={onClose} className={intake.secondaryAction}>
                  Mégse
                </button>
                <button type="submit" disabled={!canSubmit} className={intake.primaryAction}>
                  {submitting ? "Létrehozás…" : "Ügy létrehozása"}
                </button>
              </div>
            </>
          )}
        </form>
      </div>
    </div>,
    document.body,
  );
}
