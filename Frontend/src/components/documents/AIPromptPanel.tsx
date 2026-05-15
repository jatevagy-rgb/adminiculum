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
    instruction: `Készíts gyors, ügyvédi felülvizsgálatra alkalmas jogi kockázatelemzést legfeljebb 2-4 oldalban. A válasz szerkezete pontosan ez legyen, és semmi mást ne tartalmazzon a megadott struktúrán kívül:

# Gyors jogi kockázatelemzés

## 1. Rövid összefoglaló
- Szerződés típusa:
- Felek szerepe:
- Szerződés tárgya:
- Legfontosabb kockázat egy mondatban:

## 2. Kockázati táblázat
| # | Probléma | Kockázat szintje | Miért gond? | Javasolt javítás | Ügyvédi döntési pont |
|---|---|---|---|---|---|---|

## 3. Hiányzó / ellenőrizendő adatok
| Hiányzó adat/irat | Miért szükséges? | Ki tudja megadni? | Sürgősség |
|---|---|---|---|---|

## 4. Javasolt következő lépések
Numbered list, maximum 6 elem.

Csak anyagi (jogi relevanciájú) problémákat szerepeltess. Kockázati szintek: Alacsony / Közepes / Magas / Kritikus.`,
  },
  {
    id: "fullLegal",
    label: "Teljes jogi elemzés",
    description: "Tények, jogi kérdések, kockázati mátrix, alkupontok.",
    instruction: `Készíts teljes, ügyvédi felülvizsgálatra alkalmas jogi elemzést. A válasz szerkezete pontosan ez legyen, és semmi mást ne tartalmazzon:

# Teljes jogi elemzés ügyvédi review-hoz

## 1. Vezetői összefoglaló
Maximum 8 bullet point, gyakorlati és tömör.

## 2. Tényállás és dokumentum kontextus
| Elem | Megállapítás | Bizonytalanság / hiány |
|---|---|---|

## 3. Fő jogi kérdések
| Jogi kérdés | Relevancia | Kockázat | Ellenőrizendő tény |
|---|---|---|---|---|

## 4. Kockázati mátrix
| # | Kockázat | Szint | Érintett rendelkezés | Hatás | Javasolt kezelés |
|---|---|---|---|---|---|---|

## 5. Hiányzó iratok/adatok
| Irat/adat | Kritikus? | Miért kell? | Beszerzés forrása |
|---|---|---|---|---|

## 6. Várható ellenoldali érvek és válaszok
| Várható ellenoldali érv | Erősség | Lehetséges válasz | Tárgyalási javaslat |
|---|---|---|---|---|

## 7. Javasolt szerződésmódosítások
| Eredeti probléma | Javasolt módosítás iránya | Konkrét beilleszthető szöveg | Indoklás |
|---|---|---|---|---|

## 8. Beilleszthető szövegblokkok
Csak akkor javasolj szöveget, ha a tények elegendők. Ha hiányzó tény van, ezt írd: „Szöveg nem javasolható a következő hiányzó tény miatt: …"

## 9. Ügyvédi döntési pontok
Numbered list.

## 10. Figyelmeztetés
„Ez az elemzés ügyvédi felülvizsgálatot igényel; nem minősül végleges jogi állásfoglalásnak."`,
  },
  {
    id: "missingData",
    label: "Hiányzó adatok és iratok",
    description: "Kritikus, ajánlott és opcionális hiányok listája.",
    instruction: `Készíts hiányzó adat- és iratlistát ügyvédi munkához. A válasz szerkezete pontosan ez legyen:

# Hiányzó adatok és iratok listája

## 1. Kritikus hiányok
| Hiányzó adat/irat | Miért kritikus? | Milyen döntést akadályoz? | Kihez kell fordulni? |
|---|---|---|---|---|

## 2. Ajánlott ellenőrzések
| Ellenőrzés | Cél | Forrás | Határidő / prioritás |
|---|---|---|---|---|

## 3. Opcionális kiegészítések
| Kiegészítés | Haszna | Mikor szükséges? |
|---|---|---|

## 4. Kérdéslista az ügyfélnek
Numbered, gyakorlati kérdések.

Ne találj ki nem szereplő adatot.`,
  },
  {
    id: "clauseEdits",
    label: "Módosítási javaslatok",
    description: "Konkrét klauzula-javítások indokolással.",
    instruction: `Tegyél konkrét szerződésmódosítási javaslatokat ügyvédi review-hoz. Minden javaslat az alábbi táblázatban legyen:

# Szerződésmódosítási javaslatok

## Javaslat [sorszám]

| Mező | Tartalom |
|---|---|
| Eredeti probléma | … |
| Érintett rendelkezés | … |
| Javasolt új szöveg | … |
| Indoklás | … |
| Kockázati hatás | … |
| Ügyvédi review megjegyzés | … |

Több javaslat esetén ismételd a táblát minden javaslathoz. Őrizd meg a jogi szerkesztési stílust. Ha a tényállás hiányos, ne írj fiktív klauzulát; helyettesítsd a „Javasolt új szöveg" mezőt a megjegyzéssel: „Hiányzó tény: … — szövegezéshez további információ szükséges." Ha kétnyelvű vagy kéthasábos szerkesztés lehet szükséges, adj hozzá egy külön megjegyzést: „Kétnyelvű vagy kéthasábos szerkesztés esetén külön formázási review szükséges."`,
  },
  {
    id: "counterpartyArguments",
    label: "Ellenoldali érvek",
    description: "Várható ellenérvek és válaszstratégia.",
    instruction: `Azonosítsd a várható ellenoldali érveket, kifogásokat és alkupozíciókat. A válasz szerkezete pontosan ez legyen:

# Ellenoldali érvek és válaszstratégia

| # | Várható ellenoldali érv | Erősség | Miért várható? | Javasolt válasz | Tárgyalási javaslat |
|---|---|---|---|---|---|---|

## Legjobb alkuirány
Bullet points, rövid és gyakorlati.

## Nem javasolt engedmények
Bullet points.

A válasz legyen tárgyalás-előkészítő, ne végleges állásfoglalás. Ha valamely érv csak feltételezés, azt „(feltételezés)" megjegyzéssel jelöld.`,
  },
  {
    id: "formatting",
    label: "Formázás / helyesírás",
    description: "Nyelvi, formai és konzisztencia-ellenőrzés.",
    instruction: `Végezz helyesírási, nyelvhelyességi, formázási, számozási, hivatkozási és stílusbeli konzisztencia-ellenőrzést. A válasz szerkezete pontosan ez legyen:

# Formázási és nyelvi review

## 1. Javítandó hibák
| Hiba típusa | Hely / rész | Javasolt javítás | Megjegyzés |
|---|---|---|---|---|

## 2. Számozás és hivatkozások
| Probléma | Javasolt javítás |
|---|---|
| Hivatkozás hibás | Javított hivatkozás |
| Számozás hiányzik | Javasolt számozás |

## 3. Stílus és koherencia
Bullet points.

Ne tegyél érdemi jogi változtatást. Ha egy mondat jogi jelentéskockázatot hordoz, jelöld meg: „jogi review szükséges".`,
  },
  {
    id: "partnerVerification",
    label: "Partnerellenőrzési összefoglaló vázlat",
    description: "Checklist-vázlat fél- és cégellenőrzéshez.",
    instruction: `Készíts partnerellenőrzési összefoglaló vázlatot checklist táblázat formában. A válasz szerkezete pontosan ez legyen:

# Partnerellenőrzési összefoglaló vázlat

## 1. Ellenőrzési státusz
„Nem ellenőrzött — a dokumentumban szereplő adatok alapján csak checklist készült."

## 2. Checklist
| Ellenőrzési pont | Szükséges adat/bizonyíték | Státusz | Megjegyzés |
|---|---|---|---|
| Adószám | | nem ellenőrzött | |
| EU VAT szám / közösségi adószám | | nem ellenőrzött | |
| Megbízható adózói lista | | nem ellenőrzött | |
| ÁFA-bevallást elmulasztók listája | | nem ellenőrzött | |
| Adótartozás / végrehajtási lista | | nem ellenőrzött | |
| Cégjegyzék | | nem ellenőrzött | |
| Köztartozásmentes adózói adatbázis | | nem ellenőrzött | |
| Csatolt bizonyíték zip | | nem ellenőrzött | |

## 3. Hiányzó bizonyítékok
Bullet points.

## 4. Ügyvédi döntési pontok
Bullet points.

Ne állítsd, hogy bármely nyilvántartásban tényleges ellenőrzés történt, ha nincs megadott bizonyíték.`,
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
    "A dokumentumszöveg anonimizált.",
    "Őrizd meg változatlanul a placeholder tokeneket: [ÜGYFÉL], [MEGBÍZÓ], [ELLENÉRDEKŰ FÉL], [CÍM_1], [AZONOSÍTÓ_1].",
    "Ne találj ki hiányzó tényeket.",
    "A feltételezéseket külön jelöld.",
    "Ügyvédi felülvizsgálatra alkalmas munkaterméket készíts.",
    "Ne adj végleges jogi tanácsot.",
    "Ne hivatkozz külső adatbázis-ellenőrzésre, ha adatot/bizonyítékot nem kaptál.",
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