import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Client lifecycle archive/delete contract for the workforce dossier:
// Haladó -> Ügyfél archiválása with a truthful dependency preview, explicit
// confirmation, archived-client filtering, and a typed-name hard delete that
// is only offered for dependency-free clients.

const page = readFileSync("src/app/clients/[clientId]/page.tsx", "utf8");
const controls = readFileSync("src/components/clients/ClientLifecycleControls.tsx", "utf8");
const api = readFileSync("src/lib/api.ts", "utf8");

test("archive action lives under the Haladó menu on the client dossier", () => {
  assert.match(page, /••• Haladó/);
  assert.match(page, /<ClientLifecycleControls client=\{client\} onArchived=\{\(\) => router\.push\("\/clients"\)\} \/>/);
  assert.match(controls, /Ügyfél archiválása/);
});

test("dependency summary is fetched from the canonical preview endpoint and shown truthfully", () => {
  assert.match(controls, /getClientLifecyclePreview\(client\.id\)/);
  assert.match(api, /\/clients\/\$\{encodeURIComponent\(clientId\)\}\/lifecycle-preview/);
  assert.match(controls, /Ehhez az ügyfélhez tartozik:/);
  assert.match(controls, /Az archiválás az ügyeket, dokumentumokat és az előzményeket megőrzi/);
  assert.match(controls, /A portál felhasználói fiók nem törlődik/);
});

test("explicit confirmation is required — nothing runs on render", () => {
  assert.match(controls, /data-testid="confirm-archive"/);
  assert.match(controls, /Archiválás megerősítése/);
  // archive only fires inside the confirm handler
  const confirmBlock = controls.match(/const confirm = async[\s\S]*?\n  \};/)![0];
  assert.match(confirmBlock, /archiveClient\(client\.id\)/);
  assert.doesNotMatch(controls, /useEffect[\s\S]*?archiveClient/);
});

test("archive success redirects to /clients", () => {
  assert.match(controls, /onArchived\(\)/);
  assert.match(page, /router\.push\("\/clients"\)/);
});

test("hard delete is only offered when dependency-free and requires typed-name confirmation", () => {
  assert.match(controls, /preview\?\.canHardDelete/);
  assert.match(controls, /Végleges törlés/);
  assert.match(controls, /confirmName\.trim\(\) !== client\.name\.trim\(\)/);
  assert.match(controls, /A megerősítéshez írja be az ügyfél nevét/);
  // never presented for clients with dependencies
  assert.match(controls, /mode === "archive" && preview\?\.canHardDelete/);
  assert.doesNotMatch(controls, /deleteClient\(client\.id\)[\s\S]*?canHardDelete === false/);
});

test("archived clients are marked and the archive action is not re-offered", () => {
  assert.match(controls, /client\.archivedAt/);
  assert.match(controls, /Archivált ügyfél/);
  assert.match(page, /client\.archivedAt \? \(/);
  assert.match(page, /\bArchivált\b/);
});

test("no raw DELETE button bypass and no new deletion systems", () => {
  assert.doesNotMatch(page, /deleteClient\(/);
  assert.match(api, /archiveClient\(clientId: string\)/);
  assert.doesNotMatch(controls, /cascade|purge/i);
});

test("existing dossier functions remain intact", () => {
  assert.match(page, /setShowNewCaseModal\(true\)/);
  assert.match(page, /Ügyfélportál kezelése/);
  assert.match(page, /Dokumentumstílus/);
});
