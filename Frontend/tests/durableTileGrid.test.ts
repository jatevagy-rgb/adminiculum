import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createRaceHarness, flatten, settle, textOf } from "./helpers/asyncRaceHarness";

const source = readFileSync("src/components/cases/word-workflow/layout/DurableCaseTiles.tsx", "utf8");

const builtin = [
  { kind: "current-state", contentRef: "case.status", tone: "info", title: "Jelenlegi állapot", body: "A" },
  { kind: "subject", contentRef: "case.description", tone: "teal", title: "Miről szól az ügy?", body: "B" },
  { kind: "goal", contentRef: "case.intakeClientExpectation", tone: "green", title: "Az ügy célja", body: "C" },
];

class ApiError extends Error {
  constructor(public status: number, public code: string) { super(code); }
}

test("spatial grid replaces implementation-oriented tile ordering controls", () => {
  assert.match(source, /grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3/);
  assert.match(source, /onPointerDown=\{[^\n]*startDrag/);
  assert.match(source, /onPointerMove=\{[^\n]*moveDrag/);
  assert.match(source, /document\.elementFromPoint\(event\.clientX, event\.clientY\)/);
  assert.match(source, /setPointerCapture/);
  assert.match(source, /touch-none/);
  assert.match(source, /ArrowUp/);
  assert.match(source, /ArrowDown/);
  assert.match(source, /aria-live="polite"/);
  assert.match(source, /\+ Csempe hozzáadása/);
  assert.match(source, /Új szöveges csempe/);
  assert.match(source, /sticky top-0/);
  assert.match(source, /Az elrendezés időközben megváltozott\. A saját módosításaid megmaradtak\./);
  assert.match(source, /A csempék elrendezése mentve\./);
  assert.doesNotMatch(source, />Fel<\/button>|>Le<\/button>|aria-label=\{`\$\{title\}: fel`\}|aria-label=\{`\$\{title\}: le`\}/);
  assert.doesNotMatch(source, /Saját áttekintés|Saját dokumentumfejléc/);
  assert.doesNotMatch(source, /Elhelyezhető csempék/);
});

test("grid edit mode reorders by keyboard, hides surfaces, adds tiles and preserves the other surface", async () => {
  const puts: any[] = [];
  let conflict = false;
  let revision = 0;
  const snapshot = { tiles: [], layoutRevision: 0, placements: { overview: ["current-state", "subject", "goal"], document: ["current-state", "subject", "goal"] }, canManage: true };
  const fetchApi = (url: string, opts?: any) => {
    if (opts?.method === "PUT") {
      if (conflict) throw new ApiError(409, "LAYOUT_REVISION_CONFLICT");
      puts.push(JSON.parse(opts.body));
      revision += 1;
      return Promise.resolve({ ...snapshot, layoutRevision: revision, placements: JSON.parse(opts.body).placements });
    }
    return Promise.resolve({ ...snapshot, layoutRevision: revision });
  };
  const h = createRaceHarness("src/components/cases/word-workflow/layout/DurableCaseTiles.tsx", "DurableCaseTiles", {
    "@/lib/api": { ApiError, fetchApi },
  });
  const props = { caseId: "case-1", surface: "overview", builtin };
  const articles = (tree: any) => flatten(tree).filter((n: any) => n.type === "article" && n.props && "data-tile-id" in n.props).map((n: any) => n.props["data-tile-id"]);
  h.render(props); h.effects(); await settle();
  let tree = h.render(props);
  assert.deepEqual(articles(tree), ["current-state", "subject", "goal"]);
  assert.match(textOf(tree), /Csempék szerkesztése/);
  assert.doesNotMatch(textOf(tree), /Mentés/);

  flatten(tree).find((n: any) => n.type === "button" && textOf(n) === "Csempék szerkesztése").props.onClick();
  tree = h.render(props);
  assert.match(textOf(tree), /Mentés/);
  assert.match(textOf(tree), /Mégse/);
  assert.doesNotMatch(textOf(tree), /Saját áttekintés|Saját dokumentumfejléc/);

  const first = flatten(tree).find((n: any) => n.type === "article" && n.props?.["data-tile-id"] === "current-state");
  first.props.onKeyDown({ key: "ArrowDown", preventDefault() {} });
  tree = h.render(props);
  assert.deepEqual(articles(tree), ["subject", "current-state", "goal"]);

  flatten(tree).find((n: any) => n.props?.["aria-label"] === "Miről szól az ügy?: további műveletek").props.onClick();
  tree = h.render(props);
  flatten(tree).find((n: any) => n.type === "button" && textOf(n) === "Elrejtés erről a nézetről").props.onClick();
  tree = h.render(props);
  assert.deepEqual(articles(tree), ["current-state", "goal"]);

  flatten(tree).find((n: any) => n.type === "button" && textOf(n) === "+ Csempe hozzáadása").props.onClick();
  tree = h.render(props);
  assert.match(textOf(tree), /Miről szól az ügy\?/);
  flatten(tree).find((n: any) => n.type === "button" && textOf(n) === "Új szöveges csempe").props.onClick();
  tree = h.render(props);
  assert.equal(articles(tree).length, 3);
  assert.match(textOf(tree), /Közös csempe neve/);
  assert.match(textOf(tree), /Közös tartalom/);

  flatten(tree).find((n: any) => n.type === "button" && textOf(n) === "Mentés").props.onClick();
  await settle();
  tree = h.render(props);
  assert.match(textOf(tree), /A csempék elrendezése mentve\./);
  assert.match(textOf(tree), /Csempék szerkesztése/);
  assert.equal(puts.length, 1);
  assert.deepEqual(puts[0].placements.document, ["current-state", "subject", "goal"]);
  assert.deepEqual(puts[0].placements.overview, ["current-state", "goal", articles(tree)[2]]);

  flatten(tree).find((n: any) => n.type === "button" && textOf(n) === "Csempék szerkesztése").props.onClick();
  tree = h.render(props);
  conflict = true;
  flatten(tree).find((n: any) => n.type === "button" && textOf(n) === "Mentés").props.onClick();
  await settle();
  tree = h.render(props);
  assert.match(textOf(tree), /Az elrendezés időközben megváltozott\. A saját módosításaid megmaradtak\./);
  assert.match(textOf(tree), /Mentés/);
});

test("cross-surface placement is context-only and custom editing is manager-gated", () => {
  assert.match(source, /draft\.placements\[surface\]\.indexOf\(targetId\)/);
  assert.match(source, /placements: \{ \.\.\.d\.placements, \[surface\]: order \}/);
  assert.match(source, /layoutRevision: draft\.layoutRevision, placements: draft\.placements, tiles/);
  assert.match(source, /editTarget = draft\?\.canManage && editId/);
  assert.match(source, /custom && draft\?\.canManage/);
  assert.match(source, /if \(error instanceof ApiError && error\.status === 409\)/);
  assert.match(source, /const archivedCustom = draft\?\.canManage \? draft\.tiles\.filter\(t => t\.archived\) : \[\];/);
  assert.match(source, /Archivált csempék/);
  assert.match(source, /mutateTile\(t\.id, \{ archived: false \}\); place\(t\.id, surface, true\)/);
});

test("an archived-and-hidden custom tile stays recoverable from the add popover", async () => {
  const snapshot = { tiles: [{ id: "custom-archived", revision: 1, title: "Archivált", text: "X", tone: "green" as const, archived: true }], layoutRevision: 0, placements: { overview: ["current-state", "subject", "goal"], document: ["current-state", "subject", "goal"] }, canManage: true };
  const h = createRaceHarness("src/components/cases/word-workflow/layout/DurableCaseTiles.tsx", "DurableCaseTiles", {
    "@/lib/api": { ApiError, fetchApi: () => Promise.resolve({ ...snapshot, layoutRevision: 0 }) },
  });
  const props = { caseId: "case-1", surface: "overview", builtin };
  const articles = (tree: any) => flatten(tree).filter((n: any) => n.type === "article" && n.props && "data-tile-id" in n.props).map((n: any) => n.props["data-tile-id"]);
  h.render(props); h.effects(); await settle();
  let tree = h.render(props);
  assert.deepEqual(articles(tree), ["current-state", "subject", "goal"]);
  flatten(tree).find((n: any) => n.type === "button" && textOf(n) === "Csempék szerkesztése").props.onClick();
  tree = h.render(props);
  flatten(tree).find((n: any) => n.type === "button" && textOf(n) === "+ Csempe hozzáadása").props.onClick();
  tree = h.render(props);
  assert.match(textOf(tree), /Archivált csempék/);
  flatten(tree).find((n: any) => n.type === "button" && textOf(n) === "Archivált visszaállítása").props.onClick();
  tree = h.render(props);
  assert.deepEqual(articles(tree), ["current-state", "subject", "goal", "custom-archived"]);
});
