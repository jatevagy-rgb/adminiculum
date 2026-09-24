import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// /clients narrow-viewport repair: the compact DataTable keeps client identity,
// relationship status, and the required row actions reachable without a
// horizontal-scroll hunt, while the desktop table stays unchanged.
const source = readFileSync('src/app/clients/page.tsx', 'utf8');

test('narrow viewport hides only genuinely secondary columns', () => {
  assert.match(source, /<DataTableHeaderCell className="hidden md:table-cell">Kapcsolattartó<\/DataTableHeaderCell>/);
  assert.match(source, /<DataTableHeaderCell className="hidden md:table-cell">Elérhetőség<\/DataTableHeaderCell>/);
  assert.match(source, /<DataTableHeaderCell className="hidden md:table-cell">Státusz<\/DataTableHeaderCell>/);

  // Identity and row actions stay visible.
  assert.match(source, /<DataTableHeaderCell>Ügyfél neve<\/DataTableHeaderCell>/);
  assert.match(source, /<DataTableHeaderCell align="right">Műveletek<\/DataTableHeaderCell>/);

  // The matching body cells collapse with their headers.
  assert.match(source, /<DataTableCell muted className="hidden md:table-cell">\s*\{client\.contactPerson/);
  assert.match(source, /<DataTableCell muted className="hidden md:table-cell">\s*<div className="space-y-0\.5">/);
  assert.match(source, /<DataTableCell className="hidden md:table-cell">\s*<Badge shape="pill"/);
});

test('status stays available on narrow viewports inside the identity cell', () => {
  assert.match(
    source,
    /<\/Link>\s*<div className="mt-1\.5 md:hidden">\s*<Badge shape="pill" tone=\{client\.relationshipMode === "PORTAL_CENTRIC" \? "teal" : "neutral"\} dot>[\s\S]*?<\/Badge>\s*<\/div>/,
    'the relationship status badge must remain rendered when the status column collapses',
  );
});

test('required row actions stay reachable without horizontal scrolling on narrow viewports', () => {
  // Actions stack (and stretch) below md, and return to the inline right-aligned
  // group at md and above.
  assert.match(source, /className="flex flex-col items-stretch gap-1\.5 md:flex-row md:items-center md:justify-end md:gap-2\.5"/);
  // Touch target for the quiet link on narrow viewports only.
  assert.match(source, /className="max-md:min-h-8 max-md:justify-center"/);

  // Both confirmed working actions are preserved with accessible labels.
  assert.match(source, /href=\{`\/cases\?newCase=1&clientId=\$\{encodeURIComponent\(client\.id\)\}`\}/);
  assert.match(source, /aria-label=\{`Új ügy indítása: \$\{client\.name\}`\}/);
  assert.match(source, />\s*\+ Új ügy\s*<\/QuietLink>/);
  assert.match(source, />\s*Dosszié\s*<\/Link>/);
});

test('desktop table keeps its five columns and fixed minimum width', () => {
  assert.match(source, /<DataTable className="md:min-w-\[760px\]">/);
  assert.doesNotMatch(source, /minWidth=\{760\}/, 'narrow viewports must not inherit the desktop minimum width');
  for (const label of ['Ügyfél neve', 'Kapcsolattartó', 'Elérhetőség', 'Státusz', 'Műveletek']) {
    assert.ok(source.includes(label), `desktop column "${label}" must remain`);
  }
});

test('list/search/toggle/tile behaviors are untouched by the narrow table repair', () => {
  assert.match(source, /const \[viewMode, setViewMode\] = useState<"cards" \| "table">\("cards"\);/);
  assert.match(source, /type="search"/);
  assert.match(source, /placeholder="Név, email, kapcsolattartó vagy adószám"/);
  assert.match(source, /role="group" aria-label="Nézet kiválasztása"/);
  assert.match(source, /aria-pressed=\{viewMode === "table"\}/);
  assert.match(source, /aria-pressed=\{viewMode === "cards"\}/);
  assert.match(source, /<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">\{filteredClients\.map\(renderClientTile\)\}<\/div>/);
  assert.match(source, />\s*\+ Új ügyfél\s*<\/Button>/);
  assert.match(source, /href=\{`\/clients\/\$\{client\.id\}`\}/);
});
