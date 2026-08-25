"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { AdminButton } from "@/components/adminiculum/ui";
import {
  createCase,
  getClientList,
  listWorkPackageCaseCreationOptions,
  type Client,
  type CreateCaseResponse,
  type WorkPackageCaseCreationOption,
} from "@/lib/api";

type Props = {
  open: boolean;
  initialClientId?: string;
  onClose: () => void;
  onCreated: (result: CreateCaseResponse) => void;
};

export function CompactNewCaseDialog({ open, initialClientId, onClose, onCreated }: Props) {
  const [clients, setClients] = useState<Client[]>([]);
  const [options, setOptions] = useState<WorkPackageCaseCreationOption[]>([]);
  const [clientId, setClientId] = useState(initialClientId || "");
  const [caseTypeId, setCaseTypeId] = useState("");
  const [selectedModuleKeys, setSelectedModuleKeys] = useState<string[]>([]);
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedOption = useMemo(() => options.find((option) => option.caseTypeDefinition.id === caseTypeId) || null, [caseTypeId, options]);
  const selectedClient = clients.find((client) => client.id === clientId);
  const templateItems = selectedOption?.template?.items || [];

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([getClientList(), listWorkPackageCaseCreationOptions()])
      .then(([nextClients, nextOptions]) => {
        if (cancelled) return;
        setClients(nextClients);
        setOptions(nextOptions.items);
        const nextClientId = initialClientId && nextClients.some((client) => client.id === initialClientId) ? initialClientId : nextClients[0]?.id || "";
        const nextCaseTypeId = nextOptions.items[0]?.caseTypeDefinition.id || "";
        setClientId(nextClientId);
        setCaseTypeId(nextCaseTypeId);
        setSelectedModuleKeys((nextOptions.items[0]?.template?.items || []).map((item) => item.moduleKey));
      })
      .catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : "Nem sikerült betölteni az új ügy adatait."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [initialClientId, open]);

  if (!open) return null;

  const handleCaseTypeChange = (nextId: string) => {
    setCaseTypeId(nextId);
    setSelectedModuleKeys((options.find((option) => option.caseTypeDefinition.id === nextId)?.template?.items || []).map((item) => item.moduleKey));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedClient || !selectedOption) return;
    setSaving(true);
    setError(null);
    try {
      const result = await createCase({
        clientId: selectedClient.id,
        clientName: selectedClient.name,
        matterType: selectedOption.caseTypeDefinition.slug,
        caseTypeDefinitionId: selectedOption.caseTypeDefinition.id,
        selectedModuleKeys,
        description: description.trim() || undefined,
      });
      onCreated(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Az ügy létrehozása nem sikerült.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#16201A]/45 px-4 py-10" role="dialog" aria-modal="true" aria-labelledby="compact-new-case-title">
      <form onSubmit={handleSubmit} className="w-full max-w-2xl rounded-[8px] border border-[rgba(22,32,26,0.18)] bg-[#FFFDF7] shadow-2xl">
        <div className="flex items-start justify-between border-b border-[rgba(22,32,26,0.10)] px-5 py-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#7A8479]">Ügyindítás</p>
            <h2 id="compact-new-case-title" className="mt-1 font-serif text-2xl font-medium text-[#16201A]">Új ügy</h2>
          </div>
          <button type="button" onClick={onClose} className="text-2xl leading-none text-[#7A8479] hover:text-[#16201A]" aria-label="Bezárás">×</button>
        </div>
        <div className="grid gap-4 px-5 py-5">
          {error ? <div className="border border-[#F2DAD6] bg-[#FFF2F0] px-3 py-2 text-sm text-[#8B2A2A]">{error}</div> : null}
          {loading ? <p className="text-sm text-[#7A8479]">Adatok betöltése…</p> : null}
          <label className="grid gap-1 text-sm font-semibold text-[#16201A]">Ügyfél
            <select value={clientId} onChange={(event) => setClientId(event.target.value)} disabled={loading || saving} className="rounded-[5px] border border-[rgba(22,32,26,0.20)] bg-white px-3 py-2 font-normal" required>
              <option value="">Válassz ügyfelet</option>
              {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-semibold text-[#16201A]">Ügytípus
            <select value={caseTypeId} onChange={(event) => handleCaseTypeChange(event.target.value)} disabled={loading || saving} className="rounded-[5px] border border-[rgba(22,32,26,0.20)] bg-white px-3 py-2 font-normal" required>
              <option value="">Válassz ügytípust</option>
              {options.map((option) => <option key={option.caseTypeDefinition.id} value={option.caseTypeDefinition.id}>{option.caseTypeDefinition.name}</option>)}
            </select>
          </label>
          {selectedOption?.template ? <fieldset className="grid gap-2">
            <legend className="text-sm font-semibold text-[#16201A]">Munkacsomag moduljai <span className="font-normal text-[#7A8479]">v{selectedOption.template.version}</span></legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {templateItems.map((item) => {
                const checked = selectedModuleKeys.includes(item.moduleKey);
                return <label key={item.id} className="flex items-start gap-2 rounded-[5px] border border-[rgba(22,32,26,0.10)] bg-white px-3 py-2 text-sm">
                  <input type="checkbox" checked={checked} disabled={item.isOptional === false || saving} onChange={() => setSelectedModuleKeys((current) => checked ? current.filter((key) => key !== item.moduleKey) : [...current, item.moduleKey])} className="mt-0.5" />
                  <span><span className="block font-medium text-[#16201A]">{item.label}</span><span className="text-xs text-[#7A8479]">{item.isOptional ? "Választható" : "Kötelező"}</span></span>
                </label>;
              })}
            </div>
          </fieldset> : <p className="text-sm text-[#7A8479]">Ehhez az ügytípushoz nincs aktív munkacsomag.</p>}
          <label className="grid gap-1 text-sm font-semibold text-[#16201A]">Rövid leírás
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} disabled={saving} rows={3} className="resize-y rounded-[5px] border border-[rgba(22,32,26,0.20)] bg-white px-3 py-2 font-normal" placeholder="A megnyitás kontextusa" />
          </label>
        </div>
        <div className="flex justify-end gap-2 border-t border-[rgba(22,32,26,0.10)] px-5 py-4">
          <AdminButton type="button" onClick={onClose} disabled={saving}>Mégse</AdminButton>
          <AdminButton type="submit" variant="primary" disabled={loading || saving || !selectedClient || !selectedOption}>{saving ? "Létrehozás…" : "Ügy létrehozása"}</AdminButton>
        </div>
      </form>
    </div>
  );
}
