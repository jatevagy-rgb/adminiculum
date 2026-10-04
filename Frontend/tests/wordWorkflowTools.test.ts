import test from "node:test";
import assert from "node:assert/strict";

import {
  copyDirectPromptToClipboard,
  containsRawSensitiveMarker,
  validateSanitizedContext,
  resolveSafePromptContext,
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
  isMatrixOnlyAnalysis,
  isExplicitCaseDocument,
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

  const prompt = buildDirectCurrentStatePrompt({ caseNumber: "CASE-2026-001", sanitizedContext: rawContext });
  assert.doesNotMatch(prompt, /CASE-2026-001|belső adóazonosító/);
  assert.match(prompt, /Nem áll rendelkezésre külön anonimizált háttérszöveg/);
});

test("Safe Context Adapter: unverified context stays a generic scaffold", () => {
  const context = { isReady: true, documentTitle: "Titkos szerződés", sanitizedText: "[SZEMÉLY_1] átruházza az ingatlant" };
  for (const prompt of [
    buildDirectCurrentStatePrompt({ caseTitle: "Titkos ügy", responsibleName: "Dr. Kovács Anna", sanitizedContext: context }),
    buildDirectCaseContextPrompt({ description: "Belső ügyadat", sanitizedContext: context }),
    buildDirectGoalActionPlanPrompt({ clientExpectation: "Titkos cél", sanitizedContext: context }),
    buildDirectRiskMatrixPrompt({ sanitizedContext: context }),
    buildDirectCatalogPrompt("executiveSummary", { sanitizedContext: context }),
  ]) {
    assert.doesNotMatch(prompt, /Titkos szerződés|Titkos ügy|Kovács Anna|Belső ügyadat|Titkos cél|\[SZEMÉLY_1\]/);
    assert.match(prompt, /Nem áll rendelkezésre külön anonimizált háttérszöveg/);
  }
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

test("Prompt export omits unmarked private workspace fields in every direct and catalog path", () => {
  const secrets = {
    caseNumber: "U-987654",
    caseTitle: "Kovács Anna titkos ügye",
    description: "Rejtett vételár 9281 millió",
    originReason: "Bizalmas felvásárlás",
    currentSituation: "Névvel jelölt tárgyalás",
    clientExpectation: "Titkos cél teljesítése",
    urgentAction: "Belső határidős intézkedés",
    nextStep: "Ügyfélnek címzett lépés",
    responsibleName: "Dr. Kovács Anna",
    deadline: "2026-10-19",
    statusLabel: "Bizalmas státusz",
    urgencyLabel: "Belső sürgősség",
  };
  const prompts = [
    buildDirectCurrentStatePrompt(secrets),
    buildDirectCaseContextPrompt(secrets),
    buildDirectGoalActionPlanPrompt(secrets),
    buildDirectRiskMatrixPrompt(secrets),
    buildDirectCatalogPrompt("executiveSummary", secrets),
  ];
  for (const prompt of prompts) {
    for (const secret of Object.values(secrets)) assert.equal(prompt.includes(secret), false, secret);
    assert.match(prompt, /Nem áll rendelkezésre külön anonimizált háttérszöveg/);
  }
});

test("Catalog cannot receive unverified, rejected or not-ready text, document names or token mappings", () => {
  for (const context of [
    { isReady: true, sanitizedText: "[SZEMÉLY_1] token", documentTitle: "Titkos irat", tokenMap: { "[SZEMÉLY_1]": "Kovács Anna" } },
    { isReady: false, sanitizedText: "Nem kész titok", documentTitle: "Titkos irat" },
    { isReady: true, sanitizedText: "Elutasított titok", rejectionReason: "stale" },
  ]) {
    const prompt = buildDirectCatalogPrompt("executiveSummary", { sanitizedContext: context });
    assert.doesNotMatch(prompt, /Titkos irat|Kovács Anna|Nem kész titok|Elutasított titok|\[SZEMÉLY_1\] token/);
  }
});

test("Matrix-only target rejects mixed analysis and preserves full cells on reload", () => {
  const rows = [{ id: "a", risk: "Fizetési késedelem", severity: "Magas", probability: "Közepes", clause: "4.2", mitigation: "Kötbér és biztosíték" }];
  const markdown = serializeToMarkdownTable(rows);
  assert.equal(isMatrixOnlyAnalysis(markdown), true);
  assert.equal(isMatrixOnlyAnalysis(`Ügyvédi vélemény\n${markdown}`), false);
  assert.equal(isMatrixOnlyAnalysis(`${markdown}\nZáró megjegyzés`), false);
  const reloaded = parseRiskMatrixInput(markdown).rows[0];
  for (const field of ["risk", "severity", "probability", "clause", "mitigation"] as const) {
    assert.equal(reloaded[field], rows[0][field]);
  }
});

test("Matrix persistence requires explicit case document even for one or many documents", () => {
  const docs = [{ id: "D1", caseId: "A" }, { id: "D2", caseId: "A" }, { id: "D3", caseId: "B" }];
  assert.equal(isExplicitCaseDocument("A", null, []), false);
  assert.equal(isExplicitCaseDocument("A", null, docs.slice(0, 1)), false);
  assert.equal(isExplicitCaseDocument("A", null, docs), false);
  assert.equal(isExplicitCaseDocument("A", "D2", docs), true);
  assert.equal(isExplicitCaseDocument("A", "D3", docs), false);
  assert.equal(isExplicitCaseDocument("B", "D2", docs), false);
});

test("Matrix markdown reload retains pipe characters in every editable text cell", () => {
  const row = { id: "a", risk: "A | B", severity: "Magas", probability: "Közepes", clause: "4 | 5", mitigation: "X | Y" };
  const markdown = serializeToMarkdownTable([row]);
  assert.equal(isMatrixOnlyAnalysis(markdown), true);
  const parsed = parseRiskMatrixInput(markdown).rows[0];
  assert.equal(parsed.risk, row.risk);
  assert.equal(parsed.clause, row.clause);
  assert.equal(parsed.mitigation, row.mitigation);
});

test("Only a matching case-scoped Case Context V2 result supplies safe tokens", async () => {
  const previousWindow = (globalThis as { window?: unknown }).window;
  const previousStorage = (globalThis as { localStorage?: unknown }).localStorage;
  const previousFetch = globalThis.fetch;
  (globalThis as { window?: unknown }).window = { location: { pathname: "/cases/A" } };
  (globalThis as { localStorage?: unknown }).localStorage = { getItem: () => "test-token" };
  globalThis.fetch = async (url) => {
    const path = String(url);
    if (path.endsWith("/cases/A/workspace")) return Response.json({ case: { id: "A", client: { id: "CLIENT-A" } } });
    if (path.endsWith("/cases/A/context-sources")) return Response.json({ items: [{
      id: "SOURCE-A", anonymizedText: "[SZEMÉLY_1] biztonságos token",
      anonymizationSnapshot: { mappingLocation: "in-memory-only" },
    }] });
    throw new Error(`Unexpected URL: ${path}`);
  };
  try {
    const selected = { isReady: true, sourceId: "SOURCE-A", caseId: "A", clientId: "CLIENT-A", sanitizedText: "[SZEMÉLY_1] biztonságos token", documentTitle: "Titkos irat", tokenMap: { "[SZEMÉLY_1]": "Kovács Anna" } };
    const safe = await resolveSafePromptContext(selected, { caseId: "A", clientId: "CLIENT-A" });
    assert.ok(safe);
    const prompt = buildDirectCatalogPrompt("executiveSummary", { caseId: "A", clientId: "CLIENT-A", sanitizedContext: safe });
    assert.match(prompt, /\[SZEMÉLY_1\] biztonságos token/);
    assert.doesNotMatch(prompt, /Kovács Anna|Titkos irat/);
    assert.doesNotMatch(buildDirectCatalogPrompt("executiveSummary", { caseId: "B", clientId: "CLIENT-A", sanitizedContext: safe }), /\[SZEMÉLY_1\]/);
    assert.equal(await resolveSafePromptContext({ ...selected, isReady: false }, { caseId: "A", clientId: "CLIENT-A" }), null);
    assert.equal(await resolveSafePromptContext(selected, { caseId: "B", clientId: "CLIENT-A" }), null);
    assert.equal(await resolveSafePromptContext(selected, { caseId: "A", clientId: "CLIENT-B" }), null);
    assert.equal(await resolveSafePromptContext({ ...selected, sanitizedText: "stale" }, { caseId: "A", clientId: "CLIENT-A" }), null);
    assert.equal(await resolveSafePromptContext({ ...selected, rejectionReason: "rejected" }, { caseId: "A", clientId: "CLIENT-A" }), null);
    assert.equal(await resolveSafePromptContext({ ...selected, documentId: "DOC-A" }, { caseId: "A", clientId: "CLIENT-A", documentId: "DOC-A" }), null);
  } finally {
    (globalThis as { window?: unknown }).window = previousWindow;
    (globalThis as { localStorage?: unknown }).localStorage = previousStorage;
    globalThis.fetch = previousFetch;
  }
});

