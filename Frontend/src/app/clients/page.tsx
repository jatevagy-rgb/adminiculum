"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AuthenticatedApp } from "@/components/AuthenticatedApp";
import { AdminBadge, AdminButton, AdminPanel, AdminStatusPill } from "@/components/adminiculum/ui";
import { createClient, getClients, updateClient, type Client, type CreateClientData, type UpdateClientData } from "@/lib/api";

const CORE_CLIENT_ORDER = ["blackbelt technology kft", "blackbelt", "saubermacher-magyarorszag kft", "saubermacher", "balintfy es tarsai ugyvedi iroda", "balintfy"];

const CORE_CLIENT_DEFAULTS: Record<string, Partial<Client>> = {
  blackbelt: {
    name: "BlackBelt Technology Kft.",
    address: "1027 Budapest, Ganz utca 16. 3. em., Magyarország",
    taxNumber: "24334934-2-41",
    companyRegistrationNumber: "01-09-356381",
    phone: "70/9309191",
    email: "aczifra@t-online.hu",
    contactPerson: "Sövegjártó Róbert",
  },
  saubermacher: {
    name: "Saubermacher-Magyarország Kft.",
    address: "1181 Budapest, Zádor u. 5.",
    taxNumber: "13559212-2-43",
    companyRegistrationNumber: "03-09-113748",
  },
  balintfy: {
    name: "Bálintfy és Társai Ügyvédi Iroda",
    address: "1051 Budapest",
    contactPerson: "dr. HUBAY Gyula Máté",
  },
};

function normalize(value?: string | null) {
  return String(value || "")
    .toLocaleLowerCase("hu-HU")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function coreKey(client: Client): "blackbelt" | "saubermacher" | "balintfy" | null {
  const value = normalize(`${client.name} ${client.houseStyleProfile?.officialName || ""} ${client.houseStyleProfile?.shortName || ""}`);
  if (value.includes("blackbelt")) return "blackbelt";
  if (value.includes("saubermacher") || value.includes("sauber macher")) return "saubermacher";
  if (value.includes("balintfy")) return "balintfy";
  return null;
}

function coreScore(client: Client) {
  const key = coreKey(client);
  if (key === "blackbelt") return 0;
  if (key === "saubermacher") return 1;
  if (key === "balintfy") return 2;
  return 99;
}

function mergeCoreDefaults(client: Client): Client {
  const key = coreKey(client);
  if (!key) return client;
  const defaults = CORE_CLIENT_DEFAULTS[key];
  return {
    ...client,
    name: client.name || defaults.name || "",
    address: client.address || defaults.address,
    taxNumber: client.taxNumber || defaults.taxNumber,
    companyRegistrationNumber: client.companyRegistrationNumber || defaults.companyRegistrationNumber,
    phone: client.phone || defaults.phone,
    email: client.email || defaults.email,
    contactPerson: client.contactPerson || defaults.contactPerson,
  };
}

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
  const [showModal, setShowModal] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [showOtherClients, setShowOtherClients] = useState(false);
  const [formData, setFormData] = useState<CreateClientData>({
    name: "",
    email: "",
    phone: "",
    address: "",
    taxNumber: "",
    companyRegistrationNumber: "",
    authorizedRepresentative: "",
    contactPerson: "",
  });
  const [isSaving, setIsSaving] = useState(false);

  const loadClients = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await getClients();
      setClients((response.data || []).map(mergeCoreDefaults));
    } catch (err) {
      console.error("Failed to load clients:", err);
      setError("Az ügyféllista most nem érhető el. Próbáld újra néhány másodperc múlva.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadClients();
  }, [loadClients]);

  const visibleGroups = useMemo(() => {
    const sorted = [...clients].sort((a, b) => {
      const scoreDiff = coreScore(a) - coreScore(b);
      if (scoreDiff !== 0) return scoreDiff;
      return a.name.localeCompare(b.name, "hu-HU");
    });
    const seenCore = new Set<string>();
    const primary: Client[] = [];
    const other: Client[] = [];
    for (const client of sorted) {
      const key = coreKey(client);
      if (key && !seenCore.has(key)) {
        seenCore.add(key);
        primary.push(client);
      } else {
        other.push(client);
      }
    }
    return { primary, other };
  }, [clients]);

  const handleCreate = () => {
    setEditingClient(null);
    setFormData({ name: "", email: "", phone: "", address: "", taxNumber: "", companyRegistrationNumber: "", authorizedRepresentative: "", contactPerson: "" });
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

  const renderClientCard = (client: Client, primary: boolean) => {
    const profile = client.houseStyleProfile;
    const display = mergeCoreDefaults(client);
    const fillStatus = houseStyleFillStatus(profile);
    const hasProfile = fillStatus !== "none";
    const hasHeader = Boolean(profile?.headerAssetPath);
    return (
      <AdminPanel key={client.id} className="overflow-hidden p-4 shadow-[var(--adm-shadow-sm)]">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-serif text-2xl font-medium leading-tight text-[var(--adm-text)]">{profile?.officialName || display.name}</h2>
              {primary ? <AdminBadge tone="gold">Alap ügyfél</AdminBadge> : <AdminBadge tone="neutral">Ügyfél</AdminBadge>}
            </div>
            <p className="mt-1 text-sm text-[#3D4842]">Rövid név: <b>{profile?.shortName || (coreKey(client) === "blackbelt" ? "BlackBelt" : coreKey(client) === "saubermacher" ? "Saubermacher" : coreKey(client) === "balintfy" ? "Bálintfy" : display.name)}</b></p>
            <div className="mt-3 grid gap-2 text-xs text-[#3D4842] md:grid-cols-2 xl:grid-cols-4">
              <p>Székhely: <b>{profile?.registeredSeat || display.address || "Nincs megadva"}</b></p>
              <p>Adószám: <b>{profile?.taxNumber || display.taxNumber || "Nincs megadva"}</b></p>
              <p>Cégjegyzékszám / nyilvántartási szám: <b>{profile?.registrationNumber || display.companyRegistrationNumber || "Nincs megadva"}</b></p>
              <p>Kapcsolattartó: <b>{profile?.contactPerson || display.contactPerson || display.authorizedRepresentative || "Nincs megadva"}</b></p>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <AdminStatusPill tone={fillStatus === "filled" ? "green" : fillStatus === "partial" ? "gold" : "neutral"}>
                {fillStatus === "filled" ? "House style kitöltve" : fillStatus === "partial" ? "House style részleges" : "Nincs house style profil"}
              </AdminStatusPill>
              <AdminStatusPill tone={hasHeader ? "green" : "neutral"}>Fejlécminta: {hasHeader ? "Van" : "Nincs"}</AdminStatusPill>
            </div>
            <p className="mt-3 text-[11px] leading-5 text-[var(--adm-text-muted)]">
              A house style profil dokumentumformátumot, fejléc/arculati elvárásokat és ügyfél-specifikus instrukciókat ad a prompt-copy workflow-hoz.
            </p>
          </div>
          <div className="grid shrink-0 grid-cols-2 gap-2 sm:flex sm:flex-wrap xl:max-w-[360px] xl:justify-end">
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
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1420px] space-y-5 p-5 lg:p-7">
          <div className="flex flex-col gap-4 rounded-[var(--adm-radius-lg)] border border-[rgba(22,32,26,0.10)] bg-white p-5 shadow-[var(--adm-shadow-sm)] md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--adm-text-muted)]">Ügyfelek</p>
              <h1 className="mt-1 font-serif text-4xl font-medium text-[var(--adm-text)]">Ügyfelek</h1>
              <p className="mt-1 text-sm text-[#3D4842]">Ügyfélkapcsolatok, house style profilok és ügyindítás.</p>
            </div>
            <AdminButton variant="primary" onClick={handleCreate}>+ Új ügyfél</AdminButton>
          </div>

          <div className="grid gap-3 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.9fr)_minmax(0,0.9fr)]">
            <AdminPanel className="p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--adm-text-muted)]">Lista fókusz</p>
              <p className="mt-2 text-[11px] leading-5 text-[#3D4842]">
                A fő ügyindítási lista alapértelmezetten a kiemelt pilot ügyfelekre szűkít: BlackBelt, Saubermacher és Bálintfy. Más ügyfelek nem törlődnek.
              </p>
            </AdminPanel>
            <AdminPanel className="p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--adm-text-muted)]">House style termékérték</p>
              <ul className="mt-2 space-y-1 text-[11px] text-[#3D4842]">
                <li>Dokumentumstílus, címsor- és számozási szabályok ügyfelenként.</li>
                <li>Fejléc / branding minta és kétnyelvűségi elvárások kezelése.</li>
                <li>Ügyfél-specifikus nyelvi és fordítási irányok követése.</li>
              </ul>
            </AdminPanel>
            <AdminPanel className="p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--adm-text-muted)]">Külső prompt workflow</p>
              <p className="mt-2 text-[11px] leading-5 text-[#3D4842]">
                Az Adminiculum nem futtat automatikusan külső eszközt. A house style panel instrukciós kontextust ad, amit a felhasználó szükség esetén promptként másolhat át.
              </p>
            </AdminPanel>
          </div>

          {error ? (
            <div className="rounded border border-[#F2DAD6] bg-[var(--adm-terracotta-100)] p-3 text-xs text-[var(--adm-terracotta-700)]">
              <p className="font-semibold">{error}</p>
              <p className="mt-1 text-[11px] text-[#6D5148]">
                Ha ez staging környezeti hiba, ellenőrizd a backend `/api/v1/clients` végpontot.
              </p>
              <button
                type="button"
                onClick={loadClients}
                className="mt-2 inline-flex items-center justify-center rounded-[5px] border border-[#8B2A2A] bg-white px-3 py-1.5 text-[11px] font-semibold text-[var(--adm-terracotta-700)] hover:bg-[#FBE9E6]"
              >
                Újrapróbálás
              </button>
            </div>
          ) : null}

          {isLoading ? (
            <AdminPanel className="p-10 text-center text-sm text-[var(--adm-text-muted)]">Ügyfelek betöltése…</AdminPanel>
          ) : (
            <>
              <section className="space-y-3">
                <h2 className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--adm-text-muted)]">Kiemelt ügyfelek</h2>
                {visibleGroups.primary.length > 0 ? visibleGroups.primary.map((client) => renderClientCard(client, true)) : <AdminPanel className="p-4 text-sm text-[var(--adm-text-muted)]">Még nincs ügyfél.</AdminPanel>}
              </section>

              <section className="space-y-3">
                <button type="button" onClick={() => setShowOtherClients((value) => !value)} className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--adm-text-muted)] hover:text-[var(--adm-text)]">
                  {showOtherClients ? "▾" : "▸"} Egyéb / teszt ügyfelek ({visibleGroups.other.length})
                </button>
                <p className="text-[11px] text-[var(--adm-text-muted)]">Ezek az ügyfelek nincsenek törölve; alapértelmezés szerint nem jelennek meg az ügyindítási listában.</p>
                {showOtherClients ? <div className="space-y-3">{visibleGroups.other.map((client) => renderClientCard(client, false))}</div> : null}
              </section>
            </>
          )}
        </div>
      </main>

      {showModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#16201A]/70 p-4">
          <div className="max-h-[calc(100vh-48px)] w-full max-w-md overflow-hidden rounded-lg bg-white shadow-xl">
            <div className="border-b border-[var(--adm-border)] bg-[#082817] p-5 text-[#F4EFDB]">
              <h2 className="font-serif text-2xl font-medium">{editingClient ? "Ügyfél szerkesztése" : "Új ügyfél"}</h2>
            </div>
            <div className="max-h-[calc(100vh-190px)] space-y-4 overflow-y-auto p-6">
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
                  <input type={type} value={String(formData[key as keyof CreateClientData] || "")} onChange={(event) => setFormData({ ...formData, [key]: event.target.value })} className="mt-2 w-full rounded border border-[var(--adm-border)] px-3 py-2 text-sm normal-case tracking-normal text-[var(--adm-text)] focus:outline-none focus:border-[#082817]" />
                </label>
              ))}
              <label className="block text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">
                Székhely / cím
                <textarea value={formData.address || ""} onChange={(event) => setFormData({ ...formData, address: event.target.value })} rows={3} className="mt-2 w-full rounded border border-[var(--adm-border)] px-3 py-2 text-sm normal-case tracking-normal text-[var(--adm-text)] focus:outline-none focus:border-[#082817]" />
              </label>
            </div>
            <div className="flex justify-end gap-3 border-t border-[var(--adm-border)] bg-[var(--adm-sand-100)] p-4">
              <AdminButton variant="ghost" onClick={() => setShowModal(false)} disabled={isSaving}>Mégse</AdminButton>
              <AdminButton variant="primary" onClick={handleSave} disabled={isSaving || !formData.name?.trim()}>{isSaving ? "Mentés..." : "Mentés"}</AdminButton>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
