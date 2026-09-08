import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const source = fs.readFileSync(path.join(process.cwd(), "src/app/clients/page.tsx"), "utf8");

test("client overview cards stay identity-first and dossier-linked", () => {
  assert.match(source, /<h2[\s\S]*client\.name/);
  assert.match(source, /href=\{`\/clients\/\$\{client\.id\}`\}/);
  assert.match(source, /getClientColorDefinition\(client\.colorKey\)/);
  assert.match(source, /\$\{color\.borderClass\}/);
  for (const hidden of ["taxNumber", "companyRegistrationNumber", "authorizedRepresentative", "contactPerson", "House style", "Szerkesztés"]) {
    const card = source.slice(source.indexOf("const renderClientCard"), source.indexOf("return (", source.indexOf("const renderClientCard")));
    assert.doesNotMatch(card, new RegExp(hidden));
  }
});

test("editing and house style remain reachable from the canonical dossier", () => {
  const dossier = fs.readFileSync(path.join(process.cwd(), "src/app/clients/[clientId]/page.tsx"), "utf8");
  assert.match(dossier, /Ügyfél szerkesztése/);
  assert.match(dossier, /House Style|House style/);
});
