import { test, before, after, afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

/**
 * UX-03 targeted repair: /portal/vallalat must present a truthful, recoverable
 * restricted-access state for the known organization summary-scope denial
 * (403 CLIENT_SUMMARY_SCOPE_FORBIDDEN) and must NOT collapse authentication,
 * not-found, service-unavailable or unexpected failures into that state.
 *
 * The real component and the real API client run against a controlled fetch so
 * the response `code` survives the fetch layer. The security predicate stays in
 * the backend and is never weakened here.
 */

const require = createRequire(import.meta.url);
const { JSDOM } = require("jsdom");
let dom: any;
let React: any;
let createRoot: any;
let PortalCompanyV3: any;
let classifyCompanyFailure: any;
let ApiError: any;
let root: any;
let container: any;
let route: (pathname: string) => { status: number; body: unknown };
const originalFetch = globalThis.fetch;

const globals = new Map<string, PropertyDescriptor | undefined>();
const expose = (key: string, value: any) => {
  globals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
};

before(async () => {
  dom = new JSDOM('<!doctype html><div id="root"></div>', { url: "http://localhost/portal/vallalat" });
  for (const key of ["window", "document", "navigator", "HTMLElement", "Event", "MouseEvent", "localStorage", "self"]) {
    expose(key, key === "window" || key === "self" ? dom.window : dom.window[key]);
  }
  expose("IS_REACT_ACT_ENVIRONMENT", true);
  expose("fetch", async (input: any) => {
    const raw = typeof input === "string" ? input : input.url;
    const url = new URL(raw, "http://localhost");
    const pathname = url.pathname.replace(/^\/api\/v1/, "");
    const { status, body } = route(pathname);
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: { get: (name: string) => (name.toLowerCase() === "content-type" ? "application/json" : null) },
      json: async () => body,
      text: async () => JSON.stringify(body),
    };
  });
  dom.window.localStorage.setItem("adminiculum:auth_token:customer", "qa-customer-token");
  React = await import("react");
  expose("React", React);
  ({ createRoot } = await import("react-dom/client"));
  ({ ApiError } = await import("../src/lib/api"));
  ({ PortalCompanyV3, classifyCompanyFailure } = await import(
    "../src/components/client-portal-v3/company/PortalCompanyV3"
  ));
});

afterEach(async () => {
  if (root) await React.act(async () => root.unmount());
  root = null;
});

beforeEach(() => {
  route = (pathname) => {
    if (pathname === "/client-portal/org/company") return { status: 200, body: emptyCompany };
    if (pathname === "/client-portal/org/contracts") return { status: 200, body: { items: [] } };
    if (pathname === "/client-portal/org/company-profile") {
      return { status: 200, body: { client: { name: "Demo Kft." }, capabilities: { teaor25CatalogInstalled: false }, screens: [], questions: [] } };
    }
    if (pathname === "/client-portal/org/company-profile/evidence") {
      return { status: 200, body: { items: [], reusableDocuments: [] } };
    }
    return { status: 200, body: {} };
  };
});

after(() => {
  expose("fetch", originalFetch);
  dom.window.close();
  for (const [key, value] of globals) {
    if (value) Object.defineProperty(globalThis, key, value);
    else Reflect.deleteProperty(globalThis, key);
  }
});

async function mount() {
  container = document.getElementById("root");
  root = createRoot(container);
  await React.act(async () => root.render(React.createElement(PortalCompanyV3)));
}

const text = () => container.textContent as string;
const deny = (status: number, code?: string) => {
  route = (pathname) => {
    if (pathname === "/client-portal/org/company") {
      return { status, body: { status, code, message: "An organization summary scope is required." } };
    }
    return { status: 200, body: { items: [] } };
  };
};

const emptyCompany = {
  companyName: "Demo Kft.",
  profileHeadline: "Országos logisztikai vállalkozás.",
  employeeCount: 42,
  groups: [],
  visibleMattersByArea: [],
  totalVisibleMatterCount: 0,
  milestones: [],
  initiatives: [],
  systems: [],
  processes: [],
  dataSummary: { relevantQuestionCount: 0, answeredCount: 0, unknownCount: 0, unansweredCount: 0, needsCompletion: false },
  documentsSummary: { visibleDocumentCount: 0, latestPublishedAt: null },
  complianceSummary: { topicCount: 0, moreInformationNeededCount: 0, lawyerReviewRequiredCount: 0, actionInProgressCount: 0, resolvedCount: 0 },
  developmentSummary: { initiativeCount: 0, activeInitiativeCount: 0 },
  outcomeSummary: { measuredCount: 0, calculatedCount: 0, estimatedCount: 0 },
};

test("authorized organization scope still renders the company overview", async () => {
  await mount();
  assert.match(text(), /Demo Kft\./);
  assert.match(text(), /Munkavállalók száma: 42/);
  assert.doesNotMatch(text(), /nem érhető el/);
});

test("CLIENT_SUMMARY_SCOPE_FORBIDDEN renders the restricted state with a safe return and no data", async () => {
  deny(403, "CLIENT_SUMMARY_SCOPE_FORBIDDEN");
  await mount();
  assert.match(text(), /A vállalati áttekintés a jelenlegi hozzáférésével nem érhető el\./);
  assert.ok(container.querySelector('[data-testid="portal-company-restricted"] a[href="/portal"]'), "safe return to /portal is rendered");
  assert.doesNotMatch(text(), /Demo Kft\./);
  assert.doesNotMatch(text(), /CLIENT_SUMMARY_SCOPE_FORBIDDEN|membership|permission/i);
});

test("401, 404 and 503 keep distinct semantics and never show the restricted state", async () => {
  deny(401);
  await mount();
  assert.match(text(), /munkamenet nem érvényes/i);
  assert.doesNotMatch(text(), /jelenlegi hozzáférésével/);
  await React.act(async () => root.unmount());
  root = null;

  deny(404);
  await mount();
  assert.match(text(), /nem található/);
  assert.doesNotMatch(text(), /jelenlegi hozzáférésével/);
  await React.act(async () => root.unmount());
  root = null;

  deny(503);
  await mount();
  assert.match(text(), /átmenetileg nem érhető el/);
  assert.doesNotMatch(text(), /jelenlegi hozzáférésével/);
});

test("unexpected failure keeps error/retry semantics", async () => {
  route = (pathname) => {
    if (pathname === "/client-portal/org/company") return { status: 500, body: { status: 500, code: "CLIENT_PORTAL_INTERNAL_ERROR", message: "failed" } };
    return { status: 200, body: { items: [] } };
  };
  await mount();
  assert.match(text(), /Az adatok betöltése sikertelen\./);
  assert.match(text(), /Újratöltés/);
  assert.doesNotMatch(text(), /jelenlegi hozzáférésével/);
});

test("a 403 without the canonical code is never misreported as restricted access", async () => {
  deny(403);
  await mount();
  assert.doesNotMatch(text(), /jelenlegi hozzáférésével/);
  assert.match(text(), /Az adatok betöltése sikertelen\./);
});

test("classifyCompanyFailure maps exactly by status and code", () => {
  assert.equal(classifyCompanyFailure(new ApiError(403, "x", "/e", "CLIENT_SUMMARY_SCOPE_FORBIDDEN")), "RESTRICTED");
  assert.equal(classifyCompanyFailure(new ApiError(403, "x", "/e")), "ERROR");
  assert.equal(classifyCompanyFailure(new ApiError(401, "x", "/e")), "UNAUTHENTICATED");
  assert.equal(classifyCompanyFailure(new ApiError(404, "x", "/e")), "NOT_FOUND");
  assert.equal(classifyCompanyFailure(new ApiError(503, "x", "/e")), "UNAVAILABLE");
  assert.equal(classifyCompanyFailure(new ApiError(500, "x", "/e")), "ERROR");
  assert.equal(classifyCompanyFailure(new Error("boom")), "ERROR");
});
