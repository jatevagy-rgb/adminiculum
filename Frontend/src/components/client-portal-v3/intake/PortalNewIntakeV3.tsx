"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import {
  createIntake,
  submitIntake,
  listMemberUnits,
  type CustomerOrganizationUnit,
} from "@/lib/clientIntakeApi";
import {
  buildCreateIntakePayload,
  INTAKE_URGENCIES,
  intakeErrorMessage,
} from "@/lib/clientIntakeShared";

/**
 * Client Portal 3.0 new intake — the /portal/megkeresesek/uj ORGANIZATION body.
 * Allows drafting or directly submitting customer inquiries with organizational
 * unit binding.
 */
export function PortalNewIntakeV3() {
  const router = useRouter();
  const [units, setUnits] = useState<CustomerOrganizationUnit[]>([]);
  const [unitId, setUnitId] = useState("");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [urgency, setUrgency] = useState("NORMAL");
  const [deadline, setDeadline] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    void listMemberUnits()
      .then((res) => {
        if (!mounted) return;
        const items = res.items || [];
        setUnits(items);
        if (items.length === 1) {
          setUnitId(items[0].id);
        }
      })
      .catch(() => {
        if (mounted) setUnits([]);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const canSubmit = subject.trim().length > 0 && description.trim().length > 0 && !busy;

  const handleCreate = async (shouldSubmitImmediately: boolean) => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);

    try {
      const payload = buildCreateIntakePayload({
        subject: subject.trim(),
        description: description.trim(),
        organizationGroupId: unitId || null,
        urgency,
        requestedDeadline: deadline || null,
      });

      const created = await createIntake(payload);

      if (shouldSubmitImmediately) {
        try {
          await submitIntake(created.reference, null);
        } catch {
          // If submit failed, redirect to detail page where draft is preserved
          router.push(`/portal/megkeresesek/${encodeURIComponent(created.reference)}`);
          return;
        }
      }

      router.push(`/portal/megkeresesek/${encodeURIComponent(created.reference)}`);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(intakeErrorMessage(err.code));
      } else {
        setError(intakeErrorMessage(undefined));
      }
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5" data-testid="portal-new-intake-v3">
      <div>
        <Link
          href="/portal/megkeresesek"
          className="inline-flex text-sm text-[var(--adm-text-secondary)] hover:text-[var(--adm-text-primary)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-green)]"
        >
          ← Vissza a megkeresésekhez
        </Link>
        <h1 className="mt-2 font-serif text-2xl font-semibold tracking-tight text-[var(--adm-text-primary)] sm:text-3xl">
          Új megkeresés
        </h1>
        <p className="mt-1 text-sm text-[var(--adm-text-secondary)]">
          Írja le röviden, miben kéri az iroda segítségét. A megkeresés elküldése még nem hoz létre új ügyet; az iroda először áttekinti, majd visszajelez.
        </p>
      </div>

      <div className="rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] p-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleCreate(true);
          }}
          className="space-y-4"
        >
          <label className="block text-sm">
            <span className="font-medium text-[var(--adm-text-primary)]">Tárgy *</span>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={240}
              placeholder="Rövid, összefoglaló cím"
              disabled={busy}
              className="mt-1.5 h-10 w-full rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] px-3 text-sm text-[var(--adm-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-green)] disabled:opacity-50"
            />
          </label>

          <label className="block text-sm">
            <span className="font-medium text-[var(--adm-text-primary)]">Leírás *</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={6000}
              rows={5}
              placeholder="Részletezze a helyzetet és a felmerült kérdést vagy igényt…"
              disabled={busy}
              className="mt-1.5 w-full rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] p-3 text-sm text-[var(--adm-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-green)] disabled:opacity-50"
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="font-medium text-[var(--adm-text-primary)]">Szervezeti egység</span>
              <select
                value={unitId}
                onChange={(e) => setUnitId(e.target.value)}
                disabled={busy || units.length <= 1}
                className="mt-1.5 h-10 w-full rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] px-3 text-sm text-[var(--adm-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-green)] disabled:opacity-50"
              >
                {units.length === 0 ? (
                  <option value="">Nincs elérhető szervezeti egység</option>
                ) : units.length === 1 ? (
                  <option value={units[0].id}>{units[0].name}</option>
                ) : (
                  <>
                    <option value="">— Válasszon szervezeti egységet —</option>
                    {units.map((unit) => (
                      <option key={unit.id} value={unit.id}>
                        {unit.name}
                      </option>
                    ))}
                  </>
                )}
              </select>
            </label>

            <label className="block text-sm">
              <span className="font-medium text-[var(--adm-text-primary)]">Sürgősség</span>
              <select
                value={urgency}
                onChange={(e) => setUrgency(e.target.value)}
                disabled={busy}
                className="mt-1.5 h-10 w-full rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] px-3 text-sm text-[var(--adm-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-green)] disabled:opacity-50"
              >
                {INTAKE_URGENCIES.map((u) => (
                  <option key={u.value} value={u.value}>
                    {u.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="block text-sm">
            <span className="font-medium text-[var(--adm-text-primary)]">Kért határidő</span>
            <input
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              disabled={busy}
              className="mt-1.5 h-10 w-full rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] px-3 text-sm text-[var(--adm-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-green)] disabled:opacity-50 sm:w-64"
            />
          </label>

          {error ? (
            <div
              role="alert"
              className="rounded-[8px] border border-[var(--adm-brand-terracotta)]/30 bg-[var(--adm-brand-terracotta)]/10 p-3 text-sm text-[var(--adm-brand-terracotta)]"
            >
              {error}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="button"
              disabled={!canSubmit}
              onClick={() => void handleCreate(true)}
              data-testid="portal-new-intake-submit-btn"
              className="inline-flex h-10 items-center justify-center rounded-[8px] border border-[var(--adm-brand-green)] bg-[var(--adm-brand-green)] px-4 text-sm font-medium text-[var(--adm-canvas-white)] transition-colors hover:border-[var(--adm-brand-deep)] hover:bg-[var(--adm-brand-deep)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-green)] focus-visible:ring-offset-2 disabled:opacity-50 motion-reduce:transition-none"
            >
              {busy ? "Beküldés folyamatban…" : "Megkeresés beküldése"}
            </button>

            <button
              type="button"
              disabled={!canSubmit}
              onClick={() => void handleCreate(false)}
              data-testid="portal-new-intake-save-draft-btn"
              className="inline-flex h-10 items-center justify-center rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] px-4 text-sm font-medium text-[var(--adm-text-primary)] transition-colors hover:bg-[var(--adm-canvas-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-green)] focus-visible:ring-offset-2 disabled:opacity-50 motion-reduce:transition-none"
            >
              Piszkozat mentése
            </button>

            <Link
              href="/portal/megkeresesek"
              className="inline-flex h-10 items-center justify-center rounded-[8px] px-4 text-sm text-[var(--adm-text-secondary)] hover:text-[var(--adm-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-green)]"
            >
              Mégse
            </Link>
          </div>

          <p className="text-xs text-[var(--adm-text-secondary)]">
            A beküldést követően a megkeresést az iroda dolgozza fel. Szükség esetén az iroda további információt kérhet a megadott felületen.
          </p>
        </form>
      </div>
    </div>
  );
}
