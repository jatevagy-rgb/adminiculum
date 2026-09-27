/**
 * Contract date candidates — frontend API contract.
 *
 * The REAL shipped client (`api.contractDateCandidatesApi`) must issue exactly the
 * documented internal workforce requests: list by documentId, extract for one
 * exact documentVersionId, confirm with targetContractId (+ obligationId only
 * for occurrence types), and reject. A local HTTP server implements the
 * documented endpoint contract; the real client performs real network calls.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

let server: http.Server;
let api: typeof import("../src/lib/contractDateCandidatesApi");
const captured: Array<{ url?: string; method?: string; body: unknown }> = [];

const CANDIDATE = {
  id: "candidate-1",
  documentId: "doc-1",
  documentVersionId: "ver-1",
  dateType: "PAYMENT_DUE",
  proposedDate: "2024-06-30T12:00:00.000Z",
  sourceExcerpt: "fizetési határidő: 2024. június 30.",
  excerptStartOffset: 10,
  excerptEndOffset: 60,
  excerptHash: "cafebabe",
  provenance: "RULE_BASED_EXTRACTION",
  aiPromptDraftId: null,
  status: "PENDING",
  targetContractId: null,
  targetOccurrenceId: null,
  decisionReason: null,
  decidedById: null,
  decidedAt: null,
  createdById: "manager-1",
  createdAt: "2026-09-27T10:00:00.000Z",
  updatedAt: "2026-09-27T10:00:00.000Z",
};

function json(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

before(async () => {
  server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => { raw += chunk; });
    req.on("end", () => {
      const body = raw ? JSON.parse(raw) : null;
      captured.push({ url: req.url, method: req.method, body });
      const url = req.url || "";

      const listMatch = /^\/api\/v1\/contract-date-candidates\?documentId=([^&]+)$/.exec(url);
      if (listMatch && req.method === "GET") {
        json(res, 200, { items: [CANDIDATE] });
        return;
      }
      const extractMatch = /^\/api\/v1\/contract-date-candidates\/extract$/.exec(url);
      if (extractMatch && req.method === "POST") {
        json(res, 200, { items: [CANDIDATE], detectedCount: 1, createdCount: 1, skippedExisting: 0 });
        return;
      }
      const confirmMatch = /^\/api\/v1\/contract-date-candidates\/([^/]+)\/confirm$/.exec(url);
      if (confirmMatch && req.method === "POST") {
        json(res, 200, { candidate: { ...CANDIDATE, id: confirmMatch[1], status: "CONFIRMED" }, canonical: { id: "contract-1" } });
        return;
      }
      const rejectMatch = /^\/api\/v1\/contract-date-candidates\/([^/]+)\/reject$/.exec(url);
      if (rejectMatch && req.method === "POST") {
        json(res, 200, { ...CANDIDATE, id: rejectMatch[1], status: "REJECTED" });
        return;
      }
      json(res, 404, { status: 404, code: "NOT_FOUND", message: "Not found" });
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server address unavailable");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  process.env.NEXT_PUBLIC_BACKEND_BASE_URL = baseUrl;

  const store = new Map<string, string>([["adminiculum:auth_token:workforce", "test-token"]]);
  (globalThis as any).window = {
    location: { pathname: "/cases/case-1/documents" },
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  (globalThis as any).localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
    removeItem: () => {},
    clear: () => {},
  };
  api = await import("../src/lib/contractDateCandidatesApi");
});

after(() => {
  delete process.env.NEXT_PUBLIC_BACKEND_BASE_URL;
  delete (globalThis as any).window;
  delete (globalThis as any).localStorage;
  return new Promise<void>((resolve) => server.close(() => resolve()));
});

test("list requests the exact documentId query on the internal endpoint", async () => {
  captured.length = 0;
  const result = await api.contractDateCandidatesApi.list("doc-1");
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].status, "PENDING");
  const request = captured[0];
  assert.equal(request.method, "GET");
  assert.match(request.url || "", /\/contract-date-candidates\?documentId=doc-1$/);
});

test("extract posts exactly the selected documentVersionId", async () => {
  captured.length = 0;
  const result = await api.contractDateCandidatesApi.extract("ver-1");
  assert.equal(result.createdCount, 1);
  assert.deepEqual(captured[0].body, { documentVersionId: "ver-1" });
});

test("confirm for a contract-level type sends targetContractId and null obligationId", async () => {
  captured.length = 0;
  await api.contractDateCandidatesApi.confirm("candidate-1", { targetContractId: "contract-1", obligationId: null });
  assert.deepEqual(captured[0].body, { targetContractId: "contract-1", obligationId: null });
});

test("confirm for an occurrence-level type sends the obligationId", async () => {
  captured.length = 0;
  await api.contractDateCandidatesApi.confirm("candidate-1", { targetContractId: "contract-1", obligationId: "obligation-1" });
  assert.deepEqual(captured[0].body, { targetContractId: "contract-1", obligationId: "obligation-1" });
});

test("reject posts to the reject action", async () => {
  captured.length = 0;
  const result = await api.contractDateCandidatesApi.reject("candidate-1", "Nem releváns.");
  assert.equal(result.status, "REJECTED");
  assert.match(captured[0].url || "", /\/candidate-1\/reject$/);
  assert.deepEqual(captured[0].body, { reason: "Nem releváns." });
});
