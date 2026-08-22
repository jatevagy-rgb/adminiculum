import assert from "node:assert/strict";
import test from "node:test";
import { ApiError } from "../src/lib/api";
import {
  StableMutationAttempt,
  approveTaskSubmission,
  attachTaskSubmissionDocument,
  isStaleReviewError,
  isUncertainMutationError,
  readTaskSubmissionWorkflow,
  returnTaskSubmission,
  submitTaskSubmissionForReview,
} from "../src/lib/taskLifecycleApi";

type FetchCall = {
  url: string;
  init?: RequestInit;
};

const originalFetch = globalThis.fetch;

function installAuthenticatedBrowserGlobals(): void {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { location: { pathname: "/" } },
  });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => key === "auth_token" ? "synthetic-test-token" : null,
      setItem: () => undefined,
      removeItem: () => undefined,
      clear: () => undefined,
      key: () => null,
      length: 1,
    } satisfies Storage,
  });
}

function installFetchResponse(payload: unknown, calls: FetchCall[]): void {
  globalThis.fetch = async (input, init) => {
    calls.push({ url: String(input), init });
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
}

test.beforeEach(() => {
  installAuthenticatedBrowserGlobals();
});

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  Reflect.deleteProperty(globalThis, "window");
  Reflect.deleteProperty(globalThis, "localStorage");
});

test("workflow read uses the exact encoded backend route and bearer auth", async () => {
  const calls: FetchCall[] = [];
  installFetchResponse({ nextActionCode: "OPEN_TASK" }, calls);

  const result = await readTaskSubmissionWorkflow("task with space");

  assert.equal(result.nextActionCode, "OPEN_TASK");
  assert.equal(calls[0].url, "/api/v1/tasks/task%20with%20space/workflow");
  assert.equal((calls[0].init?.headers as Record<string, string>).Authorization, "Bearer synthetic-test-token");
});

test("document linking uses only the backend-supported documentId and role fields", async () => {
  const calls: FetchCall[] = [];
  installFetchResponse({ nextActionCode: "CONTINUE_SUBMISSION" }, calls);

  await attachTaskSubmissionDocument("task-1", "submission-1", "document-1", "PRIMARY_OUTPUT");

  assert.equal(calls[0].url, "/api/v1/tasks/task-1/submissions/submission-1/documents");
  assert.equal(calls[0].init?.method, "POST");
  assert.deepEqual(JSON.parse(String(calls[0].init?.body)), {
    documentId: "document-1",
    role: "PRIMARY_OUTPUT",
  });
});

test("submit reuses one stable idempotency key for the same attempt", async () => {
  const calls: FetchCall[] = [];
  installFetchResponse({ idempotentReplay: false, submission: {}, workflow: {} }, calls);
  const attempt = new StableMutationAttempt("submit");
  const key = attempt.begin();

  await submitTaskSubmissionForReview("task-1", "submission-1", attempt.key());
  await submitTaskSubmissionForReview("task-1", "submission-1", attempt.key());

  assert.equal((calls[0].init?.headers as Record<string, string>)["Idempotency-Key"], key);
  assert.equal((calls[1].init?.headers as Record<string, string>)["Idempotency-Key"], key);
});

test("return and approval send quoted If-Match plus stable idempotency headers", async () => {
  const calls: FetchCall[] = [];
  installFetchResponse({ idempotentReplay: false, review: {} }, calls);

  await returnTaskSubmission("task-1", "submission-1", "review-version", "return-key", {
    note: "Megjegyzés",
    requestedCorrections: "Kért javítás",
    requiresFullReview: true,
  });
  await approveTaskSubmission("task-1", "submission-1", "review-version-2", "approve-key", "Rendben");

  const returnHeaders = calls[0].init?.headers as Record<string, string>;
  const approveHeaders = calls[1].init?.headers as Record<string, string>;
  assert.equal(returnHeaders["If-Match"], '"review-version"');
  assert.equal(returnHeaders["Idempotency-Key"], "return-key");
  assert.equal(approveHeaders["If-Match"], '"review-version-2"');
  assert.equal(approveHeaders["Idempotency-Key"], "approve-key");
});

test("stale and uncertain errors are bounded for reread recovery", async () => {
  assert.equal(isStaleReviewError(new ApiError(412, "stale", "/review", "REVIEW_VERSION_STALE")), true);
  assert.equal(isStaleReviewError(new ApiError(409, "conflict", "/review")), false);

  const originalConsoleError = console.error;
  console.error = () => undefined;
  globalThis.fetch = async () => {
    throw new Error("synthetic network break");
  };
  try {
    await assert.rejects(
      () => readTaskSubmissionWorkflow("task-1"),
      (error: unknown) => error instanceof ApiError && isUncertainMutationError(error),
    );
  } finally {
    console.error = originalConsoleError;
  }
});
