import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('src/app/clients/page.tsx', 'utf8');

test('client directory provides a compact tile grid by default and the DataTable as secondary view', () => {
  assert.match(source, /const \[viewMode, setViewMode\] = useState<"cards" \| "table">\("cards"\);/);
  assert.match(source, /<DataTable className="md:min-w-\[760px\]">/);
  assert.match(source, /<DataTableHead>/);
  assert.match(source, /<DataTableHeaderCell>Ügyfél neve<\/DataTableHeaderCell>/);
  assert.match(source, /<DataTableHeaderCell className="hidden md:table-cell">Kapcsolattartó<\/DataTableHeaderCell>/);
  assert.match(source, /<DataTableHeaderCell className="hidden md:table-cell">Elérhetőség<\/DataTableHeaderCell>/);
  assert.match(source, /<DataTableHeaderCell className="hidden md:table-cell">Státusz<\/DataTableHeaderCell>/);
  assert.match(source, /<DataTableHeaderCell align="right">Műveletek<\/DataTableHeaderCell>/);
  assert.match(source, /<DataTableBody>/);
  assert.match(source, /<DataTableRow key=\{client\.id\}>/);
});

test('compact table row preserves identity rail, contact comparison, status pill, and quiet actions', () => {
  // Identity rail and client link
  assert.match(source, /border-l-4 \$\{color\.key \? color\.accentBorderClass : "border-l-transparent"\}/);
  assert.match(source, /href=\{`\/clients\/\$\{client\.id\}`\}/);

  // Contact comparison fields
  assert.match(source, /client\.contactPerson/);
  assert.match(source, /mailto:\$\{client\.email\}/);
  assert.match(source, /client\.phone/);

  // Status pill with truthful relationship mode
  assert.match(source, /Badge shape="pill" tone=\{client\.relationshipMode === "PORTAL_CENTRIC" \? "teal" : "neutral"\} dot/);
  assert.match(source, /client\.relationshipMode === "PORTAL_CENTRIC" \? "Portál ügyfél" : "Ügyfél"/);

  // Quiet row actions
  assert.match(source, /QuietLink[\s\S]*href=\{`\/cases\?newCase=1&clientId=\$\{encodeURIComponent\(client\.id\)\}`\}/);
  assert.match(source, /aria-label=\{`Új ügy indítása: \$\{client\.name\}`\}/);
});

test('segmented view control toggles between compact list and card layout', () => {
  assert.match(source, /role="group" aria-label="Nézet kiválasztása"/);
  assert.match(source, /onClick=\{\(\) => setViewMode\("table"\)\}/);
  assert.match(source, /onClick=\{\(\) => setViewMode\("cards"\)\}/);
  assert.match(source, /aria-pressed=\{viewMode === "table"\}/);
  assert.match(source, /aria-pressed=\{viewMode === "cards"\}/);
});
