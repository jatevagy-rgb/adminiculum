"use client";

import { useState } from "react";

type PromptKind =
  | "quickRisk"
  | "fullLegal"
  | "missingData"
  | "clauseEdits"
  | "counterpartyArguments"
  | "formatting"
  | "partnerVerification";

type PromptOption = {
  id: PromptKind;
  label: string;
  description: string;
  instruction: string;
};

type AIPromptPanelProps = {
  caseId?: string;
  documentId?: string;
  documentTitle?: string;
  anonymizedText?: string;
  className?: string;
};

const promptOptions: PromptOption[] = [
  {
    id: "quickRisk",
    label: "Gyors kockázatelemzés",
    description: "2-4 oldalas, táblázatos kockázati áttekintés.",
    instruction:
      "Készíts rövid jogi kockázatelemzést legfeljebb 2-4 oldalban. Használj táblázatot ezekkel az oszlopokkal: probléma, kockázati szint, miért probléma, javasolt javítás.",
  },
  {
    id: "fullLegal",
    label: "Teljes jogi elemzés",
    description: "Tények, jogi kérdések, kockázati mátrix, alkupontok.",
    instruction:
      "Készíts részletes, ügyvédi felülvizsgálatra alkalmas jogi elemzést. Térj ki a tényállásra, jogi kérdésekre, kockázati mátrixra, hiányzó adatokra, tárgyalási pontokra és javasolt szerződéses klauzulákra. Jelezd külön, hogy ügyvédi felülvizsgálat szükséges.",
  },
  {
    id: "missingData",
    label: "Hiányzó adatok és iratok",
    description: "Kritikus, ajánlott és opcionális hiányok listája.",
    instruction:
      "Listázd a hiányzó információkat és iratokat. Osztályozd őket három csoportba: kritikus, ajánlott, opcionális. Minden elemnél írd le, miért szükséges.",
  },
  {
    id: "clauseEdits",
    label: "Módosítási javaslatok",
    description: "Konkrét klauzula-javítások indokolással.",
    instruction:
      "Tegyél konkrét szerződésszöveg-módosítási javaslatokat. Őrizd meg a jogi szerkesztési stílust, és minden módosításnál röviden indokold a javaslatot.",
  },
  {
    id: "counterpartyArguments",
    label: "Ellenoldali érvek",
    description: "Várható ellenérvek és válaszstratégia.",
    instruction:
      "Azonosítsd a várható ellenoldali érveket, kifogásokat és alkupozíciókat. Minden érvhez adj lehetséges választ vagy tárgyalási stratégiát.",
  },
  {
    id: "formatting",
    label: "Formázás / helyesírás",
    description: "Nyelvi, formai és konzisztencia-ellenőrzés.",
    instruction:
      "Ellenőrizd a helyesírást, nyelvhelyességet, számozást, hivatkozásokat és formai konzisztenciát. Érdemi jogi változtatást csak akkor javasolj, ha külön jelölöd, hogy az nem pusztán formai javítás.",
  },
  {
    id: "partnerVerification",
    label: "Partnerellenőrzési összefoglaló vázlat",
    description: "Checklist-vázlat fél- és cégellenőrzéshez.",
    instruction:
      "Készíts checklist-jellegű partnerellenőrzési összefoglaló vázlatot. Ne állítsd, hogy az ellenőrzés megtörtént, ha a felhasználó nem adott hozzá bizonyítékot. Térj ki külön ezekre: adószám, közösségi adószám, megbízható adózói lista, hiányzó áfabevallók listája, adótartozás vagy végrehajtási listák, nyilvános cégjegyzék, köztartozásmentes adózói adatbázis, csatolt bizonyíték zip.",
  },
];

function buildPrompt(option: PromptOption, props: AIPromptPanelProps): string {
  const text = props.anonymizedText?.trim();
  const documentBlock = text
    ? `=== ANONIMIZÁLT DOKUMENTUMSZÖVEG ===\n${text}`
    : "=== ANONIMIZÁLT DOKUMENTUMSZÖVEG ===\nIlleszd be ide az anonimizált dokumentumszöveget. A jelenlegi felület csak prompt-vázat készít, mert nincs elérhető anonimizált szöveg ebben a nézetben.";

  return [
    "Adminiculum szerződés-workspace prompt",
    "",
    `Ügy azonosító: ${props.caseId || "nem ismert"}`,
    `Dokumentum azonosító: ${props.documentId || "nem ismert"}`,
    `Dokumentum címe: ${props.documentTitle || "nem ismert"}`,
    "",
    "A szöveg anonimizált. Őrizd meg az anonimizált placeholder tokeneket, például [ÜGYFÉL], [MEGBÍZÓ], [ELLENÉRDEKŰ FÉL], [CÍM_1], [AZONOSÍTÓ_1].",
    "Ne találj ki hiányzó tényeket. A feltételezéseket külön, egyértelműen jelöld.",
    "Ügyvédi felülvizsgálatra alkalmas munkaterméket készíts, ne végleges jogi tanácsot.",
    option.id === "fullLegal"
      ? "Részletes elemzést készíts, de maradj strukturált és gyakorlati."
      : "Kerüld a túl hosszú, akadémikus esszét; gyakorlati, áttekinthető választ adj.",
    "Ne hivatkozz arra, hogy külső adatbázisban ellenőriztél bármit, ha a szükséges adatokat vagy bizonyítékokat nem kaptad meg.",
    "",
    "Feladat:",
    option.instruction,
    "",
    documentBlock,
  ].join("\n");
}

export function AIPromptPanel(props: AIPromptPanelProps) {
  const [copiedId, setCopiedId] = useState<PromptKind | null>(null);
  const hasText = Boolean(props.anonymizedText?.trim());

  const handleCopy = async (option: PromptOption) => {
    try {
      await navigator.clipboard.writeText(buildPrompt(option, props));
      setCopiedId(option.id);
      setTimeout(() => setCopiedId(null), 1800);
    } catch {
      setCopiedId(null);
    }
  };

  return (
    <aside className={`border border-[#DDD7CA] bg-white p-4 ${props.className || ""}`}>
      <div className="mb-4">
        <p className="text-[10px] uppercase tracking-[0.2em] text-[#7B776D]">AI prompt panel</p>
        <h3 className="mt-1 text-sm font-semibold text-[#1F2821]">Külső AI promptok</h3>
        <p className="mt-2 text-[11px] text-[#514D45]">
          A rendszer nem hív külső AI-t. A gombok csak vágólapra másolható promptokat készítenek.
        </p>
        <p className="mt-2 text-[10px] text-[#7B776D]">
          {hasText
            ? "A prompt a jelenleg látható anonimizált / munkaszöveget is tartalmazza."
            : "Ebben a nézetben nincs teljes anonimizált szöveg; a prompt-váz kéri a szöveg beillesztését."}
        </p>
      </div>

      <div className="space-y-2">
        {promptOptions.map((option) => (
          <button
            key={option.id}
            onClick={() => handleCopy(option)}
            className="w-full text-left border border-[#EEE7D9] p-3 hover:bg-[#FBF9F3] transition-colors"
          >
            <span className="block text-xs font-semibold text-[#1F2821]">
              {copiedId === option.id ? "Másolva: " : ""}{option.label}
            </span>
            <span className="mt-1 block text-[10px] text-[#7B776D]">{option.description}</span>
          </button>
        ))}
      </div>

      <div className="mt-4 border border-[#EEE7D9] bg-[#FBF9F3] p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold text-[#1F2821]">Partnerellenőrzés</p>
          <span className="text-[10px] px-2 py-0.5 border border-[#DDD7CA] bg-white text-[#7B776D]">Nincs rögzítve</span>
        </div>
        <p className="mt-2 text-[10px] text-[#7B776D]">
          A részletes ellenőrzési zip és checklist külön workflow-ban lesz kezelve.
        </p>
      </div>
    </aside>
  );
}
