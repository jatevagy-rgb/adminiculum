import Link from "next/link";
import type { ReactNode } from "react";

import { statusTone, type PortalMatterStatus } from "./mockPortalData";

const portalNavItems = [
  { href: "/portal", label: "Áttekintés" },
  { href: "/portal/matters", label: "Ügyeim" },
  { href: "/portal/documents", label: "Dokumentumok" },
  { href: "/portal/uploads", label: "Feltöltési kérések" },
];

export function PortalMockShell({ children, activeHref = "/portal" }: { children: ReactNode; activeHref?: string }) {
  return (
    <main className="min-h-screen bg-[var(--adm-ivory-50)] text-[var(--adm-text)]">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8">
        <header className="rounded-[28px] border border-[var(--adm-border)] bg-white/95 px-4 py-4 shadow-[var(--adm-shadow-md)] sm:px-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--adm-text-muted)]">
                Ügyfélportál előnézet
              </p>
              <h1 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[var(--adm-green-950)]">
                Biztonságos, szintetikus ügyféloldali előnézet
              </h1>
            </div>
            <nav aria-label="Ügyfélportál mock navigáció" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0">
              {portalNavItems.map((item) => {
                const isActive = activeHref === item.href;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={isActive ? "page" : undefined}
                    className={`whitespace-nowrap rounded-full border px-3 py-2 text-sm font-semibold transition ${
                      isActive
                        ? "border-[var(--adm-green-950)] bg-[var(--adm-green-950)] text-white shadow-sm"
                        : "border-[var(--adm-border)] bg-[var(--adm-surface)] text-[var(--adm-text-muted)] hover:border-[var(--adm-border-strong)] hover:text-[var(--adm-green-900)]"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
        </header>
        <PortalMockNotice />
        {children}
      </div>
    </main>
  );
}

export function PortalMockNotice() {
  return (
    <aside className="rounded-2xl border border-[rgba(253,158,2,0.42)] bg-[rgba(253,158,2,0.12)] px-4 py-3 text-sm leading-6 text-[var(--adm-blue-950)] shadow-sm">
      <strong>Fejlesztési előnézet — szintetikus adatokkal.</strong> Az ügyfélportál backendje nincs engedélyezve.
      Ez az előnézet nem végez API-hívást, nem fogad beküldést, és nem jelenít meg valós ügyfél-, ügy- vagy dokumentumadatot.
    </aside>
  );
}

export function PortalPageHero({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <section className="rounded-[32px] border border-[var(--adm-border)] bg-white p-6 shadow-[var(--adm-shadow-shell)] sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--adm-blue-700)]">{eyebrow}</p>
      <h2 className="mt-4 max-w-4xl text-4xl font-semibold tracking-[-0.045em] text-[var(--adm-green-950)] sm:text-5xl">
        {title}
      </h2>
      <p className="mt-5 max-w-3xl text-base leading-7 text-[var(--adm-text-muted)]">{description}</p>
    </section>
  );
}

export function SectionHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--adm-text-soft)]">{eyebrow}</p>
      <h2 className="mt-2 text-2xl font-semibold tracking-[-0.035em] text-[var(--adm-green-950)]">{title}</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--adm-text-muted)]">{description}</p>
    </div>
  );
}

export function PortalStatusBadge({ status }: { status: PortalMatterStatus }) {
  return <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusTone[status]}`}>{status}</span>;
}

export function DisabledMockButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      disabled
      className="rounded-full border border-dashed border-[var(--adm-border-strong)] bg-white/80 px-4 py-2 text-sm font-semibold text-[var(--adm-text-muted)] shadow-sm disabled:cursor-not-allowed disabled:opacity-80"
    >
      {label}
    </button>
  );
}

export function MockEmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-3xl border border-dashed border-[var(--adm-border-strong)] bg-white p-5">
      <p className="text-base font-semibold text-[var(--adm-green-950)]">{title}</p>
      <p className="mt-2 text-sm leading-6 text-[var(--adm-text-muted)]">{detail}</p>
    </div>
  );
}
