"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AuthenticatedApp } from "@/components/AuthenticatedApp";
import { AdminBadge, AdminButton, AdminPanel, AdminSectionHeader, AdminStatusPill } from "@/components/adminiculum/ui";

type LitigationPhase =
  | "incoming"
  | "brackets"
  | "response-road"
  | "assembly"
  | "lawyer-review"
  | "export";

type OpponentBracketType =
  | "claim"
  | "fact"
  | "legal"
  | "evidence"
  | "amount"
  | "procedure"
  | "attackable";

type OpponentBracketStatus = "rögzítve" | "válaszút kell" | "válaszút kapcsolva" | "lezárható";

type OpponentArgument = {
  id: string;
  type: OpponentBracketType;
  title: string;
  quote: string;
  sourceRef: string;
  legalBasis: string;
  evidence: string;
  requestedRelief: string;
  risk: "low" | "medium" | "high";
  status: OpponentBracketStatus;
};

type ResponseRoadBlock = {
  id: string;
  type:
    | "fact-rebuttal"
    | "evidence"
    | "statute"
    | "case-law"
    | "procedural-objection"
    | "amount-objection"
    | "evidence-motion"
    | "own-narrative";
  title: string;
  detail: string;
  relatedArgumentIds: string[];
};

type ResponseDraftCard = {
  id: string;
  title: string;
  pleadingText: string;
  counterclaimDirection: string;
  requestedRelief: string;
  status: "hiányos" | "szerkeszthető" | "ügyvédi review";
};

type OutputTemplate = "full-defense" | "injunction-opposition" | "counterclaim" | "defense";

const phaseLabels: Array<{ key: LitigationPhase; label: string }> = [
  { key: "incoming", label: "1. Ellenfél irata" },
  { key: "brackets", label: "2. Bracketek" },
  { key: "response-road", label: "3. Válaszút" },
  { key: "assembly", label: "4. Dokumentum összeállítása" },
  { key: "lawyer-review", label: "5. Szerkesztés" },
  { key: "export", label: "6. Export / leadás" },
];

const bracketTypeLabels: Record<OpponentBracketType, string> = {
  claim: "Kérelem",
  fact: "Tényállítás",
  legal: "Jogi állítás",
  evidence: "Bizonyítéki hivatkozás",
  amount: "Összegszerűség / kárszámítás",
  procedure: "Eljárási kifogás",
  attackable: "Irreleváns / támadható állítás",
};

const roadTypeLabels: Record<ResponseRoadBlock["type"], string> = {
  "fact-rebuttal": "Ténybeli cáfolat",
  evidence: "Bizonyíték",
  statute: "Jogszabályhely",
  "case-law": "Joggyakorlat",
  "procedural-objection": "Eljárásjogi kifogás",
  "amount-objection": "Összegszerűségi kifogás",
  "evidence-motion": "Bizonyítási indítvány",
  "own-narrative": "Saját narratíva",
};

const outputTemplateLabels: Record<OutputTemplate, string> = {
  "full-defense": "Teljes írásbeli ellenkérelem",
  "injunction-opposition": "Ideiglenes intézkedés elleni ellenkérelem",
  counterclaim: "Viszontkereset",
  defense: "Ellenirat / védekezés",
};

const fullDefenseStructure = [
  "Bíróság megszólítása",
  "Írásbeli ellenkérelem címsor",
  "Alperes adatai",
  "Alperesi jogi képviselő",
  "Felperes adatai",
  "Per tárgya",
  "Ügyszám",
  "Csatolmányok",
  "Bevezető jogi képviseleti formula",
  "A. Érdemi ellenkérelem",
  "B. Tényállási és bizonyítási rész",
  "C. Jogi érvelés / anyagi jogi kifogások",
  "D. Bizonyítási indítványok",
  "E. Mellékletjegyzék",
  "F. Záró kérelem / perköltség / dátum / aláírás",
];

const injunctionOppositionStructure = [
  "Kérelem",
  "Alaki kifogások",
  "Pp. 103. § szerinti feltételek hiánya",
  "Ideiglenes intézkedés nem előlegezheti meg az érdemi döntést",
  "Pp. 104. § szerinti arányossági mérleg",
  "Valószínűsítési kötelezettség hiánya",
  "Biztosítékadás indítványa, ha releváns",
  "Záró kérelem",
];

const riskTone: Record<OpponentArgument["risk"], "gold" | "amber" | "burgundy"> = {
  low: "gold",
  medium: "amber",
  high: "burgundy",
};

const draftStatusTone: Record<ResponseDraftCard["status"], "gold" | "green" | "violet"> = {
  hiányos: "gold",
  szerkeszthető: "green",
  "ügyvédi review": "violet",
};

const riskLabel: Record<OpponentArgument["risk"], string> = {
  low: "Kockázat: alacsony",
  medium: "Kockázat: közepes",
  high: "Kockázat: magas",
};

const roadTone = (type: ResponseRoadBlock["type"]): "green" | "gold" | "blue" | "violet" => {
  if (type === "evidence" || type === "evidence-motion") return "blue";
  if (type === "statute" || type === "case-law") return "violet";
  if (type === "procedural-objection" || type === "amount-objection") return "gold";
  return "green";
};

export default function LitigationWorkspacePage() {
  return (
    <AuthenticatedApp section="litigation-workspace">
      <Suspense fallback={<LitigationWorkspaceShellFallback />}>
        <LitigationWorkspacePageContent />
      </Suspense>
    </AuthenticatedApp>
  );
}

function LitigationWorkspaceShellFallback() {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-[#F3EBD4] p-4">
      <div className="mx-auto max-w-[1640px] rounded-[10px] border border-[#D8CFB6] bg-[#FBF6E7] p-4 text-[13px] text-[#6D6A62]">
        Peres stratégiai térkép betöltése.
      </div>
    </div>
  );
}

function LitigationWorkspacePageContent() {
  const searchParams = useSearchParams();
  const caseId = searchParams?.get("caseId")?.trim() ?? "";
  const documentId = searchParams?.get("documentId")?.trim() ?? "";
  const mode = searchParams?.get("mode")?.trim() || "pleading-foundation";
  const hasContext = Boolean(caseId && documentId);

  const [currentPhase, setCurrentPhase] = useState<LitigationPhase>("incoming");
  const [sourceReference, setSourceReference] = useState("");
  const [localExtractedText, setLocalExtractedText] = useState("");
  const [opponentArguments, setOpponentArguments] = useState<OpponentArgument[]>([]);
  const [roadBlocks, setRoadBlocks] = useState<ResponseRoadBlock[]>([]);
  const [draftCards, setDraftCards] = useState<ResponseDraftCard[]>([]);
  const [outputTemplate, setOutputTemplate] = useState<OutputTemplate>("full-defense");

  const [argumentDraft, setArgumentDraft] = useState({
    type: "claim" as OpponentBracketType,
    title: "",
    quote: "",
    sourceRef: "",
    legalBasis: "",
    evidence: "",
    requestedRelief: "",
    risk: "medium" as OpponentArgument["risk"],
    status: "válaszút kell" as OpponentBracketStatus,
  });

  const [roadDraft, setRoadDraft] = useState({
    title: "",
    detail: "",
    type: "fact-rebuttal" as ResponseRoadBlock["type"],
    relatedArgumentIds: [] as string[],
  });

  const [responseDraft, setResponseDraft] = useState({
    title: "",
    pleadingText: "",
    counterclaimDirection: "",
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

  const assemblyStructure = outputTemplate === "injunction-opposition" ? injunctionOppositionStructure : fullDefenseStructure;

  const addOpponentArgument = () => {
    if (!argumentDraft.title.trim() || !argumentDraft.quote.trim()) return;
    setOpponentArguments((prev) => [
      ...prev,
      {
        id: `arg-${Date.now()}-${prev.length + 1}`,
        type: argumentDraft.type,
        title: argumentDraft.title.trim(),
        quote: argumentDraft.quote.trim(),
        sourceRef: argumentDraft.sourceRef.trim(),
        legalBasis: argumentDraft.legalBasis.trim(),
        evidence: argumentDraft.evidence.trim(),
        requestedRelief: argumentDraft.requestedRelief.trim(),
        risk: argumentDraft.risk,
        status: argumentDraft.status,
      },
    ]);
    setArgumentDraft({
      type: "claim",
      title: "",
      quote: "",
      sourceRef: "",
      legalBasis: "",
      evidence: "",
      requestedRelief: "",
      risk: "medium",
      status: "válaszút kell",
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
    setOpponentArguments((prev) =>
      prev.map((argument) =>
        roadDraft.relatedArgumentIds.includes(argument.id)
          ? { ...argument, status: "válaszút kapcsolva" }
          : argument,
      ),
    );
    setRoadDraft({
      title: "",
      detail: "",
      type: "fact-rebuttal",
      relatedArgumentIds: [],
    });
  };

  const addResponseDraftCard = () => {
    if (!responseDraft.title.trim() || !responseDraft.pleadingText.trim()) return;
    setDraftCards((prev) => [
      ...prev,
      {
        id: `draft-${Date.now()}-${prev.length + 1}`,
        title: responseDraft.title.trim(),
        pleadingText: responseDraft.pleadingText.trim(),
        counterclaimDirection: responseDraft.counterclaimDirection.trim(),
        requestedRelief: responseDraft.requestedRelief.trim(),
        status: responseDraft.status,
      },
    ]);
    setResponseDraft({
      title: "",
      pleadingText: "",
      counterclaimDirection: "",
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
                <AdminBadge tone="green">Peres stratégiai térkép</AdminBadge>
                <AdminStatusPill tone="gold">Local/foundation — szerveroldali mentés későbbi patchben.</AdminStatusPill>
              </div>
              <div>
                <h1 className="font-serif text-[30px] font-medium leading-tight text-[#1F2821]">Peres beadvány válaszút</h1>
                <p className="mt-1 max-w-4xl text-[13px] text-[#6D6A62]">
                  Ügyhöz és ellenfél-iratához kötött bracket, válaszút és beadvány-összeállítási alap.
                </p>
              </div>
            </div>
            <div className="grid gap-2 rounded-[8px] border border-[#D8CFB6] bg-white p-3 text-[11px] text-[#514D45] sm:grid-cols-3">
              <div>
                <p className="font-semibold text-[#1F2821]">Workflow</p>
                <p className="mt-1">Ügy → ellenfél irata → stratégiai térkép</p>
              </div>
              <div>
                <p className="font-semibold text-[#1F2821]">Mentés</p>
                <p className="mt-1">Helyi state</p>
              </div>
              <div>
                <p className="font-semibold text-[#1F2821]">AI / generálás</p>
                <p className="mt-1">Nincs automatikus jogi következtetés</p>
              </div>
            </div>
          </div>
        </section>

        {!hasContext ? (
          <section className="rounded-[10px] border border-[#D8CFB6] bg-white p-4">
            <AdminSectionHeader
              eyebrow="Hiányzó ügykörnyezet"
              title="Válassz ügyet és ellenfél iratát a peres stratégiai térkép indításához."
              subtitle="A munkafelület fogadja a caseId és documentId query paramétereket, de nem tölt be szerveroldali adatot ebben a foundation állapotban."
              action={<AdminStatusPill tone="gold">Context szükséges</AdminStatusPill>}
            />
          </section>
        ) : (
          <section className="grid gap-2 rounded-[10px] border border-[#D8CFB6] bg-white p-4 text-[11px] text-[#514D45] md:grid-cols-4">
            <div>
              <p className="font-semibold text-[#1F2821]">Ügy</p>
              <p className="mt-1 break-all">{caseId}</p>
            </div>
            <div>
              <p className="font-semibold text-[#1F2821]">Dokumentum</p>
              <p className="mt-1 break-all">{documentId}</p>
            </div>
            <div>
              <p className="font-semibold text-[#1F2821]">Mód</p>
              <p className="mt-1 break-all">{mode}</p>
            </div>
            <div>
              <p className="font-semibold text-[#1F2821]">Státusz</p>
              <p className="mt-1">local/foundation</p>
            </div>
          </section>
        )}

        <section className="rounded-[10px] border border-[#D8CFB6] bg-white p-4">
          <div className="flex flex-wrap gap-2">
            {phaseLabels.map((phase) => {
              const active = currentPhase === phase.key;
              return (
                <button
                  key={phase.key}
                  type="button"
                  onClick={() => setCurrentPhase(phase.key)}
                  className={`inline-flex min-h-10 items-center rounded-[6px] border px-3 py-2 text-[11px] font-semibold transition-colors ${
                    active
                      ? "border-[#1F4A33] bg-[#1F4A33] text-[#F4EFDB]"
                      : "border-[#E7DECB] bg-[#FBF9F3] text-[#514D45] hover:bg-white"
                  }`}
                >
                  {phase.label}
                </button>
              );
            })}
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(300px,0.95fr)_minmax(340px,1.1fr)_minmax(300px,0.95fr)]">
          <AdminPanel className="overflow-hidden">
            <AdminSectionHeader
              eyebrow="1. Ellenfél irata"
              title="Input dokumentum"
              subtitle="Az ellenoldali beadvány helyi kivonata és forráshelyei. A tényleges dokumentum-szöveg kinyerése még nincs bekötve."
              action={<AdminStatusPill tone="burgundy">{opponentArguments.length} bracket</AdminStatusPill>}
            />
            <div className="space-y-3 p-4">
              <div className="rounded-[8px] border border-[#E5C3C3] bg-[#FFF7F4] p-3">
                <div className="grid gap-2">
                  <input
                    value={sourceReference}
                    onChange={(event) => setSourceReference(event.target.value)}
                    placeholder="Forrás referencia: oldal / pont / bekezdés"
                    className="rounded border border-[#DFCFC6] bg-white px-3 py-2 text-xs text-[#1F2821]"
                  />
                  <textarea
                    value={localExtractedText}
                    onChange={(event) => setLocalExtractedText(event.target.value)}
                    rows={5}
                    placeholder="Local extracted text / dokumentum placeholder"
                    className="rounded border border-[#DFCFC6] bg-white px-3 py-2 text-xs text-[#1F2821]"
                  />
                  <p className="rounded-[6px] border border-dashed border-[#E5C3C3] bg-white px-3 py-2 text-[11px] text-[#7B776D]">
                    A tényleges iratkinyerés és dokumentum-olvasás még nincs bekötve; ez helyi előkészítő mező.
                  </p>
                </div>
              </div>

              <div className="rounded-[8px] border border-[#E5C3C3] bg-[#FFF7F4] p-3">
                <div className="grid gap-2">
                  <select
                    value={argumentDraft.type}
                    onChange={(event) => setArgumentDraft((prev) => ({ ...prev, type: event.target.value as OpponentBracketType }))}
                    className="rounded border border-[#DFCFC6] bg-white px-3 py-2 text-xs text-[#1F2821]"
                  >
                    {Object.entries(bracketTypeLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <input
                    value={argumentDraft.title}
                    onChange={(event) => setArgumentDraft((prev) => ({ ...prev, title: event.target.value }))}
                    placeholder="Érv / kérelem címe"
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
                    placeholder="Forráshely: oldal / pont / bekezdés"
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
                  <div className="grid gap-2 sm:grid-cols-2">
                    <select
                      value={argumentDraft.risk}
                      onChange={(event) => setArgumentDraft((prev) => ({ ...prev, risk: event.target.value as OpponentArgument["risk"] }))}
                      className="rounded border border-[#DFCFC6] bg-white px-3 py-2 text-xs text-[#1F2821]"
                    >
                      <option value="low">Kockázat: alacsony</option>
                      <option value="medium">Kockázat: közepes</option>
                      <option value="high">Kockázat: magas</option>
                    </select>
                    <select
                      value={argumentDraft.status}
                      onChange={(event) => setArgumentDraft((prev) => ({ ...prev, status: event.target.value as OpponentBracketStatus }))}
                      className="rounded border border-[#DFCFC6] bg-white px-3 py-2 text-xs text-[#1F2821]"
                    >
                      <option value="rögzítve">Státusz: rögzítve</option>
                      <option value="válaszút kell">Státusz: válaszút kell</option>
                      <option value="válaszút kapcsolva">Státusz: válaszút kapcsolva</option>
                      <option value="lezárható">Státusz: lezárható</option>
                    </select>
                  </div>
                  <AdminButton variant="warning" size="sm" onClick={addOpponentArgument} disabled={!argumentDraft.title.trim() || !argumentDraft.quote.trim()}>
                    Bracket hozzáadása
                  </AdminButton>
                </div>
              </div>

              {opponentArguments.length === 0 ? (
                <div className="rounded-[8px] border border-dashed border-[#DFCFC6] bg-[#FBF9F3] p-4 text-[12px] text-[#7B776D]">
                  Még nincs ellenoldali bracket. A felvett állításokhoz később több válaszút-blokk kapcsolható.
                </div>
              ) : (
                opponentArguments.map((argument) => (
                  <div key={argument.id} className="relative rounded-[10px] border border-[#E5C3C3] bg-white p-4 pl-6 shadow-sm before:absolute before:bottom-4 before:left-0 before:top-4 before:w-[4px] before:rounded-r-full before:bg-[#8F3131]">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <AdminBadge tone="burgundy">{bracketTypeLabels[argument.type]}</AdminBadge>
                        <h3 className="mt-2 font-serif text-lg font-medium text-[#1F2821]">{argument.title}</h3>
                      </div>
                      <AdminStatusPill tone={riskTone[argument.risk]}>{riskLabel[argument.risk]}</AdminStatusPill>
                    </div>
                    <p className="mt-3 rounded-[8px] border border-[#F0DFD8] bg-[#FFF8F5] px-3 py-2 text-[12px] italic text-[#6B4A44]">
                      „{argument.quote}”
                    </p>
                    <dl className="mt-3 space-y-2 text-[11px] text-[#514D45]">
                      <div>
                        <dt className="font-semibold text-[#1F2821]">Forráshely: oldal / pont / bekezdés</dt>
                        <dd>{argument.sourceRef || sourceReference || "Nincs megadva"}</dd>
                      </div>
                      <div>
                        <dt className="font-semibold text-[#1F2821]">Hivatkozott jogalap</dt>
                        <dd>{argument.legalBasis || "Nincs megadva"}</dd>
                      </div>
                      <div>
                        <dt className="font-semibold text-[#1F2821]">Hivatkozott bizonyíték</dt>
                        <dd>{argument.evidence || "Nincs megadva"}</dd>
                      </div>
                      <div>
                        <dt className="font-semibold text-[#1F2821]">Követelt jogkövetkezmény</dt>
                        <dd>{argument.requestedRelief || "Nincs megadva"}</dd>
                      </div>
                      <div>
                        <dt className="font-semibold text-[#1F2821]">Státusz</dt>
                        <dd>{argument.status}</dd>
                      </div>
                    </dl>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <AdminBadge tone={linkedCounts[argument.id] ? "blue" : "neutral"}>{linkedCounts[argument.id] || 0} kapcsolódó válaszút-blokk</AdminBadge>
                    </div>
                  </div>
                ))
              )}
            </div>
          </AdminPanel>

          <AdminPanel className="overflow-hidden">
            <AdminSectionHeader
              eyebrow="3. Válaszút"
              title="Bracketekhez kapcsolt válaszút"
              subtitle="Ténybeli cáfolat, bizonyíték, jogszabályhely, joggyakorlat és eljárásjogi reakciók egy útvonalon."
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
                    rows={5}
                    placeholder="Ténybeli cáfolat, bizonyíték, jogszabályhely, joggyakorlat, kifogás vagy saját narratíva"
                    className="rounded border border-[#E3D6AA] bg-white px-3 py-2 text-xs text-[#1F2821]"
                  />
                  <div className="rounded-[6px] border border-[#E6D8AD] bg-white p-3">
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#7B776D]">Kapcsolódó opponent bracketek</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {opponentArguments.length === 0 ? (
                        <span className="text-[11px] text-[#7B776D]">Előbb adj hozzá bracketeket.</span>
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
                  A stratégiai út itt épül fel. Egy blokk több ellenoldali brackethez is kapcsolható.
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
                          <AdminBadge tone={roadTone(block.type)}>{roadTypeLabels[block.type]}</AdminBadge>
                          {block.relatedArgumentIds.length > 0 ? <AdminBadge tone="blue">{block.relatedArgumentIds.length} bracket-kapcsolat</AdminBadge> : null}
                        </div>
                        <h3 className="mt-2 font-serif text-lg font-medium text-[#1F2821]">{block.title}</h3>
                        <p className="mt-2 whitespace-pre-wrap text-[12px] leading-6 text-[#514D45]">{block.detail}</p>
                        <div className="mt-3 rounded-[8px] border border-[#EEE7D9] bg-[#FCFAF4] px-3 py-2 text-[10px] text-[#6D6A62]">
                          Kapcsolat: {block.relatedArgumentIds.length > 0 ? "egy vagy több ellenoldali brackethez kötve" : "még nincs bracket-kapcsolat"}
                        </div>
                        {block.relatedArgumentIds.length > 0 ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {block.relatedArgumentIds.map((argumentId) => {
                              const argument = opponentArguments.find((item) => item.id === argumentId);
                              return argument ? (
                                <AdminBadge key={argumentId} tone="blue">
                                  {argument.title}
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
              eyebrow="4. Dokumentum összeállítása"
              title="Beadvány-kimenet"
              subtitle="Beadványba illeszthető válaszok, ellenkérelmi irány és Bálintfy szerkezet előnézete."
              action={<AdminStatusPill tone="violet">{draftCards.length} válasz</AdminStatusPill>}
            />
            <div className="space-y-3 p-4">
              <div className="rounded-[8px] border border-[#D7CCB0] bg-[#FBF9F3] p-3">
                <div className="grid gap-2">
                  <select
                    value={outputTemplate}
                    onChange={(event) => setOutputTemplate(event.target.value as OutputTemplate)}
                    className="rounded border border-[#DDD7CA] bg-white px-3 py-2 text-xs text-[#1F2821]"
                  >
                    {Object.entries(outputTemplateLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <input
                    value={responseDraft.title}
                    onChange={(event) => setResponseDraft((prev) => ({ ...prev, title: event.target.value }))}
                    placeholder="Válasz-blokk címe"
                    className="rounded border border-[#DDD7CA] bg-white px-3 py-2 text-xs text-[#1F2821]"
                  />
                  <textarea
                    value={responseDraft.pleadingText}
                    onChange={(event) => setResponseDraft((prev) => ({ ...prev, pleadingText: event.target.value }))}
                    rows={4}
                    placeholder="Beadványba illeszthető válasz"
                    className="rounded border border-[#DDD7CA] bg-white px-3 py-2 text-xs text-[#1F2821]"
                  />
                  <input
                    value={responseDraft.counterclaimDirection}
                    onChange={(event) => setResponseDraft((prev) => ({ ...prev, counterclaimDirection: event.target.value }))}
                    placeholder="Viszontkereseti / ellenkérelmi irány"
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
                    <option value="hiányos">Státusz: hiányos</option>
                    <option value="szerkeszthető">Státusz: szerkeszthető</option>
                    <option value="ügyvédi review">Státusz: ügyvédi review</option>
                  </select>
                  <AdminButton variant="primary" size="sm" onClick={addResponseDraftCard} disabled={!responseDraft.title.trim() || !responseDraft.pleadingText.trim()}>
                    Válasz-blokk hozzáadása
                  </AdminButton>
                </div>
              </div>

              {draftCards.length === 0 ? (
                <div className="rounded-[8px] border border-dashed border-[#DDD7CA] bg-white p-4 text-[12px] text-[#7B776D]">
                  Még nincs beadványba illeszthető válasz. Itt készülhetnek a dokumentum-összeállításhoz használt helyi blokkok.
                </div>
              ) : (
                draftCards.map((card) => (
                  <div key={card.id} className="rounded-[10px] border border-[#DDD7CA] bg-white p-4 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <h3 className="font-serif text-lg font-medium text-[#1F2821]">{card.title}</h3>
                      <AdminStatusPill tone={draftStatusTone[card.status]}>{card.status}</AdminStatusPill>
                    </div>
                    <div className="mt-3 rounded-[8px] border border-[#E7DECB] bg-[#FCFAF4] p-3">
                      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#7B776D]">Beadványba illeszthető válasz</p>
                      <p className="mt-2 whitespace-pre-wrap text-[12px] leading-6 text-[#514D45]">{card.pleadingText}</p>
                    </div>
                    <dl className="mt-3 space-y-2 text-[11px] text-[#514D45]">
                      <div>
                        <dt className="font-semibold text-[#1F2821]">Viszontkereseti / ellenkérelmi irány</dt>
                        <dd>{card.counterclaimDirection || "Nincs megadva"}</dd>
                      </div>
                      <div>
                        <dt className="font-semibold text-[#1F2821]">Kérelem / jogkövetkezmény</dt>
                        <dd>{card.requestedRelief || "Nincs megadva"}</dd>
                      </div>
                    </dl>
                  </div>
                ))
              )}

              <div className="rounded-[10px] border border-[#D8CFB6] bg-[#FBF6E7] p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="font-serif text-xl font-medium text-[#1F2821]">Bálintfy ellenkérelem struktúra</h3>
                    <p className="mt-1 text-[12px] text-[#6D6A62]">{outputTemplateLabels[outputTemplate]}</p>
                  </div>
                  <AdminStatusPill tone="gold">Későbbi patch</AdminStatusPill>
                </div>
                <ol className="mt-4 grid gap-2 rounded-[8px] border border-[#E7DECB] bg-white p-4 text-[12px] text-[#514D45]">
                  {assemblyStructure.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ol>
                <p className="mt-3 rounded-[6px] border border-dashed border-[#D8CFB6] bg-white px-3 py-2 text-[11px] text-[#7B776D]">
                  Dokumentum összeállítása későbbi patchben aktiválható.
                </p>
                <div className="mt-3 rounded-[6px] border border-[#E7DECB] bg-white px-3 py-2 text-[11px] text-[#7B776D]">
                  Nincs végleges beadványgenerálás, nincs fake AI output és nincs automatikus legal certainty.
                </div>
              </div>
            </div>
          </AdminPanel>
        </section>
      </div>
    </div>
  );
}
