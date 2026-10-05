import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const read = (relative: string) =>
  readFileSync(path.resolve(process.cwd(), relative), "utf8");

const api = () => read("src/lib/clientPublicationApi.ts");
const panel = () => read("src/components/documents/publication/ClientPublicationPanel.tsx");

test("publication target DTO exposes the server-derived readiness state", () => {
  const source = api();
  assert.match(source, /publicationReadiness: PortalPublicationReadiness/);
  assert.match(source, /PortalPublicationReadiness = "READY_NEW" \| "READY_EXISTING_ACCESS" \| "BLOCKED_CONFLICT"/);
});

test("publication panel communicates every readiness state in Hungarian before publication", () => {
  const source = panel();
  for (const message of [
    "Ehhez az ügyhöz a közzététellel olvasási hozzáférés jön létre.",
    "A címzett már rendelkezik megfelelő hozzáféréssel ehhez az ügyhöz. A meglévő hozzáférés változatlan marad.",
    "A címzett meglévő hozzáférése nem kompatibilis ezzel a közzététellel. Közzététel nem történt.",
  ]) assert.match(source, new RegExp(message.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(source, /PUBLICATION_READINESS_LABELS\[selectedTarget\.publicationReadiness\]/);
  assert.match(source, /data-readiness=\{selectedTarget\.publicationReadiness\}/);
});

test("a BLOCKED_CONFLICT target is never presented or treated as ready for publication", () => {
  const source = panel();
  // The publish button is disabled whenever the selected target is blocked.
  assert.match(source, /disabled=\{busy \|\| !selectedTarget \|\| selectedTarget\.publicationReadiness === "BLOCKED_CONFLICT"\}/);
  // The blocked message is the same text used for the server conflict error,
  // so a blocked target cannot misleadingly appear ready.
  assert.match(source, /PUBLICATION_CONFLICT_TEXT = PUBLICATION_READINESS_LABELS\.BLOCKED_CONFLICT/);
});

test("server grant conflict renders the actionable Hungarian message", () => {
  const source = panel();
  assert.match(source, /publicationErrorText/);
  assert.match(source, /code === "PARTICIPANT_GRANT_CONFLICT"/);
  assert.match(source, /setError\(publicationErrorText\(caught\)\)/);
});

test("compatible reuse still requires the explicit publish click and a bounded admin route", () => {
  const source = panel();
  // Publication is only reachable through the operator's explicit click — the
  // readiness state alone never publishes.
  assert.match(source, /onClick=\{\(\) => run\(async \(\) => \{[\s\S]*?await publishInternalCaseToPortal\(caseId,/);
  assert.doesNotMatch(source, /useEffect\(\(\) => \{[\s\S]{0,600}?publishInternalCaseToPortal/);
  // Bounded navigation to the existing safe management route.
  assert.match(source, /href="\/client-portal-admin"[^>]*>Hozzáférések részletei<\/a>/);
  assert.doesNotMatch(source, /Automatikus közzététel/);
});
