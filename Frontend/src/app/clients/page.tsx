"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AuthenticatedApp } from "@/components/AuthenticatedApp";
import { AdminBadge, AdminButton, AdminPanel, AdminStatusPill } from "@/components/adminiculum/ui";
import { ClientColorSelector } from "@/components/clients/ClientColorSelector";
import { createClient, getClients, updateClient, type Client, type CreateClientData, type UpdateClientData } from "@/lib/api";
import { getClientColorDefinition } from "@/lib/clientColors";

function houseStyleFillStatus(profile: Client["houseStyleProfile"]): "none" | "partial" | "filled" {
  if (!profile) return "none";
  const fields = [
    profile.officialName,
    profile.shortName,
    profile.registeredSeat,
    profile.taxNumber,
    profile.registrationNumber,
    profile.contactPerson,
    profile.preferredLanguage,
    profile.documentLanguageMode,
    profile.fontFamily,
    profile.headerAssetPath,
    profile.externalAiInstructions,
  ];
  const filledCount = fields.filter((value) => typeof value === "string" && value.trim().length > 0).length;
  return filledCount >= 4 ? "filled" : "partial";
}

function emptyClientForm(): CreateClientData {
  return {
    name: "",
    email: "",
    phone: "",
    address: "",
    taxNumber: "",
    companyRegistrationNumber: "",
    authorizedRepresentative: "",
    contactPerson: "",
    colorKey: null,
  };
}

export default function ClientsPage() {
  return (
    <AuthenticatedApp section="clients">
      <ClientsPageContent />
    </AuthenticatedApp>
  );
}

function ClientsPageContent() {
  const [clients, setClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [formData, setFormData] = useState<CreateClientData>(emptyClientForm());
  const [isSaving, setIsSaving] = useState(false);

  const loadClients = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await getClients();
      setClients(response.data || []);
    } catch (err) {
      console.error("Failed to load clients:", err);
      setError("Az ügyféllista most nem érhető el. Próbáld újra néhány másodperc múlva.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadClients();
  }, [loadClients]);

  const filteredClients = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("hu-HU");
    return [...clients]
      .filter((client) => {
        if (!query) return true;
        return [client.name, client.email, client.contactPerson, client.taxNumber]
          .some((value) => String(value || "").toLocaleLowerCase("hu-HU").includes(query));
      })
      .sort((left, right) => left.name.localeCompare(right.name, "hu-HU"));
  }, [clients, search]);

  const handleCreate = () => {
    setEditingClient(null);
    setFormData(emptyClientForm());
    setShowModal(true);
  };

  const handleEdit = (client: Client) => {
    setEditingClient(client);
    setFormData({
      name: client.name || "",
      email: client.email || "",
      phone: client.phone || "",
      address: client.address || "",
      taxNumber: client.taxNumber || "",
      companyRegistrationNumber: client.companyRegistrationNumber || "",
      authorizedRepresentative: client.authorizedRepresentative || "",
      contactPerson: client.contactPerson || "",
      colorKey: client.colorKey || null,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formData.name?.trim()) {
      alert("Az ügyfél hivatalos neve kötelező.");
      return;
    }

    setIsSaving(true);
    try {
      if (editingClient) {
        const updateData: UpdateClientData = { ...formData };
        await updateClient(editingClient.id, updateData);
      } else {
        await createClient(formData);
      }
      setShowModal(false);
      await loadClients();
    } catch (err: unknown) {
      console.error("Failed to save client:", err);
      const message = err instanceof Error && err.message ? err.message : "Az ügyfél mentése sikertelen.";
      alert(message);
    } finally {
      setIsSaving(false);
    }
  };

  const renderClientCard = (client: Client) => {
    const profile = client.houseStyleProfile;
    const fillStatus = houseStyleFillStatus(profile);
    const hasHeader = Boolean(profile?.headerAssetPath);
    const color = getClientColorDefinition(client.colorKey);

    return (
      <AdminPanel key={client.id} className={`adm-board-list-row relative overflow-hidden p-4 pl-6 ${color.softBackgroundClass} ${color.borderClass}`}>
        <span aria-hidden="true" className={`absolute inset-y-0 left-0 w-1.5 ${color.accentClass}`} />
        <div className="flex flex-col gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-serif text-2xl font-medium leading-tight text-[var(--adm-text)]">{profile?.officialName || client.name}</h2>
              <AdminBadge tone="neutral">Ügyfél</AdminBadge>
              <span className="text-[10px] font-semibold text-[var(--adm-text-muted)]">{color.label}</span>
            </div>
            {profile?.shortName ? <p className="mt-1 text-sm text-[#3D4842]">Rövid név: <b>{profile.shortName}</b></p> : null}
            <div className="mt-3 grid gap-2 text-xs text-[#3D4842] sm:grid-cols-2">
              {[
                ["Székhely", profile?.registeredSeat || client.address || "Nincs megadva"],
                ["Adószám", profile?.taxNumber || client.taxNumber || "Nincs megadva"],
                ["Nyilvántartás", profile?.registrationNumber || client.companyRegistrationNumber || "Nincs megadva"],
                ["Kapcsolattartó", profile?.contactPerson || client.contactPerson || client.authorizedRepresentative || "Nincs megadva"],
              ].map(([label, value]) => (
                <p key={label} className="rounded-[10px] border border-[rgba(22,32,26,0.10)] bg-white/80 px-3 py-2">
                  <span className="block text-[9px] font-bold uppercase tracking-[0.13em] text-[var(--adm-text-muted)]">{label}</span>
                  <b className="mt-1 block font-semibold text-[var(--adm-text)]">{value}</b>
                </p>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <AdminStatusPill tone={fillStatus === "filled" ? "green" : fillStatus === "partial" ? "gold" : "neutral"}>
                {fillStatus === "filled" ? "House style kitöltve" : fillStatus === "partial" ? "House style részleges" : "Nincs house style profil"}
              </AdminStatusPill>
              <AdminStatusPill tone={hasHeader ? "green" : "neutral"}>Fejlécminta: {hasHeader ? "Van" : "Nincs"}</AdminStatusPill>
            </div>
          </div>
          <div className="grid shrink-0 grid-cols-2 gap-2 border-t border-[rgba(22,32,26,0.10)] pt-3 sm:grid-cols-4">
            <Link href={`/clients/${client.id}`} className="inline-flex items-center justify-center rounded-[5px] border border-[#173824] bg-[var(--adm-green-800)] px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-[#173824]">Ügyfél dosszié</Link>
            <Link href={`/clients/${client.id}#house-style`} className="inline-flex items-center justify-center rounded-[5px] border border-[rgba(22,32,26,0.20)] bg-white px-3 py-1.5 text-[12px] font-semibold text-[var(--adm-text)] hover:bg-[var(--adm-surface)]">House style</Link>
            <Link href={`/cases?newCase=1&clientId=${encodeURIComponent(client.id)}`} className="inline-flex items-center justify-center rounded-[5px] border border-[#8E6A1B] bg-white px-3 py-1.5 text-[12px] font-semibold text-[var(--adm-text)] hover:bg-[var(--adm-surface)]">+ Új ügy</Link>
            <AdminButton size="sm" variant="neutral" onClick={() => handleEdit(client)}>Szerkesztés</AdminButton>
          </div>
        </div>
      </AdminPanel>
    );
  };

  return (
    <div className="flex min-h-0 flex-1 adm-shell-bg text-[var(--adm-text)]">
      <main className="flex-1 overflow-y-auto adm-board-page">
        <div className="adm-board-container space-y-5">
          <div className="adm-board-hero flex flex-col gap-4 p-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--adm-text-muted)]">Ügyfelek</p>
              <h1 className="mt-1 font-serif text-[38px] font-medium leading-tight text-[var(--adm-text)]">Ügyféldossziék</h1>
              <p className="mt-1 max-w-3xl text-[13px] leading-5 text-[#3D4842]">Ügyféladatok, dossziék és kapcsolt ügyindítás egy helyen.</p>
            </div>
            <AdminButton variant="gold" onClick={handleCreate}>+ Új ügyfél</AdminButton>
          </div>

          <AdminPanel className="adm-board-panel-tight p-3">
            <label className="block text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">
              Keresés
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Név, email, kapcsolattartó vagy adószám"
                className="adm-board-field mt-2 w-full px-3 py-2 text-sm normal-case tracking-normal"
              />
            </label>
          </AdminPanel>

          {error ? (
            <div className="rounded border border-[#F2DAD6] bg-[var(--adm-terracotta-100)] p-3 text-xs text-[var(--adm-terracotta-700)]">
              <p className="font-semibold">{error}</p>
              <button type="button" onClick={() => void loadClients()} className="mt-2 inline-flex items-center justify-center rounded-[5px] border border-[#8B2A2A] bg-white px-3 py-1.5 text-[11px] font-semibold text-[var(--adm-terracotta-700)] hover:bg-[#FBE9E6]">Újrapróbálás</button>
            </div>
          ) : null}

          {isLoading ? (
            <AdminPanel className="adm-board-empty text-sm text-[var(--adm-text-muted)]">Ügyfelek betöltése…</AdminPanel>
          ) : filteredClients.length > 0 ? (
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--adm-text-muted)]">Ügyfelek</h2>
                <span className="text-[11px] text-[var(--adm-text-muted)]">{filteredClients.length} találat</span>
              </div>
              <div className="grid gap-3 xl:grid-cols-2">{filteredClients.map(renderClientCard)}</div>
            </section>
          ) : (
            <AdminPanel className="adm-board-empty text-sm text-[var(--adm-text-muted)]">{clients.length === 0 ? "Még nincs ügyfél." : "Nincs találat a keresésre."}</AdminPanel>
          )}
        </div>
      </main>

      {showModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#16201A]/70 p-4">
          <div className="adm-wizard-modal max-h-[92vh] w-full max-w-2xl overflow-y-auto">
            <div className="adm-wizard-header flex items-start justify-between gap-4 border-b bg-[#082817] p-5 text-[#F4EFDB]">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--adm-ochre-500)]">Ügyfél dosszié</p>
                <h2 className="mt-1 font-serif text-[28px] font-medium leading-tight">{editingClient ? "Ügyfél szerkesztése" : "Új ügyfél rögzítése"}</h2>
              </div>
              <button type="button" onClick={() => setShowModal(false)} className="rounded-[var(--adm-radius-sm)] border border-white/20 px-3 py-1 text-sm text-white/80 hover:text-white">Bezárás</button>
            </div>
            <div className="adm-wizard-body space-y-5 p-5">
              <div className="grid gap-3 md:grid-cols-2">
                {[
                  ["name", "Hivatalos név", "text"],
                  ["email", "Email", "email"],
                  ["phone", "Telefon", "tel"],
                  ["taxNumber", "Adószám", "text"],
                  ["companyRegistrationNumber", "Cégjegyzékszám / nyilvántartási szám", "text"],
                  ["authorizedRepresentative", "Cégjegyzésre jogosult", "text"],
                  ["contactPerson", "Kapcsolattartó", "text"],
                ].map(([key, label, type]) => (
                  <label key={key} className="block text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">
                    {label}{key === "name" ? <span className="text-[var(--adm-terracotta-700)]"> *</span> : null}
                    <input type={type} value={String(formData[key as keyof CreateClientData] || "")} onChange={(event) => setFormData({ ...formData, [key]: event.target.value })} className="adm-modal-field mt-2 w-full px-3 py-2 text-sm normal-case tracking-normal" />
                  </label>
                ))}
                <label className="block text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--adm-text-muted)] md:col-span-2">
                  Székhely / cím
                  <textarea value={formData.address || ""} onChange={(event) => setFormData({ ...formData, address: event.target.value })} rows={3} className="adm-modal-field mt-2 w-full px-3 py-2 text-sm normal-case tracking-normal" />
                </label>
              </div>
              <ClientColorSelector value={formData.colorKey || null} onChange={(colorKey) => setFormData((current) => ({ ...current, colorKey }))} disabled={isSaving} />
            </div>
            <div className="adm-wizard-footer flex flex-col gap-3 border-t p-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[11px] text-[var(--adm-text-muted)]">A szín mentés után az ügy- és feladatlistán is ugyanígy jelenik meg.</p>
              <div className="flex justify-end gap-3">
                <AdminButton variant="ghost" onClick={() => setShowModal(false)} disabled={isSaving}>Mégse</AdminButton>
                <AdminButton variant="primary" onClick={() => void handleSave()} disabled={isSaving || !formData.name?.trim()}>{isSaving ? "Mentés..." : "Mentés"}</AdminButton>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
