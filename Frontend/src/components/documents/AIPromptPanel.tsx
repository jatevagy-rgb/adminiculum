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
      "Készíts gyors, ügyvédi felülvizsgálatra alkalmas jogi kockázatelemzést legfeljebb 2-4 oldalban. A válasz szerkezete pontosan ez legyen: 1. Rövid összefoglaló. 2. Legfontosabb problémák táblázata ezekkel az oszlopokkal: Probléma | Kockázat szintje | Miért gond? | Javasolt javítás. 3. Hiányzó / ellenőrizendő adatok. 4. Gyors ügyvédi döntési pontok. A válasz legyen gyakorlati, tömör, döntés-előkészítő jellegű.",
  },
  {
    id: "fullLegal",
    label: "Teljes jogi elemzés",
    description: "Tények, jogi kérdések, kockázati mátrix, alkupontok.",
    instruction:
      "Készíts teljes, ügyvédi felülvizsgálatra alkalmas jogi elemzést. A válasz szerkezete pontosan ez legyen: 1. Vezetői összefoglaló. 2. Tényállás és dokumentum kontextus. 3. Fő jogi kérdések. 4. Kockázati mátrix. 5. Hiányzó iratok/adatok. 6. Várható ellenoldali érvek és válaszok. 7. Javasolt szerződésmódosítások. 8. Beilleszthető szövegblokkok. 9. Ügyvédi döntési pontok. 10. Figyelmeztetés: ügyvédi review szükséges. A beilleszthető szövegblokkoknál csak olyan klauzulát javasolj, amelyhez a tények rendelkezésre állnak; hiányzó tény esetén ezt külön jelezd.",
  },
  {
    id: "missingData",
    label: "Hiányzó adatok és iratok",
    description: "Kritikus, ajánlott és opcionális hiányok listája.",
    instruction:
      "Készíts hiányzó adat- és iratlistát ügyvédi munkához. A válasz szerkezete ez legyen: Kritikus hiányok; Ajánlott ellenőrzések; Opcionális kiegészítések; Kihez kell fordulni / milyen irat kell. Minden elemnél írd le röviden, miért szükséges, milyen döntést akadályoz, és ki lehet a valószínű adatgazda. Ne találj ki nem szereplő adatot.",
  },
  {
    id: "clauseEdits",
    label: "Módosítási javaslatok",
    description: "Konkrét klauzula-javítások indokolással.",
    instruction:
      "Tegyél konkrét szerződésmódosítási javaslatokat ügyvédi review-hoz. Minden javaslatnál ezt a szerkezetet használd: eredeti probléma; javasolt új szöveg; indoklás; kockázati hatás. Őrizd meg a jogi szerkesztési stílust. Ha a tényállás hiányos, ne írj fiktív klauzulát; helyette jelöld meg, milyen tény vagy dokumentum szükséges a szövegezéshez.",
  },
  {
    id: "counterpartyArguments",
    label: "Ellenoldali érvek",
    description: "Várható ellenérvek és válaszstratégia.",
    instruction:
      "Azonosítsd a várható ellenoldali érveket, kifogásokat és alkupozíciókat. Táblázatos szerkezetet használj ezekkel az oszlopokkal: Várható ellenoldali érv; Erősség; Válasz; Tárgyalási javaslat. A válasz legyen tárgyalás-előkészítő, ne végleges állásfoglalás. Jelöld külön, ha valamely érv csak feltételezés a dokumentum alapján.",
  },
  {
    id: "formatting",
    label: "Formázás / helyesírás",
    description: "Nyelvi, formai és konzisztencia-ellenőrzés.",
    instruction:
      "Csak helyesírási, nyelvhelyességi, formázási, számozási, hivatkozási és stílusbeli konzisztencia-ellenőrzést végezz. Ne tegyél érdemi jogi változtatást, kivéve ha külön, elkülönített megjegyzésben jelzed, hogy az már nem pusztán formai javítás és külön ügyvédi döntést igényel. A válasz listázza: észlelt hiba; javasolt javítás; javítás típusa.",
  },
  {
    id: "partnerVerification",
    label: "Partnerellenőrzési összefoglaló vázlat",
    description: "Checklist-vázlat fél- és cégellenőrzéshez.",
    instruction:
      "Készíts partnerellenőrzési összefoglaló vázlatot checklist táblázat formában. A státusz maradjon 'nem ellenőrzött', kivéve ha a felhasználó konkrét bizonyítékot adott. A táblázat tartalmazza: ellenőrzési pont; bekért/adott adat; státusz; hiányzó bizonyíték; megjegyzés. Térj ki ezekre: adószám, EU VAT number / közösségi adószám, megbízható adózói és nyilvános listák, cégjegyzék, végrehajtási/adósság indikátorok, köztartozásmentes adatbázis, csatolt bizonyíték zip. Ne állítsd, hogy bármely nyilvántartásban tényleges ellenőrzés történt, ha nincs megadott bizonyíték.",
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
    "Magyar nyelven válaszolj.",
    "A dokumentumszöveg anonimizált. Őrizd meg változatlanul az anonimizált placeholder tokeneket, például [ÜGYFÉL], [MEGBÍZÓ], [ELLENÉRDEKŰ FÉL], [CÍM_1], [AZONOSÍTÓ_1].",
    "Ne találj ki hiányzó tényeket. A feltételezéseket külön, egyértelműen jelöld.",
    "Ügyvédi felülvizsgálatra alkalmas munkaterméket készíts, ne végleges jogi tanácsot.",
    option.id === "fullLegal"
      ? "Részletes elemzést készíts, de maradj strukturált, gyakorlati és ügyvédi döntésre előkészített."
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
        <p className="text-[10px] uppercase tracking-[0.2em] text-[#7B776D]">Prompt panel</p>
        <h3 className="mt-1 text-sm font-semibold text-[#1F2821]">Külső AI promptok</h3>
        <p className="mt-2 text-[11px] text-[#514D45]">
          Adminiculum nem hív külső AI-t és nem ment elemzést. A gombok csak vágólapra másolható munkapromptokat készítenek.
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
              {copiedId === option.id ? "Vágólapra másolva: " : ""}{option.label}
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
