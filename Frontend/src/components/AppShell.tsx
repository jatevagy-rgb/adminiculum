"use client";

import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { Dashboard } from "./Dashboard";
import { RightPanel } from "./RightPanel";
import { CasesList } from "./CasesList";
import { useUiPack } from "@/lib/uiPack";

type AppShellProps = {
  onSignOut: () => void;
  section?:
    | "dashboard"
    | "cases"
    | "clause-library"
    | "case-detail"
    | "generation"
    | "tasks"
    | "notifications"
    | "reviews"
    | "clients"
    | "documents-compare"
    | "time-entries"
    | "timesheet-presets"
    | "calendar"
    | "search";
  userProfile?: {
    id: string;
    email: string;
    name: string;
    role: string;
  } | null;
  children?: React.ReactNode;
};

export function AppShell({ onSignOut, userProfile, section = "dashboard", children }: AppShellProps) {
  const [uiPack] = useUiPack();
  const isSignalOps = uiPack === "signal_tiles_console";
  const profileName = userProfile?.name ?? "Ügyvéd";
  const titleBySection: Record<string, string> = {
    dashboard: "Műszerfal",
    cases: "Aktív ügyek",
    "clause-library": "Záradék könyvtár",
    "case-detail": "Ügy részletei",
    generation: "Dokumentum generálás",
    tasks: "Feladatok",
    notifications: "Értesítések",
    reviews: "Review sor",
    clients: "Ügyfelek",
    "documents-compare": "Dokumentum összevetés",
    "time-entries": "Munkaórák",
    "timesheet-presets": "Presetek",
    calendar: "Határidők és naptár",
    search: "Keresés",
  };

  const shouldRenderCasesDefault = section === "cases" && !children;
  const shouldRenderDashboardDefault = section === "dashboard" && !children;
  const shellBody = children ? (
    children
  ) : shouldRenderCasesDefault ? (
    <CasesList />
  ) : shouldRenderDashboardDefault ? (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <Dashboard />
      <RightPanel />
    </div>
  ) : (
    <div className="text-xs text-[#7B776D]">Nincs elérhető tartalom ebben a szekcióban.</div>
  );
  const shouldFrameBody = !children && !isSignalOps;

  return (
    <div
      data-ui-pack={uiPack}
      className={`min-h-screen flex app-shell ${isSignalOps ? "bg-[#0B1220] text-[#D6E2F2] ui-pack-signal-ops" : "bg-[#D5CBA8] text-[#16201A] ui-pack-insight-analytics"}`}
    >
        <Sidebar
          activeItem={section}
          profileName={profileName}
          profileRole={userProfile?.role ?? "Admin"}
          uiPack={uiPack}
        />

      <div className={`min-w-0 flex-1 flex flex-col app-shell-content ${isSignalOps ? "" : "bg-[#EFE7CF]"}`}>
        <TopBar
          title={titleBySection[section] || "Műszerfal"}
          onSignOut={onSignOut}
          profileName={profileName}
          uiPack={uiPack}
        />

        <main className={`flex-1 overflow-y-auto app-shell-main ${isSignalOps ? "bg-[#0B1220] p-6" : "bg-[#EFE7CF] p-4"}`}>
          <div className={`${shouldFrameBody ? "mx-auto max-w-[1480px] border border-[rgba(22,32,26,0.10)] bg-white p-5 shadow-[0_12px_32px_rgba(22,32,26,0.08)]" : "h-full min-h-0"}`}>
            {shellBody}
          </div>
        </main>

        <footer className={`app-shell-footer border-t px-5 py-2 flex items-center justify-between gap-3 ${isSignalOps ? "border-[#1E293B] bg-[#0F172A]" : "border-[#D5CBA8] bg-[#F7F0D9]"}`}>
          <p className={`text-xs ${isSignalOps ? "text-[#94A3B8]" : "text-[#6E7872]"}`} style={{ fontFamily: 'var(--font-newsreader)' }}>
            Adminiculum · Jogi munkapad
          </p>
          <div className={`text-[10px] uppercase tracking-[0.2em] ${isSignalOps ? "text-[#64748B]" : "text-[#8B8477]"}`}>
            {new Date().getFullYear()}
          </div>
        </footer>
      </div>
    </div>
  );
}
