import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

// Case Workspace — Kontextus V2 behavioral proofs (real React 19 + jsdom).
//
// A mocked fetch implements the Backend PR #393 contract so the real
// component can run the full journey:
//   paste -> save -> detect -> explicit approval -> anonymize -> result.
//
// Fail-closed: jsdom must resolve or the whole file fails. There is no skip.

const require = createRequire(import.meta.url);
const { JSDOM } = require("jsdom") as { JSDOM: new (html?: string, options?: any) => any };

const CASE_ID = "c-1";
const RAW = "Kiss Péter és peter@example.com találkoztak.";
const CANDIDATES = [
  { id: "cand-1", type: "PERSON", start: 0, end: 10, originalText: "Kiss Péter", proposedReplacement: "[SZEMÉLY-1]", detector: "exact-term", confidence: "HIGH", note: "Manuális kifejezés" },
  { id: "cand-2", type: "EMAIL", start: 14, end: 30, originalText: "peter@example.com", proposedReplacement: "[EMAIL-1]", detector: "email", confidence: "HIGH" },
];
const SOURCE_HASH = "hash-abc";
const OPTIONS_DIGEST = "digest-xyz";

let dom: any;
let React: any;
let h: any;
let createRoot: any;
let CaseContextV2: any;

const previous = new Map<string, PropertyDescriptor | undefined>();
const setGlobal = (name: string, value: any) => {
  previous.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
};

const authStore = new Map<string, string>([["adminiculum:auth_token:workforce", "test-token"]]);

type StoredSource = {
  id: string;
  origin: "PASTED" | "COMMUNICATION";
  rawText: string;
  anonymizedText: string | null;
  anonymizationSnapshot: any;
  sourceCommunicationId: string | null;
  createdAt: string;
  updatedAt: string;
};

const server = {
  sources: [] as StoredSource[],
  seq: 0,
  requests: [] as Array<{ url: string; method: string; body?: any }>,
  detectResult: {
    sourceHash: SOURCE_HASH,
    optionsDigest: OPTIONS_DIGEST,
    candidates: CANDIDATES,
  },
  detectError: null as null | { status: number; payload: any },
  anonymizeError: null as null | { status: number; payload: any },
  createPastedError: null as null | { status: number; payload: any },
  createCommError: null as null | { status: number; payload: any },
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const applyApprovals = (rawText: string, approvedIds: string[]) => {
  let out = rawText;
  for (const candidate of CANDIDATES) {
    if (approvedIds.includes(candidate.id)) out = out.split(candidate.originalText).join(candidate.proposedReplacement);
  }
  return out;
};

function handleFetch(input: any, init: any): Promise<Response> {
  const url = String(input);
  const method = (init?.method || "GET").toUpperCase();
  let body: any;
  if (init?.body && typeof init.body === "string") {
    try {
      body = JSON.parse(init.body);
    } catch {
      body = init.body;
    }
  }
  server.requests.push({ url, method, body });

  const match = url.match(/^\/api\/v1\/cases\/([^/]+)\/(.+)$/);
  if (!match) return Promise.resolve(json(404, { status: 404, code: "NOT_FOUND", message: `unhandled ${url}` }));
  const [, , rest] = match;

  if (rest === "workspace" && method === "GET") {
    return Promise.resolve(
      json(200, {
        communications: [
          { id: "comm-1", type: "EMAIL", subject: "Egyeztetés", contentPreview: "Tisztelt Ügyfelünk…", sender: "dr. Példa Anna", timestamp: "2026-09-01T10:00:00Z", internal: false, taskId: null, documentId: null },
        ],
      }),
    );
  }

  if (rest === "context-sources" && method === "GET") {
    return Promise.resolve(json(200, { items: server.sources }));
  }

  if (rest === "context-sources" && method === "POST") {
    if (server.createPastedError) {
      return Promise.resolve(json(server.createPastedError.status, server.createPastedError.payload));
    }
    const created: StoredSource = {
      id: `src-${++server.seq}`,
      origin: "PASTED",
      rawText: String(body?.rawText ?? ""),
      anonymizedText: null,
      anonymizationSnapshot: null,
      sourceCommunicationId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    server.sources.push(created);
    return Promise.resolve(json(201, created));
  }

  if (rest === "context-sources/from-communication" && method === "POST") {
    if (server.createCommError) {
      return Promise.resolve(json(server.createCommError.status, server.createCommError.payload));
    }
    const created: StoredSource = {
      id: `src-${++server.seq}`,
      origin: "COMMUNICATION",
      rawText: "Kommunikáció törzsszövege.",
      anonymizedText: null,
      anonymizationSnapshot: null,
      sourceCommunicationId: String(body?.communicationId ?? ""),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    server.sources.push(created);
    return Promise.resolve(json(201, created));
  }

  const detectMatch = rest.match(/^context-sources\/([^/]+)\/detect$/);
  if (detectMatch && method === "POST") {
    if (server.detectError) return Promise.resolve(json(server.detectError.status, server.detectError.payload));
    return Promise.resolve(json(200, server.detectResult));
  }

  const anonymizeMatch = rest.match(/^context-sources\/([^/]+)\/anonymize$/);
  if (anonymizeMatch && method === "POST") {
    if (server.anonymizeError) {
      return Promise.resolve(json(server.anonymizeError.status, server.anonymizeError.payload));
    }
    if (body?.sourceHash !== SOURCE_HASH || body?.optionsDigest !== OPTIONS_DIGEST) {
      return Promise.resolve(json(409, { status: 409, code: "SOURCE_HASH_MISMATCH", message: "Review is stale." }));
    }
    const source = server.sources.find((item) => item.id === anonymizeMatch[1]);
    const anonymizedText = applyApprovals(source?.rawText ?? "", body?.approvedCandidateIds ?? []);
    if (source) {
      source.anonymizedText = anonymizedText;
      source.anonymizationSnapshot = {
        algorithmRevision: 1,
        sourceHash: SOURCE_HASH,
        resultHash: "result-hash",
        appliedCount: (body?.approvedCandidateIds ?? []).length,
        categoryCounts: { PERSON: 1 },
        warnings: [],
        mappingLocation: "in-memory-only",
      };
    }
    return Promise.resolve(
      json(200, {
        id: anonymizeMatch[1],
        origin: source?.origin ?? "PASTED",
        anonymizedText,
        anonymizationSnapshot: source?.anonymizationSnapshot ?? null,
        updatedAt: new Date().toISOString(),
      }),
    );
  }

  return Promise.resolve(json(404, { status: 404, code: "NOT_FOUND", message: `unhandled ${url}` }));
}

let container: any;
let root: any;

const flush = () =>
  React.act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

const q = (selector: string) => container.querySelector(`[data-testid="${selector}"]`);

const click = (selector: string) => {
  const element = q(selector);
  if (!element) throw new Error(`missing element: ${selector}`);
  React.act(() => {
    element.click();
  });
};

const typeText = (selector: string, value: string) => {
  const element = q(selector);
  if (!element) throw new Error(`missing element: ${selector}`);
  const proto = element instanceof dom.window.HTMLTextAreaElement ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype;
  React.act(() => {
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(element, value);
    element.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
};

const selectValue = (selector: string, value: string) => {
  const element = q(selector);
  if (!element) throw new Error(`missing element: ${selector}`);
  React.act(() => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLSelectElement.prototype, "value")!.set!.call(element, value);
    element.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  });
};

const countPosts = (urlSuffix: string) =>
  server.requests.filter((request) => request.method === "POST" && request.url.endsWith(urlSuffix)).length;

async function freshRender() {
  server.sources = [];
  server.seq = 0;
  server.detectError = null;
  server.anonymizeError = null;
  server.createPastedError = null;
  server.createCommError = null;
  if (root) root.unmount();
  container.innerHTML = "";
  root = createRoot(container);
  await React.act(async () => {
    root.render(h(CaseContextV2, { caseId: CASE_ID }));
  });
  await flush();
}

async function createAndDetect() {
  typeText("ccv2-paste-textarea", RAW);
  click("ccv2-create-source");
  await flush();
  click("ccv2-source-detect-src-1");
  await flush();
}

before(async () => {
  dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { pretendToBeVisual: true });

  setGlobal("window", dom.window);
  setGlobal("document", dom.window.document);
  setGlobal("navigator", dom.window.navigator);
  setGlobal("HTMLElement", dom.window.HTMLElement);
  setGlobal("Element", dom.window.Element);
  setGlobal("Node", dom.window.Node);
  setGlobal("Event", dom.window.Event);
  setGlobal("localStorage", {
    getItem: (key: string) => authStore.get(key) ?? null,
    setItem: (key: string, value: string) => authStore.set(key, String(value)),
    removeItem: (key: string) => authStore.delete(key),
  });
  setGlobal("requestAnimationFrame", (cb: any) => setTimeout(() => cb(Date.now()), 0));
  setGlobal("cancelAnimationFrame", (id: any) => clearTimeout(id));
  setGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  setGlobal("fetch", (input: any, init: any) => handleFetch(input, init));

  React = await import("react");
  ({ createRoot } = await import("react-dom/client"));
  ({ CaseContextV2 } = await import("../src/components/cases/caseContextV2/CaseContextV2"));
  h = React.createElement;

  container = dom.window.document.getElementById("root")!;
});

after(() => {
  for (const [name, descriptor] of previous) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete (globalThis as any)[name];
  }
});

test("2. pasted source create works and the raw source is shown", async () => {
  await freshRender();
  typeText("ccv2-paste-textarea", RAW);
  click("ccv2-create-source");
  await flush();

  const createRequest = server.requests.find((request) => request.method === "POST" && request.url.endsWith("/context-sources"));
  assert.ok(createRequest, "a create POST was sent");
  assert.deepEqual(createRequest.body, { rawText: RAW }, "create sends only rawText");
  assert.equal(q("ccv2-source-src-1") !== null, true, "the created source is listed");
  assert.equal(q("ccv2-source-raw-src-1").textContent, RAW, "raw text is rendered verbatim");
});

test("3. whitespace-only paste is blocked truthfully and never reaches the server", async () => {
  await freshRender();
  typeText("ccv2-paste-textarea", "   ");

  assert.equal(q("ccv2-create-source").disabled, true, "whitespace-only text disables saving");
  const before = countPosts("/context-sources");
  click("ccv2-create-source");
  await flush();
  assert.equal(countPosts("/context-sources"), before, "no create POST for whitespace-only text");

  typeText("ccv2-paste-textarea", "Valós szöveg");
  server.createPastedError = { status: 400, payload: { status: 400, code: "EMPTY_RAW_TEXT", message: "Context source text must be a non-empty string." } };
  click("ccv2-create-source");
  await flush();
  const error = q("ccv2-create-error");
  assert.ok(error, "the server-side whitespace failure is surfaced");
  assert.match(error.textContent, /üres vagy csak szóközökből áll/, "the whitespace failure is stated truthfully");
});

test("4. manual terms stay ephemeral and reach only the detect endpoint", async () => {
  await freshRender();
  click("ccv2-manual-term-add");
  await flush();
  typeText("ccv2-manual-term-input-0", "Kiss Péter");
  typeText("ccv2-paste-textarea", RAW);
  click("ccv2-create-source");
  await flush();

  const createRequest = server.requests.find((request) => request.method === "POST" && request.url.endsWith("/context-sources"));
  assert.ok(createRequest, "create was sent");
  assert.equal("manualTerms" in (createRequest.body ?? {}), false, "create body carries no manual terms");

  click("ccv2-source-detect-src-1");
  await flush();
  const detectRequest = server.requests.find((request) => request.method === "POST" && request.url.endsWith("/context-sources/src-1/detect"));
  assert.ok(detectRequest, "detect was sent");
  assert.deepEqual(detectRequest.body, { manualTerms: [{ term: "Kiss Péter", category: "PERSON" }] }, "detect receives the ephemeral terms");

  const persistedKeys = [...authStore.keys()];
  assert.deepEqual(persistedKeys, ["adminiculum:auth_token:workforce"], "nothing beyond the auth token is stored client-side");
});

test("5. detect renders candidates and approval starts explicitly empty", async () => {
  await freshRender();
  await createAndDetect();

  assert.ok(q("ccv2-review"), "the review panel is rendered");
  assert.ok(q("ccv2-candidate-cand-1"), "candidate 1 is listed");
  assert.ok(q("ccv2-candidate-cand-2"), "candidate 2 is listed");
  assert.equal(q("ccv2-candidate-checkbox-cand-1").checked, false, "candidate 1 starts unapproved");
  assert.equal(q("ccv2-candidate-checkbox-cand-2").checked, false, "candidate 2 starts unapproved");
  assert.match(q("ccv2-approved-count").textContent, /0 \/ 2/, "approval count is 0 of 2");
});

test("6. deselected candidates are not applied; raw stays unchanged", async () => {
  await freshRender();
  await createAndDetect();

  click("ccv2-candidate-checkbox-cand-1");
  await flush();
  assert.equal(q("ccv2-candidate-checkbox-cand-1").checked, true, "candidate 1 is now approved");
  assert.match(q("ccv2-approved-count").textContent, /1 \/ 2/, "approval count is 1 of 2");

  click("ccv2-anonymize-apply");
  await flush();

  const anonymizeRequest = server.requests.find((request) => request.method === "POST" && request.url.endsWith("/context-sources/src-1/anonymize"));
  assert.ok(anonymizeRequest, "anonymize was sent");
  assert.deepEqual(anonymizeRequest.body.approvedCandidateIds, ["cand-1"], "only the approved candidate id is sent");

  const raw = q("ccv2-source-raw-src-1");
  const anonymized = q("ccv2-source-anonymized-src-1");
  assert.ok(raw, "raw source block is present");
  assert.ok(anonymized, "anonymized derivative block is present");
  assert.equal(raw.textContent, RAW, "the raw source remains unchanged");
  assert.notEqual(anonymized.textContent, raw.textContent, "raw and anonymized are separate texts");
  assert.match(anonymized.textContent, /\[SZEMÉLY-1\]/, "approved candidate was replaced");
  assert.match(anonymized.textContent, /peter@example\.com/, "deselected candidate was NOT applied");
});

test("7. sourceHash and optionsDigest are preserved exactly as returned by detect", async () => {
  await freshRender();
  await createAndDetect();
  click("ccv2-candidate-checkbox-cand-1");
  await flush();
  click("ccv2-anonymize-apply");
  await flush();

  const anonymizeRequest = server.requests.find((request) => request.method === "POST" && request.url.endsWith("/context-sources/src-1/anonymize"));
  assert.ok(anonymizeRequest, "anonymize was sent");
  assert.equal(anonymizeRequest.body.sourceHash, SOURCE_HASH, "sourceHash passes through verbatim");
  assert.equal(anonymizeRequest.body.optionsDigest, OPTIONS_DIGEST, "optionsDigest passes through verbatim");
});

test("8. stale conflict fails closed: controlled error, review cleared, no silent retry", async () => {
  await freshRender();
  await createAndDetect();
  click("ccv2-candidate-checkbox-cand-1");
  await flush();

  server.anonymizeError = { status: 409, payload: { status: 409, code: "SOURCE_HASH_MISMATCH", message: "Source hash does not match the current source. Review is stale." } };
  const attemptsBefore = countPosts("/context-sources/src-1/anonymize");
  click("ccv2-anonymize-apply");
  await flush();

  const anonymizeAttempts = countPosts("/context-sources/src-1/anonymize") - attemptsBefore;
  assert.equal(anonymizeAttempts, 1, "exactly one attempt — no silent retry");

  const staleError = q("ccv2-stale-error");
  assert.ok(staleError, "a controlled stale error is shown");
  assert.match(staleError.textContent, /Futtasd újra a Detektálást/, "the message requires Detect again");
  assert.equal(q("ccv2-review"), null, "the stale review is discarded");
});

test("9. communication source uses the ID-only flow", async () => {
  await freshRender();
  click("ccv2-source-mode-communication");
  await flush();
  selectValue("ccv2-communication-select", "comm-1");
  click("ccv2-create-from-communication");
  await flush();

  const commRequest = server.requests.find((request) => request.method === "POST" && request.url.endsWith("/context-sources/from-communication"));
  assert.ok(commRequest, "the from-communication endpoint was called");
  assert.deepEqual(commRequest.body, { communicationId: "comm-1" }, "only the communicationId is sent — no copied body");
  const source = q("ccv2-source-src-1");
  assert.ok(source, "the imported source is listed");
});

test("10. editing manual terms after detect invalidates the review until re-detected", async () => {
  await freshRender();
  await createAndDetect();
  click("ccv2-manual-term-add");
  await flush();
  typeText("ccv2-manual-term-input-0", "Másik Név");
  await flush();

  assert.ok(q("ccv2-review-stale-note"), "the stale note appears after terms change");
  assert.equal(q("ccv2-anonymize-apply").disabled, true, "anonymize is blocked while terms differ");

  click("ccv2-source-detect-src-1");
  await flush();
  assert.equal(q("ccv2-review-stale-note"), null, "re-detecting clears the stale note");
  assert.equal(q("ccv2-anonymize-apply").disabled, false, "anonymize is available again after re-detect");
});

test("11. no external AI or non-internal endpoint is ever called", () => {
  for (const request of server.requests) {
    assert.match(request.url, /^\/api\/v1\/cases\/c-1\/(workspace|context-sources)/, `internal endpoint only: ${request.url}`);
    assert.doesNotMatch(request.url, /openai|anthropic|claude|gemini/i, `no external AI host: ${request.url}`);
  }
});

test("12. communication with no snapshot-able body shows a truthful error", async () => {
  await freshRender();
  click("ccv2-source-mode-communication");
  await flush();
  selectValue("ccv2-communication-select", "comm-1");
  server.createCommError = { status: 400, payload: { status: 400, code: "COMMUNICATION_SOURCE_GAP", message: "Communication has no snapshot-able body." } };
  click("ccv2-create-from-communication");
  await flush();

  const error = q("ccv2-create-error");
  assert.ok(error, "the gap error is shown");
  assert.match(error.textContent, /nincs átvehető törzsszövege/, "the body gap is stated truthfully");
});
