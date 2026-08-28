import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const source = readFileSync(
  path.join(process.cwd(), "src/components/client-portal/OrganizationPortalViews.tsx"),
  "utf8",
);

describe("organization portal Hungarian copy encoding", () => {
  it("keeps customer-visible Hungarian labels UTF-8 encoded", () => {
    for (const label of [
      "Saját ügyem",
      "Megosztott ügy",
      "Beküldve",
      "Áttekintés alatt",
      "Szervezeti portálfelhasználó",
      "Dokumentum megnyitása",
    ]) {
      assert.match(source, new RegExp(label));
    }

    for (const marker of ["Ă", "Â", "Ã", "Ĺ"]) {
      assert.doesNotMatch(source, new RegExp(marker));
    }
  });
});
