import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const owner = readFileSync("src/components/cases/word-workflow/layout/CaseClientOwner.tsx", "utf8");
const tiles = readFileSync("src/components/cases/word-workflow/layout/DurableCaseTiles.tsx", "utf8");

test("case owner only presents empty or assigned state after a successful read", () => {
  assert.match(owner, /useState<'loading' \| 'error' \| 'success'>\('loading'\)/);
  assert.match(owner, /readState === 'loading'[\s\S]*?Ügygazda betöltése/);
  assert.match(owner, /readState === 'success' \? <p>\{value\?\.owner[\s\S]*?Nincs kijelölve/);
  assert.match(owner, /setReadState\('error'\)/);
  assert.match(owner, /ownerReadError\(error\)/);
});

test("case owner preserves feature, authorization, eligibility, case-scoped and save semantics", () => {
  assert.match(owner, /const url = `\/case-workspace\/cases\/\$\{encodeURIComponent\(caseId\)\}\/owner`/);
  assert.match(owner, /fetchApi<Owner>\(url, \{ method: 'PUT', body: JSON\.stringify\(\{ revision: value\.revision, personId: draft \|\| null \}\) \}\)/);
  assert.match(owner, /value\.owner\.valid \? '' : ' · már nem választható; új kijelölés szükséges'/);
  assert.match(owner, /WORKSPACE_CAPABILITY_UNAVAILABLE/);
  assert.match(owner, /error\.status === 403/);
  assert.match(owner, /case-owner-saved/);
  assert.match(owner, /jelentésben külön felülírható/);
});

test("durable tiles do not render a layout until canonical state succeeds", () => {
  assert.match(tiles, /useState<'loading' \| 'error' \| 'success'>\('loading'\)/);
  assert.match(tiles, /readState === 'loading' && <p role="status">Az ügy csempéinek betöltése/);
  assert.match(tiles, /setReadState\('error'\)/);
  assert.match(tiles, /tileReadError\(error\)/);
  assert.match(tiles, /readState === 'success' && <div className="grid/);
  assert.match(tiles, /const refs = view\?\.placements\[surface\] \?\? \[\]/);
  assert.doesNotMatch(tiles, /view\?\.placements\[surface\] \|\| builtin\.map/);
});

test("successful canonical placements retain builtins, custom tiles, archive and per-user layout", () => {
  assert.match(tiles, /placements: Record<Surface, string\[]>/);
  assert.match(tiles, /builtinById = new Map\(builtin\.map/);
  assert.match(tiles, /view\?\.tiles\.find\(t => t\.id === id\)/);
  assert.match(tiles, /custom\?\.archived && !draft/);
  assert.match(tiles, /placements\[surface\]/);
  assert.match(tiles, /WORKSPACE_CAPABILITY_UNAVAILABLE/);
  assert.match(tiles, /error\.status === 403/);
});

test("durable tile save and conflict behavior remain unchanged", () => {
  assert.match(tiles, /if \(!draft \|\| !saved\)/);
  assert.match(tiles, /layoutRevision: draft\.layoutRevision, placements: draft\.placements, tiles/);
  assert.match(tiles, /A mentés nem sikerült vagy másik szerkesztés történt\. A piszkozat megmaradt/);
  assert.match(tiles, /setSaved\(next\);\s*setDraft\(null\)/);
  assert.match(tiles, /case-tiles-saved/);
});
