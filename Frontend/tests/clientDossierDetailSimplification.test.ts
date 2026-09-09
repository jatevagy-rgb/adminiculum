import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync("src/app/clients/[clientId]/page.tsx", "utf8");

test("client dossier has identity-first header, canonical color and portal entry", () => {
  assert.match(source, /<h1[^>]*>\{client\.name\}<\/h1>/);
  assert.match(source, /getClientColorDefinition\(client\.colorKey\)/);
  assert.match(source, /clientColorDef\.borderClass/);
  assert.match(source, /clients\/\$\{encodeURIComponent\(clientId\)\}\/portal/);
  assert.match(source, /Ügyfélportál kezelése/);
});

test("dossier keeps detailed identity editing and secondary House Style access", () => {
  assert.match(source, /Ügyfélazonosság és kapcsolódó adatok/);
  for (const field of ["client.email", "client.phone", "client.address", "client.taxNumber", "client.companyRegistrationNumber"]) assert.match(source, new RegExp(field.replace(".", "\\.")));
  assert.match(source, /onClick=\{openEditClient\}/);
  assert.match(source, /id="house-style"/);
  assert.match(source, /ClientHouseStylePanel/);
});
