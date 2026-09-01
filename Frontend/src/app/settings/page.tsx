"use client";

import { useState } from "react";
import Link from "next/link";
import { AuthenticatedApp } from "@/components/AuthenticatedApp";
import { getPreference } from "@/lib/preferences";
import { UI_PACKS, useUiPack } from "@/lib/uiPack";

/**
 * Settings Page — Browser-Local UI and Workflow Preferences
 * 
 * Controls: workflow assistance toggle, UI pack selector.
 * Storage: localStorage only (per-browser, no account sync).
 * Scope: does NOT affect case data, documents, permissions, or authentication.
 */
export default function SettingsPage() {
  return (
    <AuthenticatedApp>
      <SettingsPageContent />
    </AuthenticatedApp>
  );
}

function SettingsPageContent() {
  const [uiPack, setUiPack] = useUiPack();
  const isSignalTiles = uiPack === "signal_tiles_console";
  const p = {
    bg: isSignalTiles ? "bg-[#0C1222]" : "bg-[var(--adm-ivory-100)]",
    bgAlt: isSignalTiles ? "bg-[#111827]" : "bg-[var(--adm-ivory-100)]",
    bgHover: isSignalTiles ? "hover:bg-[#1a2744]" : "hover:bg-[var(--adm-ivory-200)]",
    bgCard: isSignalTiles ? "bg-[#0F1923]" : "bg-white",
    bgSection: isSignalTiles ? "bg-[#0A1020]" : "bg-[var(--adm-surface)]",
    text: isSignalTiles ? "text-[#CBD5E1]" : "text-[var(--adm-text-muted)]",
    textMuted: isSignalTiles ? "text-[#94A3B8]" : "text-[var(--adm-text-muted)]",
    textDark: isSignalTiles ? "text-[#F1F5F9]" : "text-[var(--adm-text)]",
    border: isSignalTiles ? "border-[#1E3A5F]" : "border-[var(--adm-border)]",
    borderLight: isSignalTiles ? "border-[#1E3A5F]" : "border-[var(--adm-border)]",
    badge: isSignalTiles ? "bg-[#1E3A5F] text-[#D8C58E]" : "bg-[var(--adm-ivory-200)] text-[var(--adm-text-muted)]",
    accent: isSignalTiles ? "text-[#D8C58E]" : "text-[#8B7355]",
    accentBg: isSignalTiles ? "bg-[#1E3A5F]/40" : "bg-[var(--adm-ivory-100)]",
    success: isSignalTiles ? "text-emerald-400" : "text-emerald-700",
    warning: isSignalTiles ? "text-amber-400" : "text-amber-700",
    danger: isSignalTiles ? "text-red-400" : "text-red-700",
  };
  const [reviewTaskSuggestions] = useState<boolean>(getPreference("reviewTaskSuggestions"));
  
  return (
    <div className={`flex-1 overflow-y-auto settings-surface adm-board-page`}>
      <div className="adm-board-container grid max-w-[1280px] gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className={`${p.bgCard} border ${p.border} rounded-[var(--adm-radius-lg)] p-4 lg:sticky lg:top-6 lg:self-start`}>
          <p className={`text-[10px] font-bold uppercase tracking-[0.18em] ${p.textMuted}`}>Beállítások navigáció</p>
          <nav className="mt-4 space-y-2 text-xs">
            {[
              ["#appearance", "Megjelenés"],
              ["#house-style", "House style"],
              ["#security", "Adatkezelés"],
            ].map(([href, label]) => (
              <a key={href} href={href} className={`block rounded border ${p.borderLight} ${p.bgSection} px-3 py-2 ${p.text} hover:border-[var(--adm-ochre-500)]`}>
                {label}
              </a>
            ))}
            <Link href="/settings/workflows" data-testid="settings-workflows-link" className={`block rounded border ${p.borderLight} ${p.bgSection} px-3 py-2 ${p.text} hover:border-[var(--adm-ochre-500)]`}>
              Munkafolyamatok
            </Link>
            <Link href="/settings/work-packages" data-testid="settings-work-packages-link" className={`block rounded border ${p.borderLight} ${p.bgSection} px-3 py-2 ${p.text} hover:border-[var(--adm-ochre-500)]`}>
              Ügytípusok és munkacsomagok
            </Link>
          </nav>
          <div className={`mt-4 rounded border ${p.borderLight} ${p.bgSection} p-3`}>
            <p className={`text-[11px] font-semibold ${p.textDark}`}>Aktív UI pack</p>
            <p className={`mt-1 text-[11px] ${p.textMuted}`}>
              {uiPack === "legal_ops_atelier" ? "Adminiculum production design" : "Kísérleti, nem production default"}
            </p>
          </div>
        </aside>

        <main>
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <span className={`text-[9px] uppercase tracking-[0.35em] ${p.textMuted} px-2 py-1 ${p.bgAlt}`}>Beállítások</span>
          </div>
          <h1 className={`text-3xl font-serif ${p.textDark} leading-tight`}>
            Beállítások
          </h1>
          <p className={`text-sm ${p.textMuted} mt-3`}>
            Az itt végrehajtott módosítások csak a böngészőben tárolódnak. Nem befolyásolják az ügyeket, dokumentumokat vagy jogosultságokat.
          </p>
        </div>
        <div className="grid gap-6">
          <section id="appearance" className={`${p.bgCard} border ${p.border} rounded-[var(--adm-radius-lg)] p-5 scroll-mt-6`}>
            <div className="flex items-center justify-between gap-2 mb-3">
              <h2 className={`text-lg font-semibold ${p.textDark}`}>Megjelenés</h2>
              <span className={`text-[10px] px-2 py-1 ${p.bgAlt} ${p.textMuted}`}>UI pack</span>
            </div>
            <p className={`text-xs ${p.textMuted} mb-4`}>
              A UI pack böngésző-local megjelenési beállítás. Nem módosít ügyeket, dokumentumokat vagy jogosultságokat.
            </p>
            <p className={`text-xs ${p.textMuted} mb-4`}>
              Böngészőben mentve.
            </p>
            <div className="space-y-3">
              {UI_PACKS.filter((pack) => pack.id === "legal_ops_atelier" || pack.id === "signal_tiles_console").map((pack) => {
                const selected = pack.id === uiPack;
                const title = pack.id === "legal_ops_atelier" ? "Adminiculum default" : "Signal Tiles Console";
                const helper =
                  pack.id === "legal_ops_atelier"
                    ? "Design bible alapirány: cream felület, dark legal green navigáció, muted gold kiemelések."
                    : "Kísérleti sötét műveleti nézet. Nem a fő production design.";
                return (
                  <button
                    key={pack.id}
                    type="button"
                    onClick={() => setUiPack(pack.id)}
                    className={`settings-ui-pack-option w-full text-left border rounded-lg p-4 transition-all ${
                      selected
                        ? `${p.accent} border-[var(--adm-ochre-500)] ${p.accentBg} shadow-sm`
                        : `${p.border} ${p.bgCard} ${p.bgHover}`
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <p className={`text-sm font-semibold ${p.textDark}`}>
                            {title}
                          </p>
                          {selected && (
                            <span className={`text-[9px] uppercase tracking-[0.2em] px-2 py-0.5 rounded-full ${p.badge}`}>
                              Aktív
                            </span>
                          )}
                        </div>
                        <p className={`text-[11px] ${p.textMuted}`}>{helper}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="mt-4">
              <button
                type="button"
                onClick={() => setUiPack("legal_ops_atelier")}
                disabled={uiPack === "legal_ops_atelier"}
                className={`px-3 py-2 text-xs border ${p.border} ${p.textDark} ${p.bgSection} disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                Alapértelmezett visszaállítása
              </button>
            </div>
          </section>

          <section id="house-style" className={`${p.bgCard} border ${p.border} rounded-[var(--adm-radius-lg)] p-5 scroll-mt-6`}>
            <h2 className={`text-lg font-semibold ${p.textDark} mb-2`}>Ügyfélprofil / house style alapértelmezések</h2>
            <p className={`text-xs ${p.textMuted} mb-4`}>
              Az ügyfél-specifikus house style profilok az Ügyfelek oldalon kezelhetők. Ezek adják majd a külső promptok dokumentumstílus-, fejléc-, kétnyelvűségi és formázási kontextusát.
            </p>
            <Link href="/clients" className="inline-block px-3 py-2 text-xs border border-[var(--adm-ochre-500)] text-[#8B6B3A] bg-[var(--adm-surface)] hover:bg-[#f5ecd8]">
              Ügyfelek megnyitása
            </Link>
          </section>

          <section id="security" className={`${p.bgCard} border ${p.border} rounded-[var(--adm-radius-lg)] p-5 scroll-mt-6`}>
            <h2 className={`text-lg font-semibold ${p.textDark} mb-2`}>Adatkezelés / biztonság</h2>
            <p className={`text-xs ${p.textMuted} mb-2`}>
              Külső promptok másolhatók, de Adminiculum nem hív automatikusan külső eszközt.
            </p>
            <p className={`text-xs ${p.textMuted} mb-4`}>
              Review feladatjavaslatok helyi állapota: {reviewTaskSuggestions ? "engedélyezve" : "kikapcsolva"}.
            </p>
          </section>
        </div>
        </main>
      </div>
    </div>
  );
}
