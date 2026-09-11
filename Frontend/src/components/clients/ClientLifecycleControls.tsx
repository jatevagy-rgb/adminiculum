"use client";

import { useState } from "react";
import {
  archiveClient,
  deleteClient,
  getClientLifecyclePreview,
  type Client,
  type ClientLifecyclePreview,
} from "@/lib/api";

const DEPENDENCY_LABELS: Record<string, string> = {
  cases: "ügy",
  matters: "munka",
  departments: "osztály",
  workgroups: "munkacsoport",
  documents: "dokumentum",
  communications: "kommunikáció",
  timeEntries: "munkaóra",
  hourlyRates: "óradíj-verzió",
  timesheetReports: "munkaóra-riport",
  timesheetPresets: "munkaóra-előbeállítás",
  billingPreparations: "számlázási előkészítés",
  invoiceDrafts: "számlatervezet",
  portalWorkspaces: "portál munkatér",
  portalInvitations: "portál meghívás",
  portalGrants: "portál ügyhozzáférés",
  portalPublications: "portál közzététel",
  clientRequests: "ügyfélkitöltés / kérdés",
  clientInteractions: "ügyfélteendő / frissítés / értesítés",
  contractsAndObligations: "szerződés / kötelezettség / jogosultság",
  complianceAndFoundation: "megfelelőségi és cégprofil adat",
  organizationRecords: "szervezeti adat",
  clientProfiles: "ügyfélprofil",
};

function dependencyLines(preview: ClientLifecyclePreview): string[] {
  return Object.entries(preview.dependencies)
    .filter(([, count]) => count > 0)
    .map(([key, count]) => `${count} ${DEPENDENCY_LABELS[key] || key}`);
}

export function ClientLifecycleControls({ client, onArchived }: { client: Client; onArchived: () => void }) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<ClientLifecyclePreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"archive" | "delete">("archive");
  const [confirmName, setConfirmName] = useState("");

  if (client.archivedAt) {
    return <span className="block px-3 py-2 text-xs text-[var(--adm-text-muted)]" data-testid="client-archived-indicator">Archivált ügyfél</span>;
  }

  const openDialog = async (nextMode: "archive" | "delete") => {
    setMode(nextMode);
    setOpen(true);
    setError(null);
    setConfirmName("");
    setLoadingPreview(true);
    try {
      setPreview(await getClientLifecyclePreview(client.id));
    } catch {
      setPreview(null);
      setError("A függőségi előnézet jelenleg nem érhető el.");
    } finally {
      setLoadingPreview(false);
    }
  };

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      if (mode === "delete") {
        await deleteClient(client.id);
      } else {
        await archiveClient(client.id);
      }
      setOpen(false);
      onArchived();
    } catch (err) {
      setError(err instanceof Error ? err.message : "A művelet nem sikerült.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        data-testid="archive-client-action"
        onClick={() => void openDialog("archive")}
        className="block w-full rounded px-3 py-2 text-left text-xs hover:bg-[var(--adm-surface)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--adm-ochre-500)]"
      >
        Ügyfél archiválása
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" role="dialog" aria-modal="true" data-testid="client-lifecycle-dialog">
          <div className="w-full max-w-md rounded-xl border border-[var(--adm-border)] bg-white p-5 text-left shadow-xl">
            {mode === "archive" ? (
              <>
                <h3 className="font-serif text-lg text-[var(--adm-text)]">Ügyfél archiválása</h3>
                <p className="mt-2 text-sm text-[var(--adm-text)]">
                  <b>{client.name}</b> archiválása után az ügyfél eltűnik a normál aktív listákból, de minden kapcsolt adat megmarad.
                </p>
                <div className="mt-3 rounded-lg bg-[var(--adm-bg,#faf8f3)] p-3 text-sm text-[var(--adm-text-muted)]" data-testid="dependency-summary">
                  {loadingPreview ? <p>Függőségek betöltése…</p> : null}
                  {preview ? (
                    preview.total > 0 ? (
                      <>
                        <p>Ehhez az ügyfélhez tartozik: {dependencyLines(preview).join(", ")}.</p>
                        <p className="mt-1">Az archiválás az ügyeket, dokumentumokat és az előzményeket megőrzi. A portál felhasználói fiók nem törlődik.</p>
                      </>
                    ) : (
                      <p>Az ügyfélhez nem tartozik kapcsolt adat. Az archiválás visszafordítható előzmény-őrzéssel jár.</p>
                    )
                  ) : null}
                </div>
              </>
            ) : (
              <>
                <h3 className="font-serif text-lg text-red-800">Végleges törlés</h3>
                <p className="mt-2 text-sm text-[var(--adm-text)]">
                  <b>{client.name}</b> véglegesen törlődik. Ez a művelet nem vonható vissza.
                </p>
                <label className="mt-3 grid gap-1 text-xs font-semibold text-[var(--adm-text-muted)]">
                  <span>A megerősítéshez írja be az ügyfél nevét</span>
                  <input
                    data-testid="hard-delete-confirm-input"
                    value={confirmName}
                    onChange={(event) => setConfirmName(event.target.value)}
                    className="rounded-lg border border-[var(--adm-border)] px-3 py-2 text-sm"
                  />
                </label>
              </>
            )}
            {error ? <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-800" role="alert">{error}</p> : null}
            <div className="mt-4 flex flex-wrap justify-between gap-2">
              <button type="button" onClick={() => setOpen(false)} className="adm-link-button px-4 py-2 text-xs">Mégse</button>
              <div className="flex gap-2">
                {mode === "archive" && preview?.canHardDelete ? (
                  <button
                    type="button"
                    data-testid="hard-delete-option"
                    onClick={() => void openDialog("delete")}
                    className="rounded border border-red-300 bg-white px-4 py-2 text-xs font-semibold text-red-700 hover:bg-red-50"
                  >
                    Végleges törlés…
                  </button>
                ) : null}
                {mode === "archive" ? (
                  <button
                    type="button"
                    data-testid="confirm-archive"
                    disabled={busy || loadingPreview}
                    onClick={() => void confirm()}
                    className="adm-link-button adm-link-button-primary px-4 py-2 text-xs font-semibold"
                  >
                    Archiválás megerősítése
                  </button>
                ) : (
                  <button
                    type="button"
                    data-testid="confirm-hard-delete"
                    disabled={busy || confirmName.trim() !== client.name.trim() || !(preview?.canHardDelete ?? false)}
                    onClick={() => void confirm()}
                    className="rounded bg-red-700 px-4 py-2 text-xs font-semibold text-white hover:bg-red-800 disabled:opacity-50"
                  >
                    Törlés megerősítése
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
