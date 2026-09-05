"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import {
  clientOrganizationApi,
  type OrgGroupDTO,
  type OrgPersonDTO,
} from "@/lib/clientOrganizationApi";

export interface ClientOrganizationPreviewProps {
  clientId: string;
  clientName?: string;
}

export function ClientOrganizationPreview({
  clientId,
  clientName,
}: ClientOrganizationPreviewProps) {
  const [groups, setGroups] = useState<OrgGroupDTO[]>([]);
  const [persons, setPersons] = useState<OrgPersonDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    Promise.all([
      clientOrganizationApi.listGroups(clientId).catch(() => ({ items: [] as OrgGroupDTO[] })),
      clientOrganizationApi.listPersons(clientId).catch(() => ({ items: [] as OrgPersonDTO[] })),
    ])
      .then(([groupsRes, personsRes]) => {
        if (!active) return;
        setGroups(groupsRes?.items || []);
        setPersons(personsRes?.items || []);
      })
      .catch(() => {
        if (!active) return;
        setError("Nem sikerült betölteni a szervezeti adatokat.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [clientId]);

  // Small curated snapshot: root leaders (no manager or top-level) or top key people (up to 4)
  const previewPersons = useMemo(() => {
    if (!persons.length) return [];
    const leaders = persons.filter((p) => !p.managerPersonId);
    const others = persons.filter((p) => p.managerPersonId);
    return [...leaders, ...others].slice(0, 4);
  }, [persons]);

  // Key organizational units snapshot (up to 4)
  const previewGroups = useMemo(() => {
    if (!groups.length) return [];
    const rootGroups = groups.filter((g) => !g.parentGroupId);
    const subGroups = groups.filter((g) => g.parentGroupId);
    return [...rootGroups, ...subGroups].slice(0, 4);
  }, [groups]);

  const szervezetHref = `/clients/${encodeURIComponent(clientId)}/szervezet`;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--adm-text-muted)]">
              Szervezeti pillanatkép
            </p>
            <span className="rounded-full bg-[var(--adm-sand-100)] px-2 py-0.5 text-[10px] font-medium text-[var(--adm-green-800)] border border-[#DCCCA6]">
              Miniatűr nézet
            </span>
          </div>
          <h3 className="mt-0.5 font-serif text-lg text-[var(--adm-text)]">
            Szervezeti felépítés
          </h3>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-3 text-xs text-[var(--adm-text-muted)]">
            <span>
              <strong className="text-[var(--adm-text)]">{persons.length}</strong> munkatárs
            </span>
            <span>·</span>
            <span>
              <strong className="text-[var(--adm-text)]">{groups.length}</strong> szervezeti egység
            </span>
          </div>
          <Link
            href={szervezetHref}
            className="adm-link-button inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-[var(--adm-ochre-600)] hover:text-[var(--adm-ochre-700)]"
          >
            <span>Szervezeti felépítés megnyitása</span>
            <span>→</span>
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="p-4 text-xs text-[var(--adm-text-muted)]">
          Szervezeti adatok betöltése...
        </div>
      ) : error ? (
        <div className="p-4 text-xs text-[var(--adm-terracotta-700)]">
          {error}
        </div>
      ) : persons.length === 0 && groups.length === 0 ? (
        <div className="rounded border border-dashed border-[var(--adm-border)] p-4 text-center text-xs text-[var(--adm-text-muted)]">
          <p>Még nincsenek rögzített szervezeti egységek vagy munkatársak.</p>
          <Link
            href={szervezetHref}
            className="mt-2 inline-block text-xs font-semibold text-[var(--adm-ochre-600)] hover:underline"
          >
            Szervezet kezelése a részletes felületen →
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
          {/* Kulcsszemélyek és vezetés */}
          <div className="rounded border border-[var(--adm-border)] bg-[var(--adm-surface)] p-3 space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">
              Vezetés és kulcsszemélyek
            </p>
            {previewPersons.length > 0 ? (
              <ul className="space-y-2">
                {previewPersons.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center justify-between rounded bg-white px-3 py-2 border border-[var(--adm-border)] text-xs"
                  >
                    <div className="min-w-0 pr-2">
                      <p className="font-semibold text-[var(--adm-text)] truncate">{p.name}</p>
                      <p className="text-[10px] text-[var(--adm-text-muted)] truncate">
                        {p.jobTitle || "Munkatárs"}
                        {p.organizationGroupName ? ` · ${p.organizationGroupName}` : ""}
                      </p>
                    </div>
                    <span className="shrink-0 text-[10px] px-2 py-0.5 rounded-full bg-[var(--adm-sand-100)] text-[var(--adm-text-muted)]">
                      {p.organizationGroupName || (p.managerPersonId ? "Tag" : "Vezetés")}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-[var(--adm-text-muted)]">Nincs megjeleníthető munkatárs.</p>
            )}
          </div>

          {/* Fő szervezeti egységek */}
          <div className="rounded border border-[var(--adm-border)] bg-[var(--adm-surface)] p-3 space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--adm-text-muted)]">
              Fő szervezeti egységek
            </p>
            {previewGroups.length > 0 ? (
              <div className="grid grid-cols-2 gap-2">
                {previewGroups.map((g) => (
                  <div
                    key={g.id}
                    className="rounded bg-white p-2.5 border border-[var(--adm-border)] text-xs flex flex-col justify-between"
                  >
                    <p className="font-semibold text-[var(--adm-text)] truncate">{g.name}</p>
                    <p className="mt-1 text-[10px] text-[var(--adm-text-muted)]">
                      {g.parentGroupId ? "Részleg" : "Főegység"}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-[var(--adm-text-muted)]">Nincs rögzített szervezeti egység.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
