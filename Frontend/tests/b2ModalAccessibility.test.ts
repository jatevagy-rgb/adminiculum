import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

const read = (file: string) => readFileSync(path.resolve(process.cwd(), file), "utf8");

function overlayTag(src: string): string {
  const portalIndex = src.indexOf("createPortal(");
  const start = src.indexOf("<div", portalIndex);
  const end = src.indexOf(">", start);
  return src.slice(start, end);
}

describe("B2 modal accessibility closure", () => {
  it("exposes ONE shared dialog accessibility implementation", () => {
    const modal = read("src/components/ui/Modal.tsx");
    const hook = read("src/components/ui/useDialogAccessibility.ts");

    // The canonical primitive adopts the shared hook instead of a private copy.
    assert.match(modal, /useDialogAccessibility/);
    assert.doesNotMatch(modal, /addEventListener\("keydown"/);

    // Shared semantics: remember opener, move focus in, trap Tab, Escape closes, restore focus.
    assert.match(hook, /previousFocusRef/);
    assert.match(hook, /requestAnimationFrame\(focusDialog\)/);
    assert.match(hook, /event\.key === "Escape"/);
    assert.match(hook, /onCloseRef\.current\(\)/);
    assert.match(hook, /event\.key !== "Tab"/);
    assert.match(hook, /previous\.focus\(\)/);
  });

  it("wires AnonymizeModal to the shared hook without changing its form or submit handler", () => {
    const dialog = read("src/components/documents/AnonymizeModal.tsx");
    assert.match(dialog, /useDialogAccessibility\(\{ open: isOpen && mounted, onClose, dialogRef \}\)/);
    assert.match(dialog, /ref=\{dialogRef\}/);
    assert.match(dialog, /createPortal\([\s\S]*document\.body/);
    assert.match(dialog, /onClick=\{handleAnonymize\}/);
    assert.match(dialog, /max-h-\[calc\(100dvh-2rem\)\]/);
  });

  it("wires CaseTimeEntryDialog to the shared hook without changing its save handler", () => {
    const dialog = read("src/components/cases/CaseTimeEntryDialog.tsx");
    assert.match(dialog, /useDialogAccessibility\(\{ open: mounted, onClose, dialogRef \}\)/);
    assert.match(dialog, /ref=\{dialogRef\}/);
    assert.match(dialog, /createPortal\([\s\S]*document\.body/);
    assert.match(dialog, /recordCaseTime/);
    assert.match(dialog, /max-h-\[calc\(100dvh-2rem\)\]/);
  });

  it("preserves existing overlay-click semantics (no click-to-close invented)", () => {
    for (const file of [
      "src/components/documents/AnonymizeModal.tsx",
      "src/components/cases/CaseTimeEntryDialog.tsx",
    ]) {
      const src = read(file);
      assert.ok(!overlayTag(src).includes("onClick="), `${file}: overlay must not gain a click handler`);
    }
  });
});
