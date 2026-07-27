"use client";

/**
 * Explicit comparison lifecycle states (STRUCTURED-DOC-COMPARISON-1, Phase 11).
 * Each backend state has a distinct, truthful presentation — an identical
 * comparison is never shown as an error, and an unsupported format never claims
 * "no differences".
 */
import { AdminButton } from "@/components/adminiculum/ui";

const box = "rounded-lg border border-[var(--adm-border)] bg-white px-4 py-6 text-center";

export function ComparisonEmptyState({ onCreate, canCreate }: { onCreate: () => void; canCreate: boolean }) {
  return (
    <div data-testid="cmp-empty" className={box}>
      <h3 className="font-serif text-[17px] font-semibold text-[var(--adm-text)]">Nincs még összehasonlítás</h3>
      <p className="mx-auto mt-1 max-w-md text-[12.5px] text-[var(--adm-text-muted)]">
        Válaszd ki az alap- és a cél-verziót, majd indítsd el a strukturált összehasonlítást. Csak változtathatatlan verziók hasonlíthatók össze.
      </p>
      <div className="mt-4">
        <AdminButton variant="primary" size="sm" onClick={onCreate} disabled={!canCreate} data-testid="cmp-create">
          Összehasonlítás indítása
        </AdminButton>
      </div>
    </div>
  );
}

export function ComparisonProcessingState({ status }: { status: "PENDING" | "PROCESSING" }) {
  return (
    <div data-testid="cmp-processing" className={`${box} animate-pulse`} aria-busy="true">
      <h3 className="font-serif text-[17px] font-semibold text-[var(--adm-text)]">
        {status === "PENDING" ? "Előkészítés…" : "Feldolgozás…"}
      </h3>
      <p className="mt-1 text-[12.5px] text-[var(--adm-text-muted)]">Az összehasonlítás készül. Ez néhány másodpercet vehet igénybe.</p>
    </div>
  );
}

export function ComparisonIdenticalState({ baseLabel, targetLabel }: { baseLabel: string; targetLabel: string }) {
  return (
    <div data-testid="cmp-identical" className={box}>
      <h3 className="font-serif text-[17px] font-semibold text-[var(--adm-text)]">Nincs tartalmi eltérés</h3>
      <p className="mt-1 text-[12.5px] text-[var(--adm-text-muted)]">
        A(z) {baseLabel} és a(z) {targetLabel} verzió szövege azonos. (Nem hiba: a két verzió tartalmilag megegyezik.)
      </p>
    </div>
  );
}

export function ComparisonUnsupportedState({ reasonCode, onDownload }: { reasonCode: string | null; onDownload?: () => void }) {
  return (
    <div data-testid="cmp-unsupported" className={box}>
      <h3 className="font-serif text-[17px] font-semibold text-[var(--adm-text)]">Nem összehasonlítható</h3>
      <p className="mx-auto mt-1 max-w-md text-[12.5px] text-[var(--adm-text-muted)]">
        Ehhez a formátumhoz nincs hiteles kinyert szöveg (jelenleg csak TXT hasonlítható össze). A dokumentum letölthető és a verziók elérhetők.
        {reasonCode ? ` (${reasonCode})` : ""}
      </p>
      {onDownload ? <div className="mt-4"><AdminButton variant="neutral" size="sm" onClick={onDownload}>Letöltés</AdminButton></div> : null}
    </div>
  );
}

export function ComparisonFailedState({ message, onRetry, canRetry }: { message: string | null; onRetry: () => void; canRetry: boolean }) {
  return (
    <div role="alert" data-testid="cmp-failed" className={box}>
      <h3 className="font-serif text-[17px] font-semibold text-[var(--adm-terracotta-700)]">Az összehasonlítás sikertelen</h3>
      <p className="mx-auto mt-1 max-w-md text-[12.5px] text-[var(--adm-text-muted)]">{message || "Az összehasonlítás nem készült el."}</p>
      {canRetry ? <div className="mt-4"><AdminButton variant="neutral" size="sm" onClick={onRetry} data-testid="cmp-retry">Újrapróbálkozás</AdminButton></div> : null}
    </div>
  );
}

export function ComparisonAuthorizationState() {
  return (
    <div role="alert" data-testid="cmp-authz" className={box}>
      <h3 className="font-serif text-[17px] font-semibold text-[var(--adm-text)]">Nincs hozzáférés</h3>
      <p className="mt-1 text-[12.5px] text-[var(--adm-text-muted)]">Ehhez az összehasonlításhoz nincs jogosultságod.</p>
    </div>
  );
}
