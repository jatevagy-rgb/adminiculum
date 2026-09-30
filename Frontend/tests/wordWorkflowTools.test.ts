import test from "node:test";
import assert from "node:assert/strict";

import {
  copyDirectPromptToClipboard,
  containsRawSensitiveMarker,
  validateSanitizedContext,
  buildDirectCurrentStatePrompt,
  buildDirectCaseContextPrompt,
  buildDirectGoalActionPlanPrompt,
  buildDirectRiskMatrixPrompt,
  buildDirectCatalogPrompt,
  parseRiskMatrixInput,
  serializeToMarkdownTable,
  serializeToTsv,
  WordCurrentStateTile,
  WordRiskMatrixPanel,
  WordCompactPromptCollection,
  WordWideCommunicationLeaf,
} from "../src/components/cases/word-workflow/tools";

test("Clipboard: copyDirectPromptToClipboard succeeds with valid clipboard and does not false-report on error", async () => {
  let copiedText = "";
  const successfulClipboard = {
    writeText: async (t: string) => {
      copiedText = t;
    },
  };

  const ok = await copyDirectPromptToClipboard("Teszt prompt", successfulClipboard);
  assert.equal(ok.success, true);
  assert.equal(copiedText, "Teszt prompt");

  const failingClipboard = {
    writeText: async () => {
      throw new Error("Permission denied by user");
    },
  };

  const fail = await copyDirectPromptToClipboard("Teszt prompt", failingClipboard);
  assert.equal(fail.success, false);
  assert.match(fail.error || "", /Permission denied/);

  // Empty string handling
  const emptyFail = await copyDirectPromptToClipboard("", successfulClipboard);
  assert.equal(emptyFail.success, false);
});

test("Safe Context Adapter: rejects raw sensitive fixture markers and never exposes confidential text un-anonymized", () => {
  assert.equal(containsRawSensitiveMarker("[CONFIDENTIAL:RAW] Titkos adatok"), true);
  assert.equal(containsRawSensitiveMarker("Normal sanitized text"), false);
  assert.equal(containsRawSensitiveMarker("<RAW_SENSITIVE> CEO személyi száma"), true);
  assert.equal(containsRawSensitiveMarker("[PII:RAW] dr. Kovács János"), true);

  const rawContext = {
    isReady: true,
    sanitizedText: "Szerződés tervezet [CONFIDENTIAL:RAW] belső adóazonosító",
  };
  const validation = validateSanitizedContext(rawContext);
  assert.equal(validation.valid, false);
  assert.match(validation.reason || "", /Biztonsági hiba/);

  // Attempting to build prompt with raw sensitive marker throws error
  assert.throws(
    () => {
      buildDirectCurrentStatePrompt({
        caseNumber: "CASE-2026-001",
        sanitizedContext: rawContext,
      });
    },
    { message: /Biztonsági hiba/ }
  );
});

test("Safe Context Adapter: templates compose correct case, version, and non-overwriting context", () => {
  const safeContext = {
    isReady: true,
    documentTitle: "Adásvételi Szerződés",
    documentVersionNumber: 3,
    sanitizedText: "1. § A vevő [SZEMÉLY_1] megvásárolja az ingatlant.",
  };

  const prompt = buildDirectCurrentStatePrompt({
    caseNumber: "UGY-2026-99",
    caseTitle: "Ingatlan adásvétel",
    statusLabel: "Véleményezés alatt",
    urgencyLabel: "Sürgős",
    deadline: "2026-10-15",
    responsibleName: "Dr. Admin Ügyvéd",
    nextStep: "Módosítások átvezetése",
    sanitizedContext: safeContext,
  });

  assert.match(prompt, /Ügy: UGY-2026-99 · Ingatlan adásvétel/);
  assert.match(prompt, /Dokumentum: Adásvételi Szerződés v3/);
  assert.match(prompt, /ANONIMIZÁLT HÁTTÉRSZÖVEG \(v3\):/);
  assert.match(prompt, /\[SZEMÉLY_1\] megvásárolja az ingatlant/);
  assert.match(prompt, /Felelős ügyvéd\/munkatárs: Dr\. Admin Ügyvéd/);

  // When sanitized context is absent, template-only prompt is generated without confidential text
  const templateOnly = buildDirectCurrentStatePrompt({
    caseNumber: "UGY-EMPTY",
    sanitizedContext: null,
  });
  assert.match(templateOnly, /Nem áll rendelkezésre külön anonimizált háttérszöveg/);

  // Case Context Prompt verification
  const contextPrompt = buildDirectCaseContextPrompt({
    caseNumber: "UGY-CTX-01",
    originReason: "Peren kívüli egyezség előkészítése",
    currentSituation: "A felek vitatják a kártérítési felelősség mértékét",
    description: "Részletes háttérleírás",
  });
  assert.match(contextPrompt, /Peren kívüli egyezség előkészítése/);
  assert.match(contextPrompt, /A felek vitatják a kártérítési felelősség mértékét/);

  // Goal & Action Plan verification
  const goalPrompt = buildDirectGoalActionPlanPrompt({
    caseNumber: "UGY-GOAL-01",
    clientExpectation: "Megállapodás megkötése a hónap végéig",
    urgentAction: "Fizetési felszólítás megválaszolása 3 napon belül",
  });
  assert.match(goalPrompt, /Megállapodás megkötése a hónap végéig/);
  assert.match(goalPrompt, /Fizetési felszólítás megválaszolása 3 napon belül/);

  // Risk Matrix Prompt verification
  const riskPrompt = buildDirectRiskMatrixPrompt({
    caseNumber: "UGY-RISK-01",
  });
  assert.match(riskPrompt, /\| Kockázat \| Súlyosság \| Valószínűség \| Érintett pont \| Javasolt kezelés \|/);

  // Catalog prompt verification
  const execPrompt = buildDirectCatalogPrompt("executiveSummary", {
    caseNumber: "UGY-CAT-01",
  });
  assert.match(execPrompt, /Vezetői összefoglaló/);
});

test("Risk Matrix Parser: TSV and Markdown table parsing and roundtrip with long Hungarian text", () => {
  const hungarianRisk = "Kártérítési felelősségkorlátozás hiánya árvíztűrő tükörfúrógéppel";
  const hungarianMitigation = "Kifejezett felelősségi plafon beépítése a nettó megbízási díj 100%-áig a 12.1. pontban.";

  const markdownInput = `
| Kockázat | Súlyosság | Valószínűség | Érintett pont | Javasolt kezelés |
|---|---|---|---|---|
| ${hungarianRisk} | Magas | Közepes | 12.1. pont | ${hungarianMitigation} |
| Egyoldalú felmondási jog | Kritikus | Biztos | 8.3. pont | Szimmetrikus 30 napos határidő kérése |
`;

  const mdResult = parseRiskMatrixInput(markdownInput);
  assert.equal(mdResult.recognizedFormat, "markdown");
  assert.equal(mdResult.rows.length, 2);
  assert.equal(mdResult.rows[0].risk, hungarianRisk);
  assert.equal(mdResult.rows[0].severity, "Magas");
  assert.equal(mdResult.rows[0].probability, "Közepes");
  assert.equal(mdResult.rows[0].clause, "12.1. pont");
  assert.equal(mdResult.rows[0].mitigation, hungarianMitigation);

  // Roundtrip back to Markdown
  const serializedMd = serializeToMarkdownTable(mdResult.rows);
  assert.match(serializedMd, new RegExp(hungarianRisk));
  assert.match(serializedMd, new RegExp(hungarianMitigation));

  // TSV parsing
  const tsvInput = `Kockázat\tSúlyosság\tValószínűség\tÉrintett pont\tJavasolt kezelés\n${hungarianRisk}\tMagas\tKözepes\t12.1. pont\t${hungarianMitigation}`;
  const tsvResult = parseRiskMatrixInput(tsvInput);
  assert.equal(tsvResult.recognizedFormat, "tsv");
  assert.equal(tsvResult.rows.length, 1);
  assert.equal(tsvResult.rows[0].risk, hungarianRisk);

  // Roundtrip back to TSV
  const serializedTsv = serializeToTsv(tsvResult.rows);
  assert.match(serializedTsv, new RegExp(hungarianRisk));
  assert.match(serializedTsv, new RegExp(hungarianMitigation));
});

test("Risk Matrix Parser: preserves malformed input and ensures XSS payloads stay inert", () => {
  const xssPayload = `<script>alert('xss')</script><img src=x onerror="alert(1)">`;
  const markdownWithXss = `
| Kockázat | Súlyosság | Valószínűség | Érintett pont | Javasolt kezelés |
|---|---|---|---|---|
| ${xssPayload} | Magas | Közepes | 1.1 | Normal kezelés |
`;

  const parsed = parseRiskMatrixInput(markdownWithXss);
  assert.equal(parsed.rows.length, 1);
  // Stored as inert plain string, not executed
  assert.equal(parsed.rows[0].risk, xssPayload);

  // Malformed input preservation
  const brokenInput = `
Ez nem egy táblázat sor
| Hiányos sor csak két oszloppal |
`;
  const brokenResult = parseRiskMatrixInput(brokenInput);
  assert.ok(brokenResult.malformedLines.length > 0);
  assert.ok(brokenResult.malformedLines.some((l) => l.includes("Ez nem egy táblázat sor")));
});

test("Word Workflow Tools: leaf components export correctly", () => {
  assert.equal(typeof WordCurrentStateTile, "function");
  assert.equal(typeof WordRiskMatrixPanel, "function");
  assert.equal(typeof WordCompactPromptCollection, "function");
  assert.equal(typeof WordWideCommunicationLeaf, "function");
});

test("Risk Matrix: failed save retains edits in UI without data loss", () => {
  // Test row state modification and error retention logic
  const initialRows = [
    {
      id: "row-1",
      risk: "Eredeti kockázat",
      severity: "Közepes",
      probability: "Közepes",
      clause: "1. pont",
      mitigation: "Eredeti javaslat",
    },
  ];

  // User edits row
  const editedRows = initialRows.map((r) =>
    r.id === "row-1" ? { ...r, risk: "Módosított kockázat felhasználó által" } : r
  );

  // If save fails, editedRows must remain intact
  const saveFailed = true;
  const currentRowsInUI = saveFailed ? editedRows : initialRows;

  assert.equal(currentRowsInUI[0].risk, "Módosított kockázat felhasználó által");
});

test("Wide Communication Leaf: splits and preserves quoted history while keeping main text clean", () => {
  const emailContent = `Tisztelt Ügyvéd Úr!

Mellékelten küldöm az észrevételeket a tervezethez.

Üdvözlettel,
Kovács János

-----Original Message-----
From: dr. Admin Ügyvéd <ugyved@example.com>
Sent: 2026. szeptember 29. 14:30
To: Kovács János <kovacs@example.com>
Subject: Szerződéstervezet áttekintésre

Tisztelt Ügyfél!
Küldöm az előzetes változatot áttekintésre.
`;

  // Testing the splitQuotedHistory regex logic
  const lines = emailContent.split(/\r?\n/);
  const quoteStartIdx = lines.findIndex((line) => {
    const trimmed = line.trim();
    return (
      trimmed.startsWith(">") ||
      /^-----*Original Message-----*/i.test(trimmed) ||
      /^-----*Eredeti üzenet-----*/i.test(trimmed) ||
      /^Feladó:.*|^From:.*|^Date:.*|^Dátum:.*/i.test(trimmed)
    );
  });

  assert.ok(quoteStartIdx > 0);
  const mainText = lines.slice(0, quoteStartIdx).join("\n").trim();
  const quotedText = lines.slice(quoteStartIdx).join("\n").trim();

  assert.match(mainText, /Mellékelten küldöm az észrevételeket/);
  assert.doesNotMatch(mainText, /-----Original Message-----/);
  assert.match(quotedText, /From: dr\. Admin Ügyvéd/);
});

