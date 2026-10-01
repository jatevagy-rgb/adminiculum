"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ApiError } from "@/lib/api";
import {
  createIntake,
  submitIntake,
  listMemberUnits,
  type CustomerIntake,
  type CustomerOrganizationUnit,
} from "@/lib/clientIntakeApi";
import {
  buildCreateIntakePayload,
  INTAKE_URGENCIES,
  intakeErrorMessage,
} from "@/lib/clientIntakeShared";
import { formatIntakeDate } from "./PortalIntakeSections";

export type IntakeStep = 1 | 2 | 3 | 4;

export const INTAKE_STEPS: ReadonlyArray<{ number: IntakeStep; label: string }> = [
  { number: 1, label: "Téma" },
  { number: 2, label: "Szervezeti terület" },
  { number: 3, label: "Leírás" },
  { number: 4, label: "Ellenőrzés" },
];

/**
 * Client Portal 3.0 new intake — the /portal/megkeresesek/uj ORGANIZATION body.
 * Implements the accepted 4-step wizard journey:
 * 1. Téma
 * 2. Szervezeti terület
 * 3. Leírás (including optional canonical urgency & requestedDeadline)
 * 4. Ellenőrzés és beküldés
 */
export function PortalNewIntakeV3() {
  const router = useRouter();

  // Wizard step
  const [currentStep, setCurrentStep] = useState<IntakeStep>(1);

  // Form values
  const [subject, setSubject] = useState("");
  const [unitId, setUnitId] = useState("");
  const [description, setDescription] = useState("");
  const [urgency, setUrgency] = useState("NORMAL");
  const [deadline, setDeadline] = useState("");

  // Organization units discovery
  const [units, setUnits] = useState<CustomerOrganizationUnit[]>([]);
  const [unitsLoading, setUnitsLoading] = useState(true);

  // Execution states
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draftSavedReference, setDraftSavedReference] = useState<string | null>(null);

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
      })
      .finally(() => {
        if (mounted) setUnitsLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const selectedUnit = useMemo(() => {
    return units.find((u) => u.id === unitId) || null;
  }, [units, unitId]);

  const urgencyLabel = useMemo(() => {
    const match = INTAKE_URGENCIES.find((u) => u.value === urgency);
    return match ? match.label : urgency;
  }, [urgency]);

  // Step progression validation
  const canAdvanceStep1 = subject.trim().length > 0;
  const canAdvanceStep2 = units.length > 0 && unitId.trim().length > 0;
  const canAdvanceStep3 = description.trim().length > 0;

  const handleCreate = async (shouldSubmitImmediately: boolean) => {
    if (!canAdvanceStep1 || !canAdvanceStep2 || !canAdvanceStep3 || busy) return;
    setBusy(true);
    setError(null);
    setDraftSavedReference(null);

    const payload = buildCreateIntakePayload({
      subject: subject.trim(),
      description: description.trim(),
      organizationGroupId: unitId || null,
      urgency,
      requestedDeadline: deadline || null,
    });

    let created: CustomerIntake;
    try {
      created = await createIntake(payload);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(intakeErrorMessage(err.code));
      } else {
        setError(intakeErrorMessage(undefined));
      }
      setBusy(false);
      return;
    }

    if (!shouldSubmitImmediately) {
      // "Piszkozat mentése": createIntake was executed, route to detail
      router.push(`/portal/megkeresesek/${encodeURIComponent(created.reference)}`);
      return;
    }

    // "Megkeresés beküldése": submit created draft
    try {
      await submitIntake(created.reference, null);
      router.push(`/portal/megkeresesek/${encodeURIComponent(created.reference)}`);
    } catch {
      // If create succeeds but submit fails: do not claim submission succeeded.
      // The draft exists, so preserve reference and inform the user truthfully.
      setDraftSavedReference(created.reference);
      setError(
        "A megkeresés piszkozata létrejött és elmentésre került, de a beküldés nem sikerült. Kérjük, nyissa meg a piszkozatot a beküldés újrapróbálásához."
      );
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6" data-testid="portal-new-intake-v3">
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
          Kérjük, adja meg a megkeresés adatait a 4 lépéses űrlapon. A megkeresés beküldése nem hoz létre közvetlenül ügyet; az iroda először áttekinti és visszajelez.
        </p>
      </div>

      {/* Accessible Compact Step Indicator */}
      <nav aria-label="Megkeresés készítésének lépései" data-testid="portal-intake-step-indicator">
        <ol className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:gap-3">
          {INTAKE_STEPS.map((step) => {
            const isCurrent = currentStep === step.number;
            const isCompleted = currentStep > step.number;

            return (
              <li key={step.number} className="sm:flex-1">
                <button
                  type="button"
                  onClick={() => {
                    if (isCompleted) setCurrentStep(step.number);
                  }}
                  disabled={!isCompleted && !isCurrent}
                  aria-current={isCurrent ? "step" : undefined}
                  className={`flex w-full items-center gap-2 rounded-[8px] border px-3 py-2 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-green)] ${
                    isCurrent
                      ? "border-[var(--adm-brand-green)] bg-[var(--adm-brand-green)]/10 text-[var(--adm-brand-green)] font-semibold"
                      : isCompleted
                      ? "border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] text-[var(--adm-text-primary)] hover:bg-[var(--adm-canvas-subtle)] cursor-pointer"
                      : "border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-subtle)] text-[var(--adm-text-secondary)] opacity-60 cursor-not-allowed"
                  }`}
                >
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-[4px] text-xs font-bold ${
                      isCurrent
                        ? "bg-[var(--adm-brand-green)] text-[var(--adm-canvas-white)]"
                        : isCompleted
                        ? "bg-[var(--adm-canvas-subtle)] text-[var(--adm-text-primary)] border border-[var(--adm-border-canonical)]"
                        : "bg-[var(--adm-canvas-white)] text-[var(--adm-text-secondary)] border border-[var(--adm-border-canonical)]"
                    }`}
                  >
                    {step.number}
                  </span>
                  <span className="truncate">{step.label}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      {/* Wizard Form Container */}
      <div className="rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] p-6">
        {/* STEP 1: TÉMA */}
        {currentStep === 1 ? (
          <section data-testid="portal-new-intake-step-1" className="space-y-4">
            <div>
              <h2 className="font-serif text-lg font-semibold text-[var(--adm-text-primary)]">
                1. Téma
              </h2>
              <p className="mt-1 text-xs text-[var(--adm-text-secondary)]">
                Adja meg a megkeresés rövid, azonosításra alkalmas címét vagy témáját.
              </p>
            </div>

            <label className="block text-sm">
              <span className="font-medium text-[var(--adm-text-primary)]">Tárgy *</span>
              <input
                type="text"
                data-testid="portal-new-intake-subject-input"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                maxLength={240}
                placeholder="Rövid, összefoglaló cím"
                disabled={busy}
                className="mt-1.5 h-10 w-full rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] px-3 text-sm text-[var(--adm-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-green)] disabled:opacity-50"
              />
            </label>

            <div className="flex items-center justify-between pt-2">
              <Link
                href="/portal/megkeresesek"
                className="inline-flex h-10 items-center justify-center rounded-[8px] px-3 text-sm text-[var(--adm-text-secondary)] hover:text-[var(--adm-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-green)]"
              >
                Mégse
              </Link>
              <button
                type="button"
                data-testid="portal-new-intake-next-1"
                disabled={!canAdvanceStep1}
                onClick={() => setCurrentStep(2)}
                className="inline-flex h-10 items-center justify-center rounded-[8px] border border-[var(--adm-brand-green)] bg-[var(--adm-brand-green)] px-4 text-sm font-medium text-[var(--adm-canvas-white)] transition-colors hover:border-[var(--adm-brand-deep)] hover:bg-[var(--adm-brand-deep)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-green)] focus-visible:ring-offset-2 disabled:opacity-40"
              >
                Tovább: Szervezeti terület →
              </button>
            </div>
          </section>
        ) : null}

        {/* STEP 2: SZERVEZETI TERÜLET */}
        {currentStep === 2 ? (
          <section data-testid="portal-new-intake-step-2" className="space-y-4">
            <div>
              <h2 className="font-serif text-lg font-semibold text-[var(--adm-text-primary)]">
                2. Szervezeti terület
              </h2>
              <p className="mt-1 text-xs text-[var(--adm-text-secondary)]">
                Válassza ki, melyik szervezeti egység nevében indítja a megkeresést.
              </p>
            </div>

            {unitsLoading ? (
              <p className="text-sm text-[var(--adm-text-secondary)]">Szervezeti egységek betöltése…</p>
            ) : units.length === 0 ? (
              <div
                role="status"
                data-testid="portal-new-intake-no-units-alert"
                className="rounded-[8px] border border-[var(--adm-brand-terracotta)]/30 bg-[var(--adm-brand-terracotta)]/10 p-4 text-sm text-[var(--adm-brand-terracotta)]"
              >
                <p className="font-medium">Nincs elérhető szervezeti egység</p>
                <p className="mt-1 text-xs leading-relaxed">
                  Ehhez a művelethez még nincs szervezeti egységhez rendelve. A megkeresés elküldéséhez előbb szervezeti egységhez tartozó tagság szükséges. Kérjük, jelezze a szervezeti adminisztrátornak vagy kapcsolattartójának.
                </p>
              </div>
            ) : units.length === 1 ? (
              <div className="rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-subtle)] p-4 text-sm">
                <span className="font-medium text-[var(--adm-text-secondary)]">Kijelölt szervezeti egység:</span>
                <p className="mt-1 font-semibold text-[var(--adm-text-primary)]">{units[0].name}</p>
                <input type="hidden" value={unitId} />
              </div>
            ) : (
              <label className="block text-sm">
                <span className="font-medium text-[var(--adm-text-primary)]">Szervezeti egység *</span>
                <select
                  data-testid="portal-new-intake-unit-select"
                  value={unitId}
                  onChange={(e) => setUnitId(e.target.value)}
                  disabled={busy}
                  className="mt-1.5 h-10 w-full rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] px-3 text-sm text-[var(--adm-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-green)] disabled:opacity-50"
                >
                  <option value="">— Válasszon szervezeti egységet —</option>
                  {units.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.name}
                    </option>
                  ))}
                </select>
                {!unitId && (
                  <span className="mt-1 block text-xs text-[var(--adm-brand-terracotta)]">
                    A továbblépéshez válasszon szervezeti egységet.
                  </span>
                )}
              </label>
            )}

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => setCurrentStep(1)}
                className="inline-flex h-10 items-center justify-center rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] px-4 text-sm font-medium text-[var(--adm-text-primary)] hover:bg-[var(--adm-canvas-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-green)]"
              >
                ← Vissza: Téma
              </button>
              <button
                type="button"
                data-testid="portal-new-intake-next-2"
                disabled={!canAdvanceStep2}
                onClick={() => setCurrentStep(3)}
                className="inline-flex h-10 items-center justify-center rounded-[8px] border border-[var(--adm-brand-green)] bg-[var(--adm-brand-green)] px-4 text-sm font-medium text-[var(--adm-canvas-white)] transition-colors hover:border-[var(--adm-brand-deep)] hover:bg-[var(--adm-brand-deep)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-green)] focus-visible:ring-offset-2 disabled:opacity-40"
              >
                Tovább: Leírás →
              </button>
            </div>
          </section>
        ) : null}

        {/* STEP 3: LEÍRÁS & OPCIONÁLIS BEÁLLÍTÁSOK */}
        {currentStep === 3 ? (
          <section data-testid="portal-new-intake-step-3" className="space-y-4">
            <div>
              <h2 className="font-serif text-lg font-semibold text-[var(--adm-text-primary)]">
                3. Leírás
              </h2>
              <p className="mt-1 text-xs text-[var(--adm-text-secondary)]">
                Részletezze a helyzetet és az iroda felé megfogalmazott kérdést vagy igényt.
              </p>
            </div>

            <label className="block text-sm">
              <span className="font-medium text-[var(--adm-text-primary)]">Leírás *</span>
              <textarea
                data-testid="portal-new-intake-description-input"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={6000}
                rows={6}
                placeholder="Részletezze a helyzetet és a felmerült kérdést vagy igényt…"
                disabled={busy}
                className="mt-1.5 w-full rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] p-3 text-sm text-[var(--adm-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-green)] disabled:opacity-50"
              />
            </label>

            {/* Restrained optional subsection for canonical urgency and deadline */}
            <details className="rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-subtle)] p-3 text-sm">
              <summary className="cursor-pointer font-medium text-[var(--adm-text-primary)] hover:text-[var(--adm-brand-green)]">
                További beállítások (opcionális)
              </summary>
              <div className="mt-3 grid gap-4 border-t border-[var(--adm-border-canonical)] pt-3 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className="font-medium text-[var(--adm-text-primary)]">Sürgősség</span>
                  <select
                    data-testid="portal-new-intake-urgency-select"
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

                <label className="block text-sm">
                  <span className="font-medium text-[var(--adm-text-primary)]">Kért határidő</span>
                  <input
                    type="date"
                    data-testid="portal-new-intake-deadline-input"
                    value={deadline}
                    onChange={(e) => setDeadline(e.target.value)}
                    disabled={busy}
                    className="mt-1.5 h-10 w-full rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] px-3 text-sm text-[var(--adm-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-green)] disabled:opacity-50"
                  />
                </label>
              </div>
            </details>

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => setCurrentStep(2)}
                className="inline-flex h-10 items-center justify-center rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] px-4 text-sm font-medium text-[var(--adm-text-primary)] hover:bg-[var(--adm-canvas-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-green)]"
              >
                ← Vissza: Terület
              </button>
              <button
                type="button"
                data-testid="portal-new-intake-next-3"
                disabled={!canAdvanceStep3}
                onClick={() => setCurrentStep(4)}
                className="inline-flex h-10 items-center justify-center rounded-[8px] border border-[var(--adm-brand-green)] bg-[var(--adm-brand-green)] px-4 text-sm font-medium text-[var(--adm-canvas-white)] transition-colors hover:border-[var(--adm-brand-deep)] hover:bg-[var(--adm-brand-deep)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-green)] focus-visible:ring-offset-2 disabled:opacity-40"
              >
                Tovább: Ellenőrzés →
              </button>
            </div>
          </section>
        ) : null}

        {/* STEP 4: ELLENŐRZÉS ÉS BEKÜLDÉS */}
        {currentStep === 4 ? (
          <section data-testid="portal-new-intake-step-4" className="space-y-5">
            <div>
              <h2 className="font-serif text-lg font-semibold text-[var(--adm-text-primary)]">
                4. Ellenőrzés és beküldés
              </h2>
              <p className="mt-1 text-xs text-[var(--adm-text-secondary)]">
                Kérjük, ellenőrizze az adatokat beküldés vagy piszkozatként történő mentés előtt.
              </p>
            </div>

            {/* Read-only Review Summary */}
            <div
              data-testid="portal-new-intake-review"
              className="rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-subtle)] p-5"
            >
              <dl className="grid gap-4 sm:grid-cols-2">
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wider text-[var(--adm-text-secondary)]">
                    Téma
                  </dt>
                  <dd data-testid="portal-review-subject" className="mt-1 text-sm font-semibold text-[var(--adm-text-primary)]">
                    {subject}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wider text-[var(--adm-text-secondary)]">
                    Szervezeti terület
                  </dt>
                  <dd data-testid="portal-review-unit" className="mt-1 text-sm font-medium text-[var(--adm-text-primary)]">
                    {selectedUnit ? selectedUnit.name : "Nincs megadva"}
                  </dd>
                </div>
                {urgency ? (
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wider text-[var(--adm-text-secondary)]">
                      Sürgősség
                    </dt>
                    <dd data-testid="portal-review-urgency" className="mt-1 text-sm font-medium text-[var(--adm-text-primary)]">
                      {urgencyLabel}
                    </dd>
                  </div>
                ) : null}
                {deadline ? (
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wider text-[var(--adm-text-secondary)]">
                      Kért határidő
                    </dt>
                    <dd data-testid="portal-review-deadline" className="mt-1 text-sm font-medium text-[var(--adm-text-primary)]">
                      {formatIntakeDate(deadline) || deadline}
                    </dd>
                  </div>
                ) : null}
                <div className="sm:col-span-2 border-t border-[var(--adm-border-canonical)] pt-3">
                  <dt className="text-xs font-semibold uppercase tracking-wider text-[var(--adm-text-secondary)]">
                    Leírás
                  </dt>
                  <dd data-testid="portal-review-description" className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-[var(--adm-text-primary)]">
                    {description}
                  </dd>
                </div>
              </dl>
            </div>

            {error ? (
              <div
                role="alert"
                data-testid="portal-new-intake-error"
                className="rounded-[8px] border border-[var(--adm-brand-terracotta)]/30 bg-[var(--adm-brand-terracotta)]/10 p-3 text-sm text-[var(--adm-brand-terracotta)]"
              >
                <p>{error}</p>
                {draftSavedReference ? (
                  <div className="mt-2">
                    <Link
                      href={`/portal/megkeresesek/${encodeURIComponent(draftSavedReference)}`}
                      className="font-semibold underline hover:no-underline"
                    >
                      Ugrás az elmentett piszkozathoz →
                    </Link>
                  </div>
                ) : null}
              </div>
            ) : null}

            {/* Actions: Direct Submit & Save Draft */}
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleCreate(true)}
                data-testid="portal-new-intake-submit-btn"
                className="inline-flex h-10 items-center justify-center rounded-[8px] border border-[var(--adm-brand-green)] bg-[var(--adm-brand-green)] px-4 text-sm font-medium text-[var(--adm-canvas-white)] transition-colors hover:border-[var(--adm-brand-deep)] hover:bg-[var(--adm-brand-deep)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-green)] focus-visible:ring-offset-2 disabled:opacity-50 motion-reduce:transition-none"
              >
                {busy ? "Beküldés folyamatban…" : "Megkeresés beküldése"}
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={() => void handleCreate(false)}
                data-testid="portal-new-intake-save-draft-btn"
                className="inline-flex h-10 items-center justify-center rounded-[8px] border border-[var(--adm-border-canonical)] bg-[var(--adm-canvas-white)] px-4 text-sm font-medium text-[var(--adm-text-primary)] transition-colors hover:bg-[var(--adm-canvas-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-green)] focus-visible:ring-offset-2 disabled:opacity-50 motion-reduce:transition-none"
              >
                Piszkozat mentése
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={() => setCurrentStep(3)}
                className="inline-flex h-10 items-center justify-center rounded-[8px] px-3 text-sm text-[var(--adm-text-secondary)] hover:text-[var(--adm-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--adm-brand-green)]"
              >
                ← Vissza a szerkesztéshez
              </button>
            </div>

            <p className="text-xs text-[var(--adm-text-secondary)]">
              A beküldést követően az iroda dolgozza fel a megkeresést. Szükség esetén az iroda további információt kérhet a portálon.
            </p>
          </section>
        ) : null}
      </div>
    </div>
  );
}
