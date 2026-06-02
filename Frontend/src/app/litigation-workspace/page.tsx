"use client";

import { useMemo, useState } from "react";
import { AuthenticatedApp } from "@/components/AuthenticatedApp";
import { AdminBadge, AdminButton, AdminPanel, AdminSectionHeader, AdminStatusPill } from "@/components/adminiculum/ui";

type LitigationPhase =
  | "incoming"
  | "brackets"
  | "response-road"
  | "assembly"
  | "lawyer-review"
  | "export";

type OpponentArgument = {
  id: string;
  title: string;
  quote: string;
  sourceRef: string;
  legalBasis: string;
  evidence: string;
  requestedRelief: string;
  risk: "low" | "medium" | "high";
};

type ResponseRoadBlock = {
  id: string;
  type:
    | "fact-rebuttal"
    | "evidence"
    | "legal-basis"
    | "case-law"
    | "commentary"
    | "procedure"
    | "strategy";
  title: string;
  detail: string;
  relatedArgumentIds: string[];
};

type ResponseDraftCard = {
  id: string;
  title: string;
  strategy: string;
  pleadingText: string;
  counterclaim: string;
  requestedRelief: string;
  status: "hiányos" | "kész" | "ügyvédi review";
};

const phaseLabels: Array<{ key: LitigationPhase; label: string }> = [
  { key: "incoming", label: "Ellenfél irata" },
  { key: "brackets", label: "Érvek bracketekben" },
  { key: "response-road", label: "Válaszút" },
  { key: "assembly", label: "Dokumentum összeállítása" },
  { key: "lawyer-review", label: "Ügyvédi review" },
  { key: "export", label: "Export / leadás" },
];

const roadTypeLabels: Record<ResponseRoadBlock["type"], string> = {
  "fact-rebuttal": "Ténybeli cáfolat",
  evidence: "Bizonyíték",
  "legal-basis": "Jogszabályhely",
  "case-law": "Joggyakorlat",
  commentary: "Kommentár",
  procedure: "Perjogi kifogás",
  strategy: "Stratégiai megjegyzés",
};

const riskTone: Record<OpponentArgument["risk"], "gold" | "amber" | "burgundy"> = {
  low: "gold",
  medium: "amber",
  high: "burgundy",
};

const draftStatusTone: Record<ResponseDraftCard["status"], "gold" | "green" | "violet"> = {
  hiányos: "gold",
  kész: "green",
  "ügyvédi review": "violet",
};

const riskLabel: Record<OpponentArgument["risk"], string> = {
  low: "Kockázat: alacsony",
  medium: "Kockázat: közepes",
  high: "Kockázat: magas",
};

export default function LitigationWorkspacePage() {
  return (
    <AuthenticatedApp section="litigation-workspace">
      <LitigationWorkspacePageContent />
    </AuthenticatedApp>
  );
}

function LitigationWorkspacePageContent() {
  const [currentPhase, setCurrentPhase] = useState<LitigationPhase>("brackets");
  const [opponentArguments, setOpponentArguments] = useState<OpponentArgument[]>([]);
  const [roadBlocks, setRoadBlocks] = useState<ResponseRoadBlock[]>([]);
  const [draftCards, setDraftCards] = useState<ResponseDraftCard[]>([]);

  const [argumentDraft, setArgumentDraft] = useState({
    title: "",
    quote: "",
    sourceRef: "",
    legalBasis: "",
    evidence: "",
    requestedRelief: "",
    risk: "medium" as OpponentArgument["risk"],
  });

  const [roadDraft, setRoadDraft] = useState({
    title: "",
    detail: "",
    type: "fact-rebuttal" as ResponseRoadBlock["type"],
    relatedArgumentIds: [] as string[],
  });

  const [responseDraft, setResponseDraft] = useState({
    title: "",
    strategy: "",
    pleadingText: "",
    counterclaim: "",
    requestedRelief: "",
    status: "hiányos" as ResponseDraftCard["status"],
  });

  const linkedCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const argument of opponentArguments) {
      counts[argument.id] = roadBlocks.filter((block) => block.relatedArgumentIds.includes(argument.id)).length;
    }
    return counts;
  }, [opponentArguments, roadBlocks]);

  const addOpponentArgument = () => {
    if (!argumentDraft.title.trim() || !argumentDraft.quote.trim()) return;
    setOpponentArguments((prev) => [
      ...prev,
      {
        id: `arg-${Date.now()}-${prev.length + 1}`,
        title: argumentDraft.title.trim(),
        quote: argumentDraft.quote.trim(),
        sourceRef: argumentDraft.sourceRef.trim(),
        legalBasis: argumentDraft.legalBasis.trim(),
        evidence: argumentDraft.evidence.trim(),
        requestedRelief: argumentDraft.requestedRelief.trim(),
        risk: argumentDraft.risk,
      },
    ]);
    setArgumentDraft({
      title: "",
      quote: "",
      sourceRef: "",
      legalBasis: "",
      evidence: "",
      requestedRelief: "",
      risk: "medium",
    });
  };

  const toggleArgumentRelation = (argumentId: string) => {
    setRoadDraft((prev) => ({
      ...prev,
      relatedArgumentIds: prev.relatedArgumentIds.includes(argumentId)
        ? prev.relatedArgumentIds.filter((id) => id !== argumentId)
        : [...prev.relatedArgumentIds, argumentId],
    }));
  };

  const addRoadBlock = () => {
    if (!roadDraft.title.trim() || !roadDraft.detail.trim()) return;
    setRoadBlocks((prev) => [
      ...prev,
      {
        id: `road-${Date.now()}-${prev.length + 1}`,
        type: roadDraft.type,
        title: roadDraft.title.trim(),
        detail: roadDraft.detail.trim(),
        relatedArgumentIds: roadDraft.relatedArgumentIds,
      },
    ]);
    setRoadDraft({
      title: "",
      detail: "",
      type: "fact-rebuttal",
      relatedArgumentIds: [],
    });
  };

  const addResponseDraftCard = () => {
    if (!responseDraft.title.trim() || !responseDraft.strategy.trim()) return;
    setDraftCards((prev) => [
      ...prev,
      {
        id: `draft-${Date.now()}-${prev.length + 1}`,
        title: responseDraft.title.trim(),
        strategy: responseDraft.strategy.trim(),
        pleadingText: responseDraft.pleadingText.trim(),
        counterclaim: responseDraft.counterclaim.trim(),
        requestedRelief: responseDraft.requestedRelief.trim(),
        status: responseDraft.status,
      },
    ]);
    setResponseDraft({
      title: "",
      strategy: "",
      pleadingText: "",
      counterclaim: "",
      requestedRelief: "",
      status: "hiányos",
    });
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-[#F3EBD4]">
      <div className="mx-auto max-w-[1640px] space-y-4 px-4 py-4 xl:px-6">
        <section className="rounded-[10px] border border-[#D8CFB6] bg-[#FBF6E7] p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <AdminBadge tone="green">Peres stratégiai road</AdminBadge>
                <AdminStatusPill tone="gold">Helyi stratégiai vázlat — szerveroldali mentés későbbi patchben.</AdminStatusPill>
              </div>
              <div>
                <h1 className="font-serif text-[30px] font-medium leading-tight text-[#1F2821]">Peres stratégiai térkép</h1>
                <p className="mt-1 max-w-4xl text-[13px] text-[#6D6A62]">
                  Ellenérvek, bizonyítékok és jogi hivatkozások útvonala a készülő beadványig.
                </p>
              </div>
              <p className="text-[11px] text-[#6D6A62]">
                Ügy: <span className="font-semibold text-[#1F2821]">CASE-LIT-2026-01</span>
                {" · "}Ügyfél: <span className="font-semibold text-[#1F2821]">BlackBelt Technology Kft.</span>
                {" · "}Mód: <span className="font-semibold text-[#1F2821]">Bracketek + válaszút foundation</span>
              </p>
            </div>
            <div className="grid gap-2 rounded-[8px] border border-[#D8CFB6] bg-white p-3 text-[11px] text-[#514D45] sm:grid-cols-3">
              <div>
                <p className="font-semibold text-[#1F2821]">Állapot</p>
                <p className="mt-1">Előkészítés alatt</p>
              </div>
              <div>
                <p className="font-semibold text-[#1F2821]">Mentés</p>
                <p className="mt-1">Helyi state</p>
              </div>
              <div>
                <p className="font-semibold text-[#1F2821]">AI</p>
                <p className="mt-1">Külső AI prompt — ügyvédi ellenőrzést igényel</p>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-[10px] border border-[#D8CFB6] bg-white p-4">
          <div className="flex flex-wrap gap-2">
            {phaseLabels.map((phase, index) => {
              const active = currentPhase === phase.key;
              return (
                <button
                  key={phase.key}
                  type="button"
                  onClick={() => setCurrentPhase(phase.key)}
                  className={`inline-flex items-center gap-2 rounded-[6px] border px-3 py-2 text-[11px] font-semibold transition-colors ${
                    active
                      ? "border-[#1F4A33] bg-[#1F4A33] text-[#F4EFDB]"
                      : "border-[#E7DECB] bg-[#FBF9F3] text-[#514D45] hover:bg-white"
                  }`}
                >
                  <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${active ? "bg-[#F4EFDB] text-[#1F4A33]" : "bg-white text-[#7B776D]"}`}>
                    {index + 1}
                  </span>
                  {phase.label}
                </button>
              );
            })}
          </div>
          <div className="mt-3 grid gap-2 rounded-[8px] border border-[#EEE7D9] bg-[#FCFAF4] p-3 text-[11px] text-[#514D45] xl:grid-cols-4">
            <div>
              <p className="font-semibold text-[#1F2821]">Bracket logika</p>
              <p className="mt-1">Az ellenfél állításai külön konténerekben maradnak, hogy a válaszút egyenként kapcsolható legyen hozzájuk.</p>
            </div>
            <div>
              <p className="font-semibold text-[#1F2821]">Road logika</p>
              <p className="mt-1">Tény, bizonyíték, jogszabályhely és kommentár blokk-sorrendben épül a válaszút.</p>
            </div>
            <div>
              <p className="font-semibold text-[#1F2821]">Kimenet</p>
              <p className="mt-1">A jobb oldali draft-kártyák még nem jelentenek kész beadványt vagy kész jogi következtetést.</p>
            </div>
            <div>
              <p className="font-semibold text-[#1F2821]">Összeállítás</p>
              <p className="mt-1">Dokumentum összeállítása későbbi patchben aktiválható.</p>
            </div>
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(280px,0.9fr)_minmax(340px,1.1fr)_minmax(280px,0.95fr)]">
          <AdminPanel className="overflow-hidden">
            <AdminSectionHeader
              eyebrow="Bracketek"
              title="Ellenfél érvei"
              subtitle="Az ellenoldali állítások, forráshelyek és kockázatok bracket-szerű konténerekben."
              action={<AdminStatusPill tone="burgundy">{opponentArguments.length} érv</AdminStatusPill>}
            />
            <div className="space-y-3 p-4">
              <div className="rounded-[8px] border border-[#E5C3C3] bg-[#FFF7F4] p-3">
                <div className="grid gap-2">
                  <input
                    value={argumentDraft.title}
                    onChange={(event) => setArgumentDraft((prev) => ({ ...prev, title: event.target.value }))}
                    placeholder="Érv címe"
                    className="rounded border border-[#DFCFC6] bg-white px-3 py-2 text-xs text-[#1F2821]"
                  />
                  <textarea
                    value={argumentDraft.quote}
                    onChange={(event) => setArgumentDraft((prev) => ({ ...prev, quote: event.target.value }))}
                    rows={4}
                    placeholder="Idézet / forráshely az ellenfél iratából"
                    className="rounded border border-[#DFCFC6] bg-white px-3 py-2 text-xs text-[#1F2821]"
                  />
                  <input
                    value={argumentDraft.sourceRef}
                    onChange={(event) => setArgumentDraft((prev) => ({ ...prev, sourceRef: event.target.value }))}
                    placeholder="Forráshely / oldalszám / bekezdés"
                    className="rounded border border-[#DFCFC6] bg-white px-3 py-2 text-xs text-[#1F2821]"
                  />
                  <input
                    value={argumentDraft.legalBasis}
                    onChange={(event) => setArgumentDraft((prev) => ({ ...prev, legalBasis: event.target.value }))}
                    placeholder="Hivatkozott jogalap"
                    className="rounded border border-[#DFCFC6] bg-white px-3 py-2 text-xs text-[#1F2821]"
                  />
                  <input
                    value={argumentDraft.evidence}
                    onChange={(event) => setArgumentDraft((prev) => ({ ...prev, evidence: event.target.value }))}
                    placeholder="Hivatkozott bizonyíték"
                    className="rounded border border-[#DFCFC6] bg-white px-3 py-2 text-xs text-[#1F2821]"
                  />
                  <input
                    value={argumentDraft.requestedRelief}
                    onChange={(event) => setArgumentDraft((prev) => ({ ...prev, requestedRelief: event.target.value }))}
                    placeholder="Követelt jogkövetkezmény"
                    className="rounded border border-[#DFCFC6] bg-white px-3 py-2 text-xs text-[#1F2821]"
                  />
                  <select
                    value={argumentDraft.risk}
                    onChange={(event) => setArgumentDraft((prev) => ({ ...prev, risk: event.target.value as OpponentArgument["risk"] }))}
                    className="rounded border border-[#DFCFC6] bg-white px-3 py-2 text-xs text-[#1F2821]"
                  >
                    <option value="low">Kockázat: alacsony</option>
                    <option value="medium">Kockázat: közepes</option>
                    <option value="high">Kockázat: magas</option>
                  </select>
                  <AdminButton variant="warning" size="sm" onClick={addOpponentArgument} disabled={!argumentDraft.title.trim() || !argumentDraft.quote.trim()}>
                    Ellenfél-érv hozzáadása
                  </AdminButton>
                </div>
              </div>

              {opponentArguments.length === 0 ? (
                <div className="rounded-[8px] border border-dashed border-[#DFCFC6] bg-[#FBF9F3] p-4 text-[12px] text-[#7B776D]">
                  Még nincs ellenoldali érv. Itt jelennek majd meg a bracket-konténerek, amelyekhez a válaszút kapcsolódhat.
                </div>
              ) : (
                opponentArguments.map((argument) => (
                  <div key={argument.id} className="relative rounded-[10px] border border-[#E5C3C3] bg-white p-4 pl-6 shadow-sm before:absolute before:bottom-4 before:left-0 before:top-4 before:w-[4px] before:rounded-r-full before:bg-[#B35E3C]">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <h3 className="font-serif text-lg font-medium text-[#1F2821]">{argument.title}</h3>
                      <AdminStatusPill tone={riskTone[argument.risk]}>{riskLabel[argument.risk]}</AdminStatusPill>
                    </div>
                    <p className="mt-3 rounded-[8px] border border-[#F0DFD8] bg-[#FFF8F5] px-3 py-2 text-[12px] italic text-[#6B4A44]">
                      „{argument.quote}”
                    </p>
                    <dl className="mt-3 space-y-2 text-[11px] text-[#514D45]">
                      <div>
                        <dt className="font-semibold text-[#1F2821]">Idézet / forráshely</dt>
                        <dd>{argument.sourceRef || "Előkészítés alatt"}</dd>
                      </div>
                      <div>
                        <dt className="font-semibold text-[#1F2821]">Jogalap</dt>
                        <dd>{argument.legalBasis || "Előkészítés alatt"}</dd>
                      </div>
                      <div>
                        <dt className="font-semibold text-[#1F2821]">Bizonyíték</dt>
                        <dd>{argument.evidence || "Előkészítés alatt"}</dd>
                      </div>
                      <div>
                        <dt className="font-semibold text-[#1F2821]">Követelt jogkövetkezmény</dt>
                        <dd>{argument.requestedRelief || "Előkészítés alatt"}</dd>
                      </div>
                      <div>
                        <dt className="font-semibold text-[#1F2821]">Kockázat</dt>
                        <dd>{riskLabel[argument.risk]}</dd>
                      </div>
                    </dl>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <AdminBadge tone="burgundy">Bracket</AdminBadge>
                      <AdminBadge tone={linkedCounts[argument.id] ? "blue" : "neutral"}>{linkedCounts[argument.id] || 0} kapcsolódó válaszút-blokk</AdminBadge>
                    </div>
                  </div>
                ))
              )}
            </div>
          </AdminPanel>

          <AdminPanel className="overflow-hidden">
            <AdminSectionHeader
              eyebrow="Stratégiai út"
              title="Válaszút"
              subtitle="Tények, bizonyítékok, jogszabályhelyek és stratégiai megjegyzések egy összefűzött úton."
              action={<AdminStatusPill tone="gold">{roadBlocks.length} útblokk</AdminStatusPill>}
            />
            <div className="space-y-3 p-4">
              <div className="rounded-[8px] border border-[#E6D8AD] bg-[#FFF9E6] p-3">
                <div className="grid gap-2">
                  <select
                    value={roadDraft.type}
                    onChange={(event) => setRoadDraft((prev) => ({ ...prev, type: event.target.value as ResponseRoadBlock["type"] }))}
                    className="rounded border border-[#E3D6AA] bg-white px-3 py-2 text-xs text-[#1F2821]"
                  >
                    {Object.entries(roadTypeLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <input
                    value={roadDraft.title}
                    onChange={(event) => setRoadDraft((prev) => ({ ...prev, title: event.target.value }))}
                    placeholder="Válaszút-blokk címe"
                    className="rounded border border-[#E3D6AA] bg-white px-3 py-2 text-xs text-[#1F2821]"
                  />
                  <textarea
                    value={roadDraft.detail}
                    onChange={(event) => setRoadDraft((prev) => ({ ...prev, detail: event.target.value }))}
                    rows={4}
                    placeholder="Ténybeli cáfolat, bizonyíték, kommentár vagy perjogi kifogás részlete"
                    className="rounded border border-[#E3D6AA] bg-white px-3 py-2 text-xs text-[#1F2821]"
                  />
                  <div className="rounded-[6px] border border-[#E6D8AD] bg-white p-3">
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#7B776D]">Kapcsolódó ellenfél-érvek</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {opponentArguments.length === 0 ? (
                        <span className="text-[11px] text-[#7B776D]">Előbb adj hozzá bracket-érveket.</span>
                      ) : (
                        opponentArguments.map((argument) => (
                          <button
                            key={argument.id}
                            type="button"
                            onClick={() => toggleArgumentRelation(argument.id)}
                            className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold transition-colors ${
                              roadDraft.relatedArgumentIds.includes(argument.id)
                                ? "border-[#2D4A7C] bg-[#EAEFF6] text-[#2D4A7C]"
                                : "border-[#DDD7CA] bg-[#FBF9F3] text-[#514D45] hover:bg-white"
                            }`}
                          >
                            {argument.title}
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                  <AdminButton variant="warning" size="sm" onClick={addRoadBlock} disabled={!roadDraft.title.trim() || !roadDraft.detail.trim()}>
                    Válaszút-blokk hozzáadása
                  </AdminButton>
                </div>
              </div>

              {roadBlocks.length === 0 ? (
                <div className="rounded-[8px] border border-dashed border-[#D8CFB6] bg-[#FBF9F3] p-4 text-[12px] text-[#7B776D]">
                  A stratégiai út itt épül fel. Helyi state-ben tudsz ténybeli cáfolatot, bizonyítékot, jogszabályhelyet és perjogi kifogást felvenni.
                </div>
              ) : (
                <div className="relative space-y-3 before:absolute before:bottom-0 before:left-[17px] before:top-0 before:w-[2px] before:bg-[#D8CFB6]">
                  {roadBlocks.map((block, index) => (
                    <div key={block.id} className="relative pl-10">
                      <span className="absolute left-0 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#D8CFB6] bg-white text-[11px] font-bold text-[#6C5120]">
                        {index + 1}
                      </span>
                      <div className="rounded-[10px] border border-[#D8CFB6] bg-white p-4 shadow-sm">
                        <div className="flex flex-wrap items-center gap-2">
                          <AdminBadge tone={block.type === "evidence" ? "blue" : block.type === "legal-basis" || block.type === "case-law" || block.type === "commentary" ? "violet" : block.type === "procedure" ? "gold" : "green"}>
                            {roadTypeLabels[block.type]}
                          </AdminBadge>
                          {block.relatedArgumentIds.length > 0 ? <AdminBadge tone="blue">{block.relatedArgumentIds.length} kapcsolódás</AdminBadge> : null}
                        </div>
                        <h3 className="mt-2 font-serif text-lg font-medium text-[#1F2821]">{block.title}</h3>
                        <p className="mt-2 whitespace-pre-wrap text-[12px] leading-6 text-[#514D45]">{block.detail}</p>
                        <div className="mt-3 rounded-[8px] border border-[#EEE7D9] bg-[#FCFAF4] px-3 py-2 text-[10px] text-[#6D6A62]">
                          Válaszút-kapcsolat: {block.relatedArgumentIds.length > 0 ? "kapcsolt bracket(ek)hez kötve" : "még nincs bracket-kapcsolat"}
                        </div>
                        {block.relatedArgumentIds.length > 0 ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {block.relatedArgumentIds.map((argumentId) => {
                              const argument = opponentArguments.find((item) => item.id === argumentId);
                              return argument ? (
                                <AdminBadge key={argumentId} tone="blue">
                                  Kapcsolódik: {argument.title}
                                </AdminBadge>
                              ) : null;
                            })}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </AdminPanel>

          <AdminPanel className="overflow-hidden">
            <AdminSectionHeader
              eyebrow="Kimenet"
              title="Saját válasz / viszontkereset"
              subtitle="A stratégiai út végén a beadványba illeszthető szöveg és a dokumentum-összeállítás iránya."
              action={<AdminStatusPill tone="violet">{draftCards.length} draft-blokk</AdminStatusPill>}
            />
            <div className="space-y-3 p-4">
              <div className="rounded-[8px] border border-[#D7CCB0] bg-[#FBF9F3] p-3">
                <div className="grid gap-2">
                  <input
                    value={responseDraft.title}
                    onChange={(event) => setResponseDraft((prev) => ({ ...prev, title: event.target.value }))}
                    placeholder="Válaszstratégia / blokk címe"
                    className="rounded border border-[#DDD7CA] bg-white px-3 py-2 text-xs text-[#1F2821]"
                  />
                  <textarea
                    value={responseDraft.strategy}
                    onChange={(event) => setResponseDraft((prev) => ({ ...prev, strategy: event.target.value }))}
                    rows={3}
                    placeholder="Stratégiai irány vagy rövid válaszlogika"
                    className="rounded border border-[#DDD7CA] bg-white px-3 py-2 text-xs text-[#1F2821]"
                  />
                  <textarea
                    value={responseDraft.pleadingText}
                    onChange={(event) => setResponseDraft((prev) => ({ ...prev, pleadingText: event.target.value }))}
                    rows={4}
                    placeholder="Beadványba illeszthető szöveg"
                    className="rounded border border-[#DDD7CA] bg-white px-3 py-2 text-xs text-[#1F2821]"
                  />
                  <input
                    value={responseDraft.counterclaim}
                    onChange={(event) => setResponseDraft((prev) => ({ ...prev, counterclaim: event.target.value }))}
                    placeholder="Viszontkövetelés / ellenkérelem"
                    className="rounded border border-[#DDD7CA] bg-white px-3 py-2 text-xs text-[#1F2821]"
                  />
                  <input
                    value={responseDraft.requestedRelief}
                    onChange={(event) => setResponseDraft((prev) => ({ ...prev, requestedRelief: event.target.value }))}
                    placeholder="Kérelem / jogkövetkezmény"
                    className="rounded border border-[#DDD7CA] bg-white px-3 py-2 text-xs text-[#1F2821]"
                  />
                  <select
                    value={responseDraft.status}
                    onChange={(event) => setResponseDraft((prev) => ({ ...prev, status: event.target.value as ResponseDraftCard["status"] }))}
                    className="rounded border border-[#DDD7CA] bg-white px-3 py-2 text-xs text-[#1F2821]"
                  >
                    <option value="hiányos">Hiányos</option>
                    <option value="kész">Kész</option>
                    <option value="ügyvédi review">Ügyvédi review</option>
                  </select>
                  <AdminButton variant="primary" size="sm" onClick={addResponseDraftCard} disabled={!responseDraft.title.trim() || !responseDraft.strategy.trim()}>
                    Válasz-blokk hozzáadása
                  </AdminButton>
                </div>
              </div>

              {draftCards.length === 0 ? (
                <div className="rounded-[8px] border border-dashed border-[#DDD7CA] bg-white p-4 text-[12px] text-[#7B776D]">
                  Még nincs saját válaszblokk. Itt készülhetnek a beadványba illeszthető szövegrészek és a viszontkereseti irányok.
                </div>
              ) : (
                draftCards.map((card) => (
                  <div key={card.id} className="rounded-[10px] border border-[#DDD7CA] bg-white p-4 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <h3 className="font-serif text-lg font-medium text-[#1F2821]">{card.title}</h3>
                      <AdminStatusPill tone={draftStatusTone[card.status]}>{card.status}</AdminStatusPill>
                    </div>
                    <p className="mt-2 text-[12px] text-[#514D45]">{card.strategy}</p>
                    {card.pleadingText ? (
                      <div className="mt-3 rounded-[8px] border border-[#E7DECB] bg-[#FCFAF4] p-3">
                        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#7B776D]">Beadványba illeszthető szöveg</p>
                        <p className="mt-2 whitespace-pre-wrap text-[12px] leading-6 text-[#514D45]">{card.pleadingText}</p>
                      </div>
                    ) : (
                      <div className="mt-3 rounded-[8px] border border-dashed border-[#DDD7CA] bg-[#FCFAF4] p-3 text-[11px] text-[#7B776D]">
                        Beadványba illeszthető szöveg: Előkészítés alatt.
                      </div>
                    )}
                    <dl className="mt-3 space-y-2 text-[11px] text-[#514D45]">
                      {card.counterclaim ? (
                        <div>
                          <dt className="font-semibold text-[#1F2821]">Viszontkövetelés</dt>
                          <dd>{card.counterclaim}</dd>
                        </div>
                      ) : (
                        <div>
                          <dt className="font-semibold text-[#1F2821]">Viszontkövetelés</dt>
                          <dd>Előkészítés alatt</dd>
                        </div>
                      )}
                      {card.requestedRelief ? (
                        <div>
                          <dt className="font-semibold text-[#1F2821]">Kereseti / viszontkereseti kérelem</dt>
                          <dd>{card.requestedRelief}</dd>
                        </div>
                      ) : (
                        <div>
                          <dt className="font-semibold text-[#1F2821]">Kereseti / viszontkereseti kérelem</dt>
                          <dd>Előkészítés alatt</dd>
                        </div>
                      )}
                    </dl>
                  </div>
                ))
              )}

              <div className="rounded-[10px] border border-[#D8CFB6] bg-[#FBF6E7] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="font-serif text-xl font-medium text-[#1F2821]">Dokumentum összeállítása</h3>
                    <p className="mt-1 text-[12px] text-[#6D6A62]">A stratégiai út végén a beadvány szerkezete és a kérelem logikája áll össze, de a végső dokumentum még nem generálódik automatikusan.</p>
                  </div>
                  <AdminStatusPill tone="gold">Későbbi patch</AdminStatusPill>
                </div>
                <ol className="mt-4 grid gap-2 rounded-[8px] border border-[#E7DECB] bg-white p-4 text-[12px] text-[#514D45]">
                  <li>I. Bevezetés</li>
                  <li>II. Ellenfél állításainak vitatása</li>
                  <li>III. Ténybeli ellenérvek</li>
                  <li>IV. Jogi ellenérvek</li>
                  <li>V. Bizonyítékok</li>
                  <li>VI. Viszontkereset / ellenkérelem</li>
                  <li>VII. Kérelmek</li>
                </ol>
                <p className="mt-3 rounded-[6px] border border-dashed border-[#D8CFB6] bg-white px-3 py-2 text-[11px] text-[#7B776D]">
                  Dokumentum összeállítása későbbi patchben aktiválható.
                </p>
                <div className="mt-3 rounded-[6px] border border-[#E7DECB] bg-white px-3 py-2 text-[11px] text-[#7B776D]">
                  Nincs win probability, nincs AI certainty és nincs automatikus jogi következtetés — ez csak stratégiai előkészítő munkafelület.
                </div>
              </div>
            </div>
          </AdminPanel>
        </section>
      </div>
    </div>
  );
}
