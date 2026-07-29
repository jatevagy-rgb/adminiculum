"use client";

import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { DashboardFocused } from "./DashboardFocused";
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
    | "client-portal-admin"
    | "search";
  userProfile?: {
    id: string;
    email: string;
    name: string;
    role: string;
  } | null;
  children?: React.ReactNode;
  /**
   * Viewport-bound workbench mode (professional editor route). When true the
   * shell is fixed to the viewport height (h-dvh + overflow-hidden), <main>
   * stops being a scroll surface, the app footer yields to the route's own
   * status bar, and the route content owns its internal scroll regions.
   * All other routes keep the default page-scrolling shell.
   */
  fullViewport?: boolean;
};

export function AppShell({ onSignOut, userProfile, section = "dashboard", children, fullViewport = false }: AppShellProps) {
  const [uiPack] = useUiPack();
  const isSignalOps = uiPack === "signal_tiles_console";
  const profileName = userProfile?.name ?? "Ügyvéd";
  const titleBySection: Record<string, string> = {
    dashboard: "Belső munkapad",
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
    "client-portal-admin": "Ügyfélportál adminisztráció",
    search: "Keresés",
  };

  const shouldRenderCasesDefault = section === "cases" && !children;
  const shouldRenderDashboardDefault = section === "dashboard" && !children;
  const shellBody = children ? (
    children
  ) : shouldRenderCasesDefault ? (
    <CasesList />
  ) : shouldRenderDashboardDefault ? (
    <DashboardFocused />
  ) : (
    <div className="text-xs text-[#7B776D]">Nincs elérhető tartalom ebben a szekcióban.</div>
  );
  const shouldFrameBody = !children && !isSignalOps && section !== "dashboard";

  // Viewport-bound mode: the shell itself never grows beyond the viewport, so
  // the page/body cannot become the document scroll surface. Normal mode keeps
  // the historical page-scrolling behavior for every other route.
  const rootHeightClass = fullViewport ? "h-dvh min-h-0 overflow-hidden" : "min-h-screen";
  const mainScrollClass = fullViewport
    ? "flex-1 min-h-0 overflow-hidden app-shell-main p-0"
    : `flex-1 overflow-y-auto app-shell-main ${isSignalOps ? "bg-[#0B1220] p-6" : section === "dashboard" ? "adm-shell-bg p-0" : "adm-shell-bg p-4 lg:p-5"}`;

  return (
    <div
      data-ui-pack={uiPack}
      data-shell-viewport={fullViewport ? "fixed" : "page"}
      className={`${rootHeightClass} flex app-shell ${isSignalOps ? "bg-[#0B1220] text-[#D6E2F2] ui-pack-signal-ops" : "adm-shell-bg text-[var(--adm-text)] ui-pack-insight-analytics"}`}
    >
        <Sidebar
          activeItem={section}
          profileName={profileName}
          profileRole={userProfile?.role ?? "Admin"}
          uiPack={uiPack}
        />

      <div className={`min-w-0 flex-1 flex flex-col min-h-0 app-shell-content ${isSignalOps ? "" : "adm-shell-bg"}`}>
        <TopBar
          title={titleBySection[section] || "Műszerfal"}
          onSignOut={onSignOut}
          profileName={profileName}
          uiPack={uiPack}
        />

        <main className={mainScrollClass}>
          <div className={`${shouldFrameBody ? "adm-page-frame mx-auto max-w-[1480px] p-4 lg:p-5" : "h-full min-h-0"}`}>
            {shellBody}
          </div>
        </main>

        {!fullViewport ? (
          <footer className={`app-shell-footer border-t px-5 py-2 flex items-center justify-between gap-3 ${isSignalOps ? "border-[#1E293B] bg-[#0F172A]" : "border-[var(--adm-border)] bg-[rgba(255,253,247,0.72)]"}`}>
            <p className={`text-xs ${isSignalOps ? "text-[#94A3B8]" : "text-[var(--adm-text-muted)]"}`} style={{ fontFamily: 'var(--font-newsreader)' }}>
              Adminiculum · Jogi munkapad
            </p>
            <div className={`text-[10px] uppercase tracking-[0.2em] ${isSignalOps ? "text-[#64748B]" : "text-[var(--adm-text-soft)]"}`}>
              {new Date().getFullYear()}
            </div>
          </footer>
        ) : null}
      </div>
    </div>
  );
}
