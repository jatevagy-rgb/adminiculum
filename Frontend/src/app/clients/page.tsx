"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AuthenticatedApp } from "@/components/AuthenticatedApp";
import { AdminPanel } from "@/components/adminiculum/ui";
import { Button, PageHeader, Modal, EmptyState, Alert } from "@/components/ui";
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
    const color = getClientColorDefinition(client.colorKey);

    return (
      <AdminPanel key={client.id} className={`relative min-w-0 border-2 border-l-4 p-4 sm:p-5 ${color.borderClass} ${color.key ? color.accentBorderClass : ""}`}>
        <div className="flex flex-col gap-4">
          <div className="min-w-0 flex-1">
            <h2 className="break-words font-serif text-2xl font-medium leading-snug text-[#1F2937] [overflow-wrap:anywhere]">{client.name}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#6B7280]">
              <span>{client.relationshipMode === "PORTAL_CENTRIC" ? "Portál ügyfél" : "Ügyfél"}</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t border-[#E5E7E6] pt-3">
            <Link href={`/clients/${client.id}`} className="inline-flex min-h-11 items-center justify-center rounded-[6px] border border-[#0F3D32] bg-[#0F3D32] px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-[#062B22] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0F3D32]">Ügyfél dosszié</Link>
            <Link href={`/cases?newCase=1&clientId=${encodeURIComponent(client.id)}`} className="inline-flex min-h-11 items-center justify-center rounded-[6px] border border-[#E5E7E6] bg-white px-3 py-2 text-[13px] font-semibold text-[#1F2937] transition-colors hover:bg-[#F8FAF9] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0F3D32]">+ Új ügy</Link>
          </div>
        </div>
      </AdminPanel>
    );
  };

  return (
    <div className="flex min-h-0 flex-1 bg-[#F8FAF9] text-[#1F2937]">
      <main className="flex-1 overflow-y-auto p-6 sm:p-8">
        <div className="mx-auto max-w-7xl space-y-6">
          <PageHeader
            kicker="Ügyfelek"
            title="Ügyféldossziék"
            subtitle="Ügyféladatok, dossziék és kapcsolt ügyindítás egy helyen."
            primaryAction={
              <Button variant="primary" onClick={handleCreate}>
                + Új ügyfél
              </Button>
            }
          />

          <div className="rounded-lg border border-[#E5E7E6] bg-white p-3.5 shadow-sm">
            <label className="block text-[10px] font-bold uppercase tracking-[0.14em] text-[#6B7280]">
              Keresés
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Név, email, kapcsolattartó vagy adószám"
                className="mt-1.5 block w-full rounded-md border border-[#E5E7E6] bg-white px-3 py-2 text-sm text-[#1F2937] outline-none transition-colors placeholder:text-[#9CA3AF] focus:border-[#0F3D32] focus:ring-2 focus:ring-[#0F3D32]/20"
              />
            </label>
          </div>

          {error ? (
            <Alert
              variant="error"
              title="Hiba történt"
              action={
                <Button size="sm" variant="danger-outline" onClick={() => void loadClients()}>
                  Újrapróbálás
                </Button>
              }
            >
              {error}
            </Alert>
          ) : null}

          {isLoading ? (
            <div className="flex items-center justify-center rounded-lg border border-[#E5E7E6] bg-white p-8 text-sm text-[#6B7280] shadow-sm">
              Ügyfelek betöltése…
            </div>
          ) : filteredClients.length > 0 ? (
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#6B7280]">Ügyfelek</h2>
                <span className="text-[11px] text-[#6B7280]">{filteredClients.length} találat</span>
              </div>
              <div className="grid gap-3 xl:grid-cols-2">{filteredClients.map(renderClientCard)}</div>
            </section>
          ) : (
            <EmptyState
              title={clients.length === 0 ? "Még nincs ügyfél." : "Nincs találat a keresésre."}
              description={clients.length === 0 ? "Hozz létre új ügyfelet a jobb felső gombra kattintva." : "Próbálj más keresési kifejezést megadni."}
              action={
                clients.length === 0 ? (
                  <Button variant="primary" size="sm" onClick={handleCreate}>
                    + Új ügyfél létrehozása
                  </Button>
                ) : undefined
              }
            />
          )}
        </div>
      </main>

      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={editingClient ? "Ügyfél szerkesztése" : "Új ügyfél rögzítése"}
        description="Ügyfél dosszié alapadatok és szín megadása."
        maxWidth="2xl"
        footer={
          <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[11px] text-[#6B7280]">
              A szín mentés után az ügy- és feladatlistán is ugyanígy jelenik meg.
            </p>
            <div className="flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setShowModal(false)} disabled={isSaving}>
                Mégse
              </Button>
              <Button variant="primary" onClick={() => void handleSave()} disabled={isSaving || !formData.name?.trim()}>
                {isSaving ? "Mentés..." : "Mentés"}
              </Button>
            </div>
          </div>
        }
      >
        <div className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            {[
              ["name", "Hivatalos név", "text"],
              ["email", "Email", "email"],
              ["phone", "Telefon", "tel"],
              ["taxNumber", "Adószám", "text"],
              ["companyRegistrationNumber", "Cégjegyzékszám / nyilvántartási szám", "text"],
              ["authorizedRepresentative", "Cégjegyzésre jogosult", "text"],
              ["contactPerson", "Kapcsolattartó", "text"],
            ].map(([key, label, type]) => (
              <label key={key} className="block text-xs font-medium text-[#374151]">
                {label}{key === "name" ? <span className="text-[#B85C4B]"> *</span> : null}
                <input
                  type={type}
                  value={String(formData[key as keyof CreateClientData] || "")}
                  onChange={(event) => setFormData({ ...formData, [key]: event.target.value })}
                  className="mt-1 block w-full rounded-md border border-[#E5E7E6] bg-white px-3 py-2 text-sm text-[#1F2937] outline-none transition-colors focus:border-[#0F3D32] focus:ring-2 focus:ring-[#0F3D32]/20"
                />
              </label>
            ))}
            <label className="block text-xs font-medium text-[#374151] md:col-span-2">
              Székhely / cím
              <textarea
                value={formData.address || ""}
                onChange={(event) => setFormData({ ...formData, address: event.target.value })}
                rows={3}
                className="mt-1 block w-full rounded-md border border-[#E5E7E6] bg-white px-3 py-2 text-sm text-[#1F2937] outline-none transition-colors focus:border-[#0F3D32] focus:ring-2 focus:ring-[#0F3D32]/20"
              />
            </label>
          </div>
          <ClientColorSelector
            value={formData.colorKey || null}
            onChange={(colorKey) => setFormData((current) => ({ ...current, colorKey }))}
            disabled={isSaving}
          />
        </div>
      </Modal>
    </div>
  );
}
