/**
 * CP3 F8 continuation — D1/D2/D3 journey truth (behavioral).
 *
 * Exercises the REAL PortalComplianceV3 and PortalGrowV3 components against a
 * controlled fetch router (the canonical fetchApi adapter is exercised too),
 * not source text:
 *  - compliance request links resolve the published MATTER identity, never the
 *    internal Case id, with a truthful fallback when unavailable;
 *  - "Lezárt / elkészült" (complete) stays distinct from "Jelenleg nincs
 *    ügyfélteendő" (no current customer action);
 *  - published compliance documents carry their topic attribution;
 *  - the F8 Grow single page renders the five numbered blocks in canonical
 *    order and the legacy tab mapping stays deterministic.
 */
import { test, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { JSDOM } = require("jsdom");
let dom: any, React: any, createRoot: any;
let root: any, container: any;
const globals = new Map<string, PropertyDescriptor | undefined>();
const realFetch = globalThis.fetch;
let routes = new Map<string, any>();
const expose = (key: string, value: any) => {
  globals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
};
const jsonResponse = (body: any, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => JSON.stringify(body),
  headers: { get: (name: string) => (String(name).toLowerCase() === "content-type" ? "application/json" : null) },
});
const route = (method: string, pathname: string, body: any) => routes.set(`${method} ${pathname}`, body);

before(async () => {
  dom = new JSDOM('<!doctype html><div id="root"></div>', { url: "http://localhost/portal" });
  for (const key of ["window", "document", "navigator", "HTMLElement", "Event", "MouseEvent", "HTMLInputElement", "HTMLTextAreaElement", "HTMLSelectElement", "localStorage", "self"]) expose(key, key === "window" || key === "self" ? dom.window : dom.window[key]);
  expose("IS_REACT_ACT_ENVIRONMENT", true);
  React = await import("react");
  expose("React", React);
  ({ createRoot } = await import("react-dom/client"));
  dom.window.localStorage.setItem("adminiculum:auth_token:customer", "synthetic-f8-token");
  globalThis.fetch = ((url: string, init?: any) => {
    const pathname = String(url).replace(/^https?:\/\/[^/]+/, "").split("?")[0].replace(/^\/api\/v1/, "");
    const key = `${init?.method || "GET"} ${pathname}`;
    if (routes.has(key)) return Promise.resolve(jsonResponse(routes.get(key)));
    return Promise.resolve(jsonResponse({ status: 404, code: "NOT_FOUND", message: "Synthetic endpoint not configured" }, 404));
  }) as typeof fetch;
});

afterEach(async () => {
  routes = new Map();
  if (root) await React.act(async () => root.unmount());
  root = null;
});

after(() => {
  globalThis.fetch = realFetch;
  dom.window.close();
  for (const [key, value] of globals) {
    if (value) Object.defineProperty(globalThis, key, value);
    else Reflect.deleteProperty(globalThis, key);
  }
});

async function mount(Component: any, props: any = {}) {
  container = document.getElementById("root");
  root = createRoot(container);
  await React.act(async () => root.render(React.createElement(React.StrictMode, null, React.createElement(Component, props))));
  for (let round = 0; round < 4; round += 1) {
    await React.act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}
const text = () => container.textContent as string;
const links = () => [...container.querySelectorAll("a")].map((a: any) => a.getAttribute("href"));

const topic = (overrides: any = {}) => ({
  topicId: "topic-munkavedelem",
  topicLabel: "Munkavédelem",
  state: "RESOLVED",
  shortExplanation: "Munkavédelmi megfelelés.",
  missingInformation: [],
  nextAction: null,
  documents: [],
  ...overrides,
});

const requestFixture = (overrides: any = {}) => ({
  id: "req-1",
  caseId: "internal-case-id-7",
  matterPublicationId: "mp-77",
  type: "DOCUMENT_UPLOAD",
  title: "Oktatási nyilvántartás",
  instructions: null,
  dueAt: null,
  required: true,
  status: "PUBLISHED",
  documentSpec: null,
  publishedAt: null,
  fields: [],
  contextLabel: "Munkavédelem",
  category: "DOCUMENT",
  state: "AWAITING_CUSTOMER",
  canRespond: true,
  canUpload: true,
  ...overrides,
});

const complianceRequests = (items: any[]) => ({
  items,
  counts: {
    awaitingCustomer: items.filter((item) => item.state === "AWAITING_CUSTOMER").length,
    officeProcessing: items.filter((item) => item.state === "OFFICE_PROCESSING").length,
    closed: items.filter((item) => item.state === "CLOSED").length,
    requestedDocuments: items.filter((item) => item.category === "DOCUMENT").length,
    openQuestions: items.filter((item) => item.category === "QUESTION" && item.state !== "CLOSED").length,
  },
  generatedAt: new Date().toISOString(),
});

async function mountCompliance() {
  route("GET", "/client-portal/org/company-profile", { questions: [], screens: [] });
  const { PortalComplianceV3 } = await import("../src/components/client-portal-v3/compliance/PortalComplianceV3");
  await mount(PortalComplianceV3);
}

test("D1 compliance request link uses the published matter identity, never the internal caseId", async () => {
  route("GET", "/client-portal/compliance", { topics: [topic()], controlsSummary: [] });
  route("GET", "/client-portal/compliance/requests", complianceRequests([
    requestFixture({ matterPublicationId: "mp-published-1", caseId: "internal-case-1" }),
  ]));
  await mountCompliance();
  const hrefs = links();
  assert.ok(hrefs.includes("/portal/matters/mp-published-1/requests/req-1"), `canonical matter href missing in ${JSON.stringify(hrefs)}`);
  assert.ok(!hrefs.includes("/portal/matters/internal-case-1/requests/req-1"), "internal caseId must never become the route identity");
});

test("D1 compliance request without a published matter falls back to the matter list, never a dead internal-id route", async () => {
  route("GET", "/client-portal/compliance", { topics: [topic()], controlsSummary: [] });
  route("GET", "/client-portal/compliance/requests", complianceRequests([
    requestFixture({ matterPublicationId: null, caseId: "internal-case-2" }),
  ]));
  await mountCompliance();
  const hrefs = links();
  assert.ok(hrefs.includes("/portal/ugyek"), `fallback href missing in ${JSON.stringify(hrefs)}`);
  assert.ok(!hrefs.some((href: string) => href.includes("internal-case-2")), "no internal-id route may be generated");
});

test("D3 complete (Lezárt) stays distinct from no-current-action (Jelenleg nincs ügyfélteendő)", async () => {
  route("GET", "/client-portal/compliance", {
    topics: [topic({ topicId: "t-resolved", state: "RESOLVED" }), topic({ topicId: "t-review", state: "LAWYER_REVIEW_REQUIRED" })],
    controlsSummary: [],
  });
  route("GET", "/client-portal/compliance/requests", complianceRequests([
    requestFixture({ id: "closed-1", state: "CLOSED", status: "COMPLETED", category: "QUESTION", type: "QUESTION_RESPONSE", canUpload: false }),
  ]));
  await mountCompliance();
  const body = text();
  assert.match(body, /Lezárt \/ elkészült/);
  assert.match(body, /Jelenleg nincs ügyfélteendő/);
  const spans = [...container.querySelectorAll("span")];
  const closedLabel = spans.find((el: any) => el.textContent === "Lezárt / elkészült");
  const noActionLabel = spans.find((el: any) => el.textContent === "Jelenleg nincs ügyfélteendő");
  assert.ok(closedLabel, "Lezárt label missing");
  assert.ok(noActionLabel, "no-action label missing");
  const count = (label: any) => label.parentElement?.querySelector("span")?.textContent;
  assert.equal(count(closedLabel), "1");
  assert.equal(count(noActionLabel), "1");
});

test("D3 published compliance documents carry their topic attribution", async () => {
  route("GET", "/client-portal/compliance", {
    topics: [
      topic({
        topicId: "t-a",
        topicLabel: "Adatvédelem",
        documents: [{ publicationId: "doc-1", title: "Adatkezelési tájékoztató", versionLabel: "2. változat", publishedAt: "2026-09-01T10:00:00Z", downloadAvailable: true }],
      }),
    ],
    controlsSummary: [],
  });
  route("GET", "/client-portal/compliance/requests", complianceRequests([]));
  await mountCompliance();
  const documentsButton = [...container.querySelectorAll("button")].find((el: any) => el.textContent.trim() === "Dokumentumok");
  assert.ok(documentsButton, "Dokumentumok section button missing");
  await React.act(async () => {
    documentsButton.click();
  });
  const body = text();
  assert.match(body, /Adatkezelési tájékoztató/);
  assert.match(body, /Adatvédelem/);
  assert.match(body, /2\. változat/);
});

test("D2 Grow single page renders the five numbered blocks in canonical order", async () => {
  route("GET", "/client-portal/org/grow", {
    processes: [],
    initiatives: [],
    opportunities: [],
    outcomes: { measured: [], calculatedOrEstimated: [] },
    surveys: [],
  });
  route("GET", "/client-portal/org/grow-assessments", { packs: [], aggregatedFindings: [] });
  route("GET", "/client-portal/org/grow-survey", { items: [] });
  const { PortalGrowV3 } = await import("../src/components/client-portal-v3/grow/PortalGrowV3");
  await mount(PortalGrowV3);
  const ids = [
    "grow-section-teendok",
    "grow-section-fejlesztesi-iranyok",
    "grow-section-kezdemenyezesek",
    "grow-section-mukodes",
    "grow-section-eredmenyek",
  ];
  const order = [...container.querySelectorAll("[data-testid]")]
    .map((el: any) => el.getAttribute("data-testid"))
    .filter((id: string) => ids.includes(id));
  assert.deepEqual(order, ids, `section order mismatch: ${JSON.stringify(order)}`);
  const body = text();
  assert.match(body, /1 · Most Önre vár/);
  assert.match(body, /2 · Amin érdemes dolgozni/);
  assert.match(body, /3 · Folyamatban/);
  assert.match(body, /4 · Az Ön működése/);
  assert.match(body, /5 · Eredmények/);
  assert.doesNotMatch(body, /pontszám|százalék|érettségi/i);
});

test("D2 legacy Grow tab values keep deterministic section mapping", async () => {
  const { resolveGrowTabV3 } = await import("../src/components/client-portal-v3/grow/PortalGrowV3");
  assert.equal(resolveGrowTabV3("felmeresek"), "teendok");
  assert.equal(resolveGrowTabV3("folyamatok"), "mukodes");
  assert.equal(resolveGrowTabV3("lehetosegek"), "fejlesztesi-iranyok");
  assert.equal(resolveGrowTabV3("kezdemenyezesek"), "kezdemenyezesek");
  assert.equal(resolveGrowTabV3("eredmenyek"), "eredmenyek");
  assert.equal(resolveGrowTabV3("ismeretlen-tab"), null);
  assert.equal(resolveGrowTabV3(null), null);
});
