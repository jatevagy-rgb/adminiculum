import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const { JSDOM } = createRequire(import.meta.url)("jsdom") as { JSDOM: new (html?: string, options?: object) => any };

test("mounted matrix keeps scope identity through absent selection, late A response and failed B save", async () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { pretendToBeVisual: true, url: "http://localhost" });
  const previous = new Map<string, PropertyDescriptor | undefined>();
  const setGlobal = (name: string, value: unknown) => {
    previous.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  };
  for (const name of ["window", "document", "navigator", "HTMLElement", "Element", "Node", "Event"]) {
    setGlobal(name, name === "window" ? dom.window : dom.window[name]);
  }
  setGlobal("localStorage", { getItem: () => "test-token" });
  setGlobal("IS_REACT_ACT_ENVIRONMENT", true);

  let releaseA: ((value: Response) => void) | null = null;
  const writes: Array<{ path: string; body: any }> = [];
  setGlobal("fetch", async (url: string, init?: RequestInit) => {
    const path = String(url);
    if (path.endsWith("/cases/A/documents")) return new Promise<Response>((resolve) => { releaseA = resolve; });
    if (path.endsWith("/cases/B/documents")) return Response.json([{ id: "DB", caseId: "B" }, { id: "DB2", caseId: "B" }]);
    if (path.endsWith("/cases/C/documents")) return Response.json([{ id: "DC", caseId: "C" }]);
    if (path.includes("/documents/DC/legal-analyses") && init?.method === "POST") {
      writes.push({ path, body: JSON.parse(String(init.body)) });
      return Response.json({ id: "NEW-C", caseId: "C", documentId: "DC" });
    }
    if (path.includes("/documents/DC/legal-analyses")) return Response.json([{ id: "MIXED-C", caseId: "C", documentId: "DC", title: "Kockázati mátrix (Word-workflow)", sourceType: "MANUAL", riskMatrixDetected: true }]);
    if (path.endsWith("/legal-analyses/MIXED-C")) {
      if (init?.method === "PATCH") throw new Error("Mixed analysis was overwritten");
      return Response.json({ id: "MIXED-C", caseId: "C", documentId: "DC", title: "Kockázati mátrix (Word-workflow)", sourceType: "MANUAL", analysisText: "Ügyvédi vélemény\n| Kockázat | Súlyosság | Valószínűség | Érintett pont | Javasolt kezelés |\n|---|---|---|---|---|\n| Vegyes | Magas | Közepes | 1 | Kezelés |" });
    }
    if (path.includes("/documents/DB/legal-analyses") && init?.method === "POST") {
      writes.push({ path, body: JSON.parse(String(init.body)) });
      return Response.json({ message: "save denied" }, { status: 500 });
    }
    if (path.includes("/documents/DB/legal-analyses")) return Response.json([]);
    throw new Error(`Unexpected API call ${path}`);
  });

  let root: import("react-dom/client").Root | null = null;
  try {
    const React = await import("react");
    const { createRoot } = await import("react-dom/client");
    const { WordRiskMatrixPanel } = await import("../src/components/cases/word-workflow/tools/WordRiskMatrixPanel");
    const container = dom.window.document.getElementById("root")! as HTMLElement;
    root = createRoot(container);
    const render = async (caseId: string, documentId: string | null) => {
      await React.act(async () => { root!.render(React.createElement(WordRiskMatrixPanel, { caseId, clientId: `C${caseId}`, documentId })); });
    };
    const save = () => container.querySelector<HTMLButtonElement>('[data-testid="save-risk-matrix-btn"]')!;

    await render("A", null);
    assert.equal(save().disabled, true);
    assert.match(container.textContent || "", /válasszon ki egy konkrét dokumentumot/);

    await render("A", "DA");
    assert.ok(releaseA, "A document read is pending");
    await render("B", "DB");
    assert.equal(save().disabled, false, "explicit B target resolved despite two B documents");
    await React.act(async () => { releaseA!(Response.json([{ id: "DA", caseId: "A" }])); });
    assert.equal(save().disabled, false, "late A response did not replace B target");

    await React.act(async () => { container.querySelector<HTMLButtonElement>('[data-testid="empty-add-risk-btn"]')!.click(); });
    const field = container.querySelector<HTMLTextAreaElement>('textarea[aria-label="Kockázat leírása"]')!;
    await React.act(async () => {
      const nativeSetter = Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, "value")!.set!;
      nativeSetter.call(field, "B ügy saját kockázata");
      field.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    });
    await React.act(async () => { save().click(); });
    assert.equal(writes.length, 1);
    assert.match(writes[0].path, /\/documents\/DB\/legal-analyses/);
    assert.equal(writes[0].body.caseId, "B");
    assert.match(writes[0].body.analysisText, /B ügy saját kockázata/);
    assert.match(container.textContent || "", /A mentés sikertelen volt/);
    assert.doesNotMatch(container.textContent || "", /save denied/);
    assert.equal(Boolean(container.querySelector('[data-testid="risk-save-success-toast"]')), false);
    assert.equal((container.querySelector<HTMLTextAreaElement>('textarea[aria-label="Kockázat leírása"]')?.value), "B ügy saját kockázata");

    await render("C", "DC");
    assert.equal(save().disabled, false);
    assert.doesNotMatch(container.textContent || "", /B ügy saját kockázata/, "B draft cannot appear in C");
    await React.act(async () => { container.querySelector<HTMLButtonElement>('[data-testid="empty-add-risk-btn"]')!.click(); });
    await React.act(async () => {
      const fieldC = container.querySelector<HTMLTextAreaElement>('textarea[aria-label="Kockázat leírása"]')!;
      const nativeSetter = Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, "value")!.set!;
      nativeSetter.call(fieldC, "C önálló kockázata");
      fieldC.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    });
    await React.act(async () => { save().click(); });
    assert.equal(writes.length, 2);
    assert.match(writes[1].path, /\/documents\/DC\/legal-analyses/);
    assert.equal(writes[1].body.title, "Kockázati mátrix (Word-workflow; önálló)");
    assert.match(writes[1].body.analysisText, /C önálló kockázata/);
  } finally {
    if (root) {
      const React = await import("react");
      await React.act(async () => { root!.unmount(); });
    }
    for (const [name, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete (globalThis as Record<string, unknown>)[name];
    }
    dom.window.close();
  }
});
