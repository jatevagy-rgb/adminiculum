"use client";

import { useCallback, useEffect, useState } from "react";
import { SafePanelError } from "@/components/ui";
import {
  getPortalOrganizationSummary,
  type PortalLeadershipUnitAggregate,
} from "@/lib/clientPortalApi";
import { PortalEmptyInline } from "../shared/PortalEmptyInline";

/**
 * Client Portal 3.0 organization summary — the /portal/szervezeti-attekintes
 * ORGANIZATION body (kept as a deep-link destination). Consumes the canonical
 * org summary contract (GET /client-portal/org/summary/organization) and shows
 * aggregate counts only. It never links to individual cases, documents or
 * communications.
 */

function formatDate(value?: string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("hu-HU", { year: "numeric", month: "short", day: "numeric" }).format(new Date(value));
}

const CARD =
  "min-w-0 rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] p-4 sm:p-5";
const EYEBROW = "text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--adm-text-secondary)]";
const MUTED = "text-[var(--adm-text-secondary)]";

export function PortalLeadershipV3() {
  const [units, setUnits] = useState<PortalLeadershipUnitAggregate[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getPortalOrganizationSummary();
      setUnits(result.units || []);
    } catch {
      setUnits(null);
      setError("Az összesített áttekintés jelenleg nem tölthető be.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, reloadNonce]);

  if (loading) {
    return (
      <div aria-label="Vezetői áttekintés betöltése" data-testid="portal-leadership-loading" className="space-y-3">
        {[0, 1, 2].map((row) => (
          <div key={row} className="h-24 animate-pulse rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)]" />
        ))}
      </div>
    );
  }

  if (error || !units) {
    return (
      <div data-testid="portal-leadership-v3">
        <SafePanelError
          detail={error || "Ehhez az ügyfélfelülethez nincs vezetői összesítő rálátás."}
          onRetry={() => setReloadNonce((value) => value + 1)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5" data-testid="portal-leadership-v3">
      <header className="rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] px-4 py-4 sm:px-5">
        <h1 className="font-serif text-2xl font-semibold tracking-tight text-[var(--adm-text-primary)] sm:text-3xl">
          Vezetői áttekintés
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--adm-text-secondary)]">
          Ez az oldal kizárólag összesített adatokat mutat, és nem ad hozzáférést egyedi ügyekhez, dokumentumokhoz vagy
          kommunikációhoz.
        </p>
      </header>

      {units.length === 0 ? (
        <section
          data-testid="portal-leadership-empty"
          className="rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] p-6 text-center"
        >
          <PortalEmptyInline>
            Ehhez az ügyfélfelülethez jelenleg nincs közzétett összesített áttekintés.
          </PortalEmptyInline>
        </section>
      ) : (
        <div className="space-y-4">
          {units.map((unit) => (
            <section key={unit.organizationUnitName || "organization"} className={CARD} data-testid="portal-leadership-unit">
              <h2 className="font-serif text-lg font-semibold text-[var(--adm-text-primary)]">
                {unit.organizationUnitName || "Teljes szervezet"}
              </h2>
              <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
                <div>
                  <dt className={EYEBROW}>Aktív ügyek</dt>
                  <dd className="mt-0.5 font-semibold text-[var(--adm-text-primary)]">{unit.activeCaseCount}</dd>
                </div>
                <div>
                  <dt className={EYEBROW}>Lezárt ügyek</dt>
                  <dd className="mt-0.5 font-semibold text-[var(--adm-text-primary)]">{unit.closedCaseCount}</dd>
                </div>
                <div>
                  <dt className={EYEBROW}>Közelgő határidők</dt>
                  <dd className="mt-0.5 font-semibold text-[var(--adm-text-primary)]">{unit.approachingDeadlineCount}</dd>
                </div>
                <div>
                  <dt className={EYEBROW}>Ügyfélre vár</dt>
                  <dd className="mt-0.5 font-semibold text-[var(--adm-text-primary)]">{unit.waitingOnCustomerCount}</dd>
                </div>
                <div>
                  <dt className={EYEBROW}>Irodára vár</dt>
                  <dd className="mt-0.5 font-semibold text-[var(--adm-text-primary)]">{unit.waitingOnOfficeCount}</dd>
                </div>
              </dl>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div>
                  <p className={EYEBROW}>Jogi terület szerinti megoszlás</p>
                  {Object.keys(unit.legalAreaDistribution || {}).length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {Object.entries(unit.legalAreaDistribution || {}).map(([area, count]) => (
                        <span
                          key={area}
                          className="rounded-[6px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-subtle)] px-2.5 py-0.5 text-xs text-[var(--adm-text-primary)]"
                        >
                          {area}: {count}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className={`mt-1 text-xs ${MUTED}`}>Nincs megjeleníthető megoszlás.</p>
                  )}
                </div>
                <div>
                  <p className={EYEBROW}>Jelenlegi státuszok</p>
                  {Object.keys(unit.publicStageCounts || {}).length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {Object.entries(unit.publicStageCounts || {}).map(([stage, count]) => (
                        <span
                          key={stage}
                          className="rounded-[6px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-subtle)] px-2.5 py-0.5 text-xs text-[var(--adm-text-primary)]"
                        >
                          {stage}: {count}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className={`mt-1 text-xs ${MUTED}`}>Nincs megjeleníthető státuszösszesítő.</p>
                  )}
                </div>
              </div>

              <div className="mt-4">
                <p className={EYEBROW}>Legutóbbi biztonságos aktivitás</p>
                <div className="mt-2 grid gap-2">
                  {(unit.recentSafeActivity || []).length > 0 ? (
                    unit.recentSafeActivity.map((activity) => (
                      <p
                        key={`${activity.label}-${activity.happenedAt}`}
                        className="rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-subtle)] p-3 text-xs text-[var(--adm-text-primary)]"
                      >
                        {activity.label} · {formatDate(activity.happenedAt)}
                      </p>
                    ))
                  ) : (
                    <p className={`text-xs ${MUTED}`}>Nincs friss összesített aktivitás.</p>
                  )}
                </div>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
