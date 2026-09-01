import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { ApiError, safeUploadErrorMessage } from "../src/lib/api";

const root = process.cwd();
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");

describe("workforce upload safety", () => {
  it("maps scanner-unavailable failures without exposing infrastructure details", () => {
    const message = safeUploadErrorMessage(
      new ApiError(503, "clamd endpoint https://scanner.internal/scan unavailable", "/cases/1/documents", "SCANNER_UNAVAILABLE"),
    );
    assert.match(message, /biztonsági ellenőrzés/i);
    assert.match(message, /nem került feltöltésre/i);
    assert.doesNotMatch(message, /clamd|scanner\.internal|https?:\/\//i);
  });

  it("maps unknown upload failures to a safe non-success state", () => {
    const message = safeUploadErrorMessage(new Error("Azure container secret and stack trace"));
    assert.equal(message, "A fájl feltöltése nem sikerült. A fájl nem került feltöltésre. Próbáld újra később.");
    assert.doesNotMatch(message, /Azure|secret|stack trace/i);
  });

  it("keeps workforce upload handlers on the shared safe mapper", () => {
    for (const file of [
      "src/components/cases/CaseWorkspaceActions.tsx",
      "src/components/CaseDetail.tsx",
      "src/app/cases/[caseId]/documents/page.tsx",
    ]) {
      const source = read(file);
      assert.match(source, /safeUploadErrorMessage/);
      assert.doesNotMatch(source, /set(?:Err|UploadError|ActionResult|InitialDocuments)[\s\S]{0,180}error\.message/);
    }
  });

  it("does not claim success for scanner failure states", () => {
    const source = read("src/lib/customerUpload.ts");
    assert.match(source, /PROCESSING/);
    assert.match(source, /biztonsági ellenőrzése folyamatban/);
    assert.doesNotMatch(source, /SCAN_FAILED[\s\S]{0,100}Feltöltve/);
  });
});
