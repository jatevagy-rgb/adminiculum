import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CLIENT_COLOR_KEYS,
  CLIENT_COLOR_DEFINITIONS,
  NEUTRAL_CLIENT_COLOR,
  getClientColorDefinition,
  isClientColorKey,
} from "../src/lib/clientColors";

// Focused convergence proof for the /clients directory:
// - professional tile grid is the default, table/list stays reachable
// - client identity color comes only from canonical Client.colorKey
// - direct tile color edit uses the canonical updateClient API and the
//   server response is authoritative
const source = readFileSync("src/app/clients/page.tsx", "utf8");

function tileFunctionSource(): string {
  const start = source.indexOf("const renderClientTile");
  assert.notEqual(start, -1, "renderClientTile must exist");
  const end = source.indexOf("\n  };", start);
  assert.notEqual(end, -1, "renderClientTile must be a complete function");
  return source.slice(start, end);
}

// 1. Cards / tile grid is the default presentation.
test("1. tile grid is the default presentation", () => {
  assert.match(source, /const \[viewMode, setViewMode\] = useState<"cards" \| "table">\("cards"\);/);
  // "Csempék" is offered first, "Lista" second, in the segmented group.
  assert.match(
    source,
    /onClick=\{\(\) => setViewMode\("cards"\)\}[\s\S]*?>\s*Csempék\s*<\/button>[\s\S]*?onClick=\{\(\) => setViewMode\("table"\)\}[\s\S]*?>\s*Lista\s*<\/button>/,
  );
});

// 2. Table / list view remains reachable as a secondary toggle.
test("2. table view remains reachable as a secondary toggle", () => {
  assert.match(source, /onClick=\{\(\) => setViewMode\("table"\)\}/);
  assert.match(source, /aria-pressed=\{viewMode === "table"\}/);
  assert.match(source, /<DataTable className="md:min-w-\[760px\]">/);
  assert.match(source, /<DataTableHeaderCell>Ügyfél neve<\/DataTableHeaderCell>/);
});

// 3. Every filtered client renders exactly once in the active view.
test("3. each filtered client renders exactly once in the active view", () => {
  const mapSites = source.match(/filteredClients\.map\(/g) ?? [];
  assert.equal(mapSites.length, 2, "exactly one map site per view (tiles + table)");
  assert.match(source, /\{filteredClients\.map\(renderClientTile\)\}/);
  assert.match(source, /\{filteredClients\.map\(\(client\) => \{/);
  // The unfiltered list is never rendered directly.
  assert.doesNotMatch(source, /\bclients\.map\(/);
});

// 4. Responsive grid breakpoints exist (1 / 2 / 3 / 4 columns).
test("4. responsive grid breakpoints exist", () => {
  assert.match(source, /grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4/);
});

// 5. Search behavior is preserved across name, email, contact and tax number.
test("5. search behavior is preserved", () => {
  assert.match(source, /const query = search\.trim\(\)\.toLocaleLowerCase\("hu-HU"\);/);
  assert.match(source, /\[client\.name, client\.email, client\.contactPerson, client\.taxNumber\]/);
  assert.match(source, /\.some\(\(value\) => String\(value \|\| ""\)\.toLocaleLowerCase\("hu-HU"\)\.includes\(query\)\)/);
  assert.match(source, /\.sort\(\(left, right\) => left\.name\.localeCompare\(right\.name, "hu-HU"\)\)/);
});

// 6. Neutral color behavior is canonical and visually neutral.
test("6. neutral color resolves canonically and stays neutral", () => {
  const neutral = getClientColorDefinition(null);
  assert.equal(neutral.key, null);
  assert.equal(neutral.label, "Nincs színjelölés");
  assert.equal(neutral.accentClass, "bg-transparent");
  assert.equal(neutral.softBackgroundClass, "bg-white");
  assert.equal(getClientColorDefinition(undefined).key, null);
  assert.equal(getClientColorDefinition("NOT_A_KEY").key, null);
  const tile = tileFunctionSource();
  assert.match(tile, /color\.key \? color\.accentClass : "bg-white"/);
});

// 7. Every valid ClientColorKey resolves its canonical identity styling.
test("7. all valid color keys resolve canonically", () => {
  for (const key of CLIENT_COLOR_KEYS) {
    assert.ok(isClientColorKey(key), `${key} must be a recognized ClientColorKey`);
    const def = getClientColorDefinition(key);
    assert.equal(def.key, key);
    assert.equal(def, CLIENT_COLOR_DEFINITIONS[key]);
    assert.ok(def.accentClass.startsWith("bg-"), `${key} accentClass must define a bg`);
    assert.ok(def.label.length > 0, `${key} must expose a Hungarian label`);
  }
  assert.equal(NEUTRAL_CLIENT_COLOR.key, null);
});

// 8. Tile color edit calls the canonical updateClient API.
test("8. tile color edit calls the canonical updateClient API", () => {
  assert.match(source, /updateClient\(colorModalClient\.id, \{ colorKey: selectedColorKey \}\)/);
});

// 9. The server response is authoritative for tile color.
test("9. server response drives the tile color", () => {
  assert.match(source, /const updated = await updateClient\(colorModalClient\.id, \{ colorKey: selectedColorKey \}\);/);
  assert.match(source, /colorKey: updated\.colorKey !== undefined \? updated\.colorKey : selectedColorKey/);
  // No full-list reload is required to apply a color change.
  assert.doesNotMatch(source, /handleSaveColor[\s\S]{0,400}?await loadClients\(\)/);
});

// 10. Clearing color returns to the canonical neutral state.
test("10. clearing color returns to neutral", () => {
  assert.match(source, /setSelectedColorKey\(client\.colorKey \|\| null\)/);
  assert.match(source, /value=\{selectedColorKey\}/);
  assert.equal(getClientColorDefinition(null).key, null);
});

// 11. Dosszié destination is preserved.
test("11. Dosszié destination preserved", () => {
  const tile = tileFunctionSource();
  assert.match(tile, /href=\{`\/clients\/\$\{client\.id\}`\}/);
  assert.match(tile, />\s*Dosszié\s*<\/Link>/);
});

// 12. + Új ügy preserves the clientId query parameter.
test("12. + Új ügy preserves clientId", () => {
  const tile = tileFunctionSource();
  assert.match(tile, /href=\{`\/cases\?newCase=1&clientId=\$\{encodeURIComponent\(client\.id\)\}`\}/);
  assert.match(tile, /aria-label=\{`Új ügy indítása: \$\{client\.name\}`\}/);
});

// 13. No name hashing / generated colors.
test("13. no client name hashing for color", () => {
  assert.doesNotMatch(source, /charCodeAt/);
  assert.doesNotMatch(source, /hashColor|stringToColor|getColorFromName|colorFromName/);
  assert.match(source, /const color = getClientColorDefinition\(client\.colorKey\);/);
});

// 14. Client color is not overloaded as workflow/status semantics.
test("14. color is not used as workflow state", () => {
  const tile = tileFunctionSource();
  assert.match(tile, /tone=\{client\.relationshipMode === "PORTAL_CENTRIC" \? "teal" : "neutral"\}/);
  assert.doesNotMatch(tile, /tone=\{color/);
  assert.doesNotMatch(tile, /status=\{color|Badge[^>]*color\.key/);
});

// 15. Create/edit form still accepts the color identity.
test("15. create/edit form still accepts color", () => {
  assert.match(
    source,
    /<ClientColorSelector\s+value=\{formData\.colorKey \|\| null\}\s+onChange=\{\(colorKey\) => setFormData\(\(current\) => \(\{ \.\.\.current, colorKey \}\)\)\}/,
  );
  assert.match(source, /await createClient\(formData\);/);
  assert.match(source, /await updateClient\(editingClient\.id, updateData\);/);
});

// 16. The color control is accessible and names the client.
test("16. accessible color control", () => {
  const tile = tileFunctionSource();
  assert.match(tile, /aria-label=\{`Ügyfélszín módosítása: \$\{client\.name\} \(jelenleg: \$\{color\.label\}\)`\}/);
  assert.match(tile, /<IconButton/);
  assert.match(tile, /focus-visible:outline-\[var\(--adm-green-800\)\]/);
});

// 17. Narrow layout keeps both tile actions reachable without loss.
test("17. narrow layout has no action loss", () => {
  const tile = tileFunctionSource();
  assert.match(tile, /flex flex-wrap items-center gap-2 border-t border-\[var\(--adm-border\)\] p-3/);
  assert.match(tile, /aria-label=\{`Új ügy indítása: \$\{client\.name\}`\}/);
  assert.match(tile, />\s*Dosszié\s*<\/Link>/);
});

// Accent: the new/changed code introduces zero raw hex values.
test("18. the new tile code introduces zero raw hex values", () => {
  const tile = tileFunctionSource();
  assert.doesNotMatch(tile, /\[#(?:[0-9a-fA-F]{3,8})\]/);
  // Identity accent comes from canonical clientColors classes, not route-local hex.
  assert.match(tile, /border-l-4/);
  assert.match(tile, /\$\{color\.borderClass\}/);
  assert.match(tile, /color\.key \? color\.accentBorderClass : ""/);
});
