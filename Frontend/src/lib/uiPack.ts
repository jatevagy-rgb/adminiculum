"use client";

import { useCallback, useEffect, useState } from "react";

export const UI_PACKS = [
  {
    id: "legal_ops_atelier",
    label: "Adminiculum default",
    description: "Design bible alapirány: cream felület, dark legal green navigáció, muted gold kiemelések.",
  },
  {
    id: "signal_tiles_console",
    label: "Signal Tiles Console",
    description: "Kísérleti sötét műveleti nézet. Nem a fő production design.",
  },
] as const;

export type UiPackId = (typeof UI_PACKS)[number]["id"];

const UI_PACK_STORAGE_KEY = "adminiculum_ui_pack";
const UI_PACK_CHANGE_EVENT = "adminiculum:ui-pack-changed";
const DEFAULT_UI_PACK: UiPackId = "legal_ops_atelier";

const LEGACY_PACK_MAP: Record<string, UiPackId> = {
  legal_ops_atelier: "legal_ops_atelier",
  signal_tiles_console: "signal_tiles_console",
};

export function isUiPackId(value: string | null | undefined): value is UiPackId {
  return UI_PACKS.some((pack) => pack.id === value);
}

export function loadUiPack(): UiPackId {
  if (typeof window === "undefined") {
    return DEFAULT_UI_PACK;
  }

  const stored = window.localStorage.getItem(UI_PACK_STORAGE_KEY);
  if (isUiPackId(stored)) {
    return stored;
  }

  const migrated = stored ? LEGACY_PACK_MAP[stored] : undefined;
  return migrated || DEFAULT_UI_PACK;
}

export function saveUiPack(pack: UiPackId): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(UI_PACK_STORAGE_KEY, pack);
  window.dispatchEvent(new CustomEvent(UI_PACK_CHANGE_EVENT, { detail: { pack } }));
}

export function useUiPack(): [UiPackId, (next: UiPackId) => void] {
  const [uiPack, setUiPackState] = useState<UiPackId>(DEFAULT_UI_PACK);

  useEffect(() => {
    setUiPackState(loadUiPack());

    const syncFromStorage = () => setUiPackState(loadUiPack());

    window.addEventListener("storage", syncFromStorage);
    window.addEventListener(UI_PACK_CHANGE_EVENT, syncFromStorage as EventListener);

    return () => {
      window.removeEventListener("storage", syncFromStorage);
      window.removeEventListener(UI_PACK_CHANGE_EVENT, syncFromStorage as EventListener);
    };
  }, []);

  const setUiPack = useCallback((next: UiPackId) => {
    saveUiPack(next);
    setUiPackState(next);
  }, []);

  return [uiPack, setUiPack];
}

