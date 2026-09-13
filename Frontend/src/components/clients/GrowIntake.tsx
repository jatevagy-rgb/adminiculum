"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { growApi, SURVEY_CATEGORY_LABELS_HU, type BusinessProcessDTO } from "@/lib/growApi";

interface GrowIntakeProps {
  clientId: string;
  /** Called after a successful (non-replayed) submit so the parent can refresh. */
  onSubmitted?: () => void;
}

const CATEGORY_KEYS = Object.keys(SURVEY_CATEGORY_LABELS_HU);

/**
 * Observatory structured pain intake. Writes DECLARED_SURVEY observations via
 * the canonical connection → run → observation path; never creates findings,
 * recommendations, or tasks. Retry-safe via a stable idempotency key kept in
 * component state per draft.
 */
export function GrowIntake({ clientId, onSubmitted }: GrowIntakeProps) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [freeText, setFreeText] = useState("");
  const [processId, setProcessId] = useState("");
  const [processes, setProcesses] = useState<BusinessProcessDTO[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [intakes, setIntakes] = useState<Array<{ id: string; observedAt: string; payload: Record<string, unknown> }>>([]);
  const keyRef = useRef<string>(crypto.randomUUID());

  const loadIntakes = useCallback(async () => {
    try {
      const res = await growApi.listSurveyIntakes(clientId);
      setIntakes(res.items);
    } catch {
      // Listing is best-effort; the submit flow remains usable.
    }
  }, [clientId]);

  useEffect(() => {
    void loadIntakes();
    growApi
      .listProcesses(clientId)
      .then((rows) => setProcesses(rows.filter((p) => p.status === "ACTIVE" || !p.status)))
      .catch(() => setProcesses([]));
  }, [clientId, loadIntakes]);

  const toggle = (key: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const submit = async () => {
    if (!selected.size && !freeText.trim()) {
      setError("Jelöljön meg legalább egy területet vagy írja le a problémát.");
      return;
    }
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const result = await growApi.submitSurveyIntake(clientId, {
        categories: [...selected],
        freeText: freeText.trim() || undefined,
        processId: processId || undefined,
        idempotencyKey: keyRef.current,
      });
      setDone(result.replayed ? "A bejelentést már rögzítettük korábban (ismétlés nélkül)." : "Köszönjük — rögzítettük a visszajelzést.");
      setSelected(new Set());
      setFreeText("");
      keyRef.current = crypto.randomUUID();
      await loadIntakes();
      onSubmitted?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : "A rögzítés nem sikerült.";
      setError(message.includes("IDEMPOTENCY_CONFLICT") ? "Ez az azonosító már máshoz a bejelentéshez tartozik — a bejelentés nem duplikálódott." : "A bejelentés rögzítése nem sikerült. Próbálja újra.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-[var(--adm-radius-md)] border border-[var(--adm-border)] bg-white p-5" data-testid="grow-intake">
      <h2 className="text-[10px] uppercase tracking-[0.2em] text-[var(--adm-green-800)]">Mondd el, hol fáj</h2>
      <p className="mt-1 text-xs text-[var(--adm-text-muted)]">
        Válassza ki, mi akadályozza a mindennapi munkát. A válaszok megfigyelésként rögzülnek; önmagukban nem hoznak létre megállapítást vagy feladatot.
      </p>

      <fieldset className="mt-3">
        <legend className="sr-only">Problématerületek</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {CATEGORY_KEYS.map((key) => (
            <label key={key} className="flex cursor-pointer items-start gap-2 rounded border border-[var(--adm-border)] px-3 py-2 text-[12px] text-[var(--adm-text)] has-[:checked]:border-[var(--adm-green-800)] has-[:checked]:bg-[var(--adm-surface)]">
              <input type="checkbox" className="mt-0.5" checked={selected.has(key)} onChange={() => toggle(key)} />
              <span>{SURVEY_CATEGORY_LABELS_HU[key]}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block text-[11px] font-semibold text-[var(--adm-text-muted)]">
          Kapcsolódó folyamat (opcionális)
          <select value={processId} onChange={(e) => setProcessId(e.target.value)} className="adm-board-field mt-1 w-full px-3 py-2 text-[12px]">
            <option value="">Nincs kiválasztva</option>
            {processes.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>
      </div>
      <label className="mt-3 block text-[11px] font-semibold text-[var(--adm-text-muted)]">
        Saját szavaival (opcionális)
        <textarea
          rows={3}
          value={freeText}
          onChange={(e) => setFreeText(e.target.value)}
          placeholder="Írja le, mi nem működik jól…"
          className="adm-board-field mt-1 w-full px-3 py-2 text-[12px]"
        />
      </label>

      {error ? <p className="mt-2 text-[12px] text-[var(--adm-terracotta-700)]" role="alert">{error}</p> : null}
      {done ? <p className="mt-2 text-[12px] font-semibold text-[var(--adm-green-800)]" role="status">{done}</p> : null}

      <button
        type="button"
        disabled={busy}
        onClick={() => void submit()}
        className="mt-3 rounded-[var(--adm-radius-sm)] bg-[var(--adm-green-800)] px-4 py-2 text-[12px] font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2"
      >
        {busy ? "Rögzítés…" : "Bejelentés rögzítése"}
      </button>

      {intakes.length ? (
        <details className="mt-4 border-t border-[var(--adm-border)] pt-3">
          <summary className="cursor-pointer text-[11px] font-semibold text-[var(--adm-text-muted)]">Korábbi bejelentések ({intakes.length}) — forrás: strukturált intake</summary>
          <ul className="mt-2 space-y-1">
            {intakes.slice(0, 10).map((intake) => (
              <li key={intake.id} className="text-[11px] text-[var(--adm-text-muted)]">
                {new Date(intake.observedAt).toLocaleDateString("hu-HU")} ·{" "}
                {Array.isArray(intake.payload?.categoryLabelsHu) ? (intake.payload.categoryLabelsHu as string[]).join(", ") : "szabad szöveg"}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
