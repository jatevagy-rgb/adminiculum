import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const source = fs.readFileSync(path.join(process.cwd(), "src/app/clients/page.tsx"), "utf8");

test("client overview tiles stay identity-first and dossier-linked", () => {
  assert.match(source, /<h2[\s\S]*client\.name/);
  assert.match(source, /href=\{`\/clients\/\$\{client\.id\}`\}/);
  assert.match(source, /getClientColorDefinition\(client\.colorKey\)/);
  assert.match(source, /\$\{color\.borderClass\}/);
  const tileStart = source.indexOf("const renderClientTile");
  const tile = source.slice(tileStart, source.indexOf("\n  return (", tileStart));
  for (const hidden of ["companyRegistrationNumber", "authorizedRepresentative", "House style", "Szerkesztés"]) {
    assert.doesNotMatch(tile, new RegExp(hidden));
  }
  // The target tile intentionally surfaces the operational identity fields.
  for (const shown of ["contactPerson", "email", "phone", "taxNumber"]) {
    assert.match(tile, new RegExp(shown));
  }
});

test("editing and house style remain reachable from the canonical dossier", () => {
  const dossier = fs.readFileSync(path.join(process.cwd(), "src/app/clients/[clientId]/page.tsx"), "utf8");
  assert.match(dossier, /Ügyfél szerkesztése/);
  assert.match(dossier, /House Style|House style/);
});
