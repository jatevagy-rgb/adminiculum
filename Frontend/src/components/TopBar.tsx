"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { UiPackId } from "@/lib/uiPack";
import { getUnreadNotificationsCount } from "@/lib/api";

type TopBarProps = {
  title: string;
  onSignOut: () => void;
  profileName: string;
  uiPack?: UiPackId;
};

export function TopBar({ title, onSignOut, profileName, uiPack = "legal_ops_atelier" }: TopBarProps) {
  const isSignal = uiPack === "signal_tiles_console";
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  useEffect(() => {
    let mounted = true;
    const loadUnread = async () => {
      try {
        const result = await getUnreadNotificationsCount();
        if (mounted) {
          setUnreadNotifications(result.unreadCount);
        }
      } catch {
        // ignore notification badge failures in topbar
      }
    };
    void loadUnread();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <header className={`${isSignal ? "bg-[#0F172A] border-[#1F2937]" : "bg-white border-[rgba(22,32,26,0.10)]"} border-b px-5 py-3`}>
      <div className="flex flex-wrap items-center gap-4">
        <div>
          <p className={`text-[10px] uppercase tracking-[0.16em] ${isSignal ? "text-[#94A3B8]" : "text-[#7A8479]"}`}>Adminiculum</p>
          <h1 className={`font-serif text-[20px] leading-tight ${isSignal ? "text-[#E5E7EB]" : "text-[#16201A]"}`}>{title}</h1>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Link href="/search" className={`hidden h-9 min-w-[230px] items-center gap-2 border px-3 text-[12px] md:flex ${isSignal ? "border-[#334155] bg-[#111827] text-[#CBD5E1] hover:bg-[#1F2937]" : "border-[#D8CDB6] bg-[#F7F0D9] text-[#7A8479] hover:bg-[#FBF6E7]"}`} title="Keresés">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-5-5m0-6a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <span>Ügy, ügyfél, irat keresése</span>
          </Link>
          <Link
            href="/notifications"
            className={`relative h-9 w-9 border grid place-items-center ${isSignal ? "border-[#334155] bg-[#111827] text-[#CBD5E1]" : "border-[#D8CDB6] bg-white text-[#3D4842]"}`}
            title="Értesítések"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2a2 2 0 01-.6 1.4L4 17h5m6 0a3 3 0 11-6 0h6z" />
            </svg>
            {unreadNotifications > 0 ? (
              <span className={`absolute -right-1 -top-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${isSignal ? "bg-[#22D3EE] text-[#0B1220]" : "bg-[#B58A2A] text-[#173824]"}`}>
                {unreadNotifications > 99 ? "99+" : unreadNotifications}
              </span>
            ) : null}
          </Link>
          <div className={`h-9 px-3 border flex items-center gap-2 ${isSignal ? "border-[#334155] bg-[#111827]" : "border-[#D8CDB6] bg-white"}`}>
            <span className={`w-6 h-6 rounded-full text-[10px] grid place-items-center ${isSignal ? "bg-[#22D3EE] text-[#0B1220]" : "bg-[#1F4A33] text-[#F4EFDB]"}`}>A</span>
            <span className={`max-w-[160px] truncate text-[10px] uppercase tracking-[0.16em] ${isSignal ? "text-[#CBD5E1]" : "text-[#3D4842]"}`}>{profileName}</span>
          </div>
          <button onClick={onSignOut} className={`h-9 px-3 border text-[10px] uppercase tracking-[0.16em] ${isSignal ? "border-[#334155] bg-[#111827] text-[#CBD5E1] hover:text-[#67E8F9]" : "border-[#D8CDB6] bg-white text-[#3D4842] hover:text-[#8E6A1B]"}`}>
            Kilépés
          </button>
        </div>
      </div>
    </header>
  );
}
