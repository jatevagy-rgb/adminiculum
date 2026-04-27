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
    "clause-library": "Clause Library",
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

  return (
    <div
      data-ui-pack={uiPack}
      className={`min-h-screen flex app-shell ${isSignalOps ? "bg-[#0B1220] text-[#D6E2F2] ui-pack-signal-ops" : "bg-[#F5F7FB] text-[#1E293B] ui-pack-insight-analytics"}`}
    >
        <Sidebar
          activeItem={section}
          profileName={profileName}
          profileRole={userProfile?.role ?? "Admin"}
          uiPack={uiPack}
        />

      <div className="flex-1 flex flex-col app-shell-content">
        <TopBar
          title={titleBySection[section] || "Műszerfal"}
          onSignOut={onSignOut}
          profileName={profileName}
          uiPack={uiPack}
        />

        <main className={`flex-1 overflow-y-auto p-6 app-shell-main ${isSignalOps ? "bg-[#0B1220]" : "bg-[#F5F7FB]"}`}>
          {children ? (
            children
          ) : shouldRenderCasesDefault ? (
            <CasesList />
          ) : shouldRenderDashboardDefault ? (
            <div className="grid lg:grid-cols-[minmax(0,1fr)_320px] gap-6">
              <Dashboard />
              <RightPanel />
            </div>
          ) : (
            <div className="text-xs text-[#7B776D]">Nincs elérhető tartalom ebben a szekcióban.</div>
          )}
        </main>

        <footer className={`app-shell-footer border-t px-6 py-4 flex flex-wrap items-center justify-between gap-3 ${isSignalOps ? "border-[#1E293B] bg-[#0F172A]" : "border-[#E2E8F0] bg-white"}`}>
          <p className={`text-xs ${isSignalOps ? "text-[#94A3B8]" : "text-[#64748B]"}`} style={{ fontFamily: 'var(--font-newsreader)' }}>
            Adminiculum · Jogi műveleti munkafelület
          </p>
          <div className={`flex items-center gap-5 text-[10px] uppercase tracking-[0.28em] ${isSignalOps ? "text-[#64748B]" : "text-[#94A3B8]"}`}>
            <span>System v2</span>
            <span>Hungary Region</span>
            <span>{new Date().getFullYear()}</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
