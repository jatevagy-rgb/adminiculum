import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { ApiError, clearAuthToken, fetchApi, getAuthToken, setAuthToken } from "../src/lib/api";

const root = process.cwd();
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");

type Listener = (event: { type: string }) => void;

type FakeWindow = {
  location: { pathname: string };
  addEventListener: (type: string, listener: Listener) => void;
  removeEventListener: (type: string, listener: Listener) => void;
  dispatchEvent: (event: { type: string }) => boolean;
  setTimeout: typeof setTimeout;
  clearTimeout: typeof clearTimeout;
  setInterval: typeof setInterval;
  clearInterval: typeof clearInterval;
};

type FetchCall = { url: string; init: RequestInit };

const globalStore = globalThis as unknown as Record<string, unknown>;
const calls: FetchCall[] = [];

let uninstallBrowserEnv: (() => void) | null = null;
let restoreFetch: (() => void) | null = null;

function installBrowserEnv(): () => void {
  const listeners = new Map<string, Set<Listener>>();
  const values = new Map<string, string>();
  const localStorageStub = {
    getItem: (key: string) => (values.has(key) ? values.get(key)! : null),
    setItem: (key: string, value: string) => { values.set(key, String(value)); },
    removeItem: (key: string) => { values.delete(key); },
    clear: () => { values.clear(); },
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    get length() { return values.size; },
  };
  const fakeWindow: FakeWindow = {
    location: { pathname: "/clients/client-1/workgroups" },
    addEventListener: (type, listener) => {
      const bucket = listeners.get(type) ?? new Set<Listener>();
      bucket.add(listener);
      listeners.set(type, bucket);
    },
    removeEventListener: (type, listener) => { listeners.get(type)?.delete(listener); },
    dispatchEvent: (event) => {
      listeners.get(event.type)?.forEach((listener) => listener(event));
      return true;
    },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
  };
  globalStore.window = fakeWindow;
  globalStore.localStorage = localStorageStub;
  return () => {
    delete globalStore.window;
    delete globalStore.localStorage;
  };
}

function installFetchStub(): void {
  const original = globalThis.fetch;
  const stub = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    calls.push({ url: String(input), init: init ?? {} });
    const response = {
      ok: true,
      status: 200,
      headers: { get: (name: string) => (name.toLowerCase() === "content-type" ? "application/json" : null) },
      text: async () => JSON.stringify({ ok: true }),
    };
    return response as unknown as Response;
  };
  globalStore.fetch = stub;
  restoreFetch = () => { globalStore.fetch = original; };
}

afterEach(() => {
  restoreFetch?.();
  restoreFetch = null;
  uninstallBrowserEnv?.();
  uninstallBrowserEnv = null;
  calls.length = 0;
});

describe("client workgroups browser-auth lifecycle", () => {
  it("cannot authenticate during server render (window is undefined)", async () => {
    assert.equal(typeof (globalThis as { window?: unknown }).window, "undefined");
    assert.equal(getAuthToken("workforce"), null);
    await assert.rejects(
      () => fetchApi("/clients/client-1/workgroups"),
      (error: unknown) => error instanceof ApiError && error.status === 401,
    );
  });

  it("attaches the workforce bearer token from browser storage", async () => {
    uninstallBrowserEnv = installBrowserEnv();
    installFetchStub();
    setAuthToken("browser-token");
    assert.equal(getAuthToken(), "browser-token");

    const result = await fetchApi<{ ok: boolean }>("/clients/client-1/workgroups");
    assert.deepEqual(result, { ok: true });

    const last = calls[calls.length - 1];
    assert.ok(last.url.endsWith("/api/v1/clients/client-1/workgroups"), `unexpected url ${last.url}`);
    const headers = last.init.headers as Record<string, string>;
    assert.equal(headers.Authorization, "Bearer browser-token");
  });

  it("waits for the workforce shell token that arrives after mount", async () => {
    uninstallBrowserEnv = installBrowserEnv();
    installFetchStub();
    clearAuthToken();

    const pending = fetchApi<{ ok: boolean }>("/clients/client-1/workload-summary?period=2026-09");
    setTimeout(() => setAuthToken("late-token"), 120);

    const result = await pending;
    assert.deepEqual(result, { ok: true });
    const headers = calls[calls.length - 1].init.headers as Record<string, string>;
    assert.equal(headers.Authorization, "Bearer late-token");
  });
});

describe("workgroups page uses the canonical browser-auth loading pattern", () => {
  const page = () => read("src/app/clients/[clientId]/workgroups/page.tsx");
  const content = () => read("src/app/clients/[clientId]/workgroups/WorkgroupsPageContent.tsx");

  it("loads the client, workgroups and summary on the client side", () => {
    const src = page();
    assert.match(src, /["']use client["']/);
    assert.match(src, /useParams\(\)/);
    assert.match(src, /useEffect\(/);
    assert.match(src, /getClient\(clientId\)/);
    assert.match(src, /getClientWorkgroups\(clientId\)/);
    assert.match(src, /getClientWorkloadSummary\(clientId, currentPeriod\)/);
    assert.doesNotMatch(src, /params:\s*Promise</);
  });

  it("keeps the single shared auth mechanism without ad hoc token plumbing", () => {
    const src = page();
    assert.doesNotMatch(src, /localStorage|sessionStorage|document\.cookie/);
    assert.doesNotMatch(src, /auth_token|Authorization|Bearer /);
    assert.doesNotMatch(src, /[?&]token=/);
  });

  it("separates loading, not-found and API failure states", () => {
    const src = page();
    assert.match(src, /'loading'/);
    assert.match(src, /'not-found'/);
    assert.match(src, /'error'/);
    assert.match(src, /error instanceof ApiError && error\.status === 404/);
    assert.match(src, /Ügyfél betöltése/);
    assert.match(src, /nem érhetők el/);
    assert.equal((src.match(/nem található/g) || []).length, 1);
  });

  it("removes the false client-not-found state from the content surface", () => {
    const src = content();
    assert.match(src, /client: Client;/);
    assert.doesNotMatch(src, /client:\s*Client\s*\|\s*null/);
    assert.doesNotMatch(src, /Ügyfél nem található/);
  });

  it("preserves workgroup CRUD, workload recording and the new-case action", () => {
    const src = content();
    for (const api of [
      "getClientWorkgroups(",
      "getWorkgroupWorkload(",
      "createWorkgroup(",
      "updateWorkgroup(",
      "deleteWorkgroup(",
      "recordWorkload(",
      "getClientWorkloadSummary(",
    ]) {
      assert.ok(src.includes(api), `expected WorkgroupsPageContent to keep ${api}`);
    }
    assert.match(src, /CompactNewCaseDialog/);
    assert.match(src, /type="month"/);
  });
});
