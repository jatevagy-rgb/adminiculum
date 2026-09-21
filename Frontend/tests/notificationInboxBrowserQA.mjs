/**
 * Workforce notification inbox browser contract QA.
 *
 * The browser receives a deterministic synthetic workforce session and
 * contract-compatible notification API responses. It never contacts Azure,
 * PostgreSQL, or production data, and it sends no external navigation.
 *
 * Covered journeys:
 *   - the TopBar bell points at the notification inbox (not communications)
 *   - the inbox list loads through the canonical notification API
 *   - unread/read visual state, mark-one-read and mark-all-read
 *   - the canonical unread count (page pill AND TopBar badge) refreshes
 *   - bounded load-more pagination over limit/offset/total
 *   - canonical internal navigation, and a refused external/malformed link
 *   - unknown notification type fails gracefully
 *   - distinct loading, empty and error states
 *   - communications remains its own destination
 */
import { chromium } from "playwright";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.NOTIFICATION_QA_PORT || 3099);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const SHOTS = path.join(ROOT, "qa-screenshots-notifications");

const AUTH_ME = { id: "qa-user-1", email: "qa@example.invalid", name: "QA Ügyvéd", role: "LAWYER" };
const PAGE_SIZE = 20;

let server;

function startServer() {
  return new Promise((resolve, reject) => {
    server = spawn(process.platform === "win32" ? "npx.cmd" : "npx", ["next", "start", "-p", String(PORT)], {
      cwd: ROOT,
      env: { ...process.env, PORT: String(PORT) },
      stdio: ["ignore", "pipe", "pipe"],
      shell: true,
    });
    let ready = false;
    const onOutput = (chunk) => {
      if (!ready && /ready|started server/i.test(chunk.toString())) {
        ready = true;
        setTimeout(resolve, 1000);
      }
    };
    server.stdout.on("data", onOutput);
    server.stderr.on("data", onOutput);
    server.on("error", reject);
    server.on("exit", (code) => {
      if (!ready) reject(new Error(`next start exited before ready: ${code}`));
    });
    setTimeout(() => {
      if (!ready) reject(new Error("Timed out waiting for next start"));
    }, 30000);
  });
}

function stopServer() {
  if (!server) return;
  try {
    if (process.platform === "win32" && server.pid) {
      spawnSync("taskkill", ["/F", "/T", "/PID", String(server.pid)], { stdio: "ignore" });
    } else {
      server.kill("SIGKILL");
    }
  } catch {}
  server = undefined;
}

function buildNotifications() {
  const at = (day, hour) => new Date(Date.UTC(2026, 0, day, hour)).toISOString();
  const base = (id, overrides) => ({
    id,
    type: "TASK_ASSIGNED",
    title: `QA értesítés ${id}`,
    message: "Synthetic QA notification body.",
    link: null,
    isRead: false,
    userId: AUTH_ME.id,
    createdAt: at(1, 12),
    clientColorKey: null,
    ...overrides,
  });

  // Canonical internal destination + canonical client colour cue.
  const items = [
    base("qa-notification-1", {
      type: "TASK_OVERDUE",
      link: "/tasks?taskId=qa-task-1",
      clientColorKey: "BLUE",
      createdAt: at(2, 12),
    }),
    // Future/unknown enum value must not crash the inbox.
    base("qa-notification-unknown", {
      type: "FUTURE_NOTIFICATION_TYPE",
      title: "Ismeretlen típusú értesítés",
      createdAt: at(2, 11),
    }),
    // Unsafe link values must never be offered as navigation.
    base("qa-notification-external", {
      type: "SYSTEM",
      title: "Külső hivatkozású értesítés",
      link: "https://evil.example/steal",
      isRead: true,
      createdAt: at(2, 10),
    }),
    base("qa-notification-scheme", {
      type: "SYSTEM",
      title: "Sémahivatkozású értesítés",
      link: "javascript:alert(1)",
      isRead: true,
      createdAt: at(2, 9),
    }),
  ];

  for (let index = 1; index <= 24; index += 1) {
    items.push(base(`qa-notification-f${index}`, { createdAt: at(1, index) }));
  }

  return items;
}

function createStore(mode) {
  const notifications = mode === "empty" ? [] : buildNotifications();
  return {
    mode,
    notifications,
    total: notifications.length,
    unreadCount: notifications.filter((item) => !item.isRead).length,
    patchedIds: [],
    readAllCalls: 0,
  };
}

function respond(store, route) {
  const url = route.request().url();
  const method = route.request().method();
  const body = (payload, status = 200) => ({ status, body: payload });

  if (url.includes("/auth/me")) return body(AUTH_ME);

  if (store.mode === "error" && url.includes("/notifications")) {
    return { status: 500, body: { status: 500, code: "INTERNAL_ERROR", message: "Internal server error" } };
  }

  if (url.includes("/notifications/unread-count")) return body({ unreadCount: store.unreadCount });

  if (url.includes("/notifications/read-all")) {
    store.readAllCalls += 1;
    let updatedCount = 0;
    for (const item of store.notifications) {
      if (!item.isRead) {
        item.isRead = true;
        updatedCount += 1;
      }
    }
    store.unreadCount = 0;
    return body({ updatedCount });
  }

  const readMatch = url.match(/\/notifications\/([^/?]+)\/read/);
  if (readMatch) {
    const id = decodeURIComponent(readMatch[1]);
    const item = store.notifications.find((candidate) => candidate.id === id);
    if (!item) return { status: 404, body: { status: 404, code: "NOT_FOUND" } };
    store.patchedIds.push(id);
    if (!item.isRead) {
      item.isRead = true;
      store.unreadCount = Math.max(0, store.unreadCount - 1);
    }
    return body({ ...item });
  }

  if (url.includes("/notifications")) {
    const parsed = new URL(url);
    const limit = Number(parsed.searchParams.get("limit") || PAGE_SIZE);
    const offset = Number(parsed.searchParams.get("offset") || 0);
    return body({
      notifications: store.notifications.slice(offset, offset + limit),
      pagination: { total: store.total, limit, offset },
    });
  }

  return { status: 404, body: { status: 404, code: "QA_UNMOCKED_ENDPOINT" } };
}

async function newPage(browser, store, viewport = { width: 1440, height: 900 }) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const hardErrors = [];
  const requests = [];
  page.on("pageerror", (error) => hardErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().includes("[API]") && !message.text().includes("Failed to load resource")) {
      hardErrors.push(message.text());
    }
  });
  page.on("request", (request) => {
    if (request.url().includes("/api/v1/")) {
      requests.push(`${request.method()} ${request.url()}`);
    }
  });
  await page.addInitScript(({ profile }) => {
    localStorage.setItem("auth_token", "qa-workforce-token");
    sessionStorage.setItem("adminiculum_auth_profile", JSON.stringify(profile));
  }, { profile: AUTH_ME });
  await page.route("**/api/v1/**", async (route) => {
    const response = respond(store, route);
    await route.fulfill({ status: response.status, contentType: "application/json", body: JSON.stringify(response.body) });
  });
  return { context, page, hardErrors, requests };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const rowText = (page) => page.locator('[data-testid="notification-list"]').innerText();
const rowFor = (page, id) => page.locator(`[data-notification-id="${id}"]`);

async function assertUnreadBadge(page, expectedText) {
  const badge = page.locator('[data-testid="notification-unread-count"]');
  assert(await badge.count(), "notification unread badge is missing");
  const text = (await badge.innerText()).trim();
  if (expectedText) assert(text.includes(expectedText), `unread badge expected "${expectedText}" but was "${text}"`);
  return text;
}

async function runInboxJourney(browser) {
  const store = createStore("populated");
  const qa = await newPage(browser, store);
  const { page } = qa;

  await page.goto(`${BASE_URL}/notifications`, { waitUntil: "networkidle" });

  // 1. Shell + bell destination.
  assert(await page.getByRole("heading", { name: "Értesítések" }).first().isVisible(), "Értesítések page heading is not visible");
  const bell = page.locator('a[title="Értesítések"]').first();
  assert(await bell.count(), "TopBar notification bell is missing");
  assert((await bell.getAttribute("href")) === "/notifications", "bell must point at /notifications");

  // 2. List loads through the canonical API.
  assert(await page.locator('[data-testid="notification-list"]').isVisible(), "notification list is not visible");
  assert(!await page.locator('[data-testid="notification-error-state"]').count(), "error state must not render on a healthy load");
  assert(!await page.locator('[data-testid="notification-empty-state"]').count(), "empty state must not render when rows exist");

  // 3. Canonical unread count (page level).
  const initialBadge = await assertUnreadBadge(page, "olvasatlan");
  assert(
    initialBadge.startsWith(String(store.unreadCount)),
    `expected ${store.unreadCount} unread (mixed unread/read fixture), got "${initialBadge}"`,
  );

  // 4. Unread / read visual state.
  const firstRow = rowFor(page, "qa-notification-1");
  assert((await firstRow.getAttribute("data-read-state")) === "unread", "first notification must render as unread");
  const readRow = rowFor(page, "qa-notification-external");
  assert((await readRow.getAttribute("data-read-state")) === "read", "pre-read notification must render as read");
  assert(!await readRow.locator('[data-testid="notification-mark-read"]').count(), "a read notification must not offer mark-read");

  // 5. Client colour cue when canonically present.
  const accentClass = await firstRow.locator("span[aria-hidden='true']").first().getAttribute("class");
  assert((accentClass || "").includes("bg-blue-600"), `client colour cue missing, got "${accentClass}"`);

  // 6. Unknown notification type fails gracefully.
  const bodyText = await rowText(page);
  assert(bodyText.includes("Ismeretlen típusú értesítés"), "unknown-type notification row is missing");
  assert(bodyText.includes("Értesítés"), "unknown notification type must fall back to the generic label");
  assert(!bodyText.includes("FUTURE_NOTIFICATION_TYPE"), "raw enum value must never be rendered");

  // 7. Unsafe link values are not offered as navigation.
  assert(!await rowFor(page, "qa-notification-external").locator('[data-testid="notification-open"]').count(), "external link must not offer navigation");
  assert(!await rowFor(page, "qa-notification-scheme").locator('[data-testid="notification-open"]').count(), "javascript: link must not offer navigation");
  assert(await firstRow.locator('[data-testid="notification-open"]').count(), "canonical internal link must offer navigation");

  // 8. Bounded pagination over limit/offset/total.
  assert((await page.locator('[data-testid="notification-load-more"]').innerText()).includes("Több értesítés"), "load-more control is missing");
  assert(await page.locator('[data-testid="notification-row"]').count() === PAGE_SIZE, `expected ${PAGE_SIZE} rows on the first page`);
  await page.locator('[data-testid="notification-load-more"]').click();
  await page.waitForFunction((expected) => document.querySelectorAll('[data-testid="notification-row"]').length === expected, store.total);
  assert(!await page.locator('[data-testid="notification-load-more"]').count(), "load-more must disappear once every row is loaded");

  // 9. Mark one read refreshes the canonical unread count.
  const before = Number((await assertUnreadBadge(page, "olvasatlan")).split(" ")[0]);
  const rowOnerow = rowFor(page, "qa-notification-f5");
  await rowOnerow.locator('[data-testid="notification-mark-read"]').click();
  await page.waitForFunction((expected) => {
    const row = document.querySelector('[data-notification-id="qa-notification-f5"]');
    return row?.getAttribute("data-read-state") === "read" && document.querySelector('[data-testid="notification-unread-count"]')?.textContent?.startsWith(String(expected));
  }, String(before - 1), { timeout: 5000 });
  assert(store.patchedIds.includes("qa-notification-f5"), "mark-one-read must call the canonical PATCH endpoint");

  // 10. Mark all read refreshes the page pill AND the TopBar badge.
  const topBarBadgeBefore = await page.locator('header a[title="Értesítések"] span').count();
  assert(topBarBadgeBefore > 0, "TopBar unread badge was expected before marking all read");
  await page.locator('[data-testid="notification-mark-all-read"]').click();
  await page.waitForFunction(() => document.querySelector('[data-testid="notification-unread-count"]')?.textContent?.includes("Nincs olvasatlan"), null, { timeout: 5000 });
  await page.waitForFunction(() => {
    const bell = document.querySelector('header a[title="Értesítések"]');
    return bell && bell.querySelectorAll("span").length === 0;
  }, null, { timeout: 5000 });
  assert(store.readAllCalls === 1, "mark-all-read must call the canonical read-all endpoint");
  const unreadAfterAll = await page.locator('[data-testid="notification-row"][data-read-state="unread"]').count();
  assert(unreadAfterAll === 0, "no row may remain unread after mark-all-read");
  assert(await page.locator('[data-testid="notification-mark-all-read"]').isDisabled(), "mark-all-read must disable when nothing is unread");

  // 11. Canonical internal navigation (and the read state is persisted first).
  await page.locator('[data-testid="notification-open"]').first().click();
  await page.waitForURL((url) => url.pathname === "/tasks", { timeout: 10000 });
  assert(store.patchedIds.length >= 1, "opening an unread notification must mark it read first");

  if (qa.hardErrors.length) throw new Error(`notification inbox browser errors: ${qa.hardErrors.join("; ")}`);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE_URL}/notifications`, { waitUntil: "networkidle" });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  assert(!overflow, "notification inbox has horizontal overflow on the mobile shell");
  await page.screenshot({ path: path.join(SHOTS, "notifications-mobile.png"), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${BASE_URL}/notifications`, { waitUntil: "networkidle" });
  await page.screenshot({ path: path.join(SHOTS, "notifications-desktop.png"), fullPage: true });
  await qa.context.close();
}

async function runEmptyJourney(browser) {
  const store = createStore("empty");
  const qa = await newPage(browser, store);
  await qa.page.goto(`${BASE_URL}/notifications`, { waitUntil: "networkidle" });
  await qa.page.getByText("Nincs új értesítés.").waitFor({ state: "visible", timeout: 5000 });
  assert(await qa.page.locator('[data-testid="notification-empty-state"]').isVisible(), "empty state must be visible for zero notifications");
  assert(!await qa.page.locator('[data-testid="notification-error-state"]').count(), "empty inbox must not render the error state");
  assert((await qa.page.locator('[data-testid="notification-unread-count"]').innerText()).includes("Nincs olvasatlan"), "empty inbox must not fabricate an unread count");
  if (qa.hardErrors.length) throw new Error(`empty inbox browser errors: ${qa.hardErrors.join("; ")}`);
  await qa.context.close();
}

async function runErrorJourney(browser) {
  const store = createStore("error");
  const qa = await newPage(browser, store);
  await qa.page.goto(`${BASE_URL}/notifications`, { waitUntil: "networkidle" });
  await qa.page.locator('[data-testid="notification-error-state"]').waitFor({ state: "visible", timeout: 5000 });
  const text = await qa.page.locator('[data-testid="notification-error-state"]').innerText();
  assert(text.includes("Az adatok betöltése sikertelen"), `error state copy missing, got "${text}"`);
  assert(!await qa.page.locator('[data-testid="notification-empty-state"]').count(), "API failure must never be rendered as an empty inbox");
  assert(await qa.page.getByRole("button", { name: "Újratöltés" }).count(), "error state must offer a retry");
  assert(!text.includes("INTERNAL_ERROR"), "backend error payload must not be surfaced");
  if (qa.hardErrors.length) throw new Error(`error inbox browser errors: ${qa.hardErrors.join("; ")}`);
  await qa.context.close();
}

async function runCommunicationsSeparation(browser) {
  const store = createStore("populated");
  const qa = await newPage(browser, store);
  await qa.page.goto(`${BASE_URL}/notifications`, { waitUntil: "networkidle" });
  const communications = qa.page.locator('button[title="Kommunikáció"]').first();
  assert(await communications.count(), "communications navigation entry is missing");
  await communications.click();
  await qa.page.waitForURL((url) => url.pathname === "/communications", { timeout: 10000 });
  assert((await qa.page.locator('a[title="Értesítések"]').first().getAttribute("href")) === "/notifications", "bell must still point at the inbox from communications");
  await qa.context.close();
}

async function main() {
  await startServer();
  const browser = await chromium.launch({ headless: true });
  try {
    fs.mkdirSync(SHOTS, { recursive: true });

    console.log("Verifying workforce notification inbox journey...");
    await runInboxJourney(browser);

    console.log("Verifying empty state...");
    await runEmptyJourney(browser);

    console.log("Verifying error state...");
    await runErrorJourney(browser);

    console.log("Verifying communications separation...");
    await runCommunicationsSeparation(browser);

    console.log("NOTIFICATION_INBOX_BROWSER_QA=PASSED");
    console.log("SCREENSHOT_EVIDENCE=" + SHOTS);
  } finally {
    await browser.close();
    stopServer();
  }
}

main().catch((error) => {
  console.error(error);
  stopServer();
  process.exitCode = 1;
});
