import { AdminStatusPill } from "@/components/adminiculum/ui";
import { PleadingSectionCard } from "./PleadingSectionCard";
import {
  type InsertedPleadingSection,
  type PleadingQualityChecklistKey,
  type PleadingSectionStatus,
} from "./pleadingAssemblyTypes";

type StatusSummary = Record<PleadingSectionStatus, number>;

type ChecklistSummary = {
  totalItems: number;
  completedItems: number;
  completeSections: number;
};

type ReviewSummary = {
  sectionsWithReviewNotes: number;
  sectionsWithOpenNextActions: number;
};

type PleadingSectionsOverviewPanelProps = {
  sections: InsertedPleadingSection[];
  statusSummary: StatusSummary;
  checklistSummary: ChecklistSummary;
  reviewSummary: ReviewSummary;
  onFocusEditor: () => void;
  onRemoveSection: (sectionId: string) => void;
  onStatusChange: (sectionId: string, status: PleadingSectionStatus) => void;
  onChecklistToggle: (sectionId: string, itemKey: PleadingQualityChecklistKey) => void;
  onReviewFieldChange: (sectionId: string, field: "reviewNote" | "nextAction", value: string) => void;
};

export function PleadingSectionsOverviewPanel({
  sections,
  statusSummary,
  checklistSummary,
  reviewSummary,
  onFocusEditor,
  onRemoveSection,
  onStatusChange,
  onChecklistToggle,
  onReviewFieldChange,
}: PleadingSectionsOverviewPanelProps) {
  return (
    <div className="rounded-[10px] border border-[#D8CFB6] bg-[#FFFDF8] p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#7B776D]">Beadványvázlat áttekintő</p>
          <h3 className="mt-1 font-serif text-[16px] font-medium text-[#1F2821]">Beadványrészek</h3>
        </div>
        <AdminStatusPill tone="gold">{sections.length} helyi rész</AdminStatusPill>
      </div>
      <div className="mt-3 rounded-[8px] border border-[#E7DECB] bg-white px-3 py-2">
        <p className="text-[11px] font-semibold text-[#514D45]">
          Összesen: {sections.length} · Hiányos: {statusSummary["Hiányos"]} · Szerkesztés alatt: {statusSummary["Szerkesztés alatt"]} · Ügyvédi ellenőrzésre kész:{" "}
          {statusSummary["Ügyvédi ellenőrzésre kész"]}
        </p>
        <p className="mt-1 text-[11px] font-semibold text-[#514D45]">
          Ellenőrzési pontok: {checklistSummary.completedItems}/{checklistSummary.totalItems} kész · {checklistSummary.completeSections} teljes beadványrész
        </p>
        <p className="mt-1 text-[11px] font-semibold text-[#514D45]">
          Ellenőrzési megjegyzés: {reviewSummary.sectionsWithReviewNotes} · Nyitott teendő: {reviewSummary.sectionsWithOpenNextActions}
        </p>
        <p className="mt-1 text-[11px] leading-5 text-[#7B776D]">
          Csak helyben követett státusz, ellenőrzőlista és megjegyzés · Nincs még adatbázisba mentve.
        </p>
      </div>
      {sections.length === 0 ? (
        <p className="mt-3 rounded-[8px] border border-dashed border-[#D8CFB6] bg-[#FBF9F3] px-3 py-2 text-[11px] leading-5 text-[#7B776D]">
          Még nincs külön beillesztett beadványrész. A forráskártyákon válaszd a „Beillesztés a beadványvázlatba” műveletet.
        </p>
      ) : (
        <div className="mt-3 space-y-2">
          {sections.map((section) => (
            <PleadingSectionCard
              key={section.id}
              section={section}
              onFocusEditor={onFocusEditor}
              onRemove={onRemoveSection}
              onStatusChange={onStatusChange}
              onChecklistToggle={onChecklistToggle}
              onReviewFieldChange={onReviewFieldChange}
            />
          ))}
          <p className="text-[11px] leading-5 text-[#7B776D]">
            Az eltávolítás az áttekintő helyi jelölését törli; a már szerkeszthető beadványszövegben lévő szöveget kézzel tudod módosítani.
          </p>
        </div>
      )}
    </div>
  );
}
