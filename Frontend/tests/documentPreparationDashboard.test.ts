import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import {
  CLIPBOARD_COPY_FAILURE_MESSAGE,
  DOCUMENT_DELETE_DEPENDENCY_MESSAGE,
  DOCUMENT_DELETE_FORBIDDEN_MESSAGE,
  copyTextToClipboard,
  documentDeleteErrorMessage,
  latestDocumentActivity,
  pickLatestAnonymousDocument,
  redactedItemCount,
  resolveDefaultPreparationDocumentId,
  summarizeRiskMatrix,
} from "../src/lib/documents/documentPreparation";

// Focused coverage for the Case Workspace document preparation surface.
// Rules that decide correctness (default selection, newest anonymous record,
// truthful risk-matrix state, clipboard success/failure, delete status
// mapping) are proved against the dependency-light view model. The visible
// wiring is pinned against the component source so a regression cannot silently
// drop a tile, an action or a truthful empty state.

const read = (file: string) => readFileSync(path.resolve(process.cwd(), file), "utf8");
const dashboard = () => read("src/components/documents/DocumentPreparationDashboard.tsx");
const overview = () => read("src/components/cases/CaseWorkspaceOverview.tsx");

const docs = (...ids: string[]) => ids.map((id) => ({ id }));
const active = (...ids: string[]) => ids.map((id) => ({ id }));

describe("Document preparation — selection rules", () => {
  it("1. selects the first active document by default", () => {
    const documents = docs("doc-a", "doc-b", "doc-c");
    assert.equal(resolveDefaultPreparationDocumentId(documents, active("doc-c")), "doc-c");
  });

  it("2. falls back to the first document when none is active", () => {
    assert.equal(resolveDefaultPreparationDocumentId(docs("doc-a", "doc-b"), active()), "doc-a");
  });

  it("returns null only when there is no document", () => {
    assert.equal(resolveDefaultPreparationDocumentId([], active("doc-a")), null);
  });

  it("3. the dashboard reloads every tile when the selected document changes", () => {
    const source = dashboard();
    assert.match(source, /\}, \[selectedDocumentId, loadDocument\]\);/);
    // All four signals are fetched for the selected id in one coordinated load.
    assert.match(source, /getDocumentWorkContext\(documentId\)/);
    assert.match(source, /listDocumentLegalAnalyses\(documentId, \{ caseId, documentSourceType: "DOCUMENT" \}\)/);
    assert.match(source, /getAnonymousDocumentsBySource\(documentId\)/);
    // A late response for a previous selection can never commit.
    assert.match(source, /if \(requestRef\.current !== requestId\) return;/);
  });
});

describe("Document preparation — Feladat tile", () => {
  it("5. uses the real document work context, never a synthesised instruction", () => {
    const source = dashboard();
    assert.match(source, /getDocumentWorkContext/);
    assert.match(source, /card\?\.workInstruction \|\| "Nincs rögzített munkautasítás\."/);
    assert.match(source, /card\?\.responsible\?\.name/);
    assert.match(source, /formatDocDate\(card\?\.dueDate\)/);
    assert.match(source, /card\?\.nextStep/);
    assert.match(source, /card\.linkedTasks/);
    // Editing reuses the existing work-context capability, not a second model.
    assert.match(source, /DocumentWorkContextEditor/);
    assert.match(source, /useDocumentWorkContext|getDocumentWorkContext/);
  });
});

describe("Document preparation — Helyzetállás tile", () => {
  it("6. does not invent facts; unavailable signals stay 'Nincs adat'", () => {
    const source = dashboard();
    assert.match(source, /workStatus \? workStatusLabel\(workStatus\) : "Nincs adat"/);
    assert.match(source, /currentVersion != null \? `v\$\{currentVersion\}` : "Nincs adat"/);
    // The point count is only shown when the review projection actually exposes a number.
    assert.match(source, /typeof selectedDocument\?\.reviewSummary\?\.openPointCount === "number"/);
    assert.match(source, /openPointCount != null \? openPointCount : "Nincs adat"/);
    assert.match(source, /"Nincs rögzített esemény\."/);
    // AI summary opens the existing modal with the selected document preselected.
    assert.match(source, /<AIPromptPreparationModal[\s\S]*?documentId=\{selectedDocument\.id\}/);
  });

  it("the last document event prefers matching activity and never fabricates one", () => {
    const feed = [
      { objectId: "doc-a", occurredAt: "2026-01-01T10:00:00.000Z", actionLabel: "Megnyitva" },
      { objectId: "doc-b", occurredAt: "2026-02-01T10:00:00.000Z", actionLabel: "Feltöltve" },
      { objectId: "doc-a", occurredAt: "2026-03-01T10:00:00.000Z", actionLabel: "Jóváhagyva" },
    ];
    assert.equal(latestDocumentActivity(feed, "doc-a")?.actionLabel, "Jóváhagyva");
    assert.equal(latestDocumentActivity(feed, "doc-z"), null);
  });
});

describe("Document preparation — Kockázati mátrix tile", () => {
  it("7. riskMatrixDetected=false is the truthful empty state", () => {
    const summary = summarizeRiskMatrix([
      { riskMatrixDetected: false, updatedAt: "2026-01-01T00:00:00.000Z" },
    ]);
    assert.equal(summary.hasMatrix, false);
    assert.equal(summary.latestUpdatedAt, null);
    assert.match(dashboard(), /Még nincs kockázati mátrix\./);
  });

  it("8. riskMatrixDetected=true is the recorded state with the latest timestamp", () => {
    const summary = summarizeRiskMatrix([
      { riskMatrixDetected: true, updatedAt: "2026-01-01T00:00:00.000Z" },
      { riskMatrixDetected: true, updatedAt: "2026-05-01T00:00:00.000Z" },
      { riskMatrixDetected: false, updatedAt: "2026-06-01T00:00:00.000Z" },
    ]);
    assert.equal(summary.hasMatrix, true);
    assert.equal(summary.latestUpdatedAt, "2026-05-01T00:00:00.000Z");
    assert.match(dashboard(), /Kockázati elemzés rögzítve/);
  });

  it("16. never fabricates a risk level or count", () => {
    const summary = summarizeRiskMatrix([{ riskMatrixDetected: true, updatedAt: null }]);
    assert.deepEqual(Object.keys(summary).sort(), ["hasMatrix", "latestUpdatedAt"]);
    const source = dashboard();
    // No invented risk-level vocabulary in the tile.
    assert.doesNotMatch(source, /magas kockázat|alacsony kockázat|közepes kockázat|kockázati szint/i);
    assert.doesNotMatch(source, /\d+\s*kockázat/i);
  });

  it("does not hardcode a backend template id into the AI preparation modal", () => {
    const source = dashboard();
    assert.match(source, /<AIPromptPreparationModal/);
    assert.doesNotMatch(source, /initialTemplateId/);
    assert.doesNotMatch(source, /executiveSummary/);
    assert.doesNotMatch(source, /legalPromptCatalog/);
  });
});

describe("Document preparation — Anonimizált változat tile", () => {
  it("newest anonymous result is authoritative, regardless of API order", () => {
    const latest = pickLatestAnonymousDocument([
      { createdAt: "2026-01-01T00:00:00.000Z", redactedText: "old" },
      { createdAt: "2026-06-01T00:00:00.000Z", redactedText: "new" },
      { createdAt: "2026-03-01T00:00:00.000Z", redactedText: "middle" },
    ]);
    assert.equal(latest?.redactedText, "new");
    assert.equal(pickLatestAnonymousDocument([]), null);
    assert.equal(pickLatestAnonymousDocument(null), null);
  });

  it("counts redacted items only when the payload actually carries them", () => {
    assert.equal(redactedItemCount({ createdAt: "", redactedText: "", redactedItems: [1, 2, 3] }), 3);
    assert.equal(redactedItemCount({ createdAt: "", redactedText: "", redactedItems: [] }), 0);
    assert.equal(redactedItemCount({ createdAt: "", redactedText: "" }), null);
    assert.equal(redactedItemCount(null), null);
  });

  it("9. without an anonymous document the tile offers the existing anonymize action", () => {
    const source = dashboard();
    assert.match(source, /Nincs anonimizált változat\./);
    assert.match(source, /Anonimizálás indítása/);
    assert.match(source, /<AnonymizeModal/);
    // The modal internals stay untouched; only the canonical props are passed.
    assert.match(source, /contract=\{toAnonymizeContract\(selectedDocument\)\}/);
  });

  it("10. with an anonymous document the tile offers the copy action", () => {
    const source = dashboard();
    assert.match(source, /data-testid="preparation-anonymized-ready"[\s\S]{0,220}?Kész/);
    assert.match(source, /Anonimizált szöveg másolása/);
    assert.match(source, /copyTextToClipboard\(latestAnonymous\.redactedText\)/);
  });

  it("11. reports success only after the clipboard write resolves", async () => {
    let written = "";
    const ok = await copyTextToClipboard("titkos szöveg", {
      writeText: async (text: string) => {
        written = text;
      },
    });
    assert.equal(ok, true);
    assert.equal(written, "titkos szöveg");
    assert.match(dashboard(), /copyState === "ok" \? "Másolva ✓"/);
  });

  it("12. reports a safe failure when the clipboard write rejects", async () => {
    const ok = await copyTextToClipboard("titkos szöveg", {
      writeText: async () => {
        throw new Error("denied");
      },
    });
    assert.equal(ok, false);
    assert.equal(await copyTextToClipboard("", { writeText: async () => {} }), false);
    const source = dashboard();
    assert.match(source, /copyState === "fail"/);
    assert.match(source, /CLIPBOARD_COPY_FAILURE_MESSAGE/);
    assert.match(CLIPBOARD_COPY_FAILURE_MESSAGE, /vágólapra másolni/i);
  });
});

describe("Document preparation — delete", () => {
  it("13. deletion goes through the canonical dialog and endpoint", () => {
    const source = dashboard();
    assert.match(source, /<ConfirmationDialog/);
    assert.match(source, /await deleteDocument\(deletedId\)/);
    assert.match(source, /import \{ ConfirmationDialog \} from "@\/components\/ui"/);
  });

  it("14. success refreshes and selects the next valid document", () => {
    const source = dashboard();
    assert.match(source, /const remaining = documents\.filter\(\(doc\) => doc\.id !== deletedId\)/);
    assert.match(source, /setSelectedDocumentId\(resolveDefaultPreparationDocumentId\(remaining, activeDocuments\)\)/);
    assert.match(source, /onRefresh\?\.\(\)/);
  });

  it("15. maps dependency and permission blocks to truthful messages", () => {
    assert.equal(documentDeleteErrorMessage(409), DOCUMENT_DELETE_DEPENDENCY_MESSAGE);
    assert.match(documentDeleteErrorMessage(409), /kapcsolódó munkafolyamat/);
    assert.equal(documentDeleteErrorMessage(403), DOCUMENT_DELETE_FORBIDDEN_MESSAGE);
    assert.match(documentDeleteErrorMessage(403), /jogosultság/);
    assert.match(documentDeleteErrorMessage(404), /nem található/);
    assert.match(documentDeleteErrorMessage(undefined), /nem sikerült/);
  });
});

describe("Document preparation — placement and preservation", () => {
  it("dashboard is hosted on the Case Workspace overview, not the Document reader page", () => {
    const source = overview();
    assert.match(source, /<DocumentPreparationDashboard/);
    assert.match(source, /documents=\{ws\.documents\}/);
    // Full-width block placed after the two-column cockpit grid.
    const marker = source.indexOf("{/* ---- 4. Document preparation");
    const cockpit = source.indexOf('title="Aktív munka"');
    assert.ok(marker > -1 && cockpit > -1 && cockpit < marker, "preparation surface must sit below the operational cockpit");
    const reader = read("src/app/cases/[caseId]/documents/page.tsx");
    assert.doesNotMatch(reader, /DocumentPreparationDashboard/, "Phase 1 must not land in the Document reader");
  });

  it("4. Megnyitás routes to the exact selected documentId", () => {
    assert.match(
      dashboard(),
      /onClick=\{\(\) => \{\s*if \(selectedDocument\) onOpenDocument\(selectedDocument\.id\);\s*\}\}/,
    );
    assert.match(
      overview(),
      /router\.push\(`\/cases\/\$\{caseId\}\/documents\?documentId=\$\{encodeURIComponent\(docId\)\}`\)/,
    );
  });

  it("17. existing case task/deadline/communication behavior is preserved", () => {
    const source = overview();
    for (const title of ['title="Aktív munka"', 'title="Határidők"', 'title="Kommunikáció"', 'title="Dokumentumok"']) {
      assert.ok(source.includes(title), `${title} must remain in the cockpit`);
    }
    assert.match(source, /CaseTimeBillingSummary/);
    assert.match(source, /data-testid="case-workspace-quick-actions"/);
    assert.doesNotMatch(source, /reviewSummary/);
  });

  it("18. desktop uses a clean 2x2 tile layout", () => {
    assert.match(dashboard(), /className="grid grid-cols-1 gap-4 lg:grid-cols-2"/);
    assert.match(dashboard(), /lg:grid-cols-2/);
  });

  it("19. narrow layout is a single column without forced horizontal overflow", () => {
    const source = dashboard();
    assert.match(source, /className="grid grid-cols-1 gap-4 lg:grid-cols-2"/);
    // No fixed min-width larger than the narrow viewport; long header actions
    // wrap and cap their width instead of forcing horizontal scroll.
    assert.doesNotMatch(source, /min-w-\[(?:[4-9]\d{2,}|1\d{3,})px\]/);
    assert.match(source, /sm:min-w-\[240px\]/);
    assert.match(source, /className="max-w-full"/);
    assert.match(source, /flex w-full flex-wrap gap-2 sm:w-auto/);
    assert.match(source, /block w-full text-\[11\.5px\] font-semibold text-\[var\(--adm-text-secondary\)\] sm:w-auto/);
  });

  it("consumes canonical semantic tokens instead of route-local raw palettes", () => {
    const source = dashboard();
    for (const token of [
      "--adm-brand-green",
      "--adm-brand-terracotta",
      "--adm-canvas-white",
      "--adm-canvas-subtle",
      "--adm-border-canonical",
      "--adm-text-primary",
      "--adm-text-secondary",
      "--adm-palette-teal",
    ]) {
      assert.ok(source.includes(token), `${token} must be used`);
    }
    assert.doesNotMatch(source, /#efece4|#FBF6E7|#FFFCEB|var\(--adm-sand-100\)/);
    assert.doesNotMatch(source, /\brounded-(?:2xl|3xl)\b/);
  });
});

// ---------------------------------------------------------------------------
// Data-contract / truthfulness repair (PR #376 follow-up)
// ---------------------------------------------------------------------------

const apiSource = () => read("src/lib/api.ts");

const summaryInterface = (source: string): string => {
  const start = source.indexOf("export interface LegalAnalysisSummaryRecord {");
  assert.ok(start > -1, "LegalAnalysisSummaryRecord must exist");
  const end = source.indexOf("}", start);
  return source.slice(start, end);
};

describe("Document preparation — data contract & truthfulness repair", () => {
  it("frontend list contract reflects the safe Summary DTO, not a full record", () => {
    const source = apiSource();
    assert.match(source, /export interface LegalAnalysisSummaryRecord \{/);
    assert.match(source, /export interface LegalAnalysisRecord extends LegalAnalysisSummaryRecord \{/);
    assert.match(
      source,
      /export async function listDocumentLegalAnalyses\([\s\S]*?Promise<LegalAnalysisSummaryRecord\[\]>/,
    );
    // The Summary contract must not claim content/PII fields.
    const summary = summaryInterface(source);
    assert.doesNotMatch(summary, /analysisText/);
    assert.doesNotMatch(summary, /aiToolName/);
    assert.doesNotMatch(summary, /anonymizedInputSnapshot/);
    // The detail endpoint keeps the full record type.
    assert.match(source, /export async function getLegalAnalysis\(id: string\): Promise<LegalAnalysisRecord>/);
  });

  it("summary contract carries the four persisted detection booleans", () => {
    const summary = summaryInterface(apiSource());
    for (const flag of [
      "riskMatrixDetected",
      "missingDataDetected",
      "suggestedChangesDetected",
      "lawyerDecisionPointsDetected",
    ]) {
      assert.ok(summary.includes(flag), `${flag} must be on the summary contract`);
    }
  });

  it("dashboard consumes the summary contract and derives risk state from it", () => {
    const source = dashboard();
    assert.match(source, /type LegalAnalysisSummaryRecord/);
    assert.doesNotMatch(source, /type LegalAnalysisRecord\b/);
    assert.match(source, /const \[analyses, setAnalyses\] = useState<LegalAnalysisSummaryRecord\[\]>\(\[\]\)/);
    assert.match(source, /summarizeRiskMatrix\(analyses\)/);
  });

  it("1/2. persisted riskMatrixDetected true/false render the truthful states", () => {
    assert.match(dashboard(), /Kockázati elemzés rögzítve/);
    assert.match(dashboard(), /Még nincs kockázati mátrix\./);
    assert.equal(
      summarizeRiskMatrix([{ riskMatrixDetected: true, updatedAt: "2026-01-01T00:00:00.000Z" }]).hasMatrix,
      true,
    );
    assert.equal(summarizeRiskMatrix([{ riskMatrixDetected: false }]).hasMatrix, false);
  });

  it("3. legal-analysis request failure is an unavailable state, never the empty state", () => {
    const source = dashboard();
    assert.match(source, /analysesError \? \(/);
    assert.match(source, /preparation-risk-unavailable/);
    assert.match(source, /A kockázati elemzés állapota most nem tölthető be\./);
    assert.match(source, /preparation-risk-retry/);
    // The error branch is evaluated before the empty/recorded branches.
    const errorIndex = source.indexOf("preparation-risk-unavailable");
    const emptyIndex = source.indexOf("preparation-risk-empty");
    assert.ok(errorIndex > -1 && emptyIndex > -1 && errorIndex < emptyIndex);
  });

  it("4. anonymous-doc request failure is an unavailable state, never the empty state", () => {
    const source = dashboard();
    assert.match(source, /anonymousError \? \(/);
    assert.match(source, /preparation-anonymized-unavailable/);
    assert.match(source, /Az anonimizált változat állapota most nem tölthető be\./);
    assert.match(source, /preparation-anonymized-retry/);
    const errorIndex = source.indexOf("preparation-anonymized-unavailable");
    const emptyIndex = source.indexOf("preparation-anonymized-empty");
    assert.ok(errorIndex > -1 && emptyIndex > -1 && errorIndex < emptyIndex);
  });

  it("5. a successful empty anonymous response stays the truthful empty state", () => {
    assert.match(dashboard(), /Nincs anonimizált változat\./);
  });

  it("request failures are no longer masked into empty arrays", () => {
    const source = dashboard();
    assert.doesNotMatch(source, /listDocumentLegalAnalyses\(documentId, \{[^}]*\}\)\.catch\(/);
    assert.doesNotMatch(source, /getAnonymousDocumentsBySource\(documentId\)\.catch\(/);
    // Separate settled results feed separate truthful states.
    assert.match(source, /Promise\.allSettled\(/);
    assert.match(source, /analysesResult\.status === "fulfilled"/);
    assert.match(source, /anonymousResult\.status === "fulfilled"/);
  });

  it("6. the open-points label names the review-point count, not comments", () => {
    const source = dashboard();
    assert.match(source, /Nyitott felülvizsgálati pontok/);
    assert.doesNotMatch(source, /Nyitott megjegyzések/);
  });

  it("7. all four preparation tiles remain", () => {
    const source = dashboard();
    for (const tile of [
      "preparation-tile-feladat",
      "preparation-tile-helyzetallas",
      "preparation-tile-kockazat",
      "preparation-tile-anonim",
    ]) {
      assert.ok(source.includes(tile), `${tile} must remain`);
    }
  });
});
