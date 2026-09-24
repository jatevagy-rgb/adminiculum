"use client";

import Link from "next/link";
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
    | "communications"
    | "reviews"
    | "clients"
    | "compliance"
    | "documents-compare"
    | "litigation-workspace"
    | "time-entries"
    | "timesheet-presets"
    | "calendar"
    | "client-portal-admin"
    | "search"
    | "notifications";
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
  /**
   * Chrome mode. "default" renders the full application Sidebar for every
   * normal route. "focused" is an ADDITIVE document-workbench mode that yields
   * the Sidebar's horizontal space to the route (wide document reading) while
   * keeping a slim Adminiculum identity and an escape route back to cases.
   * Default behaviour is unchanged everywhere else.
   */
  workspaceChrome?: "default" | "focused";
};

export function AppShell({ onSignOut, userProfile, section = "dashboard", children, fullViewport = false, workspaceChrome = "default" }: AppShellProps) {
  const [uiPack] = useUiPack();
  const isSignalOps = uiPack === "signal_tiles_console";
  const isFocused = workspaceChrome === "focused";
  const profileName = userProfile?.name ?? "Ügyvéd";
  const titleBySection: Record<string, string> = {
    dashboard: "Belső munkapad",
    cases: "Aktív ügyek",
    "clause-library": "Záradék könyvtár",
    "case-detail": "Ügy részletei",
    generation: "Dokumentum generálás",
    tasks: "Feladatok",
    communications: "Kommunikáció",
    reviews: "Review sor",
    clients: "Ügyfelek",
    compliance: "Megfelelőség",
    "documents-compare": "Dokumentum összevetés",
    "litigation-workspace": "Peres stratégiai térkép",
    "time-entries": "Munkaórák",
    "timesheet-presets": "Presetek",
    calendar: "Határidők és naptár",
    "client-portal-admin": "Ügyfélportál adminisztráció",
    search: "Keresés",
    notifications: "Értesítések",
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
      data-shell-chrome={isFocused ? "focused" : "default"}
      className={`${rootHeightClass} app-shell flex ${isFocused ? "flex-col" : ""} ${isSignalOps ? "bg-[#0B1220] text-[#D6E2F2] ui-pack-signal-ops" : "adm-shell-bg text-[var(--adm-text)] ui-pack-insight-analytics"}`}
    >
        {isFocused ? (
          <header
            data-testid="focused-workspace-chrome"
            className={`flex items-center justify-between gap-3 border-b px-4 py-2 ${isSignalOps ? "border-[#1E293B] bg-[#0F172A]" : "border-[var(--adm-border)] bg-[var(--adm-surface)]"}`}
          >
            <div className="flex min-w-0 items-center gap-3">
              <span className={`text-[9.5px] uppercase tracking-[0.2em] ${isSignalOps ? "text-[#94A3B8]" : "text-[var(--adm-text-muted)]"}`}>Adminiculum</span>
              <Link
                data-testid="focused-workspace-escape"
                href="/cases"
                className={`text-xs font-semibold ${isSignalOps ? "text-[#67E8F9]" : "text-[var(--adm-green-800)]"} hover:underline`}
              >
                ← Ügyek
              </Link>
              <span className={`hidden truncate text-[10px] uppercase tracking-[0.2em] sm:inline ${isSignalOps ? "text-[#64748B]" : "text-[var(--adm-text-soft)]"}`}>Dokumentum munkatér</span>
            </div>
            <div className="flex min-w-0 items-center gap-2">
              <Link
                href="/search"
                className={`hidden h-8 items-center rounded-[var(--adm-radius-sm)] border px-2.5 text-[11px] sm:flex ${isSignalOps ? "border-[#334155] text-[#CBD5E1]" : "border-[var(--adm-border)] text-[var(--adm-text-muted)] hover:bg-[var(--adm-sand-100)]"}`}
              >
                Keresés
              </Link>
              <span className={`hidden max-w-[160px] truncate text-[10px] uppercase tracking-[0.16em] sm:block ${isSignalOps ? "text-[#CBD5E1]" : "text-[var(--adm-text)]"}`}>{profileName}</span>
              <button
                onClick={onSignOut}
                className={`h-8 rounded-[var(--adm-radius-sm)] border px-2.5 text-[10px] uppercase tracking-[0.16em] ${isSignalOps ? "border-[#334155] text-[#CBD5E1]" : "border-[var(--adm-border)] text-[var(--adm-text)] hover:bg-[var(--adm-sand-100)]"}`}
              >
                Kilépés
              </button>
            </div>
          </header>
        ) : (
          <Sidebar
            activeItem={section}
            profileName={profileName}
            profileRole={userProfile?.role ?? "Admin"}
            uiPack={uiPack}
          />
        )}

      <div className={`min-w-0 flex-1 flex flex-col min-h-0 app-shell-content ${isSignalOps ? "" : "adm-shell-bg"}`}>
        {!isFocused ? (
          <TopBar
            title={titleBySection[section] || "Műszerfal"}
            onSignOut={onSignOut}
            profileName={profileName}
            uiPack={uiPack}
          />
        ) : null}

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
