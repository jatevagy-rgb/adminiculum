"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui";
import { ORG_NEW_INTAKE_HREF } from "./navigation";
import { PortalPrimaryNav } from "./PortalPrimaryNav";
import { PortalUtilityTray } from "./PortalUtilityTray";

type PortalHeaderProps = {
  view: string;
  workspaceName: string;
  communicationEnabled: boolean;
  canSwitchWorkspace: boolean;
  onSwitchWorkspace: () => void;
  onLogout: () => void;
};

const menuItemClass =
  "flex min-h-10 w-full items-center px-3 py-2 text-left text-sm font-medium text-[var(--adm-text-primary)] transition-colors hover:bg-[var(--adm-canvas-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--adm-brand-green)]";

function AccountIcon() {
  return (
    <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 20c1.4-3.4 4.2-5 7.5-5s6.1 1.6 7.5 5" strokeLinecap="round" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden="true">
      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
    </svg>
  );
}

/**
 * V3 white header: wordmark, utilities, workspace/account control and exactly
 * one green primary CTA ("Új megkeresés"). The desktop primary navigation sits
 * on its own row below the header action row.
 */
export function PortalHeader({ view, workspaceName, communicationEnabled, canSwitchWorkspace, onSwitchWorkspace, onLogout }: PortalHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        triggerRef.current?.focus();
        return;
      }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const items = menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]');
        if (!items || items.length === 0) return;
        const current = document.activeElement as HTMLElement;
        const index = Array.from(items).indexOf(current);
        if (event.key === "ArrowDown") {
          const next = index < items.length - 1 ? items[index + 1] : items[0];
          next.focus();
        } else {
          const prev = index > 0 ? items[index - 1] : items[items.length - 1];
          prev.focus();
        }
      }
    };
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setMenuOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [menuOpen]);

  return (
    <header className="sticky top-0 z-20 border-b border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)]" data-testid="portal-header-v3">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-3 sm:gap-3 sm:px-6">
        <Link
          href="/portal"
          className="min-w-0 font-serif text-xl font-bold tracking-tight text-[var(--adm-brand-deep)] transition-colors hover:text-[var(--adm-brand-green)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-green)] focus-visible:ring-offset-2 sm:text-2xl"
        >
          Adminiculum
        </Link>
        <div className="flex items-center gap-2">
          <PortalUtilityTray view={view} communicationEnabled={communicationEnabled} />
          <div className="relative" ref={menuRef}>
            <Button
              ref={triggerRef}
              variant="neutral"
              size="md"
              leftIcon={<AccountIcon />}
              rightIcon={<ChevronIcon />}
              onClick={() => setMenuOpen((value) => !value)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              className="max-w-[16rem] min-h-10"
              data-testid="portal-account-menu-trigger"
            >
              <span className="hidden truncate md:inline">{workspaceName}</span>
            </Button>
            {menuOpen ? (
              <div
                role="menu"
                aria-label="Munkatér és fiók"
                data-testid="portal-account-menu"
                className="absolute right-0 z-30 mt-2 w-56 overflow-hidden rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] py-1 shadow-lg"
              >
                <p role="presentation" className="truncate border-b border-[var(--adm-border-canonical)] px-3 py-2 text-xs text-[var(--adm-text-secondary)]">
                  {workspaceName}
                </p>
                {canSwitchWorkspace ? (
                  <button
                    type="button"
                    role="menuitem"
                    data-testid="portal-account-switch-workspace"
                    className={menuItemClass}
                    onClick={() => {
                      setMenuOpen(false);
                      onSwitchWorkspace();
                    }}
                  >
                    Munkatérváltás
                  </button>
                ) : null}
                <button
                  type="button"
                  role="menuitem"
                  data-testid="portal-account-logout"
                  className={menuItemClass}
                  onClick={() => {
                    setMenuOpen(false);
                    onLogout();
                  }}
                >
                  Kijelentkezés
                </button>
              </div>
            ) : null}
          </div>
          <Link
            href={ORG_NEW_INTAKE_HREF}
            data-testid="portal-cta-new-intake"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-[8px] border border-[var(--adm-brand-green)] bg-[var(--adm-brand-green)] px-3 text-sm font-medium text-[var(--adm-canvas-white)] transition-colors hover:border-[var(--adm-brand-deep)] hover:bg-[var(--adm-brand-deep)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-green)] focus-visible:ring-offset-2 motion-reduce:transition-none sm:px-4 shadow-sm"
          >
            <span className="hidden sm:inline-flex">
              <PlusIcon />
            </span>
            <span>Új megkeresés</span>
          </Link>
        </div>
      </div>
      <div className="border-t border-[var(--adm-border-canonical)]">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
          <PortalPrimaryNav view={view} />
        </div>
      </div>
    </header>
  );
}
