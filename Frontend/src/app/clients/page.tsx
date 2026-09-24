"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AuthenticatedApp } from "@/components/AuthenticatedApp";
import { AdminPanel } from "@/components/adminiculum/ui";
import { Button, IconButton, PageHeader, Modal, EmptyState, Alert, DataTable, DataTableHead, DataTableHeaderCell, DataTableBody, DataTableRow, DataTableCell, Badge, QuietLink } from "@/components/ui";
import { ClientColorSelector } from "@/components/clients/ClientColorSelector";
import { createClient, getClients, updateClient, type Client, type CreateClientData, type UpdateClientData } from "@/lib/api";
import { getClientColorDefinition, type ClientColorKey } from "@/lib/clientColors";

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
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");
  const [showModal, setShowModal] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [formData, setFormData] = useState<CreateClientData>(emptyClientForm());
  const [isSaving, setIsSaving] = useState(false);
  const [colorModalClient, setColorModalClient] = useState<Client | null>(null);
  const [selectedColorKey, setSelectedColorKey] = useState<ClientColorKey | null>(null);
  const [isSavingColor, setIsSavingColor] = useState(false);
  const [colorSaveError, setColorSaveError] = useState<string | null>(null);

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

  const handleOpenColorModal = (client: Client) => {
    setColorModalClient(client);
    setSelectedColorKey(client.colorKey || null);
    setColorSaveError(null);
  };

  const handleCloseColorModal = () => {
    if (isSavingColor) return;
    setColorModalClient(null);
    setColorSaveError(null);
  };

  const handleSaveColor = async () => {
    if (!colorModalClient) return;
    setIsSavingColor(true);
    setColorSaveError(null);
    try {
      const updated = await updateClient(colorModalClient.id, { colorKey: selectedColorKey });
      setClients((prev) =>
        prev.map((current) =>
          current.id === colorModalClient.id
            ? { ...current, colorKey: updated.colorKey !== undefined ? updated.colorKey : selectedColorKey }
            : current,
        ),
      );
      setColorModalClient(null);
    } catch (err: unknown) {
      console.error("Failed to update client color:", err);
      setColorSaveError("Nem sikerült elmenteni az ügyfélszín-jelölést. Próbáld újra.");
    } finally {
      setIsSavingColor(false);
    }
  };

  const renderClientTile = (client: Client) => {
    const color = getClientColorDefinition(client.colorKey);

    return (
      <AdminPanel
        key={client.id}
        data-testid={`client-tile-${client.id}`}
        className={`relative flex min-w-0 flex-col overflow-hidden border-2 border-l-4 transition-shadow hover:shadow-md ${color.borderClass} ${color.key ? color.accentBorderClass : ""}`}
      >
        <div className="flex flex-1 flex-col gap-3 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h2 className="[overflow-wrap:anywhere] break-words font-serif text-lg font-semibold leading-snug text-[var(--adm-text)]">
                <Link
                  href={`/clients/${client.id}`}
                  className="rounded-[4px] transition-colors hover:text-[var(--adm-green-800)] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--adm-green-800)]"
                >
                  {client.name}
                </Link>
              </h2>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <Badge shape="pill" tone={client.relationshipMode === "PORTAL_CENTRIC" ? "teal" : "neutral"} dot>
                  {client.relationshipMode === "PORTAL_CENTRIC" ? "Portál ügyfél" : "Ügyfél"}
                </Badge>
              </div>
            </div>
            <IconButton
              size="sm"
              variant="neutral"
              aria-label={`Ügyfélszín módosítása: ${client.name} (jelenleg: ${color.label})`}
              title={`Ügyfélszín: ${color.label}`}
              onClick={() => handleOpenColorModal(client)}
              className="shrink-0"
            >
              <span
                aria-hidden="true"
                className={`h-3.5 w-3.5 rounded-full border border-black/10 ${color.key ? color.accentClass : "bg-white"}`}
              />
            </IconButton>
          </div>

          <dl className="space-y-1 text-xs text-[var(--adm-text-muted)]">
            {client.contactPerson ? (
              <div className="flex items-center gap-1.5">
                <dt className="shrink-0">Kapcsolattartó:</dt>
                <dd className="min-w-0 truncate font-medium text-[var(--adm-text)]">{client.contactPerson}</dd>
              </div>
            ) : null}
            {client.email ? (
              <div className="flex items-center gap-1.5">
                <dt className="sr-only">Email</dt>
                <dd className="min-w-0 truncate">
                  <a
                    href={`mailto:${client.email}`}
                    className="rounded-[3px] text-[var(--adm-green-800)] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--adm-green-800)]"
                  >
                    {client.email}
                  </a>
                </dd>
              </div>
            ) : null}
            {client.phone ? (
              <div className="flex items-center gap-1.5">
                <dt className="sr-only">Telefon</dt>
                <dd className="truncate">{client.phone}</dd>
              </div>
            ) : null}
            {client.taxNumber ? (
              <div className="flex items-center gap-1.5">
                <dt className="shrink-0">Adószám:</dt>
                <dd className="truncate">{client.taxNumber}</dd>
              </div>
            ) : null}
          </dl>
        </div>

        <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-[var(--adm-border)] p-3">
          <Link
            href={`/clients/${client.id}`}
            className="inline-flex min-h-9 items-center justify-center rounded-[6px] border border-[var(--adm-border)] bg-[var(--adm-surface-raised)] px-3 text-xs font-semibold text-[var(--adm-text)] transition-colors hover:bg-[var(--adm-surface)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--adm-green-800)]"
          >
            Dosszié
          </Link>
          <QuietLink
            href={`/cases?newCase=1&clientId=${encodeURIComponent(client.id)}`}
            size="sm"
            className="min-h-9 px-2"
            aria-label={`Új ügy indítása: ${client.name}`}
          >
            + Új ügy
          </QuietLink>
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
            title="Ügyfelek"
            subtitle="Ügyféladatok, dossziék és kapcsolt ügyindítás egy helyen."
            badge={
              <Badge shape="pill" tone="neutral">
                {filteredClients.length} ügyfél
              </Badge>
            }
            primaryAction={
              <Button variant="primary" onClick={handleCreate}>
                + Új ügyfél
              </Button>
            }
          />

          <div className="flex flex-col gap-3 rounded-lg border border-[#E5E7E6] bg-white p-3.5 shadow-sm sm:flex-row sm:items-end sm:justify-between">
            <div className="w-full max-w-lg">
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
            <div className="flex items-center gap-3 self-end sm:self-auto">
              <span className="text-xs text-[#6B7280]">{filteredClients.length} találat</span>
              <div className="inline-flex rounded-lg border border-[var(--adm-border)] bg-[var(--adm-surface)] p-0.5 text-xs font-medium" role="group" aria-label="Nézet kiválasztása">
                <button
                  type="button"
                  onClick={() => setViewMode("cards")}
                  className={`rounded-md px-3 py-1.5 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--adm-green-800)] ${viewMode === "cards" ? "bg-[var(--adm-surface-raised)] font-semibold text-[var(--adm-green-800)] shadow-sm" : "text-[var(--adm-text-muted)] hover:text-[var(--adm-text)]"}`}
                  aria-pressed={viewMode === "cards"}
                >
                  Csempék
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("table")}
                  className={`rounded-md px-3 py-1.5 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--adm-green-800)] ${viewMode === "table" ? "bg-[var(--adm-surface-raised)] font-semibold text-[var(--adm-green-800)] shadow-sm" : "text-[var(--adm-text-muted)] hover:text-[var(--adm-text)]"}`}
                  aria-pressed={viewMode === "table"}
                >
                  Lista
                </button>
              </div>
            </div>
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
              {viewMode === "table" ? (
                <DataTable className="md:min-w-[760px]">
                  <DataTableHead>
                    <tr>
                      <DataTableHeaderCell>Ügyfél neve</DataTableHeaderCell>
                      <DataTableHeaderCell className="hidden md:table-cell">Kapcsolattartó</DataTableHeaderCell>
                      <DataTableHeaderCell className="hidden md:table-cell">Elérhetőség</DataTableHeaderCell>
                      <DataTableHeaderCell className="hidden md:table-cell">Státusz</DataTableHeaderCell>
                      <DataTableHeaderCell align="right">Műveletek</DataTableHeaderCell>
                    </tr>
                  </DataTableHead>
                  <DataTableBody>
                    {filteredClients.map((client) => {
                      const color = getClientColorDefinition(client.colorKey);
                      return (
                        <DataTableRow key={client.id}>
                          <DataTableCell className={`border-l-4 ${color.key ? color.accentBorderClass : "border-l-transparent"}`}>
                            <Link
                              href={`/clients/${client.id}`}
                              className="group inline-flex flex-col font-medium text-[#1F2937] hover:text-[#0F3D32] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0F3D32]"
                            >
                              <span className="font-semibold text-[13.5px] group-hover:underline">{client.name}</span>
                              {client.taxNumber ? (
                                <span className="text-[11px] text-[#6B7280]">Adószám: {client.taxNumber}</span>
                              ) : null}
                            </Link>
                            <div className="mt-1.5 md:hidden">
                              <Badge shape="pill" tone={client.relationshipMode === "PORTAL_CENTRIC" ? "teal" : "neutral"} dot>
                                {client.relationshipMode === "PORTAL_CENTRIC" ? "Portál ügyfél" : "Ügyfél"}
                              </Badge>
                            </div>
                          </DataTableCell>
                          <DataTableCell muted className="hidden md:table-cell">
                            {client.contactPerson ? (
                              <span className="font-medium text-[#1F2937]">{client.contactPerson}</span>
                            ) : (
                              "—"
                            )}
                          </DataTableCell>
                          <DataTableCell muted className="hidden md:table-cell">
                            <div className="space-y-0.5">
                              {client.email ? (
                                <div>
                                  <a href={`mailto:${client.email}`} className="text-[#1F2937] hover:underline">
                                    {client.email}
                                  </a>
                                </div>
                              ) : null}
                              {client.phone ? (
                                <div className="text-[11px] text-[#6B7280]">{client.phone}</div>
                              ) : null}
                              {!client.email && !client.phone ? "—" : null}
                            </div>
                          </DataTableCell>
                          <DataTableCell className="hidden md:table-cell">
                            <Badge shape="pill" tone={client.relationshipMode === "PORTAL_CENTRIC" ? "teal" : "neutral"} dot>
                              {client.relationshipMode === "PORTAL_CENTRIC" ? "Portál ügyfél" : "Ügyfél"}
                            </Badge>
                          </DataTableCell>
                          <DataTableCell align="right">
                            <div className="flex flex-col items-stretch gap-1.5 md:flex-row md:items-center md:justify-end md:gap-2.5">
                              <QuietLink
                                href={`/cases?newCase=1&clientId=${encodeURIComponent(client.id)}`}
                                size="sm"
                                className="max-md:min-h-8 max-md:justify-center"
                                aria-label={`Új ügy indítása: ${client.name}`}
                              >
                                + Új ügy
                              </QuietLink>
                              <Link
                                href={`/clients/${client.id}`}
                                className="inline-flex min-h-8 items-center justify-center rounded-[5px] border border-[#E5E7E6] bg-white px-2.5 py-1 text-[12px] font-semibold text-[#1F2937] transition-colors hover:bg-[#F8FAF9] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0F3D32]"
                              >
                                Dosszié
                              </Link>
                            </div>
                          </DataTableCell>
                        </DataTableRow>
                      );
                    })}
                  </DataTableBody>
                </DataTable>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{filteredClients.map(renderClientTile)}</div>
              )}
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

      <Modal
        open={Boolean(colorModalClient)}
        onClose={handleCloseColorModal}
        title="Ügyfélszín módosítása"
        description={colorModalClient ? `${colorModalClient.name} vizuális azonosító színének beállítása.` : undefined}
        maxWidth="lg"
        footer={
          <div className="flex w-full items-center justify-between gap-3">
            <div>
              {colorSaveError ? (
                <p role="alert" className="text-xs font-medium text-[var(--adm-terracotta-700)]">
                  {colorSaveError}
                </p>
              ) : null}
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={handleCloseColorModal} disabled={isSavingColor}>
                Mégse
              </Button>
              <Button
                variant="primary"
                onClick={() => void handleSaveColor()}
                disabled={isSavingColor || !colorModalClient}
              >
                {isSavingColor ? "Mentés..." : "Mentés"}
              </Button>
            </div>
          </div>
        }
      >
        <ClientColorSelector value={selectedColorKey} onChange={setSelectedColorKey} disabled={isSavingColor} />
      </Modal>
    </div>
  );
}
