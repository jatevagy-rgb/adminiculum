"use client";

import Link from "next/link";
import { getClientColorDefinition } from "@/lib/clientColors";
import type { Client } from "@/lib/api";

export interface ClientControlCenterProps {
  clientId: string;
  client: Client;
  activeCases: number;
  isCasesComplete: boolean;
  organizationMode: boolean;
}

export function ClientControlCenter({
  clientId,
  client,
  activeCases,
  isCasesComplete,
  organizationMode,
}: ClientControlCenterProps) {
  const colorDef = getClientColorDefinition(client.colorKey);
  const encodedId = encodeURIComponent(clientId);

  const cardBaseClasses = `group relative flex flex-col justify-between rounded-lg border bg-white p-5 shadow-sm transition hover:shadow-md hover:border-[var(--adm-ochre-500)] ${
    colorDef.key
      ? `border-l-4 ${colorDef.accentBorderClass}`
      : "border-l-4 border-l-[var(--adm-border)] border-[var(--adm-border)]"
  }`;

  return (
    <section aria-label="Ügyfél irányítópult" className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--adm-text-muted)]">
              Irányítóközpont
            </p>
            {colorDef.key && (
              <span className={`h-1.5 w-6 rounded-full ${colorDef.accentClass}`} aria-hidden="true" />
            )}
          </div>
          <h2 className="mt-0.5 font-serif text-lg text-[var(--adm-text)]">
            Ügyfél modulok és vezérlőpult
          </h2>
        </div>
        {colorDef.key && (
          <div className={`flex items-center gap-2 rounded-full border ${colorDef.borderClass} ${colorDef.softBackgroundClass} px-3 py-1 text-[11px] text-[var(--adm-text)] shadow-xs`}>
            <span className={`h-2.5 w-2.5 rounded-full ${colorDef.accentClass}`} aria-hidden="true" />
            <span className="font-medium">{colorDef.label} kategória</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* 1. Nyitott ügyek */}
        <Link
          href={`/cases?clientId=${encodedId}&scope=ACTIVE`}
          className={cardBaseClasses}
        >
          <div>
            <div className="flex items-center justify-between text-[11px] text-[var(--adm-text-muted)]">
              <div className="flex items-center gap-1.5">
                {colorDef.key && (
                  <span className={`h-1.5 w-1.5 rounded-full ${colorDef.accentClass}`} aria-hidden="true" />
                )}
                <span className="font-semibold uppercase tracking-[0.14em]">Ügyek</span>
              </div>
              <span className="text-[var(--adm-ochre-600)] opacity-0 transition group-hover:opacity-100">
                Megnyitás →
              </span>
            </div>
            <h3 className="mt-2 font-serif text-xl text-[var(--adm-text)] group-hover:text-[var(--adm-ochre-600)]">
              Nyitott ügyek
            </h3>
            <p className="mt-1 text-xs text-[var(--adm-text-muted)]">
              Aktív folyamatban lévő ügyek listája
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-[var(--adm-border)] flex items-baseline justify-between">
            {isCasesComplete ? (
              <>
                <span className="font-serif text-2xl font-bold text-[var(--adm-text)]">
                  {activeCases}
                </span>
                <span className="text-[11px] text-[var(--adm-text-muted)]">aktív ügy</span>
              </>
            ) : (
              <>
                <span className="text-xs font-semibold text-[var(--adm-text)]">
                  Ügyek megnyitása
                </span>
                <span className="text-[11px] text-[var(--adm-text-muted)]">teljes ügylista</span>
              </>
            )}
          </div>
        </Link>

        {/* 2. Kommunikációk */}
        <Link
          href={`/communications?clientId=${encodedId}`}
          className={cardBaseClasses}
        >
          <div>
            <div className="flex items-center justify-between text-[11px] text-[var(--adm-text-muted)]">
              <div className="flex items-center gap-1.5">
                {colorDef.key && (
                  <span className={`h-1.5 w-1.5 rounded-full ${colorDef.accentClass}`} aria-hidden="true" />
                )}
                <span className="font-semibold uppercase tracking-[0.14em]">Kommunikáció</span>
              </div>
              <span className="text-[var(--adm-ochre-600)] opacity-0 transition group-hover:opacity-100">
                Megnyitás →
              </span>
            </div>
            <h3 className="mt-2 font-serif text-xl text-[var(--adm-text)] group-hover:text-[var(--adm-ochre-600)]">
              Kommunikációk
            </h3>
            <p className="mt-1 text-xs text-[var(--adm-text-muted)]">
              Ügyfélszintű és ügyszintű üzenetek
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-[var(--adm-border)] flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--adm-text)]">
              Kommunikáció megnyitása
            </span>
            <span className="rounded-full bg-[var(--adm-surface)] px-2 py-0.5 text-[10px] text-[var(--adm-text-muted)]">
              Üzenetek
            </span>
          </div>
        </Link>

        {/* 3. Ügyfélportál */}
        <Link
          href={`/clients/${encodedId}/portal`}
          className={cardBaseClasses}
        >
          <div>
            <div className="flex items-center justify-between text-[11px] text-[var(--adm-text-muted)]">
              <div className="flex items-center gap-1.5">
                {colorDef.key && (
                  <span className={`h-1.5 w-1.5 rounded-full ${colorDef.accentClass}`} aria-hidden="true" />
                )}
                <span className="font-semibold uppercase tracking-[0.14em]">Portál</span>
              </div>
              <span className="text-[var(--adm-ochre-600)] opacity-0 transition group-hover:opacity-100">
                Megnyitás →
              </span>
            </div>
            <h3 className="mt-2 font-serif text-xl text-[var(--adm-text)] group-hover:text-[var(--adm-ochre-600)]">
              Ügyfélportál
            </h3>
            <p className="mt-1 text-xs text-[var(--adm-text-muted)]">
              Ügyfélkapcsolati felület és státusz
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-[var(--adm-border)] flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--adm-text)]">
              {client.portalAccessEnabled ? "Előkészítve" : "Nincs előkészítve"}
            </span>
            <span className="rounded-full bg-[var(--adm-surface)] px-2 py-0.5 text-[10px] text-[var(--adm-text-muted)]">
              Portál adatok
            </span>
          </div>
        </Link>

        {/* 4. Szervezeti felépítés (Only organizationMode) */}
        {organizationMode && (
          <Link
            href={`/clients/${encodedId}/szervezet`}
            className={cardBaseClasses}
          >
            <div>
              <div className="flex items-center justify-between text-[11px] text-[var(--adm-text-muted)]">
                <div className="flex items-center gap-1.5">
                  {colorDef.key && (
                    <span className={`h-1.5 w-1.5 rounded-full ${colorDef.accentClass}`} aria-hidden="true" />
                  )}
                  <span className="font-semibold uppercase tracking-[0.14em]">Szervezet</span>
                </div>
                <span className="text-[var(--adm-ochre-600)] opacity-0 transition group-hover:opacity-100">
                  Megnyitás →
                </span>
              </div>
              <h3 className="mt-2 font-serif text-xl text-[var(--adm-text)] group-hover:text-[var(--adm-ochre-600)]">
                Szervezeti felépítés
              </h3>
              <p className="mt-1 text-xs text-[var(--adm-text-muted)]">
                Hierarchia, döntéshozók és felelősségi körök
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-[var(--adm-border)] flex items-center justify-between">
              <span className="text-xs font-semibold text-[var(--adm-text)]">
                Vállalati struktúra
              </span>
              <span className="rounded-full bg-[var(--adm-surface)] px-2 py-0.5 text-[10px] text-[var(--adm-text-muted)]">
                Szervezeti nézet
              </span>
            </div>
          </Link>
        )}

        {/* 5. Vállalati működés (Only organizationMode) */}
        {organizationMode && (
          <Link
            href={`/clients/${encodedId}/vallalati-mukodes`}
            className={cardBaseClasses}
          >
            <div>
              <div className="flex items-center justify-between text-[11px] text-[var(--adm-text-muted)]">
                <div className="flex items-center gap-1.5">
                  {colorDef.key && (
                    <span className={`h-1.5 w-1.5 rounded-full ${colorDef.accentClass}`} aria-hidden="true" />
                  )}
                  <span className="font-semibold uppercase tracking-[0.14em]">Működés</span>
                </div>
                <span className="text-[var(--adm-ochre-600)] opacity-0 transition group-hover:opacity-100">
                  Megnyitás →
                </span>
              </div>
              <h3 className="mt-2 font-serif text-xl text-[var(--adm-text)] group-hover:text-[var(--adm-ochre-600)]">
                Vállalati működés
              </h3>
              <p className="mt-1 text-xs text-[var(--adm-text-muted)]">
                Megfelelés, megállapítások és intézkedések
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-[var(--adm-border)] flex items-center justify-between">
              <span className="text-xs font-semibold text-[var(--adm-text)]">
                Folyamatos kísérés
              </span>
              <span className="rounded-full bg-[var(--adm-surface)] px-2 py-0.5 text-[10px] text-[var(--adm-text-muted)]">
                Grow-with-us
              </span>
            </div>
          </Link>
        )}
      </div>
    </section>
  );
}
