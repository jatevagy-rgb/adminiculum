"use client";

import { useState, useEffect } from "react";
import { AuthenticatedApp } from "@/components/AuthenticatedApp";
import { loadPreferences, savePreferences, getPreference } from "@/lib/preferences";
import { UI_PACKS, useUiPack } from "@/lib/uiPack";

/**
 * Settings Page - Workflow Assistance Preferences
 * 
 * A small, truthful control for workflow assistance behaviors.
 * Stored locally in this browser only.
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
  const [preferences, setPreferences] = useState<{
    reviewTaskSuggestions: boolean;
  } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  
  // Load preferences on mount
  useEffect(() => {
    setPreferences({
      reviewTaskSuggestions: getPreference('reviewTaskSuggestions'),
    });
  }, []);
  
  // Handle toggle change
  const handleToggle = () => {
    if (!preferences) return;
    
    const newValue = !preferences.reviewTaskSuggestions;
    
    setPreferences({ reviewTaskSuggestions: newValue });
    setIsSaving(true);
    
    // Save to localStorage
    savePreferences({ reviewTaskSuggestions: newValue });
    
    // Brief visual feedback
    setTimeout(() => setIsSaving(false), 300);
  };
  
  if (!preferences) {
    return (
      <div className={`flex-1 flex items-center justify-center ${p.bg}`}>
        <div className={p.textMuted}>Loading...</div>
      </div>
    );
  }
  
  return (
    <div className={`flex-1 overflow-y-auto settings-surface ${p.bg}`}>
      <div className="max-w-xl mx-auto p-8">
        {/* Page Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <span className={`text-[9px] uppercase tracking-[0.35em] ${p.textMuted} px-2 py-1 ${p.bgAlt}`}>Settings</span>
          </div>
          <h1 className={`text-3xl font-serif ${p.textDark} leading-tight`}>
            Beállítások
          </h1>
          <p className={`text-sm ${p.textMuted} mt-3`}>
            Workflow assistance preferences for this browser.
          </p>
        </div>
        
        {/* Single Working Preference */}
        <section className={`${p.bgCard} border ${p.border} rounded p-6 mb-6`}>
          <div className="flex items-center gap-2 mb-4">
            <svg className={`w-5 h-5 ${p.textMuted}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <h2 className={`text-lg font-semibold ${p.textDark}`}>Workflow Assistance</h2>
          </div>
          
          {/* Toggle: Review Task Suggestions - THE ONLY REAL CONTROL */}
          <div className="flex items-start justify-between py-2">
            <div className="flex-1 pr-4">
              <h3 className={`text-sm font-medium ${p.textDark}`}>
                Review task suggestions
              </h3>
              <p className={`text-xs ${p.textMuted} mt-1`}>
                Show suggested follow-up tasks after document review decisions.
              </p>
            </div>
            <button
              onClick={handleToggle}
              className={`relative w-12 h-6 rounded-full transition-colors flex-shrink-0 ${
                preferences.reviewTaskSuggestions ? 'bg-emerald-500' : p.border
              }`}
              aria-pressed={preferences.reviewTaskSuggestions}
            >
              <span
                className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                  preferences.reviewTaskSuggestions ? 'left-7' : 'left-1'
                }`}
              />
            </button>
          </div>
        </section>

        <section className={`${p.bgCard} border ${p.border} rounded p-6 mb-6`}>
          <div className="flex items-center gap-2 mb-4">
            <h2 className={`text-lg font-semibold ${p.textDark}`}>UI Pack</h2>
          </div>
          <p className={`text-xs ${p.textMuted} mb-4`}>
            Select the visual system used by shared shell and supported surfaces.
          </p>
          <div className="space-y-2">
            {UI_PACKS.map((pack) => {
              const selected = pack.id === uiPack;
              return (
                <button
                  key={pack.id}
                  type="button"
                  onClick={() => setUiPack(pack.id)}
                  className={`settings-ui-pack-option w-full text-left border px-3 py-3 transition-colors ${
                    selected
                      ? `${p.accent} border-cyan-400/50 ${p.accentBg}`
                      : `${p.border} ${p.bgCard} ${p.bgHover}`
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className={`text-sm font-medium ${p.textDark}`}>{pack.label}</p>
                      <p className={`text-[11px] ${p.textMuted} mt-1`}>{pack.description}</p>
                    </div>
                    {selected && <span className={`text-[10px] uppercase tracking-[0.2em] ${p.accent}`}>Active</span>}
                  </div>
                </button>
              );
            })}
          </div>
        </section>
        
        {/* Storage Scope Note */}
        <div className={`${p.bgSection} border ${p.border} p-4`}>
          <p className={`text-xs ${p.textMuted}`}>
            <strong className={p.text}>Stored locally in this browser only.</strong> 
            {' '}These preferences are not synced to your account or other devices.
          </p>
        </div>
        
        {/* Save indicator */}
        {isSaving && (
          <p className="text-xs text-[#059669] mt-4 animate-pulse">
            ✓ Saved
          </p>
        )}
      </div>
    </div>
  );
}
