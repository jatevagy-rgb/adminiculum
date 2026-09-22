import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

// Presentation/IA convergence guard for the Document Workspace.
//
// This suite pins the visible information architecture only. It deliberately
// says nothing about business semantics: no backend, no review state rules, no
// comparison algorithm, no annotation schema, no publication authorization and
// no handoff lifecycle. Every capability remains reachable; only the
// presentation hierarchy is constrained here.

const read = (file: string) => readFileSync(path.resolve(process.cwd(), file), "utf8");
const documentPage = () => read("src/app/cases/[caseId]/documents/page.tsx");

const topRegion = (source: string) =>
  source.match(/<section data-testid="canonical-top-region"[\s\S]*?<\/section>/)?.[0] ?? "";
const leftLedger = (source: string) =>
  source.match(/<aside data-testid="canonical-left-ledger"[\s\S]*?<\/aside>/)?.[0] ?? "";

test("one header: a single object header owns orientation, the count and the primary mode row", () => {
  const source = documentPage();
  const top = topRegion(source);

  assert.ok(top, "canonical-top-region must exist");
  assert.equal(
    (source.match(/data-testid="canonical-top-region"/g) || []).length,
    1,
    "There must be exactly one canonical top region",
  );

  // The primary mode controller lives inside the one header, once.
  assert.match(top, /<DocumentWorkspaceTabs active=\{contextualTab\} onChange=\{setContextualTab\}/);
  assert.equal((source.match(/<DocumentWorkspaceTabs/g) || []).length, 1, "Only one primary mode row may render");

  // No competing marketing hero or duplicated workspace-focus strip.
  assert.doesNotMatch(source, /Dokumentum munkatér/, "The marketing hero title must not return");
  assert.doesNotMatch(source, /Workspace fókusz:/, "The duplicated workspace-focus strip must not return");

  // Compact object orientation: document count + next meaningful action.
  assert.match(top, /\{totalLedgerDocuments\}/);
  assert.match(top, /reviewProjection\?\.nextAction\?\.label/);
});

test("left rail is the single persistent document + version context holder", () => {
  const source = documentPage();
  const ledger = leftLedger(source);

  assert.ok(ledger, "canonical-left-ledger must exist");
  assert.match(ledger, /id="document-versions"/, "Version history belongs to the left rail");
  assert.equal(
    (source.match(/id="document-versions"/g) || []).length,
    1,
    "Version history must live in exactly one place, not duplicated in advanced tools",
  );
  assert.match(ledger, /selectVersion\(version\)/, "Version selection stays reachable from the left rail");
  assert.match(ledger, /version\.isCurrent \? <AdminBadge tone="gold">Aktuális<\/AdminBadge>/);

  // Persistent document categories are preserved in the same rail.
  assert.match(ledger, /Feltöltött dokumentumok/);
  assert.match(ledger, /Módosított munkapéldányok/);
  assert.match(ledger, /Generált \/ módosított/);

  // Advanced preparation capability is demoted, not removed.
  assert.match(source, /AI előkészítés megnyitása/);
});

test("responsive: the left rail is a drawer on narrow and collapsible on medium and up", () => {
  const source = documentPage();
  const ledger = leftLedger(source);

  assert.match(source, /const \[leftRailOpen, setLeftRailOpen\] = useState\(false\)/);
  assert.match(source, /const \[leftRailCollapsed, setLeftRailCollapsed\] = useState\(false\)/);

  // Narrow/tablet: the rail is hidden unless the drawer is opened.
  assert.match(ledger, /leftRailOpen \? "" : " max-lg:hidden"/);
  // Medium and up: the rail can be collapsed and the reader keeps the flexible column.
  assert.match(ledger, /leftRailCollapsed \? " lg:hidden" : ""/);
  assert.match(source, /leftRailCollapsed \? "lg:grid-cols-\[minmax\(0,1fr\)_290px\] xl:grid-cols-\[minmax\(0,1fr\)_320px\]"/);
  // Medium viewports default to the collapsed rail so the reader stays dominant.
  assert.match(source, /matchMedia\("\(max-width: 1279px\)"\)/);
  assert.match(source, /const apply = \(\) => setLeftRailCollapsed\(query\.matches\)/);

  // The single reader stays the dominant flexible column in the expanded shell.
  assert.match(source, /lg:grid-cols-\[230px_minmax\(0,1fr\)_290px\] xl:grid-cols-\[280px_minmax\(0,1fr\)_320px\]/);
});

test("advanced tools are subordinate presentation, not a second workspace hero", () => {
  const source = documentPage();
  const top = topRegion(source);

  const summaryMatch = source.match(
    /<details id="preserved-extended-tools-shell"[\s\S]*?<summary([^>]*)>/,
  );
  assert.ok(summaryMatch, "preserved-extended-tools-shell summary must exist");
  const summaryAttrs = summaryMatch[1];

  assert.match(summaryAttrs, /text-xs/, "Advanced tools trigger must be visually muted");
  assert.doesNotMatch(summaryAttrs, /font-serif text-lg/, "Advanced tools trigger must not use hero typography");

  // The one header must not advertise or jump to the advanced collection.
  assert.doesNotMatch(top, /Eszközök ↓/, "Advanced tools must not be promoted into the primary header");

  // Preserved copy still marks the collection as secondary.
  assert.match(source, /Haladó eszközök/);
  assert.match(source, /További meglévő dokumentumeszközök/);
});

test("right work panel exposes one coherent mode header, not repeated shell headings", () => {
  const source = documentPage();
  const shell = source.match(/<aside data-testid="canonical-right-shell"[\s\S]*?<\/aside>/)?.[0] ?? "";

  assert.ok(shell, "canonical-right-shell must exist");
  // The shell-level duplicated heading block is gone; each mode owns its own heading.
  assert.doesNotMatch(shell, /Kontextus panel/, "The duplicated shell header must not return");
  for (const mode of ["overview", "changes", "comments", "approval"]) {
    assert.match(shell, new RegExp(`contextualTab === '${mode}'`));
  }
});
