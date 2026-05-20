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
    bg: isSignalTiles ? "bg-[#0C1222]" : "bg-[#F6F2E8]",
    bgAlt: isSignalTiles ? "bg-[#111827]" : "bg-[#F0EBE0]",
    bgHover: isSignalTiles ? "hover:bg-[#1a2744]" : "hover:bg-[#EAE3D5]",
    bgCard: isSignalTiles ? "bg-[#0F1923]" : "bg-white",
    bgSection: isSignalTiles ? "bg-[#0A1020]" : "bg-[#FAF8F2]",
    text: isSignalTiles ? "text-[#CBD5E1]" : "text-[#514D45]",
    textMuted: isSignalTiles ? "text-[#94A3B8]" : "text-[#7B776D]",
    textDark: isSignalTiles ? "text-[#F1F5F9]" : "text-[#1F2821]",
    border: isSignalTiles ? "border-[#1E3A5F]" : "border-[#DDD7CA]",
    borderLight: isSignalTiles ? "border-[#1E3A5F]" : "border-[#E8E2D6]",
    badge: isSignalTiles ? "bg-[#1E3A5F] text-[#67E8F9]" : "bg-[#E8E2D6] text-[#7B776D]",
    accent: isSignalTiles ? "text-cyan-400" : "text-[#8B7355]",
    accentBg: isSignalTiles ? "bg-cyan-400/10" : "bg-[#F6F2E8]",
    success: isSignalTiles ? "text-emerald-400" : "text-emerald-700",
    warning: isSignalTiles ? "text-amber-400" : "text-amber-700",
    danger: isSignalTiles ? "text-red-400" : "text-red-700",
  };
  const [reviewTaskSuggestions] = useState<boolean>(getPreference("reviewTaskSuggestions"));
  
  return (
    <div className={`flex-1 overflow-y-auto settings-surface ${p.bg}`}>
      <div className="max-w-4xl mx-auto p-8">
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
          <section className={`${p.bgCard} border ${p.border} rounded p-6`}>
            <h2 className={`text-lg font-semibold ${p.textDark} mb-3`}>Profil</h2>
            <div className="grid md:grid-cols-3 gap-3 text-xs">
              <div className={`border ${p.borderLight} p-3`}>
                <p className={p.textMuted}>Név</p>
                <p className={`mt-1 font-medium ${p.textDark}`}>Későbbi patchben</p>
              </div>
              <div className={`border ${p.borderLight} p-3`}>
                <p className={p.textMuted}>Email</p>
                <p className={`mt-1 font-medium ${p.textDark}`}>Későbbi patchben</p>
              </div>
              <div className={`border ${p.borderLight} p-3`}>
                <p className={p.textMuted}>Szerepkör</p>
                <p className={`mt-1 font-medium ${p.textDark}`}>Későbbi patchben</p>
              </div>
            </div>
            <p className={`text-xs ${p.textMuted} mt-3`}>A felhasználói adatok kezelése későbbi patchben.</p>
          </section>

          <section className={`${p.bgCard} border ${p.border} rounded p-6`}>
            <div className="flex items-center justify-between gap-2 mb-3">
              <h2 className={`text-lg font-semibold ${p.textDark}`}>Megjelenés</h2>
              <span className={`text-[10px] px-2 py-1 ${p.bgAlt} ${p.textMuted}`}>UI pack</span>
            </div>
            <p className={`text-xs ${p.textMuted} mb-4`}>
              A kiválasztás böngésző-local beállításként tárolódik, és nem szinkronizálódik fiókszinten.
            </p>
            <p className={`text-xs ${p.textMuted} mb-4`}>
              UI pack váltás későbbi patchben.
            </p>
            <div className="space-y-3">
              {UI_PACKS.filter((pack) => pack.id === "legal_ops_atelier" || pack.id === "signal_tiles_console").map((pack) => {
                const selected = pack.id === uiPack;
                return (
                  <button
                    key={pack.id}
                    type="button"
                    onClick={() => setUiPack(pack.id)}
                    className={`settings-ui-pack-option w-full text-left border rounded-lg p-4 transition-all ${
                      selected
                        ? `${p.accent} border-cyan-400/50 ${p.accentBg} shadow-sm`
                        : `${p.border} ${p.bgCard} ${p.bgHover}`
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <p className={`text-sm font-semibold ${p.textDark}`}>
                            {pack.id === "legal_ops_atelier" ? "Adminiculum default" : "Signal Tiles Console"}
                          </p>
                          {selected && (
                            <span className={`text-[9px] uppercase tracking-[0.2em] px-2 py-0.5 rounded-full ${p.badge}`}>
                              Aktív
                            </span>
                          )}
                        </div>
                        <p className={`text-[11px] ${p.textMuted}`}>{pack.description}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <section className={`${p.bgCard} border ${p.border} rounded p-6`}>
            <h2 className={`text-lg font-semibold ${p.textDark} mb-2`}>Ügyfélprofil / house style alapértelmezések</h2>
            <p className={`text-xs ${p.textMuted} mb-4`}>
              Az ügyfél-specifikus house style profilok az Ügyfelek oldalon kezelhetők.
            </p>
            <Link href="/clients" className="inline-block px-3 py-2 text-xs border border-[#C9A227] text-[#8B6B3A] bg-[#FBF9F3] hover:bg-[#f5ecd8]">
              Ügyfelek megnyitása
            </Link>
          </section>

          <section className={`${p.bgCard} border ${p.border} rounded p-6`}>
            <h2 className={`text-lg font-semibold ${p.textDark} mb-2`}>Integrációk</h2>
            <div className="grid md:grid-cols-2 gap-3 text-xs">
              <div className={`border ${p.borderLight} p-3`}>
                <p className={`font-medium ${p.textDark}`}>SharePoint</p>
                <p className={`mt-1 ${p.textMuted}`}>Kapcsolati státusz megjelenítése későbbi patchben.</p>
              </div>
              <div className={`border ${p.borderLight} p-3`}>
                <p className={`font-medium ${p.textDark}`}>Microsoft/Azure bejelentkezés</p>
                <p className={`mt-1 ${p.textMuted}`}>Kapcsolati státusz megjelenítése későbbi patchben.</p>
              </div>
            </div>
          </section>

          <section className={`${p.bgCard} border ${p.border} rounded p-6`}>
            <h2 className={`text-lg font-semibold ${p.textDark} mb-2`}>Adatkezelés / biztonság</h2>
            <p className={`text-xs ${p.textMuted} mb-2`}>
              Külső AI promptok másolhatók, de Adminiculum nem hív automatikusan külső AI-t.
            </p>
            <p className={`text-xs ${p.textMuted} mb-4`}>
              Review feladatjavaslatok helyi állapota: {reviewTaskSuggestions ? "engedélyezve" : "kikapcsolva"}.
            </p>
            <button type="button" disabled className={`px-3 py-2 text-xs border ${p.border} ${p.textMuted} ${p.bgSection}`}>
              Mentés későbbi patchben
            </button>
          </section>

          <section className={`${p.bgSection} border ${p.border} rounded p-4`}>
            <h3 className={`text-xs font-semibold ${p.textDark} mb-2`}>Kapcsolódó felületek</h3>
            <div className="flex flex-wrap gap-2">
              <Link href="/reviews" className="px-3 py-2 text-xs border border-[#DDD7CA] hover:bg-[#FBF9F3]">Review sor megnyitása</Link>
              <Link href="/clause-library" className="px-3 py-2 text-xs border border-[#DDD7CA] hover:bg-[#FBF9F3]">Záradék könyvtár</Link>
              <Link href="/clients" className="px-3 py-2 text-xs border border-[#DDD7CA] hover:bg-[#FBF9F3]">Ügyfelek megnyitása</Link>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
