"use client";

/**
 * Right-side workbench panel: truthful persistence status, safe variables,
 * task-backed review integration, and export. Unavailable capabilities are
 * explained in an informative section instead of dead placeholder buttons.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import type { CaseWorkItem } from "@/lib/api";
import type { EditorNode } from "@/lib/editor/editorModel";
import { EDITOR_FIELDS, FieldResolutionContext, listTokenOccurrences } from "@/lib/editor/fieldTokens";

export type ReviewPanelState = {
  items: CaseWorkItem[];
  busy: boolean;
  error: string | null;
  onCreateReviewTask: () => void;
  onTaskTransition: (taskId: string, action: "start" | "submit" | "approve" | "return") => void;
  canCreateReviewTask: boolean;
};

type SidePanelProps = {
  docJson: EditorNode | null;
  context: FieldResolutionContext;
  documentMeta: { id: string; caseId: string; name: string; version?: string | null } | null;
  review: ReviewPanelState;
  readOnly: boolean;
  onInsertField: (fieldId: string) => void;
  onConvertResolvedTokens: () => void;
  onExportHtml: () => void;
  onExportText: () => void;
  onPrint: () => void;
};

type PanelTab = "status" | "fields" | "review" | "export";

export function DocumentEditorSidePanel({
  docJson,
  context,
  documentMeta,
  review,
  readOnly,
  onInsertField,
  onConvertResolvedTokens,
  onExportHtml,
  onExportText,
  onPrint,
}: SidePanelProps) {
  const [tab, setTab] = useState<PanelTab>("status");
  const [fieldFilter, setFieldFilter] = useState("");

  const occurrences = useMemo(() => (docJson ? listTokenOccurrences(docJson, context) : []), [docJson, context]);
  const unresolvedCount = occurrences.filter((occurrence) => occurrence.resolved === null).length;

  const filteredFields = useMemo(() => {
    const query = fieldFilter.trim().toLowerCase();
    if (!query) return EDITOR_FIELDS;
    return EDITOR_FIELDS.filter((field) => field.label.toLowerCase().includes(query) || field.id.toLowerCase().includes(query));
  }, [fieldFilter]);

  const tabs: Array<{ id: PanelTab; label: string }> = [
    { id: "status", label: "Állapot" },
    { id: "fields", label: `Változók${unresolvedCount > 0 ? ` (${unresolvedCount}!)` : ""}` },
    { id: "review", label: "Review" },
    { id: "export", label: "Export" },
  ];

  return (
    <div className="flex h-full flex-col" data-editor-chrome>
      <div className="flex border-b border-[rgba(22,32,26,0.12)]" role="tablist">
        {tabs.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={tab === entry.id}
            className={`flex-1 px-1 py-1.5 text-[10.5px] font-semibold ${
              tab === entry.id ? "border-b-2 border-[#082817] text-[#082817]" : "text-[#7A8479] hover:text-[#16201A]"
            }`}
            onClick={() => setTab(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2.5 text-[12px] text-[#16201A]">
        {tab === "status" ? (
          <div className="space-y-3">
            <div className="rounded-[6px] border border-[rgba(185,122,15,0.35)] bg-[#FAEFCF] p-2.5">
              <p className="text-[11px] font-bold text-[#7d530a]">Munkamenet-alapú szerkesztés — nincs szerverre mentve</p>
              <p className="mt-1 text-[11px] leading-relaxed text-[#7d530a]">
                Ebben a környezetben nincs engedélyezett dokumentumtartalom-mentési útvonal, ezért a szerkesztett
                tartalom csak ebben a böngészőlapon él. Az oldal elhagyása vagy újratöltése a nem exportált tartalmat
                elveti. Használja az Export fület (nyomtatás/PDF, HTML, szöveg) a megőrzéshez.
              </p>
            </div>
            {documentMeta ? (
              <div className="space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-[#7A8479]">Dokumentum-kontextus</p>
                <p>{documentMeta.name}</p>
                <p className="text-[11px] text-[#7A8479]">
                  Verzió (metaadat): {documentMeta.version || "n/a"} · A kontextus csak metaadat — a szerveren tárolt
                  fájltartalom itt nem kerül betöltésre.
                </p>
              </div>
            ) : (
              <p className="text-[11px] text-[#7A8479]">Önálló munkapéldány — nincs kapcsolt dokumentum.</p>
            )}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-[#7A8479]">Nem elérhető funkciók (őszintén)</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11px] text-[#3D4842]">
                <li>Mentés és háttérmentés a szerverre — nincs engedélyezett tartalom-perzisztencia.</li>
                <li>Új dokumentumverzió létrehozása — a verziómentési útvonal ebben a környezetben nem érhető el.</li>
                <li>Szerveroldali DOCX konverzió — nincs; a DOCX import/export helyi böngészős munkamenetként fut.</li>
                <li>Élő változáskövetés szerkesztés közben — a verzió-összehasonlítás a támogatott redline-mechanizmus.</li>
                <li>Szöveghez rögzített kommentek — a Comment modellhez nincs kiszolgálói útvonal.</li>
                <li>Valós idejű közös szerkesztés — nem cél és nem támogatott.</li>
              </ul>
            </div>
          </div>
        ) : null}

        {tab === "fields" ? (
          <div className="space-y-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-[#7A8479]">Mező beszúrása</p>
              <input
                className="mt-1 w-full rounded-[4px] border border-[rgba(22,32,26,0.18)] px-2 py-1 text-[11.5px] focus:border-[#082817] focus:outline-none"
                placeholder="Mező keresése…"
                value={fieldFilter}
                onChange={(event) => setFieldFilter(event.target.value)}
                aria-label="Mező keresése"
              />
              <ul className="mt-1 space-y-0.5">
                {filteredFields.map((field) => (
                  <li key={field.id}>
                    <button
                      type="button"
                      disabled={readOnly}
                      className="w-full rounded-[4px] px-1.5 py-1 text-left hover:bg-[#FBF6E7] disabled:opacity-50"
                      onClick={() => onInsertField(field.id)}
                    >
                      <span className="font-semibold">{field.label}</span>
                      <span className="ml-1 text-[10px] text-[#7A8479]">({field.source})</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-[#7A8479]">
                Mezők a dokumentumban ({occurrences.length})
              </p>
              {occurrences.length === 0 ? (
                <p className="mt-1 text-[11px] italic text-[#7A8479]">Nincs beszúrt mező.</p>
              ) : (
                <ul className="mt-1 space-y-0.5">
                  {occurrences.map((occurrence, index) => (
                    <li key={index} className="flex items-center justify-between gap-2 rounded-[4px] px-1.5 py-0.5">
                      <span className="truncate">{occurrence.label}</span>
                      {occurrence.resolved ? (
                        <span className="truncate text-[10.5px] text-[#123B27]" title={occurrence.resolved}>
                          → {occurrence.resolved}
                        </span>
                      ) : (
                        <span className="shrink-0 rounded-[3px] bg-[#FAEFCF] px-1 text-[10px] font-semibold text-[#7d530a]">
                          feloldatlan
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {occurrences.some((occurrence) => occurrence.resolved) && !readOnly ? (
                <button
                  type="button"
                  className="mt-2 rounded-[4px] border border-[rgba(22,32,26,0.2)] px-2 py-1 text-[11px] font-semibold hover:bg-[#FBF6E7]"
                  onClick={() => {
                    if (window.confirm("A feloldott mezők végleges statikus szöveggé alakulnak. Folytatja?")) {
                      onConvertResolvedTokens();
                    }
                  }}
                >
                  Feloldott mezők statikus szöveggé alakítása
                </button>
              ) : null}
              <p className="mt-2 text-[10px] italic text-[#7A8479]">
                A mezők kizárólag engedélyezett, biztonságos adatforrásokból oldódnak fel. Az átalakítás nem ír vissza
                ügy- vagy ügyféladatot.
              </p>
            </div>
          </div>
        ) : null}

        {tab === "review" ? (
          <div className="space-y-2">
            {!documentMeta ? (
              <p className="text-[11px] italic text-[#7A8479]">
                A review-folyamat kapcsolt dokumentumot igényel. Önálló munkapéldányhoz nem hozható létre review-feladat.
              </p>
            ) : (
              <>
                {review.canCreateReviewTask ? (
                  <button
                    type="button"
                    disabled={review.busy}
                    className="w-full rounded-[4px] border border-[#062416] bg-[#082817] px-2 py-1.5 text-[11.5px] font-semibold text-[#F4EFDB] hover:bg-[#062416] disabled:opacity-50"
                    onClick={review.onCreateReviewTask}
                  >
                    Review-feladat létrehozása ehhez a dokumentumhoz
                  </button>
                ) : null}
                {review.error ? <p className="text-[11px] text-[#8B2A2A]">{review.error}</p> : null}
                {review.items.length === 0 ? (
                  <p className="text-[11px] italic text-[#7A8479]">Nincs ehhez a dokumentumhoz kapcsolt feladat.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {review.items.map((item) => (
                      <li key={item.id} className="rounded-[5px] border border-[rgba(22,32,26,0.12)] p-1.5">
                        <p className="truncate text-[11.5px] font-semibold" title={item.title}>
                          {item.title}
                        </p>
                        <p className="text-[10.5px] text-[#7A8479]">
                          {item.status} · {item.assignee?.displayName || "nincs felelős"}
                        </p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {item.capabilities.canStart ? (
                            <button type="button" disabled={review.busy} className="rounded-[3px] border border-[rgba(22,32,26,0.15)] px-1.5 py-0.5 text-[10px] hover:bg-[#FBF6E7]" onClick={() => review.onTaskTransition(item.id, "start")}>
                              Elkezdés
                            </button>
                          ) : null}
                          {item.capabilities.canSubmitForReview ? (
                            <button type="button" disabled={review.busy} className="rounded-[3px] border border-[rgba(22,32,26,0.15)] px-1.5 py-0.5 text-[10px] hover:bg-[#FBF6E7]" onClick={() => review.onTaskTransition(item.id, "submit")}>
                              Review-ra küldés
                            </button>
                          ) : null}
                          {item.capabilities.canApprove ? (
                            <button type="button" disabled={review.busy} className="rounded-[3px] border border-[rgba(8,40,23,0.3)] bg-[#E2E8DA] px-1.5 py-0.5 text-[10px] font-semibold text-[#123B27]" onClick={() => review.onTaskTransition(item.id, "approve")}>
                              Jóváhagyás
                            </button>
                          ) : null}
                          {item.capabilities.canReturnForCorrection ? (
                            <button type="button" disabled={review.busy} className="rounded-[3px] border border-[#F2DAD6] px-1.5 py-0.5 text-[10px] text-[#8B2A2A] hover:bg-[#F2DAD6]" onClick={() => review.onTaskTransition(item.id, "return")}>
                              Visszaküldés javításra
                            </button>
                          ) : null}
                          <Link href={`/tasks?taskId=${encodeURIComponent(item.id)}`} className="rounded-[3px] border border-[rgba(22,32,26,0.15)] px-1.5 py-0.5 text-[10px] text-[#2D4A7C] hover:bg-[#EAEFF6]">
                            Feladat megnyitása
                          </Link>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="rounded-[4px] border border-[rgba(185,122,15,0.25)] bg-[#FAEFCF] p-1.5 text-[10.5px] leading-relaxed text-[#7d530a]">
                  A review-feladat a dokumentumhoz kapcsolódik, de a jelenlegi szerkesztési munkamenet tartalma nincs az Adminiculum szerverére mentve.
                </p>
                <p className="text-[10px] italic text-[#7A8479]">
                  A jóváhagyás belső munkafolyamat-jóváhagyás — nem elektronikus aláírás, nem benyújtás és nem az irat
                  jogi érvényességének igazolása. A jogosultságokat a szerver határozza meg.
                </p>
                {documentMeta ? (
                  <Link
                    href={`/documents/compare?caseId=${encodeURIComponent(documentMeta.caseId)}&documentId=${encodeURIComponent(documentMeta.id)}`}
                    className="block rounded-[4px] border border-[rgba(22,32,26,0.15)] px-2 py-1 text-center text-[11px] font-semibold text-[#2D4A7C] hover:bg-[#EAEFF6]"
                  >
                    Verziók összehasonlítása (redline)
                  </Link>
                ) : null}
              </>
            )}
          </div>
        ) : null}

        {tab === "export" ? (
          <div className="space-y-2">
            <button type="button" className="w-full rounded-[4px] border border-[#062416] bg-[#082817] px-2 py-1.5 text-[11.5px] font-semibold text-[#F4EFDB] hover:bg-[#062416]" onClick={onPrint}>
              Nyomtatás / PDF (böngészőből)
            </button>
            <button type="button" className="w-full rounded-[4px] border border-[rgba(22,32,26,0.2)] px-2 py-1.5 text-[11.5px] font-semibold hover:bg-[#FBF6E7]" onClick={onExportHtml}>
              HTML letöltése (önálló, tisztított)
            </button>
            <button type="button" className="w-full rounded-[4px] border border-[rgba(22,32,26,0.2)] px-2 py-1.5 text-[11.5px] font-semibold hover:bg-[#FBF6E7]" onClick={onExportText}>
              Szöveges export (.txt, számozással)
            </button>
            <p className="text-[10px] italic leading-relaxed text-[#7A8479]">
              A PDF a böngésző nyomtatási funkciójával készül — nem szerveroldali generálás. DOCX export nem érhető el:
              nincs megbízható Tiptap→DOCX konverter a telepített állományban; ezt a korlátot a dokumentáció rögzíti. Az
              exportok a feloldott mezőértékeket tartalmazzák; a feloldatlan mezők jelölve maradnak.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
