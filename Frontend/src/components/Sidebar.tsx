"use client";

import { useEffect, useState } from "react";
import { navItems } from "@/lib/mockData";
import { useRouter } from "next/navigation";
import type { UiPackId } from "@/lib/uiPack";
import { getUnreadNotificationsCount } from "@/lib/api";

type SidebarProps = {
  activeItem: string;
  profileName?: string;
  profileRole?: string;
  uiPack?: UiPackId;
};

const iconFor = (name: string | undefined) => {
  switch (name) {
    case 'grid':
      return (
        <svg className="w-5 h-5" viewBox="0 0 24 24" stroke="currentColor" fill="none">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 4h7v7H3zM14 4h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z" />
        </svg>
      );
    case 'folder':
      return (
        <svg className="w-5 h-5" viewBox="0 0 24 24" stroke="currentColor" fill="none">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8a1 1 0 011-1h5l2 2h8a1 1 0 011 1v9a1 1 0 01-1 1H4a1 1 0 01-1-1z" />
        </svg>
      );
    case 'file':
      return (
        <svg className="w-5 h-5" viewBox="0 0 24 24" stroke="currentColor" fill="none">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 2h7l5 5v13a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1z" />
        </svg>
      );
    case 'calendar':
      return (
        <svg className="w-5 h-5" viewBox="0 0 24 24" stroke="currentColor" fill="none">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 3v2M18 3v2M3 8h18M5 21h14a1 1 0 001-1V8H4v12a1 1 0 001 1z" />
        </svg>
      );
    case 'settings':
      return (
        <svg className="w-5 h-5" viewBox="0 0 24 24" stroke="currentColor" fill="none">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.049 2.927a9.014 9.014 0 012.902 0l.518 1.887a2 2 0 001.516 1.36l1.963.326a9.01 9.01 0 011.206 1.206l.326 1.963a2 2 0 001.36 1.516l1.887.518a9.018 9.018 0 010 2.902l-1.887.518a2 2 0 00-1.36 1.516l-.326 1.963a9.01 9.01 0 01-1.206 1.206l-1.963.326a2 2 0 00-1.516 1.36l-.518 1.887a9.014 9.014 0 01-2.902 0l-.518-1.887a2 2 0 00-1.516-1.36l-1.963-.326a9.01 9.01 0 01-1.206-1.206l-.326-1.963a2 2 0 00-1.36-1.516l-1.887-.518a9.018 9.018 0 010-2.902l1.887-.518a2 2 0 001.36-1.516l.326-1.963a9.01 9.01 0 011.206-1.206l1.963-.326a2 2 0 001.516-1.36z" />
          <circle cx="12" cy="12" r="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'clock':
      return (
        <svg className="w-5 h-5" viewBox="0 0 24 24" stroke="currentColor" fill="none">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6l4 2M12 22a10 10 0 100-20 10 10 0 000 20z" />
        </svg>
      );
    case 'briefcase':
      return (
        <svg className="w-5 h-5" viewBox="0 0 24 24" stroke="currentColor" fill="none">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 13.255A5 5 0 0112 19v3H5a2 2 0 01-2-2V8a2 2 0 012-2h4l2-2h4a2 2 0 012 2v1.5M16 5h2a2 2 0 012 2v1.5M7 14h.01M17 14h.01M12 14v4" />
        </svg>
      );
    case 'bell':
      return (
        <svg className="w-5 h-5" viewBox="0 0 24 24" stroke="currentColor" fill="none">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.05.7a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.082 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
        </svg>
      );
    default:
      return null;
  }
};

const routeMap: Record<string, string> = {
  dashboard: "/",
  cases: "/cases",
  "clause-library": "/clause-library",
  tasks: "/tasks",
  reviews: "/reviews",
  "documents-compare": "/documents/compare",
  notifications: "/notifications",
  "time-entries": "/time-entries",
  "timesheet-presets": "/timesheet-presets",
  clients: "/clients",
  calendar: "/deadlines",
  settings: "/settings",
};

const navGroups: Array<{ id: string; label: string; items: string[] }> = [
  {
    id: "operations",
    label: "Operations",
    items: ["dashboard", "tasks", "notifications", "reviews"],
  },
  {
    id: "matters",
    label: "Matters",
    items: ["cases", "clause-library", "clients", "documents-compare"],
  },
  {
    id: "resources",
    label: "Resources",
    items: ["time-entries", "timesheet-presets", "calendar", "settings"],
  },
];

export function Sidebar({ activeItem, profileName, profileRole, uiPack = "legal_ops_atelier" }: SidebarProps) {
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const isSignal = uiPack === "signal_tiles_console";
  const isCaseActive = activeItem === "cases" || activeItem === "case-detail" || activeItem === "generation";
  const isClauseLibraryActive = activeItem === "clause-library";
  const isTasksActive = activeItem === "tasks";
  const isReviewsActive = activeItem === "reviews";
  const isDocumentsCompareActive = activeItem === "documents-compare";
  const isNotificationsActive = activeItem === "notifications";
  const isTimeEntriesActive = activeItem === "time-entries";
  const isTimesheetPresetsActive = activeItem === "timesheet-presets";
  const isCalendarActive = activeItem === "calendar";
  const isClientsActive = activeItem === "clients";
  const navById = new Map(navItems.map((item) => [item.id, item]));
  const initials = profileName
    ? profileName
        .split(' ')
        .map((segment) => segment[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : 'AD';

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("sidebar-collapsed");
      if (stored === "1") {
        setCollapsed(true);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    const loadUnread = async () => {
      try {
        const result = await getUnreadNotificationsCount();
        if (mounted) {
          setUnreadNotifications(result.unreadCount);
        }
      } catch {
        // ignore notification badge failures in sidebar
      }
    };
    void loadUnread();
    return () => {
      mounted = false;
    };
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((current) => {
      const next = !current;
      try {
        window.localStorage.setItem("sidebar-collapsed", next ? "1" : "0");
      } catch {
        // ignore
      }
      return next;
    });
  };

  return (
    <aside className={`${collapsed ? "w-20" : "w-64"} min-h-screen ${isSignal ? "bg-[#111827]" : "bg-[#2D2A26]"} text-white flex flex-col transition-[width] duration-150`}>
      <div className={`${collapsed ? "px-3" : "px-6"} py-8 border-b ${isSignal ? "border-[#1F2937]" : "border-[#3D3935]"}`}>
        <p className={`text-xs uppercase tracking-[0.5em] ${isSignal ? "text-[#9CA3AF]" : "text-[#BDB7A9]"}`}>Adminiculum</p>
        {!collapsed && <h1 className="text-2xl mt-2" style={{ fontFamily: 'var(--font-newsreader)' }}>Legal Desk</h1>}
        {!collapsed && <p className={`text-[11px] uppercase tracking-[0.3em] mt-2 ${isSignal ? "text-[#6B7280]" : "text-[#9C9890]"}`}>Legal Operations</p>}
        <button
          onClick={toggleCollapsed}
          className={`mt-4 w-full h-8 border bg-white/5 hover:text-white ${isSignal ? "border-[#1F2937] text-[#9CA3AF]" : "border-[#3D3935] text-[#B1ADA6]"}`}
          title={collapsed ? "Sidebar kinyitása" : "Sidebar összecsukása"}
          type="button"
        >
          {collapsed ? "»" : "«"}
        </button>
      </div>

      <nav className={`${collapsed ? "px-2" : "px-4"} flex-1 py-6 space-y-2`}>
        {navGroups.map((group) => (
          <div key={group.id} className="space-y-1">
            {!collapsed && (
              <p className={`px-3 pt-2 pb-1 text-[10px] uppercase tracking-[0.24em] ${isSignal ? "text-[#6B7280]" : "text-[#8F8A81]"}`}>
                {group.label}
              </p>
            )}
            {group.items.map((itemId) => {
              const nav = navById.get(itemId);
              if (!nav) return null;

              const isActive = nav.id === "dashboard" && activeItem === "dashboard"
                || nav.id === "cases" && isCaseActive
                || nav.id === "clause-library" && isClauseLibraryActive
                || nav.id === "tasks" && isTasksActive
                || nav.id === "reviews" && isReviewsActive
                || nav.id === "documents-compare" && isDocumentsCompareActive
                || nav.id === "notifications" && isNotificationsActive
                || nav.id === "time-entries" && isTimeEntriesActive
                || nav.id === "timesheet-presets" && isTimesheetPresetsActive
                || nav.id === "calendar" && isCalendarActive
                || nav.id === "clients" && isClientsActive;

              return (
                <button
                  key={nav.id}
                  onClick={() => router.push(routeMap[nav.id] || "/")}
                  className={`w-full flex items-center ${collapsed ? "justify-center" : "gap-3"} px-3 py-2 text-sm font-semibold transition-colors duration-150 border-l-4 ${
                    isActive
                      ? `${isSignal ? "border-[#06B6D4] text-white bg-[#0B1220]" : "border-[#C9A227] text-white bg-white/5"}`
                      : `${isSignal ? "border-transparent text-[#9CA3AF] hover:text-white hover:bg-[#0B1220]" : "border-transparent text-[#B1ADA6] hover:text-white hover:bg-white/5"}`
                  }`}
                  title={nav.label}
                >
                  <span className={isActive ? (isSignal ? 'text-[#22D3EE]' : 'text-[#C9A227]') : 'text-inherit'}>{iconFor(nav.icon)}</span>
                  {!collapsed && (
                    <>
                      <span>{nav.label}</span>
                      {nav.id === "notifications" && unreadNotifications > 0 ? (
                        <span className={`ml-auto rounded-full px-2 py-0.5 text-[11px] font-semibold ${isSignal ? "bg-[#22D3EE] text-[#0B1220]" : "bg-[#C9A227] text-[#2D2A26]"}`}>
                          {unreadNotifications}
                        </span>
                      ) : null}
                    </>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      <div className={`${collapsed ? "px-2" : "px-6"} py-4 border-t ${isSignal ? "border-[#1F2937]" : "border-[#3D3935]"}`}>
        {profileName && !collapsed && (
          <div className="flex items-center gap-3 mb-4">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold ${isSignal ? "bg-[#22D3EE] text-[#0B1220]" : "bg-[#C9A227] text-[#2D2A26]"}`}>
              {initials}
            </div>
            <div>
              <p className="text-sm font-medium text-white leading-tight">{profileName}</p>
              <p className={`text-xs ${isSignal ? "text-[#6B7280]" : "text-[#9C9890]"}`}>{profileRole}</p>
            </div>
          </div>
        )}
        <button
          className={`w-full text-xs font-semibold uppercase ${collapsed ? "tracking-normal" : "tracking-[0.3em]"} py-3 rounded-none transition-colors ${isSignal ? "bg-[#22D3EE] text-[#0B1220] hover:bg-[#06B6D4]" : "bg-[#C9A227] text-[#2D2A26] hover:bg-[#B8911F]"}`}
          type="button"
          title="Új művelet"
        >
          {collapsed ? "+" : "Új művelet"}
        </button>
      </div>
    </aside>
  );
}
