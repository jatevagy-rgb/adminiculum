import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

// Targeted repair regression coverage for PR #372:
//
// 1. Version-ledger request race — `refreshSelectedDocumentVersions` must commit
//    only the latest in-flight request (A→B, B resolves, A resolves late ⇒ B only).
// 2. Generated-document notes race — `loadDocumentNotes` must commit only the
//    latest in-flight request.
// 3. Raw task UUIDs must not be visible product copy in Document Workspace
//    surfaces; a canonical `/tasks?taskId=…` deep link is used instead.
//
// The behavioural tests do NOT re-implement the loaders: they extract the real
// callback bodies from page.tsx and execute them with injected dependencies and
// controlled promises, so the assertions bind to the actual shipped code.

const read = (file: string) => readFileSync(path.resolve(process.cwd(), file), "utf8");
const page = () => read("src/app/cases/[caseId]/documents/page.tsx");
const canonicalChanges = () => read("src/components/documents/comparison/CanonicalChangesWorkspace.tsx");
const reviewPanel = () => read("src/components/documents/review/DocumentReviewWorkflowPanel.tsx");
const rail = () => read("src/components/documents/comparison/rail.tsx");

// --- source extraction ------------------------------------------------------

// Extracts the body of `useCallback(async (…) => { … })` starting at `signature`
// (which ends with the opening `{`) using brace matching.
function extractArrowBody(source: string, signature: string): string {
  const at = source.indexOf(signature);
  assert.ok(at >= 0, `signature not found in source: ${signature}`);
  const open = at + signature.length; // character immediately after the opening `{`
  let depth = 1;
  for (let i = open; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(open, i);
    }
  }
  throw new Error(`unbalanced braces for signature: ${signature}`);
}

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
};
function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
const flush = () => new Promise<void>((r) => setTimeout(r, 0));

// --- real version loader, extracted from page.tsx ---------------------------

function makeVersionLoader() {
  const versionsRequestRef = { current: 0 };
  const state = {
    versions: [] as Array<{ id: string; isCurrent: boolean }>,
    loadedFor: null as string | null,
    selected: null as string | null,
    loading: false,
    error: null as string | null,
  };
  const body = extractArrowBody(
    page(),
    "const refreshSelectedDocumentVersions = useCallback(async (documentId: string) => {",
  );
  const make = new Function(
    "getDocumentVersions",
    "versionsRequestRef",
    "setIsLoadingVersions",
    "setVersions",
    "setVersionsLoadedForDocumentId",
    "setSelectedVersionId",
    `return (async (documentId) => {${body}});`,
  ) as (g: unknown, r: unknown, a: unknown, b: unknown, c: unknown, d: unknown) => (id: string) => Promise<void>;

  const fetchers = new Map<string, () => Promise<{ versions: Array<{ id: string; isCurrent: boolean }> }>>();
  const loader = make(
    (id: string) => {
      const f = fetchers.get(id);
      if (!f) throw new Error(`no fetcher for ${id}`);
      return f();
    },
    versionsRequestRef,
    (v: boolean) => {
      state.loading = v;
    },
    (v: Array<{ id: string; isCurrent: boolean }>) => {
      state.versions = v;
    },
    (v: string | null) => {
      state.loadedFor = v;
    },
    (updater: unknown) => {
      state.selected =
        typeof updater === "function"
          ? (updater as (existing: string | null) => string | null)(state.selected)
          : (updater as string | null);
    },
  );
  return { state, versionsRequestRef, load: loader, fetchers };
}

test("VERSION_RACE: A starts, B starts, B resolves, A resolves late — only B versions and B identity remain", async () => {
  const loader = makeVersionLoader();
  const a = deferred<{ versions: Array<{ id: string; isCurrent: boolean }> }>();
  const b = deferred<{ versions: Array<{ id: string; isCurrent: boolean }> }>();
  loader.fetchers.set("A", () => a.promise);
  loader.fetchers.set("B", () => b.promise);

  const pendingA = loader.load("A");
  const pendingB = loader.load("B");

  b.resolve({ versions: [{ id: "b1", isCurrent: true }, { id: "b2", isCurrent: false }] });
  await pendingB;
  await flush();

  a.resolve({ versions: [{ id: "a1", isCurrent: true }] });
  await pendingA;
  await flush();

  assert.equal(loader.state.loadedFor, "B", "the committed identity must be B");
  assert.deepEqual(
    loader.state.versions.map((v) => v.id),
    ["b1", "b2"],
    "only B versions may be committed",
  );
  assert.equal(loader.state.selected, "b1", "B's current version is selected");
  assert.equal(loader.state.loading, false, "loading completes for the latest request");
});

test("VERSION_LATE_FAILURE: a late failed A request cannot clear successful B state", async () => {
  const loader = makeVersionLoader();
  const a = deferred<{ versions: Array<{ id: string; isCurrent: boolean }> }>();
  const b = deferred<{ versions: Array<{ id: string; isCurrent: boolean }> }>();
  loader.fetchers.set("A", () => a.promise);
  loader.fetchers.set("B", () => b.promise);

  const pendingA = loader.load("A");
  const pendingB = loader.load("B");

  b.resolve({ versions: [{ id: "b1", isCurrent: true }] });
  await pendingB;
  await flush();

  a.reject(new Error("A failed late"));
  await pendingA;
  await flush();

  assert.equal(loader.state.loadedFor, "B", "B identity survives A's late failure");
  assert.deepEqual(loader.state.versions.map((v) => v.id), ["b1"], "B versions survive A's late failure");
  assert.equal(loader.state.selected, "b1", "B selection survives A's late failure");
  assert.equal(loader.state.loading, false, "loading reflects the latest request only");
});

test("VERSION_INVALIDATE_ON_LEAVE: bumping the request ref discards an in-flight version response", async () => {
  const loader = makeVersionLoader();
  const a = deferred<{ versions: Array<{ id: string; isCurrent: boolean }> }>();
  loader.fetchers.set("A", () => a.promise);

  const pendingA = loader.load("A");
  // Selection changed to a document with no version surface: the effect invalidates.
  loader.versionsRequestRef.current += 1;

  a.resolve({ versions: [{ id: "a1", isCurrent: true }] });
  await pendingA;
  await flush();

  assert.equal(loader.state.loadedFor, null, "an invalidated late response must not commit identity");
  assert.deepEqual(loader.state.versions, [], "an invalidated late response must not commit versions");
});

// --- real notes loader, extracted from page.tsx -----------------------------

function makeNotesLoader() {
  const notesRequestRef = { current: 0 };
  const state = {
    notes: [] as Array<{ id: string }>,
    loading: false,
    error: null as string | null,
  };
  const body = extractArrowBody(
    page(),
    "const loadDocumentNotes = useCallback(async (docId: string) => {",
  );
  const make = new Function(
    "getCommunications",
    "notesRequestRef",
    "setIsLoadingNotes",
    "setNoteError",
    "setDocumentNotes",
    `return (async (docId) => {${body}});`,
  ) as (g: unknown, r: unknown, a: unknown, b: unknown, c: unknown) => (id: string) => Promise<void>;

  const fetchers = new Map<string, () => Promise<{ communications: Array<{ id: string }> }>>();
  const loader = make(
    (opts: { documentId: string }) => {
      const f = fetchers.get(opts.documentId);
      if (!f) throw new Error(`no fetcher for ${opts.documentId}`);
      return f();
    },
    notesRequestRef,
    (v: boolean) => {
      state.loading = v;
    },
    (v: string | null) => {
      state.error = v;
    },
    (v: Array<{ id: string }>) => {
      state.notes = v;
    },
  );
  return { state, notesRequestRef, load: loader, fetchers };
}

test("NOTES_RACE: A starts, B starts, B resolves, A resolves late — only B notes remain", async () => {
  const loader = makeNotesLoader();
  const a = deferred<{ communications: Array<{ id: string }> }>();
  const b = deferred<{ communications: Array<{ id: string }> }>();
  loader.fetchers.set("A", () => a.promise);
  loader.fetchers.set("B", () => b.promise);

  const pendingA = loader.load("A");
  const pendingB = loader.load("B");

  b.resolve({ communications: [{ id: "b-note" }] });
  await pendingB;
  await flush();

  a.resolve({ communications: [{ id: "a-note" }] });
  await pendingA;
  await flush();

  assert.deepEqual(loader.state.notes.map((n) => n.id), ["b-note"], "only B notes may be committed");
  assert.equal(loader.state.loading, false, "loading completes for the latest request");
});

test("NOTES_LATE_FAILURE: a late failed A request must not clear B notes or show A's error", async () => {
  const loader = makeNotesLoader();
  const a = deferred<{ communications: Array<{ id: string }> }>();
  const b = deferred<{ communications: Array<{ id: string }> }>();
  loader.fetchers.set("A", () => a.promise);
  loader.fetchers.set("B", () => b.promise);

  const pendingA = loader.load("A");
  const pendingB = loader.load("B");

  b.resolve({ communications: [{ id: "b-note" }] });
  await pendingB;
  await flush();

  a.reject(new Error("A failed late"));
  await pendingA;
  await flush();

  assert.deepEqual(loader.state.notes.map((n) => n.id), ["b-note"], "B notes survive A's late failure");
  assert.equal(loader.state.error, null, "A's late failure must not surface an error");
  assert.equal(loader.state.loading, false, "loading reflects the latest request only");
});

test("NOTES_INVALIDATE_ON_LEAVE: leaving notes mode discards an in-flight notes response", async () => {
  const loader = makeNotesLoader();
  const a = deferred<{ communications: Array<{ id: string }> }>();
  loader.fetchers.set("A", () => a.promise);

  const pendingA = loader.load("A");
  // Selection left generated-document notes mode: the effect invalidates.
  loader.notesRequestRef.current += 1;

  a.resolve({ communications: [{ id: "a-note" }] });
  await pendingA;
  await flush();

  assert.deepEqual(loader.state.notes, [], "an invalidated late response must not repopulate notes");
});

// --- static binding: the real page wires the guards -------------------------

test("page.tsx wires a request-generation guard onto version loading", () => {
  const src = page();
  const fn = extractArrowBody(
    src,
    "const refreshSelectedDocumentVersions = useCallback(async (documentId: string) => {",
  );
  assert.match(fn, /const requestId = versionsRequestRef\.current \+ 1;/);
  assert.match(fn, /versionsRequestRef\.current = requestId;/);
  assert.match(fn, /if \(versionsRequestRef\.current !== requestId\) return;/);
  assert.match(fn, /if \(versionsRequestRef\.current === requestId\) \{\s*setIsLoadingVersions\(false\);/);
});

test("page.tsx invalidates in-flight version requests when the selection has no version surface", () => {
  const src = page();
  assert.match(src, /versionsRequestRef\.current \+= 1;\s*setIsLoadingVersions\(false\);/);
});

test("page.tsx wires a request-generation guard onto generated-document notes", () => {
  const src = page();
  const fn = extractArrowBody(
    src,
    "const loadDocumentNotes = useCallback(async (docId: string) => {",
  );
  assert.match(fn, /const requestId = notesRequestRef\.current \+ 1;/);
  assert.match(fn, /notesRequestRef\.current = requestId;/);
  assert.match(fn, /if \(notesRequestRef\.current !== requestId\) return;/);
  assert.match(fn, /if \(notesRequestRef\.current === requestId\) \{\s*setIsLoadingNotes\(false\);/);
});

test("page.tsx invalidates in-flight notes requests when leaving generated-document notes mode", () => {
  const src = page();
  assert.match(src, /notesRequestRef\.current \+= 1;[\s\S]{0,160}setDocumentNotes\(\[\]\);/);
});

// --- Defect 3: no raw task UUID as product copy -----------------------------

test("canonical changes surface exposes a task deep link, not a raw UUID", () => {
  const src = canonicalChanges();
  assert.match(src, /Kapcsolt feladat megnyitása/);
  assert.match(src, /\/tasks\?taskId=\$\{encodeURIComponent\(segment\.linkedTaskId\)\}/);
  assert.doesNotMatch(src, /linkedTaskId\.slice\(0, 8\)/);
  assert.doesNotMatch(src, /Feladat: \{segment\.linkedTaskId/);
});

test("review panel exposes a task deep link, not a raw UUID", () => {
  const src = reviewPanel();
  assert.match(src, /Kapcsolt feladat megnyitása/);
  assert.match(src, /\/tasks\?taskId=\$\{encodeURIComponent\(point\.linkedTaskId\)\}/);
  assert.doesNotMatch(src, /linkedTaskId\.slice\(0, 8\)/);
  assert.doesNotMatch(src, /Feladat: \{point\.linkedTaskId/);
});

test("advanced comparison rail exposes a task deep link, not a raw UUID", () => {
  const src = rail();
  assert.match(src, /Kapcsolt feladat megnyitása/);
  assert.match(src, /\/tasks\?taskId=\$\{encodeURIComponent\(segment\.linkedTaskId\)\}/);
  assert.doesNotMatch(src, /Kapcsolt feladat: \{segment\.linkedTaskId\}/);
});

test("no raw linkedTaskId is rendered as text in Document Workspace surfaces", () => {
  for (const src of [canonicalChanges(), reviewPanel(), rail()]) {
    assert.doesNotMatch(src, /\{segment\.linkedTaskId\}\s*</, "raw segment task id must not be rendered");
    assert.doesNotMatch(src, /\{point\.linkedTaskId\}\s*</, "raw review-point task id must not be rendered");
  }
});
