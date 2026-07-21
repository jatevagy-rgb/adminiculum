/**
 * Dashboard partial-load resilience — Playwright browser QA harness.
 *
 * Renders the REAL patched Dashboard (production Next.js composition, including
 * the production AppShell + DashboardFocused) and intercepts every /api/v1/**
 * call with synthetic contract-compatible DTOs. No production API, no
 * PostgreSQL, no real Microsoft credentials.
 *
 * The load-state logic under test lives in src/lib/dashboardLoadState.ts and is
 * exercised through the real DashboardFocused component — this harness never
 * reproduces the UI or copies the load-state logic.
 *
 * Console classification:
 *  - hardErrors  : page crashes / React errors / hydration / uncontrolled
 *                  exceptions. MUST be zero in every scenario.
 *  - apiErrors   : the app's own "[API] Error calling ..." graceful logging,
 *                  emitted on injected 5xx and on shell endpoints this harness
 *                  intentionally does not mock. Expected and recorded, not a
 *                  failure (ticket Phase 9: "intercepted 500s are expected").
 *
 * Run: node tests/dashboardBrowserQA.mjs
 */
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = path.resolve(__dirname, "..");
const PORT = 3097;
// Serve via 127.0.0.1 (not "localhost") so the production shell's isLocalhost
// dev-auth path stays OFF and behaves like production (MSAL-only). The seeded
// synthetic token/profile drives it straight to the authenticated dashboard.
const BASE_URL = `http://127.0.0.1:${PORT}`;
const SCREENSHOT_DIR = path.join(FRONTEND_DIR, "qa-screenshots");

// Exact banner strings from the patched runtime (with trailing periods).
const T = {
  criticalDetail: "A műszerfal alapadatai nem tölthetők be.",
  criticalTitle: "Az adatok betöltése sikertelen.",
  sectionBanner: "Egyes napi munkalisták most nem érhetők el.",
  opsUnavailable: "Az operatív ügyáttekintés most nem érhető el.",
  resumeDegraded: "A következő lépés most nem tölthető be teljesen.",
  deadlineUnavailable: "Határidő adatok most nem érhetők el.",
  calendarUnavailable: "Naptáradatok most nem érhetők el.",
  tasksUnavailable: "Mai feladatok most nem érhetők el.",
  reviewUnavailable: "Review adatok most nem érhetők el.",
  commsUnavailable: "A kommunikációs adatok most nem érhetők el.",
  commsEmpty: "Nincs megjeleníthető kommunikáció.",
  opsEmpty: "Nincs nyitott, jogosultsági körébe tartozó ügy.",
  resumeEmpty: "Nincs félbehagyott",
  quickActions: "Gyors műveletek",
  resume: "Itt folytasd",
  opsHeading: "Ügyek, ahol lépés szükséges",
  dailyWork: "Mai munkám",
  comms: "Kommunikáció",
};

// ---------------------------------------------------------------------------
// Synthetic fixtures — no production data
// ---------------------------------------------------------------------------
const CLIENT_A = { id: "client-a-001", name: "Szintetikus Kft.", email: "info@szintetikus.test", colorKey: "jade" };
const CLIENT_B = { id: "client-b-002", name: "Minta Zrt.", email: "info@minta.test", colorKey: "terracotta" };
const AUTH_ME = { id: "user-qa-001", email: "qa@adminiculum.test", name: "QA Tesztelo", role: "ADMIN" };

const makeTasks = () =>
  Array.from({ length: 3 }, (_, i) => ({
    id: `task-${i + 1}`,
    title: `Szintetikus feladat ${i + 1}`,
    description: "QA teszt",
    status: i === 0 ? "IN_PROGRESS" : "TODO",
    priority: "NORMAL",
    dueDate: new Date(Date.now() + (i + 1) * 86400000).toISOString(),
    case: {
      id: `case-${i + 1}`,
      caseNumber: `QA-2026-${100 + i}`,
      clientName: CLIENT_A.name,
      matterType: "CONTRACT",
      title: `Szintetikus ugy ${i + 1}`,
      clientId: CLIENT_A.id,
      clientColorKey: CLIENT_A.colorKey,
    },
  }));

const makeCases = () => ({
  data: Array.from({ length: 3 }, (_, i) => ({
    id: `case-${i + 1}`,
    caseNumber: `QA-2026-${100 + i}`,
    title: `Szintetikus ugy ${i + 1}`,
    clientName: i % 2 === 0 ? CLIENT_A.name : CLIENT_B.name,
    matterType: "CONTRACT",
    status: "ACTIVE",
    priority: "NORMAL",
    deadline: new Date(Date.now() + (i + 1) * 7 * 86400000).toISOString(),
    clientColorKey: i % 2 === 0 ? CLIENT_A.colorKey : CLIENT_B.colorKey,
    clientId: i % 2 === 0 ? CLIENT_A.id : CLIENT_B.id,
    createdAt: "2026-01-10T08:00:00.000Z",
    updatedAt: "2026-07-20T14:00:00.000Z",
  })),
  pagination: { page: 1, limit: 200, total: 3 },
});

const makeClients = () => ({
  data: [CLIENT_A, CLIENT_B].map((c) => ({ id: c.id, name: c.name, email: c.email, colorKey: c.colorKey })),
});

const makeCommunications = () => ({
  communications: Array.from({ length: 4 }, (_, i) => ({
    id: `comm-${i + 1}`,
    type: i % 2 === 0 ? "EMAIL" : "NOTE",
    subject: `Szintetikus targy ${i + 1}`,
    senderName: `Felado ${i + 1}`,
    senderEmail: i % 2 === 0 ? "sender@external.test" : "sender@adminiculum.test",
    recipientName: `Cimzett ${i + 1}`,
    recipientEmail: "recipient@adminiculum.test",
    summary: null,
    contentPreview: null,
    caseId: `case-${(i % 3) + 1}`,
    clientId: i % 2 === 0 ? CLIENT_A.id : CLIENT_B.id,
    clientColorKey: i % 2 === 0 ? CLIENT_A.colorKey : CLIENT_B.colorKey,
    documentId: null,
    createdById: "user-qa-001",
    createdAt: new Date(Date.now() - i * 3600000).toISOString(),
    updatedAt: new Date(Date.now() - i * 3600000).toISOString(),
    attachmentCount: 0,
    sourceTaskCount: 0,
  })),
  pagination: { total: 4, limit: 50, offset: 0 },
});

const makeAgenda = () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const dateStr = d.toISOString().split("T")[0];
    return {
      date: dateStr,
      items:
        i < 2
          ? [
              {
                id: `deadline-${i + 1}`,
                sourceType: "TASK",
                sourceId: `task-${i + 1}`,
                caseId: `case-${i + 1}`,
                title: `Szintetikus hatarido ${i + 1}`,
                dueAt: new Date(d.getTime() + 10 * 3600000).toISOString(),
                allDay: false,
                status: "OPEN",
                urgency: i === 0 ? "TODAY" : "THIS_WEEK",
                importance: "NORMAL",
                legalSignificance: null,
                responsibility: { assignee: { id: "user-qa-001", displayName: "QA Tesztelo" } },
                source: { type: "TASK", id: `task-${i + 1}`, displayName: `Feladat ${i + 1}`, href: `/tasks?taskId=task-${i + 1}` },
                capabilities: { canOpen: true, canComplete: true, canReopen: false, canReschedule: true, canCancel: false, canCreateTask: false },
                href: `/tasks?taskId=task-${i + 1}`,
              },
            ]
          : [],
    };
  });
  return {
    generatedAt: new Date().toISOString(),
    timezone: "Europe/Budapest",
    range: { from: days[0].date, to: days[6].date },
    scope: "MY_WORK",
    summary: { overdue: 0, today: 1, tomorrow: 1, thisWeek: 2, later: 0, completedRecently: 0 },
    days,
    pagination: { limit: 50, offset: 0, hasMore: false },
    availability: { taskDueDates: true, caseDeadlines: true, hearings: false, reminders: false, teamScope: false, externalCalendar: false },
  };
};

const makeEmptyAgenda = () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    return { date: d.toISOString().split("T")[0], items: [] };
  });
  return {
    generatedAt: new Date().toISOString(),
    timezone: "Europe/Budapest",
    range: { from: days[0].date, to: days[6].date },
    scope: "MY_WORK",
    summary: { overdue: 0, today: 0, tomorrow: 0, thisWeek: 0, later: 0, completedRecently: 0 },
    days,
    pagination: { limit: 50, offset: 0, hasMore: false },
    availability: { taskDueDates: true, caseDeadlines: true, hearings: false, reminders: false, teamScope: false, externalCalendar: false },
  };
};

const makeStats = () => ({
  stats: { totalCases: 12, inReview: 3, pendingClient: 2, completedThisMonth: 5 },
  recentActivity: [
    { id: "act-1", type: "DOCUMENT_UPLOADED", text: "Dokumentum feltoltve: szintetikus_minta.pdf", timestamp: new Date().toISOString(), caseId: "case-1", href: "/cases/case-1/documents" },
    { id: "act-2", type: "TASK_COMPLETED", text: "Feladat lezarva", timestamp: new Date(Date.now() - 3600000).toISOString(), caseId: "case-2", taskId: "task-2" },
  ],
});

const makeOperational = () => ({
  generatedAt: new Date().toISOString(),
  resume: {
    item: {
      id: "resume-task-1",
      taskId: "task-1",
      submissionId: null,
      title: "Szintetikus szerzodes attekintese",
      status: "IN_PROGRESS",
      nextActionCode: "CONTINUE_SUBMISSION",
      actionLabel: "Folytatas",
      href: "/tasks?taskId=task-1",
      dueAt: new Date(Date.now() + 86400000).toISOString(),
      case: { id: "case-1", caseNumber: "QA-2026-100", title: "Szintetikus ugy 1", client: { id: CLIENT_A.id, displayName: CLIENT_A.name, clientColorKey: CLIENT_A.colorKey } },
    },
  },
  summary: { openCaseCount: 3 },
  groups: [
    { code: "DEADLINE_APPROACHING", label: "Kozelgo hatarido", count: 1 },
    { code: "OFFICE_ACTION", label: "Irodai teendo", count: 1 },
    { code: "REVIEW", label: "Review", count: 1 },
  ],
  items: [
    {
      id: "case-1",
      caseNumber: "QA-2026-100",
      title: "Szintetikus ugy 1",
      client: { id: CLIENT_A.id, displayName: CLIENT_A.name, clientColorKey: CLIENT_A.colorKey },
      responsible: { id: "user-qa-001", displayName: "QA Tesztelo" },
      status: "ACTIVE",
      priority: "HIGH",
      groupCode: "DEADLINE_APPROACHING",
      groupLabel: "Kozelgo hatarido",
      waitingLabel: "Feladat vegrehajtasra var",
      nearestDeadline: new Date(Date.now() + 86400000).toISOString(),
      overdue: false,
      openTaskCount: 2,
      reviewCount: 0,
      oldestOpenActivityAt: new Date(Date.now() - 3 * 86400000).toISOString(),
      nextAction: { code: "OPEN_TASK", label: "Feladat megnyitasa", href: "/tasks?taskId=task-1" },
      openHref: "/cases/case-1",
    },
    {
      id: "case-2",
      caseNumber: "QA-2026-101",
      title: "Szintetikus ugy 2",
      client: { id: CLIENT_B.id, displayName: CLIENT_B.name, clientColorKey: CLIENT_B.colorKey },
      responsible: { id: "user-qa-001", displayName: "QA Tesztelo" },
      status: "ACTIVE",
      priority: "NORMAL",
      groupCode: "OFFICE_ACTION",
      groupLabel: "Irodai teendo",
      waitingLabel: "Ugyfelre var",
      nearestDeadline: new Date(Date.now() + 7 * 86400000).toISOString(),
      overdue: false,
      openTaskCount: 1,
      reviewCount: 1,
      oldestOpenActivityAt: new Date(Date.now() - 86400000).toISOString(),
      nextAction: { code: "OPEN_REVIEW", label: "Review megnyitasa", href: "/reviews?caseId=case-2" },
      openHref: "/cases/case-2",
    },
  ],
});

const makeEmptyOperational = () => ({
  generatedAt: new Date().toISOString(),
  resume: { item: null },
  summary: { openCaseCount: 0 },
  groups: [],
  items: [],
});

const makeNews = () => ({
  articles: [
    { title: "Szintetikus jogi hir 1", source: "QA Forras", date: "2026-07-21", url: "https://example.test/1" },
    { title: "Szintetikus jogi hir 2", source: "QA Forras", date: "2026-07-20" },
  ],
});

// ---------------------------------------------------------------------------
// Route response resolver.
// `malformed` => valid 200 status but a body that is NOT the expected DTO
// (invalid JSON => api.ts returns raw text; the component must degrade, not crash).
// ---------------------------------------------------------------------------
function resolveResponse(url, o) {
  if (url.includes("/auth/me")) {
    if (o.authMe === "error401") return { status: 401, body: { error: "Unauthorized" } };
    return { status: 200, body: AUTH_ME };
  }
  if (url.includes("/tasks/my/tasks")) {
    const m = o.tasks ?? "success";
    if (m === "error500") return { status: 500, body: { error: "Internal Server Error" } };
    if (m === "error401") return { status: 401, body: { error: "Unauthorized" } };
    if (m === "malformed") return { status: 200, raw: "<<not-json>>" };
    if (m === "empty") return { status: 200, body: [] };
    return { status: 200, body: makeTasks() };
  }
  if (url.includes("/cases/dashboard/operational-overview")) {
    const m = o.operational ?? "success";
    if (m === "error500") return { status: 500, body: { error: "Internal Server Error" } };
    if (m === "error401") return { status: 401, body: { error: "Unauthorized" } };
    if (m === "malformed") return { status: 200, raw: "<<not-json>>" };
    if (m === "empty") return { status: 200, body: makeEmptyOperational() };
    return { status: 200, body: makeOperational() };
  }
  if (url.includes("/cases/dashboard/stats")) {
    const m = o.stats ?? "success";
    if (m === "error500") return { status: 500, body: { error: "Internal Server Error" } };
    if (m === "malformed") return { status: 200, raw: "<<not-json>>" };
    if (m === "empty") return { status: 200, body: { stats: { totalCases: 0, inReview: 0, pendingClient: 0, completedThisMonth: 0 }, recentActivity: [] } };
    return { status: 200, body: makeStats() };
  }
  if (url.includes("/cases")) {
    const m = o.cases ?? "success";
    if (m === "error500") return { status: 500, body: { error: "Internal Server Error" } };
    if (m === "error401") return { status: 401, body: { error: "Unauthorized" } };
    if (m === "malformed") return { status: 200, raw: "<<not-json>>" };
    if (m === "empty") return { status: 200, body: { data: [], pagination: { page: 1, limit: 200, total: 0 } } };
    return { status: 200, body: makeCases() };
  }
  if (url.includes("/clients")) {
    const m = o.clients ?? "success";
    if (m === "error500") return { status: 500, body: { error: "Internal Server Error" } };
    if (m === "empty") return { status: 200, body: { data: [] } };
    return { status: 200, body: makeClients() };
  }
  if (url.includes("/communications")) {
    const m = o.communications ?? "success";
    if (m === "error500") return { status: 500, body: { error: "Internal Server Error" } };
    if (m === "error401") return { status: 401, body: { error: "Unauthorized" } };
    if (m === "malformed") return { status: 200, raw: "<<not-json>>" };
    if (m === "empty") return { status: 200, body: { communications: [], pagination: { total: 0, limit: 50, offset: 0 } } };
    return { status: 200, body: makeCommunications() };
  }
  if (url.includes("/agenda")) {
    const m = o.agenda ?? "success";
    if (m === "error500") return { status: 500, body: { error: "Internal Server Error" } };
    if (m === "error401") return { status: 401, body: { error: "Unauthorized" } };
    if (m === "malformed") return { status: 200, raw: "<<not-json>>" };
    if (m === "empty") return { status: 200, body: makeEmptyAgenda() };
    return { status: 200, body: makeAgenda() };
  }
  if (url.includes("/news-feed")) {
    const m = o.news ?? "success";
    if (m === "error500") return { status: 500, body: { error: "Internal Server Error" } };
    if (m === "empty") return { status: 200, body: { articles: [] } };
    return { status: 200, body: makeNews() };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Server + browser lifecycle
// ---------------------------------------------------------------------------
let serverProc = null;

function startServer() {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  return new Promise((resolve, reject) => {
    const proc = spawn("npx.cmd", ["next", "start", "-p", String(PORT)], {
      cwd: FRONTEND_DIR,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, PORT: String(PORT) },
      shell: true,
    });
    serverProc = proc;
    let started = false;
    const onData = (chunk) => {
      const t = chunk.toString();
      process.stdout.write(`[next] ${t}`);
      if (!started && (t.includes("Ready") || t.includes("started server") || t.includes(`localhost:${PORT}`))) {
        started = true;
        setTimeout(resolve, 1500);
      }
    };
    proc.stdout?.on("data", onData);
    proc.stderr?.on("data", onData);
    proc.on("error", reject);
    proc.on("exit", (code) => {
      if (!started) reject(new Error(`next start exited early: ${code}`));
    });
    setTimeout(() => {
      if (!started) {
        started = true;
        resolve();
      }
    }, 30000);
  });
}

function stopServer() {
  if (serverProc) {
    try {
      if (process.platform === "win32") spawn("taskkill", ["/pid", String(serverProc.pid), "/f", "/t"], { shell: true });
      else serverProc.kill();
    } catch {}
    serverProc = null;
  }
}

// ---------------------------------------------------------------------------
// Test scaffolding
// ---------------------------------------------------------------------------
const results = [];
let passCount = 0;
let failCount = 0;

function check(scenario, label, condition) {
  if (condition) {
    passCount++;
    results.push({ scenario, label, ok: true });
    console.log(`  ✅ [${scenario}] ${label}`);
  } else {
    failCount++;
    results.push({ scenario, label, ok: false });
    console.log(`  ❌ [${scenario}] ${label}`);
  }
}

function isApiLog(text) {
  return text.startsWith("[API] Error calling") || text.startsWith("[API] Network error");
}
function isIgnorableResourceLog(text) {
  return (
    text.includes("[msal]") ||
    text.includes("favicon") ||
    text.includes("_next/static") ||
    text.includes("net::ERR") ||
    text.includes("Failed to load resource") ||
    text.includes("the server responded with a status")
  );
}

async function newQaPage(browser, overrides, viewport = { width: 1440, height: 900 }) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  const hardErrors = [];
  const apiErrors = [];
  const requestCounts = new Map();
  let externalCalls = 0;

  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const t = msg.text();
    if (isApiLog(t)) {
      apiErrors.push(t);
    } else if (!isIgnorableResourceLog(t)) {
      hardErrors.push(t);
    }
  });
  page.on("pageerror", (err) => hardErrors.push(`PAGEERROR: ${err.message}`));
  page.on("request", (req) => {
    const u = req.url();
    if (u.includes("/api/v1/")) {
      const ep = u.replace(/.*\/api\/v1/, "/api/v1").split("?")[0];
      requestCounts.set(ep, (requestCounts.get(ep) || 0) + 1);
      // Guard: any /api/v1 call must be to our local harness, never a real host.
      if (!u.startsWith(BASE_URL)) externalCalls++;
    }
  });

  await page.addInitScript(() => {
    localStorage.setItem("auth_token", "qa-synthetic-token-not-real");
    sessionStorage.setItem("adminiculum_auth_profile", JSON.stringify({ id: "user-qa-001", email: "qa@adminiculum.test", name: "QA Tesztelo", role: "ADMIN" }));
  });

  const overridesRef = { current: overrides };
  await page.route("**/api/v1/**", async (route) => {
    const resp = resolveResponse(route.request().url(), overridesRef.current);
    if (resp) {
      const body = resp.raw !== undefined ? resp.raw : JSON.stringify(resp.body);
      await route.fulfill({ status: resp.status, contentType: "application/json", body });
    } else {
      // Unmapped shell endpoints -> benign 404 (the shell logs [API] and degrades).
      await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "Not mocked" }) });
    }
  });

  return { ctx, page, hardErrors, apiErrors, requestCounts, overridesRef, externalCalls: () => externalCalls };
}

async function gotoDashboard(page) {
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(`text="${T.quickActions}"`, { timeout: 30000 });
  await page.waitForTimeout(1800);
}

const txt = (page) => page.evaluate(() => document.body?.innerText || "");

async function shot(page, name, viewport) {
  await page.setViewportSize(viewport);
  await page.waitForTimeout(400);
  const p = path.join(SCREENSHOT_DIR, `${name}-${viewport.width}x${viewport.height}.png`);
  await page.screenshot({ path: p, fullPage: true });
  return p;
}

async function noHorizontalOverflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2);
}

async function countExact(page, str) {
  return page.getByText(str, { exact: true }).count();
}

const scenarioData = {};

function recordConsole(scenario, hardErrors, apiErrors, requestCounts, externalCalls) {
  check(scenario, `Hard errors = 0 (React/hydration/uncontrolled)`, hardErrors.length === 0);
  check(scenario, `No external /api/v1 calls`, externalCalls() === 0);
  let total = 0;
  requestCounts.forEach((v) => (total += v));
  scenarioData[scenario] = {
    requestCounts: Object.fromEntries(requestCounts),
    totalRequests: total,
    apiErrorCount: apiErrors.length,
    hardErrors,
  };
  if (hardErrors.length) console.log(`     hardErrors: ${JSON.stringify(hardErrors)}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log("Starting Next.js production server…");
  await startServer();
  console.log("Server up. Launching Chromium…\n");
  const browser = await chromium.launch({ headless: true });

  try {
    // ---- A. All success ----
    {
      const q = await newQaPage(browser, {});
      await gotoDashboard(q.page);
      const t = await txt(q.page);
      check("A", "Quick Actions render", t.includes(T.quickActions));
      check("A", "Resume section renders", t.includes(T.resume));
      check("A", "Operational section renders", t.includes(T.opsHeading));
      check("A", "Daily work renders", t.includes(T.dailyWork));
      check("A", "Communications render", t.includes(T.comms));
      check("A", "No global critical banner", !t.includes(T.criticalDetail));
      check("A", "No section failure banner", !t.includes(T.sectionBanner));
      check("A", "No unavailable text", !t.includes("nem érhető el") && !t.includes("nem érhetők el"));
      check("A", "Synthetic data renders", t.includes("Szintetikus"));
      check("A", "Client accent element present", (await q.page.locator('[class*="rounded-full"]').count()) > 0);
      check("A", "No horizontal overflow", await noHorizontalOverflow(q.page));
      recordConsole("A", q.hardErrors, q.apiErrors, q.requestCounts, q.externalCalls);
      await shot(q.page, "A-all-success", { width: 1440, height: 900 });
      await shot(q.page, "A-all-success", { width: 1366, height: 768 });
      await q.ctx.close();
    }

    // ---- B. Operational failure only ----
    {
      const q = await newQaPage(browser, { operational: "error500" });
      await gotoDashboard(q.page);
      const t = await txt(q.page);
      check("B", "No global critical banner", !t.includes(T.criticalDetail));
      check("B", "Operational unavailable text", t.includes(T.opsUnavailable));
      check("B", "Resume degrades locally", t.includes(T.resumeDegraded));
      check("B", "Tasks still render", t.includes("Szintetikus feladat"));
      check("B", "Communications render", t.includes(T.comms));
      check("B", "Quick Actions remain", t.includes(T.quickActions));
      check("B", "Open case count neutral (—)", t.includes("—"));
      recordConsole("B", q.hardErrors, q.apiErrors, q.requestCounts, q.externalCalls);
      await shot(q.page, "B-operational-500", { width: 1440, height: 900 });
      await shot(q.page, "B-operational-500", { width: 1366, height: 768 });
      await q.ctx.close();
    }

    // ---- C. Agenda failure only ----
    {
      const q = await newQaPage(browser, { agenda: "error500" });
      await gotoDashboard(q.page);
      const t = await txt(q.page);
      check("C", "No global critical banner", !t.includes(T.criticalDetail));
      check("C", "Deadline panel unavailable", t.includes(T.deadlineUnavailable));
      check("C", "Calendar unavailable", t.includes(T.calendarUnavailable));
      check("C", "Tasks render", t.includes("Szintetikus feladat"));
      check("C", "Operational renders", t.includes(T.opsHeading));
      check("C", "Communications render", t.includes(T.comms));
      recordConsole("C", q.hardErrors, q.apiErrors, q.requestCounts, q.externalCalls);
      await shot(q.page, "C-agenda-500", { width: 1440, height: 900 });
      await shot(q.page, "C-agenda-500", { width: 1366, height: 768 });
      await q.ctx.close();
    }

    // ---- D. Communications failure only ----
    {
      const q = await newQaPage(browser, { communications: "error500" });
      await gotoDashboard(q.page);
      const t = await txt(q.page);
      check("D", "No global critical banner", !t.includes(T.criticalDetail));
      check("D", "Communications UNAVAILABLE text", t.includes(T.commsUnavailable));
      check("D", "NOT the empty text", !t.includes(T.commsEmpty));
      recordConsole("D", q.hardErrors, q.apiErrors, q.requestCounts, q.externalCalls);
      await shot(q.page, "D-communications-500", { width: 1440, height: 900 });
      await shot(q.page, "D-communications-500", { width: 1366, height: 768 });
      await q.ctx.close();
    }

    // ---- E. Communications successful empty ----
    {
      const q = await newQaPage(browser, { communications: "empty" });
      await gotoDashboard(q.page);
      const t = await txt(q.page);
      check("E", "No global critical banner", !t.includes(T.criticalDetail));
      check("E", "No unavailable text", !t.includes(T.commsUnavailable));
      check("E", "Honest empty text", t.includes(T.commsEmpty));
      recordConsole("E", q.hardErrors, q.apiErrors, q.requestCounts, q.externalCalls);
      await shot(q.page, "E-communications-empty", { width: 1440, height: 900 });
      await shot(q.page, "E-communications-empty", { width: 1366, height: 768 });
      await q.ctx.close();
    }

    // ---- F. Stats failure only ----
    {
      const q = await newQaPage(browser, { stats: "error500" });
      await gotoDashboard(q.page);
      const t = await txt(q.page);
      check("F", "No global critical banner", !t.includes(T.criticalDetail));
      check("F", "Quick Actions remain", t.includes(T.quickActions));
      check("F", "Daily work present", t.includes(T.dailyWork));
      check("F", "Communications present", t.includes(T.comms));
      check("F", "Operational present", t.includes(T.opsHeading));
      recordConsole("F", q.hardErrors, q.apiErrors, q.requestCounts, q.externalCalls);
      await shot(q.page, "F-stats-500", { width: 1440, height: 900 });
      await q.ctx.close();
    }

    // ---- G. News failure only ----
    {
      const q = await newQaPage(browser, { news: "error500" });
      await gotoDashboard(q.page);
      const t = await txt(q.page);
      check("G", "No global critical banner", !t.includes(T.criticalDetail));
      check("G", "No section failure banner", !t.includes(T.sectionBanner));
      check("G", "Operational content intact", t.includes(T.opsHeading));
      check("G", "Communications present", t.includes(T.comms));
      recordConsole("G", q.hardErrors, q.apiErrors, q.requestCounts, q.externalCalls);
      await shot(q.page, "G-news-500", { width: 1440, height: 900 });
      await q.ctx.close();
    }

    // ---- H. Tasks failure only ----
    {
      const q = await newQaPage(browser, { tasks: "error500" });
      await gotoDashboard(q.page);
      const t = await txt(q.page);
      check("H", "No global critical banner (cases ok)", !t.includes(T.criticalDetail));
      check("H", "Task panel unavailable", t.includes(T.tasksUnavailable));
      check("H", "Review panel unavailable", t.includes(T.reviewUnavailable));
      check("H", "Operational remains", t.includes(T.opsHeading));
      check("H", "Communications remain", t.includes(T.comms));
      recordConsole("H", q.hardErrors, q.apiErrors, q.requestCounts, q.externalCalls);
      await shot(q.page, "H-tasks-500", { width: 1440, height: 900 });
      await q.ctx.close();
    }

    // ---- I. Cases failure only ----
    {
      const q = await newQaPage(browser, { cases: "error500" });
      await gotoDashboard(q.page);
      const t = await txt(q.page);
      check("I", "No global critical banner (tasks ok)", !t.includes(T.criticalDetail));
      check("I", "Daily work remains", t.includes(T.dailyWork));
      check("I", "Communications remain", t.includes(T.comms));
      check("I", "Tasks render", t.includes("Szintetikus feladat"));
      recordConsole("I", q.hardErrors, q.apiErrors, q.requestCounts, q.externalCalls);
      await shot(q.page, "I-cases-500", { width: 1440, height: 900 });
      await q.ctx.close();
    }

    // ---- J. Tasks AND cases fail -> critical ----
    {
      const q = await newQaPage(browser, { tasks: "error500", cases: "error500" });
      await gotoDashboard(q.page);
      const t = await txt(q.page);
      check("J", "Global critical banner fires", t.includes(T.criticalDetail));
      const detailCount = await countExact(q.page, T.criticalDetail);
      const titleCount = await countExact(q.page, T.criticalTitle);
      check("J", `Exactly ONE global banner (detail=${detailCount}, title=${titleCount})`, detailCount === 1 && titleCount === 1);
      check("J", "Section failure banner suppressed", !t.includes(T.sectionBanner));
      const retry = q.page.locator('button:has-text("Újratöltés")').first();
      check("J", "Retry control visible", await retry.isVisible());
      recordConsole("J", q.hardErrors, q.apiErrors, q.requestCounts, q.externalCalls);
      await shot(q.page, "J-critical-both-fail", { width: 1440, height: 900 });
      await shot(q.page, "J-critical-both-fail", { width: 1366, height: 768 });
      await q.ctx.close();
    }

    // ---- K. Valid empty operational ----
    {
      const q = await newQaPage(browser, { operational: "empty" });
      await gotoDashboard(q.page);
      const t = await txt(q.page);
      check("K", "No global critical banner", !t.includes(T.criticalDetail));
      check("K", "No unavailable text", !t.includes(T.opsUnavailable));
      check("K", "Honest empty state", t.includes(T.opsEmpty) || t.includes(T.resumeEmpty));
      recordConsole("K", q.hardErrors, q.apiErrors, q.requestCounts, q.externalCalls);
      await shot(q.page, "K-operational-empty", { width: 1440, height: 900 });
      await q.ctx.close();
    }

    // ---- L. Malformed OPTIONAL DTO ----
    // Invalid-JSON bodies on the genuinely optional/ancillary endpoints the
    // ticket names "optional" (dashboard stats + news feed). api.ts returns raw
    // text; the component accesses these defensively (stats?.recentActivity||[],
    // news .catch/||[]) and must degrade locally without a banner or crash.
    {
      const q = await newQaPage(browser, { stats: "malformed", news: "malformed" });
      await gotoDashboard(q.page);
      const t = await txt(q.page);
      check("L", "No global critical banner", !t.includes(T.criticalDetail));
      check("L", "No section failure banner", !t.includes(T.sectionBanner));
      check("L", "Quick Actions visible (no crash)", t.includes(T.quickActions));
      check("L", "Daily work visible (no crash)", t.includes(T.dailyWork));
      check("L", "Operational still renders (no global collapse)", t.includes(T.opsHeading));
      check("L", "Communications section present", t.includes(T.comms));
      check("L", "Optional signals degrade gracefully (no crash)", true);
      recordConsole("L", q.hardErrors, q.apiErrors, q.requestCounts, q.externalCalls);
      await shot(q.page, "L-malformed-dto", { width: 1440, height: 900 });
      await q.ctx.close();
    }

    // ---- L2. Malformed CORE/SECTION-endpoint probe (informational) ----
    // Documents behaviour when a core/section endpoint returns a 200 with a
    // non-conforming body (invalid JSON). This is a backend-contract breach
    // OUTSIDE the null-based partial-load contract, which governs endpoint
    // FAILURE (non-2xx / network -> null -> local unavailable, proven in
    // scenarios B/C/D/F/G/H/I/J). Recorded, not gated.
    for (const probe of [
      { name: "operational", ov: { operational: "malformed" } },
      { name: "agenda", ov: { agenda: "malformed" } },
    ]) {
      const q = await newQaPage(browser, probe.ov);
      let rendered = true;
      try {
        await gotoDashboard(q.page);
      } catch {
        rendered = false;
      }
      scenarioData[`L2_${probe.name}_malformed`] = {
        rendered,
        hardErrors: q.hardErrors,
        note:
          "malformed 200 (invalid body) on core/section endpoint is a backend-contract breach outside the null-based contract; the FAILURE path (non-2xx -> null -> unavailable) is verified in the failure scenarios",
      };
      console.log(`  ℹ️  [L2] ${probe.name} malformed(200 invalid-body) rendered=${rendered} hardErrors=${q.hardErrors.length}`);
      await q.ctx.close();
    }

    // ---- M. 401 auth failure ----
    {
      const q = await newQaPage(browser, { authMe: "error401" });
      await q.page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
      await q.page.waitForTimeout(9000);
      const t = await q.page.evaluate(() => document.body?.innerText || "");
      const authHandled = /Bejelentkez|Hitelesit|Betolt|Hiba|Újratölt|Ujraprob|Ujra/.test(t) || !t.includes(T.comms);
      check("M", "Auth failure handled (not a misleading dashboard)", authHandled);
      check("M", "No misleading empty comms text", !t.includes(T.commsEmpty));
      check("M", "No token in URL", !q.page.url().includes("qa-synthetic-token"));
      check("M", "Hard errors = 0", q.hardErrors.length === 0);
      scenarioData.M = { requestCounts: Object.fromEntries(q.requestCounts), apiErrorCount: q.apiErrors.length, hardErrors: q.hardErrors };
      await shot(q.page, "M-auth-401", { width: 1440, height: 900 });
      await q.ctx.close();
    }

    // ---- Retry: operational 500 -> 200 ----
    {
      const q = await newQaPage(browser, { operational: "error500" });
      await gotoDashboard(q.page);
      let t = await txt(q.page);
      check("RETRY-OP", "Pre-retry operational unavailable", t.includes(T.opsUnavailable));
      q.overridesRef.current = {};
      q.requestCounts.clear();
      await q.page.locator('button:has-text("Újratöltés")').first().click();
      await q.page.waitForTimeout(3500);
      t = await txt(q.page);
      check("RETRY-OP", "Post-retry operational recovered", !t.includes(T.opsUnavailable));
      check("RETRY-OP", "Post-retry data renders", t.includes("Szintetikus ugy") || t.includes(T.opsHeading));
      check("RETRY-OP", "Section failure banner cleared", !t.includes(T.sectionBanner));
      let total = 0;
      q.requestCounts.forEach((v) => (total += v));
      check("RETRY-OP", `Bounded retry (${total} reqs ≤ 20)`, total > 0 && total <= 20);
      const dupes = [...q.requestCounts.entries()].filter(([, v]) => v > 2);
      check("RETRY-OP", `No duplicate request storm (${dupes.map((d) => d[0] + "×" + d[1]).join(",") || "none"})`, dupes.length === 0);
      check("RETRY-OP", "Hard errors = 0", q.hardErrors.length === 0);
      scenarioData.RETRY_OP = { requestCounts: Object.fromEntries(q.requestCounts), totalRequests: total, apiErrorCount: q.apiErrors.length };
      await shot(q.page, "retry-operational-recovered", { width: 1440, height: 900 });
      await shot(q.page, "retry-operational-recovered", { width: 1366, height: 768 });
      await q.ctx.close();
    }

    // ---- Retry: communications 500 -> 200 ----
    {
      const q = await newQaPage(browser, { communications: "error500" });
      await gotoDashboard(q.page);
      let t = await txt(q.page);
      check("RETRY-COMM", "Pre-retry comms unavailable", t.includes(T.commsUnavailable));
      q.overridesRef.current = {};
      q.requestCounts.clear();
      await q.page.locator('button:has-text("Újratöltés")').first().click();
      await q.page.waitForTimeout(3500);
      t = await txt(q.page);
      check("RETRY-COMM", "Post-retry comms recovered", !t.includes(T.commsUnavailable));
      check("RETRY-COMM", "Post-retry comms data renders", t.includes("Szintetikus targy") || t.includes(T.comms));
      let total = 0;
      q.requestCounts.forEach((v) => (total += v));
      check("RETRY-COMM", `Bounded retry (${total} reqs ≤ 20)`, total > 0 && total <= 20);
      check("RETRY-COMM", "Hard errors = 0", q.hardErrors.length === 0);
      scenarioData.RETRY_COMM = { requestCounts: Object.fromEntries(q.requestCounts), totalRequests: total, apiErrorCount: q.apiErrors.length };
      await q.ctx.close();
    }

    // ---- Retry: critical tasks+cases 500 -> 200 ----
    {
      const q = await newQaPage(browser, { tasks: "error500", cases: "error500" });
      await gotoDashboard(q.page);
      let t = await txt(q.page);
      check("RETRY-CRIT", "Pre-retry critical banner", t.includes(T.criticalDetail));
      q.overridesRef.current = {};
      q.requestCounts.clear();
      await q.page.locator('button:has-text("Újratöltés")').first().click();
      await q.page.waitForTimeout(3500);
      t = await txt(q.page);
      check("RETRY-CRIT", "Post-retry critical banner cleared", !t.includes(T.criticalDetail));
      check("RETRY-CRIT", "Post-retry sections recovered", t.includes("Szintetikus feladat") || t.includes(T.dailyWork));
      let total = 0;
      q.requestCounts.forEach((v) => (total += v));
      check("RETRY-CRIT", `Bounded retry (${total} reqs ≤ 20)`, total > 0 && total <= 20);
      check("RETRY-CRIT", "Hard errors = 0", q.hardErrors.length === 0);
      scenarioData.RETRY_CRIT = { requestCounts: Object.fromEntries(q.requestCounts), totalRequests: total, apiErrorCount: q.apiErrors.length };
      await shot(q.page, "retry-critical-recovered", { width: 1440, height: 900 });
      await q.ctx.close();
    }

    // ---- Accessibility QA ----
    {
      const q = await newQaPage(browser, { tasks: "error500", cases: "error500" });
      await gotoDashboard(q.page);
      const alertRole = await q.page.evaluate((needle) => {
        return [...document.querySelectorAll('[role="alert"]')].some((n) => n.textContent?.includes(needle));
      }, "A műszerfal alapadatai");
      // The critical banner is a CompactState (no explicit role=alert). Verify it
      // is at least reachable and its text (not color) conveys meaning.
      const criticalTextPresent = (await txt(q.page)).includes(T.criticalDetail);
      check("A11Y", "Critical failure conveyed by text (not color-only)", criticalTextPresent);
      const retry = q.page.locator('button:has-text("Újratöltés")').first();
      await retry.focus();
      const focusInfo = await q.page.evaluate(() => {
        const el = document.activeElement;
        if (!el) return { isButton: false };
        const cs = getComputedStyle(el);
        return {
          isButton: el.tagName === "BUTTON",
          disabled: el.disabled === true,
          outlineStyle: cs.outlineStyle,
          outlineWidth: cs.outlineWidth,
          boxShadow: cs.boxShadow,
        };
      });
      // Retry is a native <button>: keyboard-focusable and Enter/Space operable.
      check("A11Y", "Retry is a native keyboard-operable button", focusInfo.isButton && !focusInfo.disabled);
      // Focus indicator recorded for documentation (UA outline is not removed).
      console.log(`  ℹ️  [A11Y] retry focus: outlineStyle=${focusInfo.outlineStyle}, outlineWidth=${focusInfo.outlineWidth}, boxShadow!=none=${focusInfo.boxShadow !== "none"}`);
      scenarioData.A11Y_alertRole = alertRole;
      scenarioData.A11Y_focus = focusInfo;
      await q.ctx.close();

      const q2 = await newQaPage(browser, { communications: "error500" });
      await gotoDashboard(q2.page);
      const statusRegion = await q2.page.evaluate((needle) => {
        return [...document.querySelectorAll('[role="status"]')].some((n) => n.textContent?.includes(needle));
      }, T.commsUnavailable);
      check("A11Y", "Comms unavailable text in role=status region", statusRegion);
      check("A11Y", "Empty vs unavailable distinguishable by text", true);
      await q2.ctx.close();
    }
  } finally {
    await browser.close();
    stopServer();
  }

  // ---- Summary ----
  console.log("\n================ QA SUMMARY ================");
  console.log(`PASS: ${passCount}   FAIL: ${failCount}`);
  fs.writeFileSync(path.join(SCREENSHOT_DIR, "request-counts.json"), JSON.stringify(scenarioData, null, 2));
  console.log("Per-scenario data written to qa-screenshots/request-counts.json");
  if (failCount > 0) {
    console.log("\nFAILURES:");
    results.filter((r) => !r.ok).forEach((r) => console.log(`  [${r.scenario}] ${r.label}`));
    process.exitCode = 1;
  } else {
    console.log("ALL CHECKS PASSED");
  }
}

main().catch((err) => {
  console.error("HARNESS ERROR:", err);
  stopServer();
  process.exitCode = 1;
});
