import { test, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

// Real components + controlled API promises: exercise recovery, not source text.
const require = createRequire(import.meta.url);
const { JSDOM } = require("jsdom");
let dom: any, React: any, createRoot: any, Card: any, Thread: any, api: any;
let root: any, container: any;
const globals = new Map<string, PropertyDescriptor | undefined>();
const originals: Record<string, any> = {};
const expose = (key: string, value: any) => {
  globals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
};
const deferred = () => {
  let resolve!: (value: any) => void, reject!: (error: Error) => void;
  const promise = new Promise<any>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
before(async () => {
  dom = new JSDOM('<!doctype html><div id="root"></div>', { url: "http://localhost/portal" });
  for (const key of ["window", "document", "navigator", "HTMLElement", "Event", "MouseEvent"]) expose(key, key === "window" ? dom.window : dom.window[key]);
  expose("IS_REACT_ACT_ENVIRONMENT", true);
  React = await import("react");
  expose("React", React);
  ({ createRoot } = await import("react-dom/client"));
  ({ PortalInteractionCardV3: Card } = await import("../src/components/client-portal-v3/interaction/PortalInteractionCardV3"));
  ({ PortalQuestionThreadV3: Thread } = await import("../src/components/client-portal-v3/interaction/PortalQuestionThreadV3"));
  ({ customerInteractionApi: api } = await import("../src/lib/clientInteractionApi"));
  for (const key of ["listRequests", "listSubmissions", "listQuestions", "createQuestion", "getThread"]) originals[key] = api[key];
});
afterEach(async () => {
  if (root) await React.act(async () => root.unmount());
  root = null;
  Object.assign(api, originals);
});
after(() => {
  dom.window.close();
  for (const [key, value] of globals) {
    if (value) Object.defineProperty(globalThis, key, value);
    else Reflect.deleteProperty(globalThis, key);
  }
});
async function mount(Component: any, props: any) {
  container = document.getElementById("root");
  root = createRoot(container);
  await React.act(async () => root.render(React.createElement(React.StrictMode, null, React.createElement(Component, props))));
}
const text = () => container.textContent as string;
const button = (label: string) => [...container.querySelectorAll("button")].find((el: any) => el.textContent.includes(label)) as HTMLButtonElement;
const click = async (el: HTMLElement) => React.act(async () => el.click());
async function fill(selector: string, value: string) {
  const input = container.querySelector(selector);
  const prototype = input.tagName === "TEXTAREA" ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype;
  await React.act(async () => {
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
}
const thread = { id: "thread-1", subject: "Szerződés kérdése", status: "OPEN" };

test("loading is not empty; failed question list can recover without unrelated APIs", async () => {
  const pending = deferred();
  api.listQuestions = () => pending.promise;
  api.listRequests = api.listSubmissions = () => { throw new Error("wrong scope"); };
  await mount(Card, { caseId: "case-1", scope: "questions" });
  assert.match(text(), /Betöltés/);
  assert.doesNotMatch(text(), /Még nincs kérdésszál/);
  await React.act(async () => pending.reject(new Error("offline")));
  assert.match(text(), /Az interakciók jelenleg nem érhetők el/);
  assert.doesNotMatch(text(), /Még nincs kérdésszál/);
  api.listQuestions = async () => ({ items: [] });
  await click(button("Újratöltés"));
  assert.match(text(), /Még nincs kérdésszál/);
  assert.doesNotMatch(text(), /nem érhetők el/);
});

test("confirmed POST + failed GET retains success; retry performs no duplicate POST", async () => {
  let writes = 0;
  api.listQuestions = async () => ({ items: [] });
  api.createQuestion = async (caseId: string, payload: any) => {
    writes++;
    assert.equal(caseId, "case-1");
    assert.deepEqual(payload, { subject: "Kérdés", bodySafe: "Részletek" });
    api.listQuestions = async () => { throw new Error("refresh failed"); };
    return thread;
  };
  await mount(Card, { caseId: "case-1", scope: "questions" });
  for (const label of container.querySelectorAll("label")) assert.ok(document.getElementById(label.htmlFor), "labels resolve to controls");
  await fill("input", "Kérdés");
  await fill("textarea", "Részletek");
  await click(button("Kérdés beküldése"));
  assert.equal(writes, 1);
  assert.match(text(), /A kérdés beküldve/);
  assert.match(text(), /A lista újratöltése nem ismétli meg a beküldést/);
  assert.equal(container.querySelector("input").value, "");
  api.listQuestions = async () => ({ items: [thread] });
  await click(button("Újratöltés"));
  assert.equal(writes, 1);
  assert.match(text(), /Szerződés kérdése/);
  assert.doesNotMatch(text(), /nem érhetők el/);
});

test("failed POST preserves draft; pending POST locks controls and blocks duplicate clicks", async () => {
  api.listQuestions = async () => ({ items: [] });
  const pending = deferred();
  let writes = 0;
  api.createQuestion = () => { writes++; return pending.promise; };
  await mount(Card, { caseId: "case-1", scope: "questions" });
  await fill("input", "Megőrzött tárgy");
  await fill("textarea", "Megőrzött szöveg");
  await click(button("Kérdés beküldése"));
  assert.equal(container.querySelector("input").disabled, true);
  await click(button("Beküldés…"));
  assert.equal(writes, 1);
  await React.act(async () => pending.reject(new Error("offline")));
  assert.equal(container.querySelector("input").value, "Megőrzött tárgy");
  assert.equal(container.querySelector("textarea").value, "Megőrzött szöveg");
  assert.doesNotMatch(text(), /A kérdés beküldve/);
  assert.equal(button("Kérdés beküldése").disabled, false);
});

test("read-only question panel preserves reading and omits the composer", async () => {
  api.listQuestions = async () => ({ items: [thread] });
  await mount(Card, { caseId: "case-1", scope: "questions", allowAsk: false });
  assert.equal(container.querySelector("input"), null);
  assert.match(text(), /Szerződés kérdése/);
});

test("question permission failure does not hide requests in all scope", async () => {
  api.listQuestions = async () => { throw new Error("denied"); };
  api.listRequests = async () => ({ items: [] });
  api.listSubmissions = async () => ({ items: [] });
  await mount(Card, { caseId: "case-1", scope: "all" });
  assert.match(text(), /Nincs aktív dokumentum- vagy adatbekérés/);
  assert.match(text(), /Az interakciók jelenleg nem érhetők el/);
});

test("requests scope never calls question endpoint", async () => {
  api.listQuestions = () => { throw new Error("must not request messages"); };
  api.listRequests = async () => ({ items: [] });
  api.listSubmissions = async () => ({ items: [] });
  await mount(Card, { caseId: "case-1", scope: "requests" });
  assert.match(text(), /Nincs aktív dokumentum- vagy adatbekérés/);
  assert.doesNotMatch(text(), /nem érhetők el/);
});

test("list retry preserves mounted response composer and selected upload", async () => {
  const request = { id: "r1", type: "DOCUMENT_UPLOAD", title: "Irat bekérése", status: "PUBLISHED", fields: [], dueAt: null, instructions: null };
  api.listRequests = async () => ({ items: [request] });
  api.listSubmissions = async () => ({ items: [] });
  api.listQuestions = async () => { throw new Error("offline"); };
  await mount(Card, { caseId: "case-1", scope: "all" });
  const input = container.querySelector('input[type="file"]');
  Object.defineProperty(input, "files", { value: [new dom.window.File(["pdf"], "megőrzött.pdf", { type: "application/pdf" })] });
  await React.act(async () => input.dispatchEvent(new dom.window.Event("change", { bubbles: true })));
  assert.match(text(), /megőrzött.pdf/);
  const pending = deferred();
  api.listQuestions = () => pending.promise;
  await click(button("Újratöltés"));
  assert.equal(container.querySelector('input[type="file"]'), input);
  await React.act(async () => pending.resolve({ items: [] }));
  assert.equal(container.querySelector('input[type="file"]'), input);
  assert.match(text(), /megőrzött.pdf/);
});

test("thread error clears after retry; reopen refreshes actual messages", async () => {
  let reads = 0;
  api.getThread = async (caseId: string, threadId: string) => {
    assert.equal(caseId, "case-1"); assert.equal(threadId, thread.id);
    if (++reads === 1) throw new Error("offline");
    return { ...thread, messages: [{ id: "m1", authorType: "INTERNAL", body: `Válasz ${reads}\nMásodik sor`, sentAt: "2026-09-30T10:00:00Z" }] };
  };
  await mount(Thread, { caseId: "case-1", thread });
  await click(button(thread.subject));
  assert.match(text(), /Az adatok betöltése sikertelen/);
  await click(button("Újratöltés"));
  assert.match(text(), /Ügyvédi iroda/);
  assert.match(text(), /Válasz 2/);
  assert.doesNotMatch(text(), /sikertelen/);
  const trigger = button(thread.subject);
  const panel = document.getElementById(trigger.getAttribute("aria-controls")!)!;
  assert.equal(panel.getAttribute("aria-labelledby"), trigger.id);
  await click(trigger); assert.equal(panel.hidden, true);
  await click(trigger); assert.match(text(), /Válasz 3/);
});

test("late thread response cannot contaminate another case or thread", async () => {
  const pending = deferred();
  api.getThread = () => pending.promise;
  await mount(Thread, { caseId: "case-1", thread });
  await click(button(thread.subject));
  await React.act(async () => root.render(React.createElement(React.StrictMode, null, React.createElement(Thread, { caseId: "case-2", thread: { ...thread, id: "thread-2", subject: "Másik ügy" } }))));
  await React.act(async () => pending.resolve({ ...thread, messages: [{ id: "old", authorType: "INTERNAL", body: "Régi ügy válasza", sentAt: "2026-09-30T10:00:00Z" }] }));
  assert.match(text(), /Másik ügy/);
  assert.doesNotMatch(text(), /Régi ügy válasza/);
});

test("case change discards old draft and ignores the previous case's delayed list", async () => {
  const pending = deferred();
  api.listQuestions = (caseId: string) => caseId === "case-1" ? pending.promise : Promise.resolve({ items: [] });
  await mount(Card, { caseId: "case-1", scope: "questions" });
  await fill("input", "Előző ügy tárgya");
  await React.act(async () => root.render(React.createElement(React.StrictMode, null, React.createElement(Card, { caseId: "case-2", scope: "questions" }))));
  await React.act(async () => pending.resolve({ items: [thread] }));
  assert.equal(container.querySelector("input").value, "");
  assert.match(text(), /Még nincs kérdésszál/);
  assert.doesNotMatch(text(), /Szerződés kérdése/);
});
