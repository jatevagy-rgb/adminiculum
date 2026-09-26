"use client";

import React from "react";
import type { ComplianceMonitoringManifest } from "@/lib/complianceIntelligenceApi";
import { AdminBadge } from "@/components/adminiculum/ui";

type TrackedLegislationSource = ComplianceMonitoringManifest["sources"][number];

/**
 * Deterministic identifier-FAMILY labels only.
 *
 * These name the family of the machine identifier (a Hungarian act reference or
 * an EU CELEX identifier). They are NOT the legal act title: the monitoring
 * manifest carries no human act title, so no title is ever invented here.
 */
export function trackedLegislationFamilyLabel(identifierFamily: string): string {
  switch (identifierFamily) {
    case "TV":
      return "Törvény";
    case "CELEX":
      return "EU jogforrás";
    default:
      return "Jogforrás";
  }
}

/**
 * The manifest's referenceCount is the number of persisted anchor usages that
 * folded onto the deduplicated act — never an affected-document count.
 */
export function trackedLegislationReferenceCountLabel(referenceCount: number): string {
  return `${referenceCount} hivatkozás`;
}

export function trackedLegislationUnresolvedLabel(count: number): string {
  return `${count} hivatkozás nem azonosítható támogatott jogforrás-azonosítóval.`;
}

export function TrackedLegislationPanel({ manifest }: { manifest: ComplianceMonitoringManifest | null }) {
  const sources: TrackedLegislationSource[] = manifest?.sources ?? [];
  const unresolvedCount = manifest?.unresolvedSummary.count ?? 0;

  return (
    <section className="rounded-[var(--adm-radius-md)] border border-[var(--adm-border)] bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[10px] uppercase tracking-[0.2em] text-[var(--adm-green-800)]">Automatikus figyelés</h2>
        <AdminBadge tone="neutral">{sources.length} nyilvántartott jogforrás</AdminBadge>
      </div>
      <p className="mt-2 text-xs text-[var(--adm-text-muted)]">
        Adminiculum a jogforrás-figyelési igényt tartja nyilván: mely jogforrás-azonosítókra hivatkoznak a rögzített belső
        elemzések. Nem fut folyamatos külső jogforrás-figyelő, ezért itt nem jelenik meg figyelési vagy ellenőrzési állapot.
      </p>
      {sources.length === 0 ? (
        <p className="mt-3 text-sm text-[var(--adm-text-muted)]">Nincs rögzített jogforrás-kötés.</p>
      ) : (
        <>
          <ul className="mt-3 divide-y divide-[var(--adm-border)] rounded-[var(--adm-radius-sm)] border border-[var(--adm-border)]">
            {sources.map((source) => (
              <li
                key={`${source.identifierFamily}\u0000${source.sourceIdentifier}`}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-[var(--adm-text)]">
                    {trackedLegislationFamilyLabel(source.identifierFamily)}
                  </span>
                  <span className="mt-0.5 block font-mono text-[11px] tracking-[0.02em] text-[var(--adm-text-muted)]">
                    {source.sourceIdentifier}
                  </span>
                </span>
                <span className="shrink-0 rounded-[3px] border border-[var(--adm-border)] px-2 py-0.5 text-[11px] text-[var(--adm-text-muted)]">
                  {trackedLegislationReferenceCountLabel(source.referenceCount)}
                </span>
              </li>
            ))}
          </ul>
          {unresolvedCount > 0 ? (
            <p className="mt-2 text-[11px] text-[var(--adm-text-muted)]">{trackedLegislationUnresolvedLabel(unresolvedCount)}</p>
          ) : null}
        </>
      )}
    </section>
  );
}
