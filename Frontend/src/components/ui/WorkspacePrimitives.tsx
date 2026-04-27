"use client";

import type { ReactNode } from "react";
import type { UiPackId } from "@/lib/uiPack";

type WorkspaceLayoutProps = {
  uiPack: UiPackId;
  left?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function WorkspaceLayout({ uiPack, left, right, children, className = "", "data-surface": dataSurface }: WorkspaceLayoutProps & { "data-surface"?: string }) {
  const isSignal = uiPack === "signal_tiles_console";
  return (
    <div data-surface={dataSurface} className={`flex min-h-0 flex-1 ${isSignal ? "bg-[#0B1220]" : "bg-[#F5F7FB]"} ${className}`}>
      {left ? <aside className={`w-64 shrink-0 border-r ${isSignal ? "border-[#1E293B] bg-[#0F172A]" : "border-[#E2E8F0] bg-white"}`}>{left}</aside> : null}
      <main className="min-w-0 flex-1">{children}</main>
      {right ? <aside className={`w-80 shrink-0 border-l ${isSignal ? "border-[#1E293B] bg-[#0F172A]" : "border-[#E2E8F0] bg-white"}`}>{right}</aside> : null}
    </div>
  );
}

type PanelProps = {
  uiPack: UiPackId;
  children: ReactNode;
  className?: string;
};

export function Panel({ uiPack, children, className = "" }: PanelProps) {
  const isSignal = uiPack === "signal_tiles_console";
  return (
    <section
      className={`border ${
        isSignal
          ? "border-[#1E293B] bg-[#111C2E] text-[#D6E2F2]"
          : "border-[#E2E8F0] bg-white text-[#1E293B] shadow-sm"
      } ${className}`}
    >
      {children}
    </section>
  );
}

type CardProps = {
  uiPack: UiPackId;
  children: ReactNode;
  className?: string;
  emphasis?: "primary" | "secondary";
};

export function Card({ uiPack, children, className = "", emphasis = "secondary" }: CardProps) {
  const isSignal = uiPack === "signal_tiles_console";
  const base = isSignal
    ? emphasis === "primary"
      ? "bg-[#16253D] border-[#243B63]"
      : "bg-[#0F172A] border-[#1E293B]"
    : emphasis === "primary"
      ? "bg-white border-[#CBD5E1] shadow"
      : "bg-[#F8FAFC] border-[#E2E8F0]";

  return <article className={`border rounded-xl p-4 ${base} ${className}`}>{children}</article>;
}

type SectionBlockProps = {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function SectionBlock({ title, subtitle, actions, children, className = "", uiPack: _uiPack }: SectionBlockProps & { uiPack?: string }) {
  const isSignal = _uiPack === "signal_tiles_console";
  return (
    <section className={`space-y-3 ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className={`text-sm font-semibold tracking-wide ${isSignal ? "text-slate-300" : "text-slate-600"}`}>{title}</h2>
          {subtitle ? <p className={`text-xs opacity-70 mt-1 ${isSignal ? "text-slate-500" : "text-slate-400"}`}>{subtitle}</p> : null}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

