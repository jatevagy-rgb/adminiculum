"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { intake, ACCENTS } from "./intake/intakeStyles";
import {
  createCase,
  getCaseCreationOptions,
  getClientList,
  type CaseCreationOption,
  type Client,
} from "@/lib/api";

type Props = {
  open: boolean;
  onClose: () => void;
  initialClientId?: string;
};

export function CompactNewCaseDialog({ open, onClose, initialClientId }: Props) {
  const router = useRouter();

  const [clients, setClients] = useState<Client[]>([]);
  const [creationOptions, setCreationOptions] = useState<CaseCreationOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [clientId, setClientId] = useState(initialClientId || "");
  const [title, setTitle] = useState("");
  const [caseTypeDefinitionId, setCaseTypeDefinitionId] = useState("");
  const [deadline, setDeadline] = useState("");
  const [selectedModuleKeys, setSelectedModuleKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    Promise.all([getClientList(), getCaseCreationOptions()])
      .then(([c, o]) => {
        setClients(c);
        setCreationOptions(o.items || []);
      })
      .catch(() => setError("Adatok betöltése sikertelen."))
      .finally(() => setLoading(false));
  }, [open]);

  useEffect(() => {
    if (initialClientId) setClientId(initialClientId);
  }, [initialClientId]);

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
    const required = new Set<string>();
    for (const item of selectedOption.template.items) {
      if (!item.isOptional) required.add(item.moduleKey);
    }
    setSelectedModuleKeys(required);
  }, [selectedOption]);

  const canSubmit = clientId && title.trim() && caseTypeDefinitionId && !submitting;

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
        description: title.trim(),
        deadline: deadline || undefined,
      });
      onClose();
      router.push(`/cases/${result.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Létrehozás sikertelen.");
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

              {/* Case Type + Deadline */}
              <div className={`${intake.area} mb-3`}>
                <div className={intake.grid}>
                  <label className={intake.label}>
                    Ügytípus <span className={intake.required}>*</span>
                    <select value={caseTypeDefinitionId} onChange={(e) => setCaseTypeDefinitionId(e.target.value)} className={intake.field} required>
                      <option value="">Válassz ügytípust…</option>
                      {creationOptions.map((o) => (
                        <option key={o.caseTypeDefinition.id} value={o.caseTypeDefinition.id}>
                          {o.caseTypeDefinition.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={intake.label}>
                    Határidő
                    <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className={intake.field} />
                  </label>
                </div>
              </div>

              {/* Work Package Modules */}
              {selectedOption?.template && (
                <div className={`${intake.area} mb-3`}>
                  <div className="mb-2 flex items-center gap-2">
                    <span className={`${intake.sectionTitle} ${ACCENTS.petrol ? "text-[#1F5A66]" : ""}`}>
                      <span className="inline-block h-3 w-[3px] shrink-0 rounded-full bg-[#1F5A66]" />
                      Munkacsomag
                    </span>
                    <span className="text-[11px] text-[var(--adm-text-muted)]">
                      {selectedOption.template.name} v{selectedOption.template.version}
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
                          {item.moduleLabel || item.moduleType}
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
