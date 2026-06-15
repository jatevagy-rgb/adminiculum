import { AdminBadge, AdminButton } from "@/components/adminiculum/ui";
import {
  countCompletedChecklistItems,
  pleadingQualityChecklistOptions,
  pleadingSectionStatusOptions,
  pleadingSectionStatusTone,
  type InsertedPleadingSection,
  type PleadingQualityChecklistKey,
  type PleadingSectionStatus,
} from "./pleadingAssemblyTypes";

type PleadingSectionCardProps = {
  section: InsertedPleadingSection;
  onFocusEditor: () => void;
  onRemove: (sectionId: string) => void;
  onStatusChange: (sectionId: string, status: PleadingSectionStatus) => void;
  onChecklistToggle: (sectionId: string, itemKey: PleadingQualityChecklistKey) => void;
  onReviewFieldChange: (sectionId: string, field: "reviewNote" | "nextAction", value: string) => void;
};

export function PleadingSectionCard({
  section,
  onFocusEditor,
  onRemove,
  onStatusChange,
  onChecklistToggle,
  onReviewFieldChange,
}: PleadingSectionCardProps) {
  const completedChecklistItems = countCompletedChecklistItems(section.qualityChecklist);
  const isChecklistComplete = completedChecklistItems === pleadingQualityChecklistOptions.length;
  const readyStatusHasMissingItems = section.status === "Ügyvédi ellenőrzésre kész" && !isChecklistComplete;
  const readyStatusHasOpenNextAction = section.status === "Ügyvédi ellenőrzésre kész" && Boolean(section.nextAction.trim());

  return (
    <div className="rounded-[8px] border border-[#E7DECB] bg-white px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <AdminBadge tone="gold">Helyi vázlat</AdminBadge>
        <AdminBadge tone="neutral">{section.sourceLabel}</AdminBadge>
        <AdminBadge tone={pleadingSectionStatusTone[section.status]}>{section.status}</AdminBadge>
        {isChecklistComplete ? <AdminBadge tone="green">Ellenőrzési pontok kész</AdminBadge> : null}
      </div>
      <p className="mt-2 font-serif text-[14px] font-medium text-[#1F2821]">{section.title}</p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {pleadingSectionStatusOptions.map((option) => {
          const isActiveStatus = section.status === option.status;

          return (
            <button
              key={option.status}
              type="button"
              aria-pressed={isActiveStatus}
              onClick={() => onStatusChange(section.id, option.status)}
              className={`rounded-full border px-2.5 py-1 text-[10.5px] font-semibold transition ${
                isActiveStatus
                  ? "border-[#B58A2A] bg-[#B58A2A] text-white shadow-sm"
                  : "border-[#D8CFB6] bg-[#FFFDF8] text-[#514D45] hover:border-[#B58A2A] hover:text-[#8E6A1B]"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      <div className="mt-3 rounded-[8px] border border-[#E7DECB] bg-[#FCFAF4] px-3 py-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#7B776D]">Beadványrész ellenőrzése</p>
          <AdminBadge tone={isChecklistComplete ? "green" : "neutral"}>
            {completedChecklistItems}/{pleadingQualityChecklistOptions.length} ellenőrzési pont kész
          </AdminBadge>
        </div>
        <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
          {pleadingQualityChecklistOptions.map((item) => (
            <label
              key={item.key}
              className="flex cursor-pointer items-center gap-2 rounded-[6px] border border-[#E7DECB] bg-white px-2.5 py-1.5 text-[11px] font-medium text-[#514D45]"
            >
              <input
                type="checkbox"
                checked={section.qualityChecklist[item.key]}
                onChange={() => onChecklistToggle(section.id, item.key)}
                className="h-3.5 w-3.5 rounded border-[#D8CFB6] accent-[#123B27]"
              />
              <span>{item.label}</span>
            </label>
          ))}
        </div>
        {isChecklistComplete ? (
          <p className="mt-2 text-[11px] leading-5 text-[#3F6B35]">Az ellenőrzőlista teljes; a rész alkalmas lehet ügyvédi ellenőrzésre.</p>
        ) : null}
        {readyStatusHasMissingItems ? <p className="mt-2 text-[11px] leading-5 text-[#8E6A1B]">A státusz kész, de még hiányzik ellenőrzési pont.</p> : null}
        <p className="mt-1 text-[10.5px] leading-5 text-[#7B776D]">Csak helyben követett ellenőrzőlista · Nincs még adatbázisba mentve.</p>
      </div>
      <div className="mt-3 rounded-[8px] border border-[#E7DECB] bg-white px-3 py-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#7B776D]">Ellenőrzési megjegyzés</p>
          {section.nextAction.trim() ? <AdminBadge tone="gold">Nyitott teendő</AdminBadge> : <AdminBadge tone="neutral">Helyi megjegyzés</AdminBadge>}
        </div>
        <div className="mt-2 grid gap-2 md:grid-cols-2">
          <label className="grid gap-1 text-[11px] font-semibold text-[#514D45]">
            Ügyvédi megjegyzés
            <textarea
              value={section.reviewNote}
              onChange={(event) => onReviewFieldChange(section.id, "reviewNote", event.target.value)}
              rows={2}
              placeholder="Pl. bizonyíték pontosítása, jogalap ellenőrzése…"
              className="rounded border border-[#DDD7CA] bg-[#FFFDF8] px-2.5 py-2 text-[11px] font-normal leading-5 text-[#1F2821]"
            />
          </label>
          <label className="grid gap-1 text-[11px] font-semibold text-[#514D45]">
            Következő teendő
            <textarea
              value={section.nextAction}
              onChange={(event) => onReviewFieldChange(section.id, "nextAction", event.target.value)}
              rows={2}
              placeholder="Pl. csatolandó irat bekérése, tényállás pontosítása…"
              className="rounded border border-[#DDD7CA] bg-[#FFFDF8] px-2.5 py-2 text-[11px] font-normal leading-5 text-[#1F2821]"
            />
          </label>
        </div>
        {readyStatusHasOpenNextAction ? <p className="mt-2 text-[11px] leading-5 text-[#8E6A1B]">Van még rögzített teendő ennél a szakasznál.</p> : null}
        <p className="mt-1 text-[10.5px] leading-5 text-[#7B776D]">Csak helyben vezetett megjegyzés · Nincs még adatbázisba mentve.</p>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <AdminButton variant="neutral" size="sm" onClick={onFocusEditor}>
          Ugrás a beadványrészhez
        </AdminButton>
        <AdminButton variant="neutral" size="sm" onClick={() => onRemove(section.id)}>
          Eltávolítás a vázlatból
        </AdminButton>
      </div>
    </div>
  );
}
