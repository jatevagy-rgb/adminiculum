import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

// Case Workspace — Kontextus V2 behavioral proofs (real React 19 + jsdom).
//
// A mocked fetch implements the Backend PR #393 contract so the real
// component can run the full journey:
//   paste -> save -> detect -> explicit approval -> anonymize -> result.
//
// The Luna UI refinement keeps the same functional semantics: compact source
// index + one selected detail, modal intake, contextual primary actions,
// zero-approval confirmation, raw/anonymized toggle, communication load-error
// distinction.
//
// Fail-closed: jsdom must resolve or the whole file fails. There is no skip.

const require = createRequire(import.meta.url);
const { JSDOM } = require("jsdom") as { JSDOM: new (html?: string, options?: any) => any };

const CASE_ID = "c-1";
const RAW = "Kiss Péter és peter@example.com találkoztak.";
const RAW_TWO = "Második forrás Nagy Anna nevével.";
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
  workspaceError: false,
  /** When true, the anonymize request stays pending until the test settles it. */
  deferAnonymize: false,
};

let pendingAnonymizeRespond: (() => void) | null = null;
let deferredAnonymizeError: { status: number; payload: any } | null = null;

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

  // The shared API client may prepend NEXT_PUBLIC_BACKEND_BASE_URL (CI sets
  // http://localhost:3001). Route on the path only, never on the origin.
  const path = url.replace(/^https?:\/\/[^/]+/i, "");
  const match = path.match(/^\/api\/v1\/cases\/([^/]+)\/(.+)$/);
  if (!match) return Promise.resolve(json(404, { status: 404, code: "NOT_FOUND", message: `unhandled ${url}` }));
  const [, , rest] = match;

  if (rest === "workspace" && method === "GET") {
    if (server.workspaceError) {
      return Promise.resolve(json(500, { status: 500, code: "INTERNAL", message: "workspace unavailable" }));
    }
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
    if (server.deferAnonymize) {
      return new Promise<Response>((resolve) => {
        pendingAnonymizeRespond = () => {
          resolve(
            deferredAnonymizeError
              ? json(deferredAnonymizeError.status, deferredAnonymizeError.payload)
              : json(500, { status: 500, code: "INTERNAL", message: "deferred anonymize" }),
          );
        };
      });
    }
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
const qAll = (selectorPrefix: string) => container.querySelectorAll(`[data-testid^="${selectorPrefix}"]`);

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

async function freshRender(options: { workspaceError?: boolean } = {}) {
  server.sources = [];
  server.seq = 0;
  server.requests = [];
  server.detectError = null;
  server.anonymizeError = null;
  server.createPastedError = null;
  server.createCommError = null;
  server.workspaceError = options.workspaceError ?? false;
  server.deferAnonymize = false;
  pendingAnonymizeRespond = null;
  deferredAnonymizeError = null;
  if (root) root.unmount();
  container.innerHTML = "";
  root = createRoot(container);
  await React.act(async () => {
    root.render(h(CaseContextV2, { caseId: CASE_ID }));
  });
  await flush();
}

const openPasteModal = async () => {
  click("ccv2-source-mode-paste");
  await flush();
};

async function createPasted(rawText: string) {
  await openPasteModal();
  typeText("ccv2-paste-textarea", rawText);
  await flush();
  click("ccv2-create-source");
  await flush();
}

async function createAndDetect() {
  await createPasted(RAW);
  click("ccv2-source-detect-src-1");
  await flush();
}

async function openManualTerms() {
  if (!q("ccv2-manual-terms-body")) {
    click("ccv2-manual-terms-toggle");
    await flush();
  }
}

/** Settle a deferred anonymize request with the given failure response. */
async function settlePendingAnonymize(error: { status: number; payload: any }) {
  deferredAnonymizeError = error;
  await React.act(async () => {
    pendingAnonymizeRespond?.();
    pendingAnonymizeRespond = null;
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
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

test("1. pasted source create works, the new source is selected and its raw text is shown", async () => {
  await freshRender();
  await createPasted(RAW);

  const createRequest = server.requests.find((request) => request.method === "POST" && request.url.endsWith("/context-sources"));
  assert.ok(createRequest, "a create POST was sent");
  assert.deepEqual(createRequest.body, { rawText: RAW }, "create sends only rawText");
  assert.equal(q("ccv2-source-src-1") !== null, true, "the created source is listed");
  assert.equal(q("ccv2-source-detail-src-1") !== null, true, "the created source is selected by its canonical id");
  assert.equal(q("ccv2-source-raw-src-1").textContent, RAW, "raw text is rendered verbatim");
});

test("2. compact source index: only the selected source renders full content", async () => {
  await freshRender();
  await createPasted(RAW);
  await createPasted(RAW_TWO);

  assert.equal(qAll("ccv2-source-src-").length, 2, "both sources appear as compact rows");
  assert.equal(qAll("ccv2-source-detail-").length, 1, "exactly one detail pane is rendered");
  assert.equal(qAll("ccv2-source-raw-").length, 1, "only the selected source renders its full raw text");
  assert.equal(q("ccv2-source-detail-src-2") !== null, true, "the newest source is selected");
  assert.equal(q("ccv2-sources-list").textContent.includes(RAW), false, "the compact list does not embed full raw text");
  assert.equal(q("ccv2-source-raw-src-2").textContent, RAW_TWO, "the selected raw text is shown in the detail");

  click("ccv2-source-src-1");
  await flush();
  assert.equal(q("ccv2-source-detail-src-1") !== null, true, "clicking a row switches the detail");
  assert.equal(q("ccv2-source-raw-src-1").textContent, RAW, "the first source raw text is now shown");
});

test("3. whitespace-only paste is blocked truthfully and never reaches the server", async () => {
  await freshRender();
  await openPasteModal();
  typeText("ccv2-paste-textarea", "   ");
  await flush();

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
  await createPasted(RAW);
  await openManualTerms();
  click("ccv2-manual-term-add");
  await flush();
  typeText("ccv2-manual-term-input-0", "Kiss Péter");
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
  assert.equal(container.querySelectorAll('[role="tab"]').length, 0, "no incomplete tab semantics");
});

test("6. candidate row leads with originalText; detector internals stay hidden", async () => {
  await freshRender();
  await createAndDetect();

  const row = q("ccv2-candidate-cand-1");
  assert.ok(row, "candidate row is rendered");
  assert.match(row.textContent, /Kiss Péter/, "originalText is the primary review identity");
  assert.match(row.textContent, /Személy/, "category is shown as a quiet secondary detail");
  assert.match(row.textContent, /Csere:/, "replacement is clearly labelled");
  assert.match(row.textContent, /\[SZEMÉLY-1\]/, "the proposed replacement is visible");
  assert.match(row.textContent, /…a szerződést|Kiss Péter/, "a bounded local excerpt is shown");
  assert.equal(row.textContent.includes("exact-term"), false, "detector name is not shown in the ordinary row");
});

test("7. deselected candidates are not applied; raw stays unchanged; toggle switches views", async () => {
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

  assert.equal(q("ccv2-source-anonymized-src-1") !== null, true, "anonymized view is the default after apply");
  assert.equal(q("ccv2-source-raw-src-1"), null, "raw view is not rendered while anonymized is selected");
  const anonymized = q("ccv2-source-anonymized-src-1");
  assert.notEqual(anonymized.textContent, RAW, "raw and anonymized are separate texts");
  assert.match(anonymized.textContent, /\[SZEMÉLY-1\]/, "approved candidate was replaced");
  assert.match(anonymized.textContent, /peter@example\.com/, "deselected candidate was NOT applied");

  click("ccv2-source-toggle-raw-src-1");
  await flush();
  assert.equal(q("ccv2-source-raw-src-1") !== null, true, "raw toggle reveals the raw source");
  assert.equal(q("ccv2-source-raw-src-1").textContent, RAW, "the raw source remains unchanged");
  assert.equal(q("ccv2-source-anonymized-src-1"), null, "only one result view renders at a time");

  click("ccv2-source-toggle-anonymized-src-1");
  await flush();
  assert.equal(q("ccv2-source-anonymized-src-1") !== null, true, "toggle returns to the anonymized view");
});

test("8. sourceHash and optionsDigest are preserved exactly as returned by detect", async () => {
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

test("9. stale conflict fails closed: controlled error, review cleared, no silent retry", async () => {
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
  assert.match(staleError.textContent, /Futtasd újra az ellenőrzést/, "the message requires Detect again");
  assert.equal(q("ccv2-review"), null, "the stale review is discarded");
});

test("10. communication source uses the ID-only flow", async () => {
  await freshRender();
  click("ccv2-source-mode-communication");
  await flush();
  selectValue("ccv2-communication-select", "comm-1");
  click("ccv2-create-from-communication");
  await flush();

  const commRequest = server.requests.find((request) => request.method === "POST" && request.url.endsWith("/context-sources/from-communication"));
  assert.ok(commRequest, "the from-communication endpoint was called");
  assert.deepEqual(commRequest.body, { communicationId: "comm-1" }, "only the communicationId is sent — no copied body");
  assert.ok(q("ccv2-source-src-1"), "the imported source is listed");
  assert.ok(q("ccv2-source-detail-src-1"), "the imported source is selected");
  assert.match(q("ccv2-source-detail-src-1").textContent, /Egyeztetés/, "the same-case communication subject is resolved as the title");
});

test("11. editing manual terms after detect invalidates the review until re-detected", async () => {
  await freshRender();
  await createAndDetect();
  await openManualTerms();
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

test("12. no external AI or non-internal endpoint is ever called", () => {
  for (const request of server.requests) {
    const path = request.url.replace(/^https?:\/\/[^/]+/i, "");
    assert.match(path, /^\/api\/v1\/cases\/c-1\/(workspace|context-sources)/, `internal endpoint only: ${request.url}`);
    assert.doesNotMatch(request.url, /^https?:\/\/(?!localhost|127\.0\.0\.1)/i, `no external origin: ${request.url}`);
    assert.doesNotMatch(request.url, /openai|anthropic|claude|gemini/i, `no external AI host: ${request.url}`);
  }
});

test("13. communication with no snapshot-able body shows a truthful error", async () => {
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

test("14. select-all and clear-selection are explicit actions only", async () => {
  await freshRender();
  await createAndDetect();

  assert.equal(q("ccv2-candidate-checkbox-cand-1").checked, false, "detection never auto-selects");
  assert.equal(q("ccv2-candidate-checkbox-cand-2").checked, false, "detection never auto-selects");

  click("ccv2-select-all");
  await flush();
  assert.equal(q("ccv2-candidate-checkbox-cand-1").checked, true, "select-all approves candidate 1");
  assert.equal(q("ccv2-candidate-checkbox-cand-2").checked, true, "select-all approves candidate 2");
  assert.match(q("ccv2-approved-count").textContent, /2 \/ 2/, "select-all updates the count");

  click("ccv2-clear-selection");
  await flush();
  assert.equal(q("ccv2-candidate-checkbox-cand-1").checked, false, "clear-selection unchecks candidate 1");
  assert.equal(q("ccv2-candidate-checkbox-cand-2").checked, false, "clear-selection unchecks candidate 2");
  assert.match(q("ccv2-approved-count").textContent, /0 \/ 2/, "clear-selection updates the count");
});

test("15. zero approval requires confirmation; cancel does not apply; confirm sends []", async () => {
  await freshRender();
  await createAndDetect();

  const before = countPosts("/context-sources/src-1/anonymize");
  click("ccv2-anonymize-apply");
  await flush();

  assert.ok(q("ccv2-zero-approval-body"), "zero approval opens the confirmation");
  assert.match(q("ccv2-zero-approval-body").textContent, /megegyezik a nyers szöveggel/, "the consequence is stated honestly");
  assert.equal(countPosts("/context-sources/src-1/anonymize"), before, "no apply POST before explicit confirmation");

  click("ccv2-zero-approval-cancel");
  await flush();
  assert.equal(q("ccv2-zero-approval-body"), null, "cancel closes the confirmation");
  assert.equal(countPosts("/context-sources/src-1/anonymize"), before, "cancel never applies");
  assert.ok(q("ccv2-review"), "the review stays open after cancel");

  click("ccv2-anonymize-apply");
  await flush();
  click("ccv2-zero-approval-confirm");
  await flush();

  const anonymizeRequest = server.requests.find((request) => request.method === "POST" && request.url.endsWith("/context-sources/src-1/anonymize"));
  assert.ok(anonymizeRequest, "explicit confirmation applies");
  assert.deepEqual(anonymizeRequest.body.approvedCandidateIds, [], "explicit zero approval preserves the [] payload");
  assert.equal(q("ccv2-source-anonymized-src-1").textContent, RAW, "the resulting version equals the raw text");
});

test("16. already-anonymized source exposes no second Apply and keeps the anonymized default", async () => {
  await freshRender();
  await createAndDetect();
  click("ccv2-candidate-checkbox-cand-1");
  await flush();
  click("ccv2-anonymize-apply");
  await flush();

  assert.ok(q("ccv2-source-detail-src-1"), "selection is preserved after the apply refresh");
  assert.equal(q("ccv2-source-detect-src-1"), null, "no Detect action on an anonymized source");
  assert.equal(q("ccv2-anonymize-apply"), null, "no Apply action on an anonymized source");
  assert.equal(q("ccv2-source-anonymized-src-1") !== null, true, "anonymized view is the default");
  assert.ok(q("ccv2-source-toggle-raw-src-1"), "raw source stays accessible through the toggle");
});

test("17. manual terms start collapsed while empty and keep terms accessible", async () => {
  await freshRender();
  await createPasted(RAW);

  assert.equal(q("ccv2-manual-terms-body"), null, "manual terms are collapsed by default while empty");

  await openManualTerms();
  assert.ok(q("ccv2-manual-terms-empty"), "opening an empty editor states there are no terms yet");
  click("ccv2-manual-term-add");
  await flush();
  assert.ok(q("ccv2-manual-terms-body"), "adding a term keeps the editor open");
  typeText("ccv2-manual-term-input-0", "Kiss Péter");
  await flush();

  click("ccv2-manual-terms-toggle");
  await flush();
  assert.equal(q("ccv2-manual-terms-body"), null, "the editor collapses again");
  click("ccv2-manual-terms-toggle");
  await flush();
  assert.equal(q("ccv2-manual-term-input-0").value, "Kiss Péter", "existing terms remain accessible after re-opening");
});

test("18. communication fetch failure shows an error state, not an empty state", async () => {
  await freshRender({ workspaceError: true });
  click("ccv2-source-mode-communication");
  await flush();

  assert.ok(q("ccv2-communications-error"), "the load error is surfaced");
  assert.equal(q("ccv2-communications-empty"), null, "no empty-state lie after a fetch failure");
  assert.match(q("ccv2-communications-error").textContent, /most nem tölthetők be/, "the failure is stated truthfully");
  assert.ok(q("ccv2-communications-retry"), "a retry action is offered");

  server.workspaceError = false;
  click("ccv2-communications-retry");
  await flush();
  assert.equal(q("ccv2-communications-error"), null, "retry clears the error");
  assert.ok(q("ccv2-communication-select"), "retry loads the communication select");
});

test("19. paste textarea and communication select carry explicit labels", async () => {
  await freshRender();
  await openPasteModal();
  assert.ok(container.querySelector('label[for="ccv2-paste-textarea"]'), "paste textarea has an associated label");

  click("ccv2-source-mode-paste");
  await flush();
  assert.equal(container.querySelector('label[for="ccv2-paste-textarea"]'), null, "closed modal removes its controls");
  click("ccv2-source-mode-communication");
  await flush();
  assert.ok(container.querySelector('label[for="ccv2-communication-select"]'), "communication select has an associated label");
});

test("20. zero approved result keeps raw source immutable and lists the applied count honestly", async () => {
  await freshRender();
  await createAndDetect();
  click("ccv2-anonymize-apply");
  await flush();
  click("ccv2-zero-approval-confirm");
  await flush();

  assert.equal(q("ccv2-source-anonymized-src-1").textContent, RAW, "the zero-approval result equals the raw text");
  assert.match(q("ccv2-source-applied-count-src-1").textContent, /0 elem cserélve/, "the applied count is zero and honest");
});

test("21. a detect error is attributed only to its own source", async () => {
  await freshRender();
  await createPasted(RAW);
  await createPasted(RAW_TWO);

  click("ccv2-source-src-1");
  await flush();
  server.detectError = { status: 500, payload: { status: 500, code: "INTERNAL", message: "detect boom" } };
  click("ccv2-source-detect-src-1");
  await flush();
  assert.ok(q("ccv2-detect-error"), "source A shows its own detect error");

  click("ccv2-source-src-2");
  await flush();
  assert.equal(q("ccv2-detect-error"), null, "source B never shows source A's detect error");

  click("ccv2-source-src-1");
  await flush();
  assert.ok(q("ccv2-detect-error"), "returning to source A keeps the truthful attribution");
  assert.match(q("ccv2-detect-error").textContent, /Az ellenőrzés most nem sikerült/, "the error copy belongs to A's failure");
});

test("22. an apply error is attributed only to its own source", async () => {
  await freshRender();
  await createPasted(RAW);
  await createPasted(RAW_TWO);

  click("ccv2-source-src-1");
  await flush();
  click("ccv2-source-detect-src-1");
  await flush();
  click("ccv2-candidate-checkbox-cand-1");
  await flush();
  server.anonymizeError = { status: 500, payload: { status: 500, code: "INTERNAL", message: "apply boom" } };
  click("ccv2-anonymize-apply");
  await flush();
  assert.ok(q("ccv2-stale-error"), "source A shows its own apply error");

  click("ccv2-source-src-2");
  await flush();
  assert.equal(q("ccv2-stale-error"), null, "source B never shows source A's apply error");

  click("ccv2-source-src-1");
  await flush();
  assert.ok(q("ccv2-stale-error"), "returning to source A keeps the truthful attribution");
});

test("23. an async apply failure is attributed to the reviewed source, not the selected one", async () => {
  await freshRender();
  await createPasted(RAW);
  await createPasted(RAW_TWO);

  click("ccv2-source-src-1");
  await flush();
  click("ccv2-source-detect-src-1");
  await flush();
  click("ccv2-candidate-checkbox-cand-1");
  await flush();

  server.deferAnonymize = true;
  click("ccv2-anonymize-apply");
  await flush();

  click("ccv2-source-src-2");
  await flush();
  assert.ok(q("ccv2-source-detail-src-2"), "the user switched to source B while A's apply is in flight");

  await settlePendingAnonymize({ status: 500, payload: { status: 500, code: "INTERNAL", message: "deferred apply boom" } });
  await flush();
  assert.equal(q("ccv2-stale-error"), null, "the late failure for A is never rendered beneath B");

  click("ccv2-source-src-1");
  await flush();
  assert.ok(q("ccv2-stale-error"), "source A shows its own late apply error when selected");
  assert.match(q("ccv2-stale-error").textContent, /Az anonimizálás most nem sikerült/, "the error copy belongs to A's failure");
});
