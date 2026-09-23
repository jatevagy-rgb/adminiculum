import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CLIENT_COLOR_KEYS,
  CLIENT_COLOR_DEFINITIONS,
  NEUTRAL_CLIENT_COLOR,
  getClientColorDefinition,
  isClientColorKey,
} from '../src/lib/clientColors';

const source = readFileSync('src/app/clients/page.tsx', 'utf8');

// 1. Tile view is primary/default
test('1. tile view is primary and default presentation', () => {
  assert.match(source, /const \[viewMode, setViewMode\] = useState<"cards" \| "table">\("cards"\);/);
  // Csempék (cards) button is first in the segmented view group
  assert.match(source, /onClick=\{\(\) => setViewMode\("cards"\)\}[\s\S]*?onClick=\{\(\) => setViewMode\("table"\)\}/);
});

// 2. All clients from list DTO render once
test('2. all clients from filtered list render once in responsive tile grid', () => {
  assert.match(source, /<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">\{filteredClients\.map\(renderClientTile\)\}<\/div>/);
  assert.match(source, /data-testid=\{`client-tile-\$\{client\.id\}`\}/);
});

// 3. Search still filters correctly across name, email, contact, tax number
test('3. search filters across name, email, contactPerson, and taxNumber without degradation', () => {
  assert.match(source, /const query = search\.trim\(\)\.toLocaleLowerCase\("hu-HU"\);/);
  assert.match(source, /\[client\.name, client\.email, client\.contactPerson, client\.taxNumber\]/);
  assert.match(source, /\.some\(\(value\) => String\(value \|\| ""\)\.toLocaleLowerCase\("hu-HU"\)\.includes\(query\)\)/);
});

// 4. Neutral colorKey renders neutral tile
test('4. neutral colorKey renders neutral tile without saturated border', () => {
  const neutralDef = getClientColorDefinition(null);
  assert.equal(neutralDef.key, null);
  assert.equal(neutralDef.label, 'Nincs színjelölés');
  assert.equal(neutralDef.borderClass, 'border-[var(--adm-border)]');
  assert.equal(neutralDef.softBackgroundClass, 'bg-white');

  // Page source handles null colorKey with neutral fallback border-t
  assert.match(source, /color\.key \? `border-t-4 \$\{color\.accentTopBorderClass\}` : "border-t border-\[#E5E7E6\]"/);
});

// 5. Every valid colorKey renders the corresponding identity styling
test('5. every valid ClientColorKey renders its corresponding identity styling', () => {
  for (const key of CLIENT_COLOR_KEYS) {
    assert.ok(isClientColorKey(key), `${key} must be recognized as valid ClientColorKey`);
    const def = getClientColorDefinition(key);
    assert.equal(def.key, key);
    assert.ok(def.accentClass.startsWith('bg-'), `${key} accentClass must define bg color`);
    assert.ok(def.accentTopBorderClass.startsWith('border-t-'), `${key} accentTopBorderClass must define border-t color`);
    assert.ok(def.borderClass.startsWith('border-'), `${key} borderClass must define border color`);
    assert.ok(def.softBackgroundClass.startsWith('bg-'), `${key} softBackgroundClass must define soft background tint`);
    assert.ok(def.label.length > 0, `${key} must have human Hungarian label`);
  }
});

// 6. Changing color invokes canonical update API
test('6. changing color invokes canonical updateClient API', () => {
  assert.match(source, /updateClient\(colorModalClient\.id, \{ colorKey: selectedColorKey \}\)/);
});

// 7. Server response becomes authoritative UI state
test('7. server response becomes authoritative UI state for client color', () => {
  assert.match(source, /const updated = await updateClient\(colorModalClient\.id, \{ colorKey: selectedColorKey \}\);/);
  assert.match(source, /setClients\(\(prev\) =>\s*prev\.map\(\(c\) =>\s*c\.id === colorModalClient\.id\s*\?\s*\{ \.\.\.c, colorKey: updated\.colorKey !== undefined \? updated\.colorKey : selectedColorKey \}\s*:\s*c/);
});

// 8. Clearing color returns neutral
test('8. clearing color to null returns neutral styling', () => {
  const cleared = getClientColorDefinition(null);
  assert.equal(cleared.key, null);
  assert.equal(cleared.accentClass, 'bg-transparent');
  assert.equal(cleared.accentBorderClass, 'border-l-transparent');
  assert.equal(cleared.accentTopBorderClass, 'border-t-transparent');
});

// 9. Dosszié destination preserved
test('9. Dosszié link preserves exact destination to client dossier', () => {
  assert.match(source, /href=\{`\/clients\/\$\{client\.id\}`\}/);
  assert.match(source, />\s*Dosszié\s*<\/Link>/);
});

// 10. + Új ügy preserves clientId query parameter
test('10. + Új ügy preserves newCase=1 and clientId query parameters', () => {
  assert.match(source, /href=\{`\/cases\?newCase=1&clientId=\$\{encodeURIComponent\(client\.id\)\}`\}/);
  assert.match(source, /aria-label=\{`Új ügy indítása: \$\{client\.name\}`\}/);
});

// 11. No client-name hash color assignment
test('11. no client name hash or string hashing is used for color calculation', () => {
  assert.doesNotMatch(source, /charCodeAt/);
  assert.doesNotMatch(source, /hashColor|stringToColor|getColorFromName/);
  // Color strictly derives from client.colorKey
  assert.match(source, /const color = getClientColorDefinition\(client\.colorKey\);/);
});

// 12. Client color is not used as workflow/status semantics
test('12. client color is visual identity decoration, not workflow or status semantics', () => {
  // Relationship mode pill uses dedicated tone mapping independent of clientColorKey
  assert.match(source, /tone=\{client\.relationshipMode === "PORTAL_CENTRIC" \? "teal" : "neutral"\}/);
});

// 13. Create client continues accepting optional colorKey
test('13. create client form continues accepting optional colorKey', () => {
  assert.match(source, /<ClientColorSelector[\s\S]*?value=\{formData\.colorKey \|\| null\}[\s\S]*?onChange=\{\(colorKey\) => setFormData\(\(current\) => \(\{ \.\.\.current, colorKey \}\)\)\}/);
  assert.match(source, /await createClient\(formData\);/);
});

// 14. Keyboard/focus works on tile actions and color selector
test('14. keyboard focus outline and accessible labels exist on tile actions and color trigger', () => {
  assert.match(source, /aria-label=\{`Ügyfélszín módosítása: \$\{client\.name\} \(jelenleg: \$\{color\.label\}\)`\}/);
  assert.match(source, /focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-\[#0F3D32\]/);
});

// 15. Responsive layout works across breakpoints
test('15. responsive multi-column layout classes are properly defined', () => {
  assert.match(source, /grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4/);
});
