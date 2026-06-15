import { AdminBadge, AdminButton, AdminStatusPill } from "@/components/adminiculum/ui";
import {
  countCompletedChecklistItems,
  pleadingQualityChecklistOptions,
  pleadingSectionStatusTone,
  type InsertedPleadingSection,
} from "./pleadingAssemblyTypes";

type PleadingPreviewReadiness = {
  readySections: InsertedPleadingSection[];
  incompleteSections: InsertedPleadingSection[];
  totalSections: number;
  readinessPercent: number;
  previewText: string;
};

type PleadingPreviewPanelProps = {
  readiness: PleadingPreviewReadiness;
  copyState: "idle" | "success" | "error";
  onCopyPreview: () => void;
};

export function PleadingPreviewPanel({ readiness, copyState, onCopyPreview }: PleadingPreviewPanelProps) {
  return (
    <div className="rounded-[10px] border border-[#D8CFB6] bg-white p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#7B776D]">Beadvány előnézet</p>
          <h3 className="mt-1 font-serif text-[16px] font-medium text-[#1F2821]">Véglegesítés előtti áttekintés</h3>
        </div>
        <AdminStatusPill tone={readiness.readySections.length ? "green" : "gold"}>
          {readiness.readySections.length}/{readiness.totalSections} szakasz kész
        </AdminStatusPill>
      </div>
      <div className="mt-3 grid gap-2 rounded-[8px] border border-[#E7DECB] bg-[#FCFAF4] px-3 py-2 text-[11px] text-[#514D45]">
        <p className="font-semibold">
          Kész: {readiness.readySections.length} · Még szerkesztendő: {readiness.incompleteSections.length} · Készenlét: {readiness.readinessPercent}%
        </p>
        <p className="leading-5 text-[#7B776D]">
          Ez nem végleges beadvány, hanem helyi előnézeti ellenőrzés. A teljes szerkeszthető beadványszöveg továbbra is az editorban van. Nincs még
          adatbázisba mentve.
        </p>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <div className="rounded-[8px] border border-[#E7DECB] bg-[#FFFDF8] p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#7B776D]">Kész szakaszok</p>
            <AdminBadge tone="green">{readiness.readySections.length} kész</AdminBadge>
          </div>
          {readiness.readySections.length === 0 ? (
            <p className="mt-2 rounded-[8px] border border-dashed border-[#D8CFB6] bg-white px-3 py-2 text-[11px] leading-5 text-[#7B776D]">
              Még nincs teljesen ellenőrzött beadványrész.
            </p>
          ) : (
            <div className="mt-2 space-y-2">
              {readiness.readySections.map((section) => (
                <div key={section.id} className="rounded-[7px] border border-[#D8E3D2] bg-white px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <AdminBadge tone="green">Ügyvédi ellenőrzésre kész</AdminBadge>
                    <AdminBadge tone="neutral">{section.sourceLabel}</AdminBadge>
                    {section.nextAction.trim() ? <AdminBadge tone="gold">Nyitott teendő</AdminBadge> : null}
                  </div>
                  <p className="mt-1 font-serif text-[13px] font-medium text-[#1F2821]">{section.title}</p>
                  {section.nextAction.trim() ? <p className="mt-1 text-[11px] leading-5 text-[#8E6A1B]">Van még rögzített teendő ennél a szakasznál.</p> : null}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-[8px] border border-[#E7DECB] bg-[#FFFDF8] p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#7B776D]">Még szerkesztendő szakaszok</p>
            <AdminBadge tone="gold">{readiness.incompleteSections.length} nyitott</AdminBadge>
          </div>
          {readiness.incompleteSections.length === 0 ? (
            <p className="mt-2 rounded-[8px] border border-dashed border-[#D8CFB6] bg-white px-3 py-2 text-[11px] leading-5 text-[#7B776D]">
              {readiness.totalSections === 0 ? "Még nincs beillesztett beadványrész." : "Minden beillesztett szakasz teljes ellenőrzést kapott."}
            </p>
          ) : (
            <div className="mt-2 space-y-2">
              {readiness.incompleteSections.map((section) => {
                const completedChecklistItems = countCompletedChecklistItems(section.qualityChecklist);
                const readyStatusHasMissingItems = section.status === "Ügyvédi ellenőrzésre kész";

                return (
                  <div key={section.id} className="rounded-[7px] border border-[#E7DECB] bg-white px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <AdminBadge tone={pleadingSectionStatusTone[section.status]}>{section.status}</AdminBadge>
                      <AdminBadge tone="neutral">
                        {completedChecklistItems}/{pleadingQualityChecklistOptions.length} ellenőrzési pont
                      </AdminBadge>
                      {section.nextAction.trim() ? <AdminBadge tone="gold">Nyitott teendő</AdminBadge> : null}
                    </div>
                    <p className="mt-1 font-serif text-[13px] font-medium text-[#1F2821]">{section.title}</p>
                    {readyStatusHasMissingItems ? <p className="mt-1 text-[11px] leading-5 text-[#8E6A1B]">Ellenőrzési pont hiányzik.</p> : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 rounded-[8px] border border-[#E7DECB] bg-[#FBF9F3] p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#7B776D]">Helyi előnézet</p>
            <p className="mt-1 text-[11px] leading-5 text-[#7B776D]">Nem végleges beadvány; nem helyettesíti a mentést vagy exportot.</p>
          </div>
          <AdminButton variant="neutral" size="sm" onClick={onCopyPreview}>
            Másolás előnézetként
          </AdminButton>
        </div>
        <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap rounded-[8px] border border-[#E7DECB] bg-white p-3 text-[11px] leading-5 text-[#514D45]">
          {readiness.previewText}
        </pre>
        {copyState === "success" ? <p className="mt-2 text-[11px] text-[#3F6B35]">Az előnézet vágólapra másolva.</p> : null}
        {copyState === "error" ? <p className="mt-2 text-[11px] text-[#8B2A2A]">A vágólapra másolás nem sikerült ebben a böngészőkörnyezetben.</p> : null}
      </div>
    </div>
  );
}
