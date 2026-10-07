import { after, afterEach, before, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import * as labels from "../src/lib/growApi";
import * as readStates from "../src/components/clients/growWorkbenchState";

const require = createRequire(import.meta.url);
const { JSDOM } = require("jsdom");
const React = require("react");
let dom: any, root: any, container: HTMLElement, createRoot: any;
let Journey: any, Comparison: any, query = new URLSearchParams();
let api: any, company: any, diagnostics: any, tasks: any;
const globals = new Map<string, PropertyDescriptor | undefined>();
const pending = () => {
  let resolve!: (value: any) => void, reject!: (reason: any) => void;
  const promise = new Promise<any>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

// Execute the production components with real React lifecycles. Only their
// network boundaries and unrelated child surfaces are replaced.
function loadComponent(file: string, imports: Record<string, any>) {
  const source = readFileSync(new URL(`../src/components/clients/${file}.tsx`, import.meta.url), "utf8");
  const result = ts.transpileModule(source, {
    reportDiagnostics: true,
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 },
  });
  assert.equal(result.diagnostics?.length, 0, "production TSX must parse");
  const exports: any = {};
  vm.runInNewContext(result.outputText, {
    exports, console, crypto: globalThis.crypto,
    require: (name: string) => {
      if (name in imports) return imports[name];
      if (name === "react" || name === "react/jsx-runtime") return require(name);
      throw new Error(`Unexpected import: ${name}`);
    },
  });
  return exports;
}

const opportunity = (id: string, accepted = false, sourceBasis?: string) => ({
  id, title: `Opportunity ${id}`, problemStatement: "Distinct problem", direction: "Direction",
  kind: "QUICK_FIX", domainKey: "PROCESS", sufficiency: "SUPPORTED", evidenceStrength: "MODERATE",
  status: accepted ? "ACCEPTED" : "PENDING_REVIEW", impactTags: [], interventionCodes: [], evidence: [],
  diagnosis: { summary: "Diagnosis", sourceRefs: { snapshotIds: ["snapshot-1"], observationIds: [], sourceBasis } },
  opportunity: accepted ? { id: `accepted-${id}`, status: "OPEN" } : null,
});
const home = () => ({
  canRunResearch: true, topOpportunities: [], activeInitiatives: [], completedOutcomes: [],
  opportunityCounts: { total: 0, supported: 0, evidenceBacked: 0, measurementBacked: 0 },
});
function resetApis() {
  api = {
    getHome: async () => home(), listOpportunities: async () => ({ items: [] }),
    listOutcomes: async () => ({ items: [] }), listProcesses: async () => [],
    getOpportunity: async (_client: string, id: string) => opportunity(id),
    listOpportunityPublications: async () => ({ items: [] }),
    listOpportunityPublicationWorkspaces: async () => ({ items: [{ id: "ws", name: "Workspace" }] }),
    reviewOpportunity: async () => ({}), startInitiative: async () => ({}),
    createOpportunityPublicationDraft: async () => ({}), transitionOpportunityPublication: async () => ({}),
  };
  company = { listInitiatives: async () => ({ items: [] }), listMilestones: async () => ({ items: [] }) };
  diagnostics = async () => null;
  tasks = async () => [];
}
before(async () => {
  dom = new JSDOM('<!doctype html><div id="root"></div>', { url: "http://localhost/grow?view=journey" });
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })) {
    globals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value, writable: true, configurable: true });
  }
  ({ createRoot } = await import("react-dom/client"));
  Comparison = loadComponent("GrowOutcomeComparison", { "@/lib/growApi": labels }).GrowOutcomeComparison;
  Journey = loadComponent("GrowJourney", {
    "next/link": { default: ({ children, ...props }: any) => React.createElement("a", props, children) },
    "next/navigation": { useSearchParams: () => query },
    "@/lib/growApi": { ...labels, growApi: new Proxy({}, { get: (_, key) => (...args: any[]) => api[key](...args) }) },
    "@/lib/clientCompanyApi": { clientCompanyApi: new Proxy({}, { get: (_, key) => (...args: any[]) => company[key](...args) }), companyMilestoneStatusLabel: String, initiativeStatusLabel: String },
    "@/lib/taskLifecycleApi": { listTaskLifecycleItems: (...args: any[]) => tasks(...args) },
    "@/lib/diagnosticWorkbenchApi": { getDiagnosticWorkbench: (...args: any[]) => diagnostics(...args), growthUnresolvedItemLabel: String, verificationStatusLabelHu: String },
    "@/components/clients/GrowOutcomeComparison": { GrowOutcomeComparison: Comparison },
    "@/components/clients/growWorkbenchState": readStates,
    "@/components/clients/GrowIntake": { GrowIntake: () => React.createElement("div", { "data-testid": "intake" }) },
    "@/components/clients/GrowProcessMap": { GrowProcessMap: () => null },
  }).GrowJourney;
});
afterEach(async () => {
  if (root) await React.act(async () => root.unmount());
  root = null;
});
after(() => {
  dom.window.close();
  for (const [key, value] of globals) {
    if (value) Object.defineProperty(globalThis, key, value);
    else Reflect.deleteProperty(globalThis, key);
  }
});
async function mount(search: string, props: any = {}) {
  query = new URLSearchParams(`view=journey&${search}`);
  container = document.getElementById("root")!;
  root = createRoot(container);
  await render(props);
}
async function render(props: any = {}) {
  await React.act(async () => root.render(React.createElement(React.StrictMode, null,
    React.createElement(Journey, { clientId: "client-1", clientName: "Client", ...props }))));
}
const text = () => container.textContent ?? "";
const button = (label: string) => [...container.querySelectorAll("button")].find((el) => el.textContent?.includes(label));
async function click(label: string) {
  const el = button(label);
  assert.ok(el, `Missing button: ${label}`);
  await React.act(async () => el.click());
}

test("contextual detail is read-only by default; manager decisions, research and intake require resolved capability", async () => {
  resetApis();
  await mount("destination=detail&opportunity=one");
  assert.match(text(), /Opportunity one/);
  for (const label of ["Elfogadom", "Nem kérem", "További információ kell", "Kezdeményezés indítása"]) assert.equal(button(label), undefined);
  await render({ canManage: true });
  for (const label of ["Elfogadom", "Nem kérem", "További információ kell"]) assert.ok(button(label));
  await click("1. Áttekintés");
  assert.ok(button("Új mérési és kutatási futás"));
  assert.ok(container.querySelector('[data-testid="intake"]'));
  await render();
  assert.equal(button("Új mérési és kutatási futás"), undefined);
  assert.equal(container.querySelector('[data-testid="intake"]'), null);
});

test("LAWYER-style publish capability preserves publication but cannot start an initiative", async () => {
  resetApis();
  api.getOpportunity = async () => opportunity("one", true);
  api.listOpportunityPublications = async () => ({ items: [{ id: "pub", workspaceId: "ws", status: "READY_FOR_APPROVAL", revision: 1 }] });
  await mount("destination=detail&opportunity=one", { canPublish: true, canPreparePublication: true });
  assert.ok(button("Jóváhagyom"));
  assert.ok(button("Közzététel előkészítése"));
  assert.equal(button("Kezdeményezés indítása"), undefined);
  await render({ canManage: true, canPublish: true });
  assert.ok(button("Kezdeményezés indítása"));
  await render();
  assert.equal(button("Jóváhagyom"), undefined);
  assert.equal(button("Közzététel előkészítése"), undefined);
});

test("authorized readers can prepare and submit drafts, but never publish or manage; unknown defaults allow no writes", async () => {
  resetApis();
  api.getOpportunity = async () => opportunity("one", true);
  let draftStatus = "DRAFT", prepares = 0;
  const transitions: string[] = [];
  api.listOpportunityPublications = async () => ({ items: [
    { id: "draft", workspaceId: "ws", status: draftStatus, revision: 1 },
    { id: "ready", workspaceId: "ws-ready", status: "READY_FOR_APPROVAL", revision: 1 },
    { id: "approved", workspaceId: "ws-approved", status: "APPROVED", revision: 1 },
    { id: "published", workspaceId: "ws-published", status: "PUBLISHED", revision: 1 },
  ] });
  api.createOpportunityPublicationDraft = async (client: string, input: any) => {
    assert.equal(client, "client-1");
    assert.equal(input.opportunityId, "accepted-one");
    assert.equal(input.workspaceId, "ws");
    assert.equal(input.title, "Reader draft");
    assert.equal(input.summary, "Safe summary");
    prepares++;
  };
  api.transitionOpportunityPublication = async (client: string, id: string, action: string) => {
    assert.equal(client, "client-1");
    assert.equal(id, "draft");
    transitions.push(action);
    draftStatus = "READY_FOR_APPROVAL";
  };
  const publisherControls = ["Jóváhagyom", "Közzéteszem az ügyfélnek", "Visszavonom a közzétételt"];
  const preparationControls = ["Közzététel előkészítése", "Jóváhagyásra küldöm"];
  await mount("destination=detail&opportunity=one");
  for (const label of [...publisherControls, ...preparationControls, "Kezdeményezés indítása"]) assert.equal(button(label), undefined);
  assert.equal(prepares, 0);
  assert.deepEqual(transitions, []);

  await render({ canPreparePublication: true });
  for (const label of preparationControls) assert.ok(button(label));
  for (const label of [...publisherControls, "Kezdeményezés indítása", "Elfogadom"]) assert.equal(button(label), undefined);
  await React.act(async () => {
    const select = container.querySelector("select")!;
    select.value = "ws";
    select.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  });
  for (const [selector, value] of [["input", "Reader draft"], ["textarea", "Safe summary"]]) {
    await React.act(async () => {
      const input = container.querySelector(selector)!;
      const prototype = selector === "input" ? dom.window.HTMLInputElement.prototype : dom.window.HTMLTextAreaElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(input, value);
      input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    });
  }
  assert.equal(button("Közzététel előkészítése")!.disabled, false);
  await click("Közzététel előkészítése");
  assert.equal(prepares, 1);
  assert.deepEqual(transitions, [], "preparing a draft must not submit or publish it");
  await click("Jóváhagyásra küldöm");
  assert.deepEqual(transitions, ["submit"]);
  for (const label of publisherControls) assert.equal(button(label), undefined);
  assert.equal(button("Jóváhagyásra küldöm"), undefined);

  await render({ canPublish: true });
  for (const label of publisherControls) assert.ok(button(label));
  assert.equal(button("Közzététel előkészítése"), undefined, "publisher capability must not imply resolved preparation capability");
  await render();
  for (const label of [...publisherControls, ...preparationControls]) assert.equal(button(label), undefined);
  assert.equal(prepares, 1);
  assert.deepEqual(transitions, ["submit"]);
});

test("optional read failures are not empty data and successful independent panels stay usable", async () => {
  resetApis();
  api.listOpportunities = async () => ({ items: [opportunity("accepted", true)] });
  company.listInitiatives = async () => ({ items: [{ id: "initiative", title: "Live initiative", status: "ACTIVE" }] });
  company.listMilestones = async () => { throw { status: 403 }; };
  tasks = async () => { throw { status: 503 }; };
  await mount("destination=progress");
  assert.match(text(), /Opportunity accepted/);
  assert.match(text(), /Live initiative/);
  assert.match(text(), /Nincs jogosultság/);
  assert.match(text(), /jelenleg nem érhetők el/);
  assert.doesNotMatch(text(), /még nincsenek mérföldkövek|0 nyitott kapcsolódó feladat/);
  company.listMilestones = async () => ({ items: [] });
  tasks = async () => [];
  await click("Adatok újratöltése");
  assert.match(text(), /még nincsenek mérföldkövek/);
  assert.doesNotMatch(text(), /Nincs jogosultság/);
  await click("5. Eredmények");
  assert.match(text(), /Még nincs rögzített eredmény/);
});

test("late detail responses cannot replace a newer opportunity and failures are retryable", async () => {
  resetApis();
  const old = pending();
  api.getOpportunity = async (_client: string, id: string) => id === "old" ? old.promise : opportunity(id);
  await mount("destination=detail&opportunity=old");
  query = new URLSearchParams("view=journey&destination=detail&opportunity=new");
  await render();
  assert.match(text(), /Opportunity new/);
  await React.act(async () => old.resolve(opportunity("old")));
  assert.match(text(), /Opportunity new/);
  assert.doesNotMatch(text(), /Opportunity old/);
  api.getOpportunity = async () => { throw { status: 403 }; };
  query = new URLSearchParams("view=journey&destination=detail&opportunity=denied");
  await render();
  assert.match(text(), /Nincs jogosultság/);
  assert.doesNotMatch(text(), /Betöltés…|Opportunity new/);
  api.getOpportunity = async () => opportunity("recovered");
  await click("Újrapróbálás");
  assert.match(text(), /Opportunity recovered/);
});

test("human decisions reuse the existing endpoint and re-read detail without auto-starting initiatives or publication", async () => {
  resetApis();
  const decisions: string[] = [];
  let accepted = false, starts = 0, publications = 0;
  api.getOpportunity = async () => opportunity("one", accepted);
  api.reviewOpportunity = async (client: string, id: string, decision: string) => {
    assert.equal(client, "client-1");
    assert.equal(id, "one");
    decisions.push(decision);
    if (decision === "ACCEPT") accepted = true;
  };
  api.startInitiative = async () => { starts++; };
  api.createOpportunityPublicationDraft = async () => { publications++; };
  await mount("destination=detail&opportunity=one", { canManage: true });
  await click("További információ kell");
  assert.deepEqual(decisions, ["REQUEST_MORE_INFO"]);
  await click("Elfogadom");
  assert.deepEqual(decisions, ["REQUEST_MORE_INFO", "ACCEPT"]);
  assert.equal(button("Elfogadom"), undefined);
  assert.ok(button("Kezdeményezés indítása"));
  assert.equal(starts, 0);
  assert.equal(publications, 0);
});

test("failed opportunity and outcome lists never advertise empty queues or zero result counts", async () => {
  resetApis();
  api.listOpportunities = async () => { throw { status: 503 }; };
  api.listOutcomes = async () => { throw { status: 401 }; };
  await mount("destination=feed");
  assert.match(text(), /jelenleg nem érhetők el/);
  assert.doesNotMatch(text(), /Még nincs lehetőség|Még nincs eredmény|Még nincs lehetőség-javaslat/);
  await click("5. Eredmények");
  assert.match(text(), /Nincs jogosultság/);
  assert.doesNotMatch(text(), /Még nincs rögzített eredmény/);
});

test("a client switch discards outstanding summary and detail responses", async () => {
  resetApis();
  const old = pending();
  api.getHome = async (id: string) => id === "client-1" ? old.promise : home();
  api.getOpportunity = async (client: string) => client === "client-1" ? old.promise : opportunity("new-client");
  await mount("destination=detail&opportunity=one");
  await render({ clientId: "client-2" });
  assert.match(text(), /Opportunity new-client/);
  await React.act(async () => old.resolve(opportunity("old-client")));
  assert.match(text(), /Opportunity new-client/);
  assert.doesNotMatch(text(), /Opportunity old-client/);
});

test("failed publication workspace lookup does not imply no workspace or hide readable publications", async () => {
  resetApis();
  api.getOpportunity = async () => opportunity("one", true);
  api.listOpportunityPublications = async () => ({ items: [{ id: "pub", workspaceId: "ws", status: "DRAFT", revision: 1 }] });
  api.listOpportunityPublicationWorkspaces = async () => { throw { status: 503 }; };
  await mount("destination=detail&opportunity=one", { canPreparePublication: true });
  assert.match(text(), /jelenleg nem érhetők el/);
  assert.ok(button("Jóváhagyásra küldöm"));
  assert.equal(button("Közzététel előkészítése"), undefined);
  assert.doesNotMatch(text(), /Nincs aktív szervezeti munkaterület|még nincs közzététel/);
  api.listOpportunityPublicationWorkspaces = async () => ({ items: [] });
  await click("Közzétételi adatok újratöltése");
  assert.match(text(), /Nincs aktív szervezeti munkaterület/);
});

test("late publication reads cannot cross opportunity selection", async () => {
  resetApis();
  const old = pending();
  api.getOpportunity = async (_client: string, id: string) => opportunity(id, true);
  api.listOpportunityPublications = async (_client: string, id: string) => id === "accepted-old" ? old.promise : ({ items: [] });
  await mount("destination=detail&opportunity=old", { canPublish: true });
  query = new URLSearchParams("view=journey&destination=detail&opportunity=new");
  await render({ canPublish: true });
  assert.match(text(), /Opportunity new/);
  await React.act(async () => old.resolve({ items: [{ id: "old-pub", workspaceId: "ws", status: "PUBLISHED", revision: 1, snapshot: { clientSafeTitle: "OLD PUBLICATION" } }] }));
  assert.doesNotMatch(text(), /OLD PUBLICATION/);
  assert.match(text(), /még nincs közzététel/);
});

test("snapshot presence alone never claims measured evidence; explicit basis drives the display", async () => {
  resetApis();
  await mount("destination=detail&opportunity=unknown");
  const summary = () => container.querySelector('[data-testid="evidence-basis-summary"]')!.textContent!;
  assert.match(summary(), /1 folyamatpillanatkép/);
  assert.match(summary(), new RegExp(labels.sourceBasisLabelHu(null)));
  assert.doesNotMatch(summary(), /Mért ügyfél|folyamat-mérési pillanatkép/);
  api.getOpportunity = async () => opportunity("estimated", false, "ESTIMATED");
  query = new URLSearchParams("view=journey&destination=detail&opportunity=estimated");
  await render();
  assert.match(summary(), new RegExp(labels.sourceBasisLabelHu("ESTIMATED")));
});

test("shared display retains signed improvement, deterioration, zero, missing baseline and server ROI explanation", async () => {
  container = document.getElementById("root")!;
  root = createRoot(container);
  const outcome = {
    metricsSummary: { before: { TOTAL_ACTIVE_MINUTES: 10, TOTAL_WAITING_MINUTES: 20, TOTAL_CYCLE_MINUTES: 30 }, after: { TOTAL_ACTIVE_MINUTES: 15, TOTAL_WAITING_MINUTES: 10, TOTAL_CYCLE_MINUTES: 30 }, comparable: false },
    roi: { basis: "ESTIMATED", timeSavedMinutesPerMonth: { low: 0, base: 0, high: 0 }, cashSavedHufPerMonth: null, provenance: { formulaVersion: "existing-engine", computedAt: "2026-10-07T00:00:00Z", explanationHu: "Server explanation unchanged" } },
  };
  await React.act(async () => root.render(React.createElement(Comparison, { outcome })));
  assert.match(text(), /\+5 p/);
  assert.match(text(), /−10 p/);
  assert.match(text(), /0 p/);
  assert.match(text(), /mérőszám-verziója eltér/);
  assert.match(text(), /Becsült hatás|0–0–0 perc/);
  assert.match(text(), /nem becsülhető/);
  assert.match(text(), /nem egyenlő pénzmegtakarítással/);
  await click("Hogyan számoltuk?");
  assert.match(text(), /Server explanation unchanged/);
  assert.match(text(), /existing-engine/);
  await React.act(async () => root.render(React.createElement(Comparison, { outcome: { metricsSummary: null } })));
  assert.match(text(), /Nincs mérési adat/);
  assert.equal(container.querySelector("table"), null);
});
