"use client";

import React, { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { notFound } from "next/navigation";
import {
  AdminButton,
  AdminBadge,
  AdminStatusPill,
  AdminPanel,
  AdminSectionHeader,
  AdminDocumentRow,
  OperationalPageHeader,
  CompactState,
  SafePanelError,
  Button,
  IconButton,
  Badge,
  StatusChip,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
  Panel,
  DataTable,
  DataTableHead,
  DataTableHeaderCell,
  DataTableBody,
  DataTableRow,
  DataTableCell,
  FormField,
  Input,
  Select,
  Textarea,
  EmptyState,
  Alert,
  Modal,
  ConfirmationDialog,
  QuietLink,
  CANONICAL_TOKENS,
  CLIENT_COLOR_KEYS,
  calculateContrastRatio,
} from "@/components/ui";

function ShowroomInner() {
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_DISABLE_SHOWROOM === "true") {
    notFound();
  }

  const searchParams = useSearchParams();
  const activeView = searchParams.get("view") || "all";

  // Interactive modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [selectedRow, setSelectedRow] = useState<string | null>("doc-1");
  const [selectedText, setSelectedText] = useState("A felek megállapodnak abban, hogy a megbízási díj havonta esedékes.");

  // Table sample data

  const tableData = [
    { id: "U-2026-001", title: "Ingatlan adásvételi szerződés", client: "Acme Kft.", status: "Folyamatban", deadline: "2026.10.15" },
    { id: "U-2026-002", title: "Munkaszerződés módosítás", client: "Beta Zrt.", status: "Aláírásra vár", deadline: "2026.10.02" },
    { id: "U-2026-003", title: "Kereskedelmi megállapodás", client: "Gamma Kft.", status: "Lezárt", deadline: "2026.09.20" },
    { id: "U-2026-004", title: "Adatvédelmi tájékoztató", client: "Delta Nyrt.", status: "Folyamatban", deadline: "2026.11.01" },
  ];

  const showSection = (id: string) => activeView === "all" || activeView === id;

  return (
    <div className="min-h-screen bg-[var(--adm-canvas-subtle)] text-[var(--adm-text-primary)] font-sans">
      {/* Showroom Header */}
      <header className="sticky top-0 z-30 border-b border-[var(--adm-border-canonical)] bg-white px-6 py-4 shadow-sm">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <span className="rounded bg-[#0F3D32] px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-white">
                Adminiculum
              </span>
              <h1 className="text-xl font-bold tracking-tight text-[#0F3D32]">
                Coded UI Showroom & Canonical Design System
              </h1>
            </div>
            <p className="mt-1 text-xs text-[var(--adm-text-secondary)]">
              Developer-visible, testable UI contract and living component reference. Rendering real production primitives.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a
              href="/dev/showroom?view=all"
              className={`rounded px-2.5 py-1 text-xs font-medium ${activeView === "all" ? "bg-[#0F3D32] text-white" : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"}`}
            >
              Összes
            </a>
            <a
              href="/dev/showroom?view=buttons"
              className={`rounded px-2.5 py-1 text-xs font-medium ${activeView === "buttons" ? "bg-[#0F3D32] text-white" : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"}`}
            >
              Gombok
            </a>
            <a
              href="/dev/showroom?view=status"
              className={`rounded px-2.5 py-1 text-xs font-medium ${activeView === "status" ? "bg-[#0F3D32] text-white" : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"}`}
            >
              Státuszok
            </a>
            <a
              href="/dev/showroom?view=forms"
              className={`rounded px-2.5 py-1 text-xs font-medium ${activeView === "forms" ? "bg-[#0F3D32] text-white" : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"}`}
            >
              Űrlapok
            </a>
            <a
              href="/dev/showroom?view=table"
              className={`rounded px-2.5 py-1 text-xs font-medium ${activeView === "table" ? "bg-[#0F3D32] text-white" : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"}`}
            >
              Táblázat
            </a>
            <a
              href="/dev/showroom?view=page-header"
              className={`rounded px-2.5 py-1 text-xs font-medium ${activeView === "page-header" ? "bg-[#0F3D32] text-white" : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"}`}
            >
              Fejlécek
            </a>
            <a
              href="/dev/showroom?view=workspace-three-column"
              className={`rounded px-2.5 py-1 text-xs font-medium ${activeView === "workspace-three-column" ? "bg-[#0F3D32] text-white" : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"}`}
            >
              3-Oszlopos Shell
            </a>
            <a
              href="/dev/showroom?view=worklist-detail"
              className={`rounded px-2.5 py-1 text-xs font-medium ${activeView === "worklist-detail" ? "bg-[#0F3D32] text-white" : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"}`}
            >
              Worklist + Részlet
            </a>
          </div>
        </div>
      </header>

      {/* Main Content Showcase */}
      <main className="mx-auto max-w-7xl px-4 py-8 space-y-12">
        {/* ==================================================================== */}
        {/* 1. TOKENS & CONTRAST */}
        {/* ==================================================================== */}
        {showSection("tokens") && (
          <section id="tokens" className="space-y-4">
            <AdminSectionHeader
              eyebrow="Tervezési tokenek"
              title="Kanonikus Szemantikai Tokenek & Kontraszt Ellenőrzés"
              subtitle="Az ADMINICULUM_UI_SOURCE_OF_TRUTH.md szerinti kanonikus szín- és kontrasztreferenciák."
            />
            <div className="overflow-x-auto rounded-[8px] border border-[var(--adm-border-canonical)] bg-white">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-subtle)] text-[var(--adm-text-secondary)]">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Minta</th>
                    <th className="px-4 py-3 font-semibold">Név & CSS Változó</th>
                    <th className="px-4 py-3 font-semibold">Hex</th>
                    <th className="px-4 py-3 font-semibold">Szemantikai Szerepkör</th>
                    <th className="px-4 py-3 font-semibold">Rendeltetés</th>
                    <th className="px-4 py-3 font-semibold">Kontraszt (Fehér / Alap)</th>
                    <th className="px-4 py-3 font-semibold">WCAG AA</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--adm-border-canonical)]">
                  {Object.values(CANONICAL_TOKENS).map((token) => (
                    <tr key={token.id} className="hover:bg-neutral-50/50">
                      <td className="px-4 py-2.5">
                        <div
                          className="h-8 w-12 rounded border border-black/10 shadow-inner flex items-center justify-center font-mono text-[9px]"
                          style={{ backgroundColor: token.hex, color: token.isAccessibleOnLight ? "#FFFFFF" : "#1F2937" }}
                        >
                          Aa
                        </div>
                      </td>
                      <td className="px-4 py-2.5 font-medium">
                        <div>{token.name}</div>
                        <code className="text-[10px] text-neutral-500">{token.cssVariable}</code>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-[11px]">{token.hex}</td>
                      <td className="px-4 py-2.5 font-semibold text-neutral-800">{token.role}</td>
                      <td className="px-4 py-2.5 text-neutral-600 max-w-xs">{token.intendedUse}</td>
                      <td className="px-4 py-2.5 font-mono text-[11px]">
                        {token.contrastWithWhite}:1 / {token.contrastWithCanvasSubtle}:1
                      </td>
                      <td className="px-4 py-2.5">
                        {token.isAccessibleOnLight ? (
                          <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 border border-emerald-200">
                            ✓ AA Szöveg
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800 border border-amber-200">
                            Felület / Kiemelő
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* ClientColorKey palette notice */}
            <div className="rounded-[8px] border border-blue-200 bg-blue-50/60 p-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-blue-900">
                Korlátozott Ügyféljelölő Paletta (ClientColorKey)
              </h4>
              <p className="mt-1 text-xs text-blue-800">
                Kifejezetten engedélyezett kivétel ügyfél-szervezeti jelölésre. <strong>Szigorúan tilos</strong> munkafolyamat- vagy státusz-szemantikára (pl. hiba vagy siker jelzésére) használni.
              </p>
              <div className="mt-3 flex flex-wrap gap-3">
                {Object.values(CLIENT_COLOR_KEYS).map((c) => (
                  <div key={c.key} className="flex items-center gap-2 rounded border bg-white px-2.5 py-1 text-xs shadow-xs" style={{ borderColor: c.badgeBorder }}>
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: c.dotColor }} />
                    <span className="font-semibold" style={{ color: c.badgeText }}>{c.label}</span>
                    <span className="text-[10px] text-neutral-400 font-mono">({c.key})</span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ==================================================================== */}
        {/* 2. BUTTONS */}
        {/* ==================================================================== */}
        {showSection("buttons") && (
          <section id="buttons" className="space-y-4">
            <AdminSectionHeader
              eyebrow="Műveleti komponensek"
              title="Gombok (AdminButton & Button)"
              subtitle="Egyetlen elsődleges CTA oldalanként; világos funkcionális hierarchia."
            />
            <AdminPanel className="p-6 space-y-6">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--adm-text-secondary)] mb-3">
                  AdminButton Változatok (Kanonikus)
                </h4>
                <div className="flex flex-wrap items-center gap-3">
                  <AdminButton variant="primary">Elsődleges (primary)</AdminButton>
                  <AdminButton variant="neutral">Semleges / Másodlagos (neutral)</AdminButton>
                  <AdminButton variant="gold">Kiemelt figyelem (gold)</AdminButton>
                  <AdminButton variant="ai">AI Művelet (ai)</AdminButton>
                  <AdminButton variant="warning">Figyelmeztető (warning)</AdminButton>
                  <AdminButton variant="danger">Megszakítás / Törlés (danger)</AdminButton>
                  <AdminButton variant="ghost">Csendes (ghost)</AdminButton>
                  <AdminButton variant="primary" disabled>Inaktív (disabled)</AdminButton>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--adm-text-secondary)] mb-3">
                  Button Változatok & Állapotok
                </h4>
                <div className="flex flex-wrap items-center gap-3">
                  <Button variant="primary">Fő CTA mentés</Button>
                  <Button variant="secondary">Másodlagos</Button>
                  <Button variant="neutral">Körvonalas / Semleges</Button>
                  <Button variant="danger">Törlés megerősítése</Button>
                  <Button variant="primary" isLoading>Betöltés...</Button>
                  <Button variant="ghost">Csendes link művelet</Button>
                  <QuietLink href="#buttons">QuietLink hivatkozás</QuietLink>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--adm-text-secondary)] mb-3">
                  Gomb Méretarányok
                </h4>
                <div className="flex flex-wrap items-end gap-3">
                  <AdminButton size="xs" variant="neutral">Kicsi (xs)</AdminButton>
                  <AdminButton size="sm" variant="neutral">Kompakt (sm)</AdminButton>
                  <AdminButton size="md" variant="neutral">Normál (md)</AdminButton>
                  <AdminButton size="lg" variant="neutral">Nagy (lg)</AdminButton>
                </div>
              </div>
            </AdminPanel>
          </section>
        )}

        {/* ==================================================================== */}
        {/* 3. STATUS & BADGES */}
        {/* ==================================================================== */}
        {showSection("status") && (
          <section id="status" className="space-y-4">
            <AdminSectionHeader
              eyebrow="Státuszjelzők"
              title="Jelvények & Státusz Pirulák (AdminBadge, AdminStatusPill)"
              subtitle="A szöveg hordozza az értelmet, nem a szín önmagában. Pontjelzőkkel támogatva."
            />
            <AdminPanel className="p-6 space-y-6">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--adm-text-secondary)] mb-3">
                  AdminStatusPill (Kerekített pirula állapotjelzők)
                </h4>
                <div className="flex flex-wrap items-center gap-3">
                  <AdminStatusPill tone="green">Aktív / Teljesítve</AdminStatusPill>
                  <AdminStatusPill tone="gold">Függőben / Tervezet</AdminStatusPill>
                  <AdminStatusPill tone="amber">Figyelmet igényel</AdminStatusPill>
                  <AdminStatusPill tone="blue">Ügyvéd által átnézve</AdminStatusPill>
                  <AdminStatusPill tone="burgundy">Sürgős / Határidő lejárt</AdminStatusPill>
                  <AdminStatusPill tone="neutral">Archivált</AdminStatusPill>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--adm-text-secondary)] mb-3">
                  AdminBadge (Szögletes címkék)
                </h4>
                <div className="flex flex-wrap items-center gap-3">
                  <AdminBadge tone="green" dot>Jóváhagyva</AdminBadge>
                  <AdminBadge tone="gold" dot>Piszkozat</AdminBadge>
                  <AdminBadge tone="amber" dot>Kiegészítésre vár</AdminBadge>
                  <AdminBadge tone="blue" dot>Dokumentum sablon</AdminBadge>
                  <AdminBadge tone="violet" dot>Belső feljegyzés</AdminBadge>
                  <AdminBadge tone="burgundy" dot>Kritikus kockázat</AdminBadge>
                  <AdminBadge tone="neutral">Nem releváns</AdminBadge>
                </div>
              </div>
            </AdminPanel>
          </section>
        )}

        {/* ==================================================================== */}
        {/* 4. PAGE HEADERS & STRUCTURE */}
        {/* ==================================================================== */}
        {showSection("page-header") && (
          <section id="page-header" className="space-y-4">
            <AdminSectionHeader
              eyebrow="Oldalstruktúra"
              title="Oldalfejlécek & Szekciófejlécek"
              subtitle="Egyetlen H1 oldalanként; szigorú címhierarchia és integrált egyetlen fő CTA."
            />
            <AdminPanel className="p-6 space-y-8">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--adm-text-secondary)] mb-3">
                  OperationalPageHeader (Munkapad Főfejléc)
                </h4>
                <OperationalPageHeader
                  title="Ügyek és Munkacsomagok"
                  count="14 aktív"
                  subtitle="Nyitott jogi ügyek, folyamatban lévő szerződéstervezetek és kapcsolódó határidők."
                  primaryAction={<AdminButton variant="primary">Új ügy indítása</AdminButton>}
                  secondaryActions={<AdminButton variant="neutral">Exportálás</AdminButton>}
                />
              </div>

              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--adm-text-secondary)] mb-3">
                  AdminSectionHeader (Szekciófejléc Művelettel)
                </h4>
                <AdminSectionHeader
                  eyebrow="Dokumentumtár"
                  title="Feltöltött Munkapéldányok"
                  subtitle="Az ügyfél által szolgáltatott hitelesített forrásiratok."
                  action={<AdminButton size="sm" variant="neutral">Új feltöltés</AdminButton>}
                />
              </div>
            </AdminPanel>
          </section>
        )}

        {/* ==================================================================== */}
        {/* 5. SURFACES & COMPACT CARDS */}
        {/* ==================================================================== */}
        {showSection("surfaces") && (
          <section id="surfaces" className="space-y-4">
            <AdminSectionHeader
              eyebrow="Felületek és panelek"
              title="Panelek & Kártyák (AdminPanel, Card, Panel)"
              subtitle="Összetartozó tartalmi blokkok csoportosítására; nem minden mező külön kártya."
            />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <AdminPanel className="p-4">
                <h3 className="text-sm font-semibold text-[#0F3D32]">Kanonikus AdminPanel</h3>
                <p className="mt-1 text-xs text-[var(--adm-text-secondary)]">
                  8px lekerekítés, diszkrét 1px keret, tiszta fehér háttér. Alapértelmezett munkapad felület.
                </p>
                <div className="mt-4 flex items-center justify-between text-xs">
                  <span className="text-neutral-500">Módosítva</span>
                  <span className="font-mono">Ma, 14:20</span>
                </div>
              </AdminPanel>

              <Card>
                <CardHeader>
                  <CardTitle>Strukturált Kártya (Card)</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-[var(--adm-text-secondary)]">
                    12px kerekítésű kanonikus UI kártya tagolt fejléccel és törzzsel döntéstámogató összegzésekhez.
                  </p>
                </CardContent>
                <CardFooter className="flex justify-end gap-2">
                  <QuietLink href="#surfaces">Részletek</QuietLink>
                </CardFooter>
              </Card>

              <AdminPanel className="p-4 bg-[var(--adm-canvas-subtle)] border-dashed">
                <h3 className="text-sm font-semibold text-neutral-700">Kompakt műveleti doboz</h3>
                <p className="mt-1 text-xs text-[var(--adm-text-secondary)]">
                  Kontextuális információk és gyors áttekintések részére.
                </p>
                <div className="mt-3">
                  <AdminStatusPill tone="neutral">Csak olvasás</AdminStatusPill>
                </div>
              </AdminPanel>
            </div>
          </section>
        )}

        {/* ==================================================================== */}
        {/* 6. DATA & TABLES */}
        {/* ==================================================================== */}
        {showSection("table") && (
          <section id="table" className="space-y-4">
            <AdminSectionHeader
              eyebrow="Adatmegjelenítés"
              title="Kanonikus Táblázat & Kereső Eszköztár (DataTable)"
              subtitle="Összehasonlítható operatív adatoknál mindig táblázat, sosem kártyarács."
            />
            <AdminPanel className="p-4 space-y-4">
              {/* Filter Toolbar */}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-[var(--adm-border-canonical)] pb-3">
                <div className="flex flex-1 items-center gap-2 max-w-md">
                  <Input placeholder="Keresés ügy, ügyfél vagy azonosító alapján..." className="text-xs py-1.5" />
                  <Select className="text-xs py-1.5 w-40">
                    <option value="">Minden státusz</option>
                    <option value="open">Folyamatban</option>
                    <option value="pending">Aláírásra vár</option>
                    <option value="closed">Lezárt</option>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[var(--adm-text-secondary)]">Összesen: 4 tétel</span>
                  <AdminButton size="sm" variant="neutral">Szűrők törlése</AdminButton>
                </div>
              </div>

              {/* Data Table */}
              <DataTable>
                <DataTableHead>
                  <DataTableRow>
                    <DataTableHeaderCell>Azonosító</DataTableHeaderCell>
                    <DataTableHeaderCell>Ügy / Tárgy</DataTableHeaderCell>
                    <DataTableHeaderCell>Ügyfél</DataTableHeaderCell>
                    <DataTableHeaderCell>Státusz</DataTableHeaderCell>
                    <DataTableHeaderCell>Határidő</DataTableHeaderCell>
                  </DataTableRow>
                </DataTableHead>
                <DataTableBody>
                  {tableData.map((row) => (
                    <DataTableRow key={row.id}>
                      <DataTableCell className="font-mono text-xs">{row.id}</DataTableCell>
                      <DataTableCell className="font-medium">{row.title}</DataTableCell>
                      <DataTableCell>{row.client}</DataTableCell>
                      <DataTableCell>
                        {row.status === "Folyamatban" && <AdminStatusPill tone="blue">Folyamatban</AdminStatusPill>}
                        {row.status === "Aláírásra vár" && <AdminStatusPill tone="gold">Aláírásra vár</AdminStatusPill>}
                        {row.status === "Lezárt" && <AdminStatusPill tone="green">Lezárt</AdminStatusPill>}
                      </DataTableCell>
                      <DataTableCell muted>{row.deadline}</DataTableCell>
                    </DataTableRow>
                  ))}
                </DataTableBody>
              </DataTable>
            </AdminPanel>
          </section>
        )}

        {/* ==================================================================== */}
        {/* 7. FORMS */}
        {/* ==================================================================== */}
        {showSection("forms") && (
          <section id="forms" className="space-y-4">
            <AdminSectionHeader
              eyebrow="Adatbevitel"
              title="Űrlapmezők (FormField, Input, Select, Textarea)"
              subtitle="Látható feliratok, akadálymentes hibajelzések és egyértelmű kitöltési segédletek."
            />
            <AdminPanel className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField label="Ügyfél megnevezése" required help="A cégbírósági bejegyzés szerinti pontos név.">
                  <Input placeholder="Pl. Minta Kereskedelmi Kft." />
                </FormField>

                <FormField label="Ügytípus kiválasztása" required>
                  <Select defaultValue="litigation">
                    <option value="litigation">Peres eljárás (Litigation)</option>
                    <option value="contract">Szerződéskötés (Corporate / Contract)</option>
                    <option value="compliance">Megfelelőségi vizsgálat (Compliance)</option>
                  </Select>
                </FormField>

                <FormField
                  label="Iktatószám (hibás mező példa)"
                  error="Az iktatószám formátuma érvénytelen (helyes formátum: IKT-2026/001)."
                >
                  <Input defaultValue="HIBAS-IKT" aria-invalid="true" />
                </FormField>

                <FormField label="Inaktív mező">
                  <Input defaultValue="Csak rendszergazda által módosítható érték" disabled />
                </FormField>

                <div className="md:col-span-2">
                  <FormField label="Rövid tényállás / Feljegyzés" help="Maximum 500 karakter.">
                    <Textarea rows={3} placeholder="Írja le a megállapodás lényeges pontjait..." />
                  </FormField>
                </div>
              </div>
            </AdminPanel>
          </section>
        )}

        {/* ==================================================================== */}
        {/* 8. FEEDBACK & STATES */}
        {/* ==================================================================== */}
        {showSection("feedback") && (
          <section id="feedback" className="space-y-4">
            <AdminSectionHeader
              eyebrow="Visszajelzések"
              title="Értesítések, Üres és Hibaállapotok (Alert, CompactState, EmptyState)"
              subtitle="Őszinte állapotok: nincs hamis siker vagy rejtett hiba."
            />
            <div className="space-y-4">
              <Alert variant="success" title="Sikeres rögzítés">
                A szerződéstervezet változásai mentésre kerültek a központi adatbázisban.
              </Alert>

              <Alert variant="warning" title="Közeledő határidő">
                A benyújtási határidő 48 órán belül lejár. Kérjük ellenőrizze a csatolt mellékleteket.
              </Alert>

              <Alert variant="error" title="Kapcsolati hiba">
                Nem sikerült csatlakozni a SharePoint tárolóhoz. Próbálja újra néhány perc múlva.
              </Alert>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <CompactState
                  title="Nem található megnyitott feladat"
                  detail="Az ügyhöz jelenleg nem tartozik aktív ügyvédi feladatkiosztás."
                  action={<AdminButton size="sm" variant="neutral">Feladat hozzáadása</AdminButton>}
                />

                <SafePanelError
                  detail="A külső cégadatbázis lekérdezése átmenetileg időtúllépés miatt meghiúsult."
                  onRetry={() => alert("Újratöltés kísérlet...")}
                />
              </div>

              <AdminPanel className="p-8">
                <EmptyState
                  title="Nincsenek megjeleníthető dokumentumok"
                  description="Ehhez az ügyhöz még nem töltöttek fel munkapéldányt. Töltsön fel egy Word (.docx) vagy PDF fájlt az elemzéshez."
                  action={<AdminButton variant="primary">Dokumentum feltöltése</AdminButton>}
                />
              </AdminPanel>
            </div>
          </section>
        )}

        {/* ==================================================================== */}
        {/* 9. OVERLAYS & MODALS */}
        {/* ==================================================================== */}
        {showSection("modal") && (
          <section id="modal" className="space-y-4">
            <AdminSectionHeader
              eyebrow="Felugró ablakok"
              title="Modális Dialógusok (Modal, ConfirmationDialog)"
              subtitle="Fókuszcsapdával (focus trap), Escape billentyűkezeléssel és visszatérő fókusszal."
            />
            <AdminPanel className="p-6">
              <div className="flex flex-wrap items-center gap-4">
                <AdminButton variant="primary" onClick={() => setModalOpen(true)}>
                  Példa Modális Ablak Megnyitása
                </AdminButton>

                <AdminButton variant="danger" onClick={() => setConfirmOpen(true)}>
                  Törlés Megerősítése (Példa)
                </AdminButton>
              </div>

              {/* Standard Modal */}
              <Modal
                open={modalOpen}
                onClose={() => setModalOpen(false)}
                title="Új Munkapéldány Hozzáadása"
                description="Válassza ki a feltölteni kívánt forrásdokumentumot. A rendszer automatikusan ellenőrzi a vírusmentességet."
                footer={
                  <div className="flex justify-end gap-2">
                    <AdminButton variant="neutral" onClick={() => setModalOpen(false)}>
                      Mégse
                    </AdminButton>
                    <AdminButton variant="primary" onClick={() => setModalOpen(false)}>
                      Feltöltés és Mentés
                    </AdminButton>
                  </div>
                }
              >
                <div className="space-y-4 py-2">
                  <FormField label="Dokumentum neve">
                    <Input placeholder="Pl. Szerződéstervezet_v2.docx" defaultValue="Szállítói_keretszerződés_v1.docx" />
                  </FormField>
                  <FormField label="Megjegyzés a review-hoz">
                    <Textarea rows={2} placeholder="Opcionális megjegyzés a jóváhagyónak..." />
                  </FormField>
                </div>
              </Modal>

              {/* Confirmation Dialog */}
              <ConfirmationDialog
                open={confirmOpen}
                title="Biztosan törli ezt a munkapéldányt?"
                description="A törlés végleges és visszavonhatatlan. A dokumentumhoz tartozó megjegyzések és záradékhivatkozások is törlődnek."
                confirmLabel="Végleges törlés"
                cancelLabel="Mégse"
                onConfirm={() => {
                  alert("Törlés végrehajtva.");
                  setConfirmOpen(false);
                }}
                onCancel={() => setConfirmOpen(false)}
              />
            </AdminPanel>
          </section>
        )}

        {/* ==================================================================== */}
        {/* 10. WORKSPACE PATTERNS */}
        {/* ==================================================================== */}
        {(showSection("workspace-three-column") || showSection("worklist-detail") || showSection("patterns")) && (
          <section id="patterns" className="space-y-8">
            <AdminSectionHeader
              eyebrow="Tervezési minták"
              title="Operatív Jogi Munkapad Minták"
              subtitle="Coded PATTERN példák valódi közös primitívekkel komponálva."
            />

            {/* Pattern 1: Three-Column Professional Workspace */}
            {showSection("workspace-three-column") && (
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#0F3D32]">
                  1. Minta: Háromoszlopos Jogi Munkapad (Bal: Források | Közép: Munkaterület | Jobb: Metaadat sáv)
                </h4>
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 h-[440px] rounded-[8px] border border-[var(--adm-border-canonical)] bg-white overflow-hidden shadow-xs">
                  {/* Left Context Rail (3 cols) */}
                  <div className="lg:col-span-3 border-r border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-subtle)] p-3 flex flex-col gap-2 overflow-y-auto">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">Iratok (3)</span>
                    <AdminDocumentRow
                      title="Szindikátusi szerződés v2"
                      meta="Word • 240 KB"
                      fileType="DOC"
                      active={selectedRow === "doc-1"}
                      onClick={() => setSelectedRow("doc-1")}
                    />
                    <AdminDocumentRow
                      title="Cégbírósági végzés"
                      meta="PDF • 1.2 MB"
                      fileType="PDF"
                      active={selectedRow === "doc-2"}
                      onClick={() => setSelectedRow("doc-2")}
                    />
                    <AdminDocumentRow
                      title="Felelősségvállalási nyilatkozat"
                      meta="DOCX • 110 KB"
                      fileType="DOC"
                      active={selectedRow === "doc-3"}
                      onClick={() => setSelectedRow("doc-3")}
                    />
                  </div>

                  {/* Center Work Surface (6 cols) */}
                  <div className="lg:col-span-6 p-4 flex flex-col justify-between overflow-y-auto">
                    <div>
                      <div className="flex items-center justify-between border-b border-[var(--adm-border-canonical)] pb-2 mb-3">
                        <h5 className="font-semibold text-sm text-[#0F3D32]">Szindikátusi szerződés v2 — Szövegnézet</h5>
                        <AdminBadge tone="gold">Jóváhagyásra vár</AdminBadge>
                      </div>
                      <div className="prose text-xs text-neutral-800 leading-relaxed space-y-2">
                        <p>
                          1. § A jelen megállapodás a felek közötti együttműködés részletes kereteit rögzíti a vonatkozó Ptk. rendelkezései alapján.
                        </p>
                        <p className="p-2 bg-amber-50/70 border-l-2 border-amber-500 rounded-r">
                          <strong>Kiemelt záradék:</strong> {selectedText}
                        </p>
                        <p>
                          2. § A teljesítés helye a megbízó székhelye, vitás kérdések esetén a felek alávetik magukat a hatáskörrel rendelkező bíróság döntésének.
                        </p>
                      </div>
                    </div>
                    <div className="border-t border-[var(--adm-border-canonical)] pt-3 flex items-center justify-between">
                      <span className="text-[11px] text-neutral-500">Utolsó mentés: 14:32</span>
                      <div className="flex gap-2">
                        <AdminButton size="sm" variant="neutral">Revízió történet</AdminButton>
                        <AdminButton size="sm" variant="primary">Következő lépés</AdminButton>
                      </div>
                    </div>
                  </div>

                  {/* Right Context Rail (3 cols) */}
                  <div className="lg:col-span-3 border-l border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-subtle)] p-3 flex flex-col gap-3 overflow-y-auto">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">Ügy kontextus</span>
                    <div className="space-y-2 text-xs">
                      <div>
                        <span className="text-[10px] text-neutral-400">Ügyfél:</span>
                        <div className="font-medium text-neutral-900">Alpha Holding Zrt.</div>
                      </div>
                      <div>
                        <span className="text-[10px] text-neutral-400">Felelős ügyvéd:</span>
                        <div className="font-medium text-neutral-900">Dr. Kovács András</div>
                      </div>
                      <div>
                        <span className="text-[10px] text-neutral-400">Iktatószám:</span>
                        <div className="font-mono text-[11px] text-neutral-900">IKT-2026/892</div>
                      </div>
                      <div>
                        <span className="text-[10px] text-neutral-400">Megfelelőségi státusz:</span>
                        <div className="mt-0.5"><AdminStatusPill tone="green">Ellenőrizve</AdminStatusPill></div>
                      </div>
                    </div>
                    <div className="border-t border-[var(--adm-border-canonical)] pt-3">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">Gyorsműveletek</span>
                      <div className="mt-2 flex flex-col gap-1.5">
                        <QuietLink href="#patterns" size="sm">Időnapló megnyitása</QuietLink>
                        <QuietLink href="#patterns" size="sm">Záradéktár tallózása</QuietLink>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Pattern 2: Worklist + Detail Drawer/Panel */}
            {showSection("worklist-detail") && (
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#0F3D32]">
                  2. Minta: Feladatlista (Worklist) + Részletpanel Elrendezés
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 rounded-[8px] border border-[var(--adm-border-canonical)] bg-white p-4">
                  <div className="md:col-span-7 space-y-2">
                    <div className="flex items-center justify-between pb-2 border-b border-[var(--adm-border-canonical)]">
                      <span className="text-xs font-semibold">Teendők listája (3)</span>
                      <span className="text-[11px] text-neutral-500">Rendezés határidő szerint</span>
                    </div>
                    <div className="space-y-2">
                      <div className="p-3 rounded border border-[#0F3D32] bg-emerald-50/20 cursor-pointer">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-[#0F3D32]">Végleges szerkesztés áttekintése</span>
                          <AdminStatusPill tone="burgundy">Sürgős</AdminStatusPill>
                        </div>
                        <p className="mt-1 text-[11px] text-neutral-600">Határidő: Ma, 17:00 • Felelős: Dr. Szabó Péter</p>
                      </div>
                      <div className="p-3 rounded border border-[var(--adm-border-canonical)] hover:bg-neutral-50 cursor-pointer">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-neutral-800">Cégkivonat csatolása</span>
                          <AdminStatusPill tone="gold">Folyamatban</AdminStatusPill>
                        </div>
                        <p className="mt-1 text-[11px] text-neutral-600">Határidő: Holnap • Felelős: Kovács Éva</p>
                      </div>
                    </div>
                  </div>

                  <div className="md:col-span-5 border-l border-[var(--adm-border-canonical)] pl-4 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between border-b border-[var(--adm-border-canonical)] pb-2">
                        <span className="text-xs font-semibold text-[#0F3D32]">Részletek</span>
                        <QuietLink href="#patterns" size="sm">Bezárás</QuietLink>
                      </div>
                      <div className="mt-3 space-y-2 text-xs">
                        <p className="font-semibold text-neutral-900">Végleges szerkesztés áttekintése</p>
                        <p className="text-neutral-600">
                          A vevői jogi képviselő által visszaküldött módosítások tételes egyeztetése szükséges a záró aláírás előtt.
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 pt-3 border-t border-[var(--adm-border-canonical)] flex justify-end gap-2">
                      <AdminButton size="sm" variant="neutral">Átütemezés</AdminButton>
                      <AdminButton size="sm" variant="primary">Készre jelentés</AdminButton>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Pattern 3 & 4: Header + Summary Strip + Table & Selected-Text Action */}
            {showSection("patterns") && (
              <div className="space-y-6">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[#0F3D32] mb-3">
                    3. Minta: Fejléc + Összegző Sáv (Summary Strip) + Táblázat
                  </h4>
                  <AdminPanel className="p-4 space-y-4">
                    <OperationalPageHeader
                      title="Compliance Áttekintő Központ"
                      subtitle="Vállalati megfelelőségi ellenőrzőpontok és jogi forrásigazolások."
                      level="h2"
                      primaryAction={<AdminButton variant="primary">Audit futtatása</AdminButton>}
                    />
                    {/* Summary Metric Strip */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 py-2">
                      <div className="rounded border border-[var(--adm-border-canonical)] p-3 bg-[var(--adm-canvas-subtle)]">
                        <span className="text-[10px] uppercase font-bold text-neutral-500">Összes Kontroll</span>
                        <div className="text-lg font-bold text-[#0F3D32]">24</div>
                      </div>
                      <div className="rounded border border-emerald-200 p-3 bg-emerald-50/40">
                        <span className="text-[10px] uppercase font-bold text-emerald-800">Megfelelő</span>
                        <div className="text-lg font-bold text-emerald-900">19</div>
                      </div>
                      <div className="rounded border border-amber-200 p-3 bg-amber-50/40">
                        <span className="text-[10px] uppercase font-bold text-amber-800">Teendő szükséges</span>
                        <div className="text-lg font-bold text-amber-900">4</div>
                      </div>
                      <div className="rounded border border-red-200 p-3 bg-red-50/40">
                        <span className="text-[10px] uppercase font-bold text-red-800">Kritikus hiány</span>
                        <div className="text-lg font-bold text-red-900">1</div>
                      </div>
                    </div>
                    {/* Clean Table */}
                    <DataTable>
                      <DataTableHead>
                        <DataTableRow>
                          <DataTableHeaderCell>Kontroll Kód</DataTableHeaderCell>
                          <DataTableHeaderCell>Megfelelőségi Tétel</DataTableHeaderCell>
                          <DataTableHeaderCell>Eredmény</DataTableHeaderCell>
                          <DataTableHeaderCell>Utolsó igazolás</DataTableHeaderCell>
                        </DataTableRow>
                      </DataTableHead>
                      <DataTableBody>
                        <DataTableRow>
                          <DataTableCell className="font-mono text-xs">C-01</DataTableCell>
                          <DataTableCell>GDPR Adatfeldolgozói Nyilvántartás</DataTableCell>
                          <DataTableCell><AdminStatusPill tone="green">Megfelelő</AdminStatusPill></DataTableCell>
                          <DataTableCell muted>2026.09.10</DataTableCell>
                        </DataTableRow>
                        <DataTableRow>
                          <DataTableCell className="font-mono text-xs">C-02</DataTableCell>
                          <DataTableCell>Tényleges Tulajdonosi Nyilatkozat (UBO)</DataTableCell>
                          <DataTableCell><AdminStatusPill tone="green">Megfelelő</AdminStatusPill></DataTableCell>
                          <DataTableCell muted>2026.09.12</DataTableCell>
                        </DataTableRow>
                      </DataTableBody>
                    </DataTable>
                  </AdminPanel>
                </div>

                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[#0F3D32] mb-3">
                    4. Minta: Kijelölt Szöveg Kontextuális Művelet (Selected-Text Contextual Action)
                  </h4>
                  <AdminPanel className="p-4 space-y-3">
                    <p className="text-xs text-[var(--adm-text-secondary)]">
                      Szerződés-szöveg olvasása közben a kijelölt szakaszhoz azonnali kontextuális műveletek társíthatók (AI anonimizálás, záradéktárba mentés vagy megjegyzés fűzése):
                    </p>
                    <div className="p-3 bg-neutral-50 rounded border border-[var(--adm-border-canonical)] text-xs">
                      &bdquo;{selectedText}&rdquo;
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <AdminButton size="sm" variant="ai">AI Anonimizálás indítása</AdminButton>
                      <AdminButton size="sm" variant="neutral">Mentés Záradékként</AdminButton>
                      <AdminButton size="sm" variant="ghost">Megjegyzés fűzése</AdminButton>
                    </div>
                  </AdminPanel>
                </div>
              </div>
            )}
          </section>
        )}
      </main>

      {/* Showroom Footer */}
      <footer className="border-t border-[var(--adm-border-canonical)] bg-white py-6 text-center text-xs text-neutral-500">
        Adminiculum Coded Design System Foundation • Version 1.0 • Fail-closed in Production
      </footer>
    </div>
  );
}

export default function ShowroomPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-xs text-neutral-500">Showroom betöltése...</div>}>
      <ShowroomInner />
    </Suspense>
  );
}
