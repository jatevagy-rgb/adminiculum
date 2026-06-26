"use client";

import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { Dashboard } from "./Dashboard";
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
    | "litigation-workspace"
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
    notifications: "Kommunikáció",
    reviews: "Review sor",
    clients: "Ügyfelek",
    "documents-compare": "Dokumentum összevetés",
    "litigation-workspace": "Peres stratégiai térkép",
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
    <Dashboard />
  ) : (
    <div className="text-xs text-[#7B776D]">Nincs elérhető tartalom ebben a szekcióban.</div>
  );
  const shouldFrameBody = !children && !isSignalOps && section !== "dashboard";

  return (
    <div
      data-ui-pack={uiPack}
      className={`min-h-screen flex app-shell ${isSignalOps ? "bg-[#0B1220] text-[#D6E2F2] ui-pack-signal-ops" : "adm-shell-bg text-[var(--adm-text)] ui-pack-insight-analytics"}`}
    >
        <Sidebar
          activeItem={section}
          profileName={profileName}
          profileRole={userProfile?.role ?? "Admin"}
          uiPack={uiPack}
        />

      <div className={`min-w-0 flex-1 flex flex-col app-shell-content ${isSignalOps ? "" : "adm-shell-bg"}`}>
        <TopBar
          title={titleBySection[section] || "Műszerfal"}
          onSignOut={onSignOut}
          profileName={profileName}
          uiPack={uiPack}
        />

        <main className={`flex-1 overflow-y-auto app-shell-main ${isSignalOps ? "bg-[#0B1220] p-6" : section === "dashboard" ? "adm-shell-bg p-0" : "adm-shell-bg p-4 lg:p-5"}`}>
          <div className={`${shouldFrameBody ? "adm-page-frame mx-auto max-w-[1480px] p-4 lg:p-5" : "h-full min-h-0"}`}>
            {shellBody}
          </div>
        </main>

        <footer className={`app-shell-footer border-t px-5 py-2 flex items-center justify-between gap-3 ${isSignalOps ? "border-[#1E293B] bg-[#0F172A]" : "border-[var(--adm-border)] bg-[rgba(255,253,247,0.72)]"}`}>
          <p className={`text-xs ${isSignalOps ? "text-[#94A3B8]" : "text-[var(--adm-text-muted)]"}`} style={{ fontFamily: 'var(--font-newsreader)' }}>
            Adminiculum · Jogi munkapad
          </p>
          <div className={`text-[10px] uppercase tracking-[0.2em] ${isSignalOps ? "text-[#64748B]" : "text-[var(--adm-text-soft)]"}`}>
            {new Date().getFullYear()}
          </div>
        </footer>
      </div>
    </div>
  );
}
