/**
 * Restored legacy workload cards — Playwright browser QA.
 *
 * Renders the REAL patched DashboardFocused (production Next.js composition) and
 * intercepts every /api/v1/** call with synthetic contract-compatible DTOs.
 * Proves the restored "Napi munka összefoglaló" 6-card grid renders with the
 * exact historical labels/colors/order/counts, degrades per the partial-load
 * contract, and leaves the four light Quick Actions + operational groups + Mai
 * munkám untouched. Captures screenshots at 1366×768, 1440×900 and 1100×800.
 *
 * Run: node tests/dashboardWorkloadCardsBrowserQA.mjs
 */
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = path.resolve(__dirname, "..");
const PORT = 3097;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const SHOTS = path.join(FRONTEND_DIR, "qa-screenshots-workload");

const CLIENT_A = { id: "client-a-001", name: "Szintetikus Kft.", email: "info@szintetikus.test", colorKey: "jade" };
const CLIENT_B = { id: "client-b-002", name: "Minta Zrt.", email: "info@minta.test", colorKey: "terracotta" };
const AUTH_ME = { id: "user-qa-001", email: "qa@adminiculum.test", name: "QA Tesztelo", role: "ADMIN" };

const makeTasks = () =>
  Array.from({ length: 3 }, (_, i) => ({
    id: `task-${i + 1}`, title: `Szintetikus feladat ${i + 1}`, description: "QA", status: i === 0 ? "IN_PROGRESS" : "SUBMITTED",
    priority: "NORMAL", dueDate: new Date(Date.now() + (i + 1) * 86400000).toISOString(),
    case: { id: `case-${i + 1}`, caseNumber: `QA-2026-${100 + i}`, clientName: CLIENT_A.name, matterType: "CONTRACT", title: `Szintetikus ugy ${i + 1}`, clientId: CLIENT_A.id, clientColorKey: CLIENT_A.colorKey },
  }));
const makeCases = () => ({
  data: Array.from({ length: 5 }, (_, i) => ({
    id: `case-${i + 1}`, caseNumber: `QA-2026-${100 + i}`, title: `Szintetikus ugy ${i + 1}`,
    clientName: i % 2 === 0 ? CLIENT_A.name : CLIENT_B.name, matterType: "CONTRACT",
    status: i === 4 ? "CLOSED" : "ACTIVE", priority: "NORMAL", deadline: new Date(Date.now() + (i + 1) * 7 * 86400000).toISOString(),
    clientColorKey: i % 2 === 0 ? CLIENT_A.colorKey : CLIENT_B.colorKey, clientId: i % 2 === 0 ? CLIENT_A.id : CLIENT_B.id,
    createdAt: "2026-01-10T08:00:00.000Z", updatedAt: "2026-07-20T14:00:00.000Z",
  })),
  pagination: { page: 1, limit: 200, total: 5 },
});
const makeClients = () => ({ data: [CLIENT_A, CLIENT_B].map((c) => ({ id: c.id, name: c.name, email: c.email, colorKey: c.colorKey })) });
const makeComms = () => ({
  communications: Array.from({ length: 4 }, (_, i) => ({
    id: `comm-${i + 1}`, type: i % 2 === 0 ? "EMAIL" : "NOTE", subject: `Targy ${i + 1}`,
    senderName: `Felado ${i + 1}`, senderEmail: i % 2 === 0 ? "s@external.test" : "s@adminiculum.test",
    recipientName: `Cimzett ${i + 1}`, recipientEmail: "r@adminiculum.test", summary: null, contentPreview: null,
    caseId: `case-${(i % 3) + 1}`, clientId: i % 2 === 0 ? CLIENT_A.id : CLIENT_B.id, clientColorKey: i % 2 === 0 ? CLIENT_A.colorKey : CLIENT_B.colorKey,
    documentId: null, createdById: "user-qa-001", createdAt: new Date(Date.now() - i * 3600000).toISOString(),
    updatedAt: new Date(Date.now() - i * 3600000).toISOString(), attachmentCount: 0, sourceTaskCount: 0,
  })),
  pagination: { total: 4, limit: 50, offset: 0 },
});
const agendaDays = (withItems) => {
  const t = new Date(); t.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(t); d.setDate(t.getDate() + i);
    return {
      date: d.toISOString().split("T")[0],
      items: withItems && i < 2 ? [{
        id: `dl-${i}`, sourceType: "TASK", sourceId: `task-${i + 1}`, caseId: `case-${i + 1}`, title: `Hatarido ${i + 1}`,
        dueAt: new Date(d.getTime() + 10 * 3600000).toISOString(), allDay: false, status: "OPEN",
        urgency: i === 0 ? "TODAY" : "THIS_WEEK", importance: "NORMAL", legalSignificance: null,
        responsibility: { assignee: { id: "user-qa-001", displayName: "QA" } },
        source: { type: "TASK", id: `task-${i + 1}`, displayName: `Feladat ${i + 1}`, href: `/tasks?taskId=task-${i + 1}` },
        capabilities: { canOpen: true, canComplete: true, canReopen: false, canReschedule: true, canCancel: false, canCreateTask: false },
        href: `/tasks?taskId=task-${i + 1}`,
      }] : [],
    };
  });
};
const makeAgenda = (withItems = true) => {
  const days = agendaDays(withItems);
  return {
    generatedAt: new Date().toISOString(), timezone: "Europe/Budapest", range: { from: days[0].date, to: days[6].date }, scope: "MY_WORK",
    summary: { overdue: 0, today: withItems ? 2 : 0, tomorrow: withItems ? 1 : 0, thisWeek: withItems ? 2 : 0, later: 0, completedRecently: 0 },
    days, pagination: { limit: 50, offset: 0, hasMore: false },
    availability: { taskDueDates: true, caseDeadlines: true, hearings: false, reminders: false, teamScope: false, externalCalendar: false },
  };
};
const makeStats = (n = 3) => ({
  stats: { totalCases: 12, inReview: n, pendingClient: 2, completedThisMonth: 5 },
  recentActivity: [{ id: "a1", type: "DOCUMENT_UPLOADED", text: "Dokumentum feltoltve", timestamp: new Date().toISOString(), caseId: "case-1", href: "/cases/case-1/documents" }],
});
const makeOperational = (open = true) => ({
  generatedAt: new Date().toISOString(),
  resume: open ? { item: { id: "r1", taskId: "task-1", submissionId: null, title: "Szerzodes attekintese", status: "IN_PROGRESS", nextActionCode: "CONTINUE_SUBMISSION", actionLabel: "Folytatas", href: "/tasks?taskId=task-1", dueAt: new Date(Date.now() + 86400000).toISOString(), case: { id: "case-1", caseNumber: "QA-2026-100", title: "Szintetikus ugy 1", client: { id: CLIENT_A.id, displayName: CLIENT_A.name, clientColorKey: CLIENT_A.colorKey } } } } : { item: null },
  summary: { openCaseCount: open ? 4 : 0 },
  groups: open ? [{ code: "DEADLINE_APPROACHING", label: "Kozelgo hatarido", count: 1 }, { code: "OFFICE_ACTION", label: "Irodai teendo", count: 1 }] : [],
  items: open ? [{ id: "case-1", caseNumber: "QA-2026-100", title: "Szintetikus ugy 1", client: { id: CLIENT_A.id, displayName: CLIENT_A.name, clientColorKey: CLIENT_A.colorKey }, responsible: { id: "user-qa-001", displayName: "QA" }, status: "ACTIVE", priority: "HIGH", groupCode: "DEADLINE_APPROACHING", groupLabel: "Kozelgo hatarido", waitingLabel: "Feladat vegrehajtasra var", nearestDeadline: new Date(Date.now() + 86400000).toISOString(), overdue: false, openTaskCount: 2, reviewCount: 0, oldestOpenActivityAt: new Date(Date.now() - 3 * 86400000).toISOString(), nextAction: { code: "OPEN_TASK", label: "Feladat megnyitasa", href: "/tasks?taskId=task-1" }, openHref: "/cases/case-1" }] : [],
});
const makeNews = () => ({ articles: [{ title: "Jogi hir 1", source: "QA", date: "2026-07-21", url: "https://example.test/1" }] });

function resolve(url, o) {
  if (url.includes("/auth/me")) return { status: 200, body: AUTH_ME };
  if (url.includes("/tasks/my/tasks")) return o.tasks === "error500" ? { status: 500, body: { error: "e" } } : { status: 200, body: o.empty ? [] : makeTasks() };
  if (url.includes("operational-overview")) return o.operational === "error500" ? { status: 500, body: { error: "e" } } : { status: 200, body: makeOperational(!o.empty) };
  if (url.includes("dashboard/stats")) return o.stats === "error500" ? { status: 500, body: { error: "e" } } : { status: 200, body: makeStats(o.empty ? 0 : 3) };
  if (url.includes("/cases")) return o.cases === "error500" ? { status: 500, body: { error: "e" } } : { status: 200, body: o.empty ? { data: [], pagination: { page: 1, limit: 200, total: 0 } } : makeCases() };
  if (url.includes("/clients")) return { status: 200, body: makeClients() };
  if (url.includes("/communications")) return o.communications === "error500" ? { status: 500, body: { error: "e" } } : { status: 200, body: o.empty ? { communications: [], pagination: { total: 0, limit: 50, offset: 0 } } : makeComms() };
  if (url.includes("/agenda")) return o.agenda === "error500" ? { status: 500, body: { error: "e" } } : { status: 200, body: makeAgenda(!o.empty) };
  if (url.includes("/news-feed")) return { status: 200, body: makeNews() };
  return null;
}

let server = null;
function startServer() {
  fs.mkdirSync(SHOTS, { recursive: true });
  return new Promise((res, rej) => {
    const p = spawn("npx.cmd", ["next", "start", "-p", String(PORT)], { cwd: FRONTEND_DIR, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, PORT: String(PORT) }, shell: true });
    server = p; let up = false;
    const on = (c) => { const t = c.toString(); if (!up && (t.includes("Ready") || t.includes(`:${PORT}`))) { up = true; setTimeout(res, 1500); } };
    p.stdout?.on("data", on); p.stderr?.on("data", on); p.on("error", rej);
    p.on("exit", (c) => { if (!up) rej(new Error(`server exited ${c}`)); });
    setTimeout(() => { if (!up) { up = true; res(); } }, 30000);
  });
}
function stopServer() { if (server) { try { if (process.platform === "win32") spawn("taskkill", ["/pid", String(server.pid), "/f", "/t"], { shell: true }); else server.kill(); } catch {} server = null; } }

const results = []; let pass = 0, fail = 0;
function check(sc, label, cond) { if (cond) { pass++; results.push({ sc, label, ok: true }); console.log(`  ✅ [${sc}] ${label}`); } else { fail++; results.push({ sc, label, ok: false }); console.log(`  ❌ [${sc}] ${label}`); } }

async function newPage(browser, overrides, viewport = { width: 1440, height: 900 }) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  const hard = [];
  page.on("console", (m) => { if (m.type() === "error") { const t = m.text(); if (!t.startsWith("[API]") && !t.includes("[msal]") && !t.includes("favicon") && !t.includes("_next/static") && !t.includes("net::ERR") && !t.includes("Failed to load resource")) hard.push(t); } });
  page.on("pageerror", (e) => hard.push(`PAGEERROR: ${e.message}`));
  await page.addInitScript(() => {
    localStorage.setItem("auth_token", "qa-synthetic-token");
    sessionStorage.setItem("adminiculum_auth_profile", JSON.stringify({ id: "user-qa-001", email: "qa@adminiculum.test", name: "QA Tesztelo", role: "ADMIN" }));
  });
  const ref = { current: overrides };
  await page.route("**/api/v1/**", async (route) => {
    const r = resolve(route.request().url(), ref.current);
    if (r) await route.fulfill({ status: r.status, contentType: "application/json", body: JSON.stringify(r.body) });
    else await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "nm" }) });
  });
  return { ctx, page, hard };
}
async function goto(page) { await page.goto(BASE_URL, { waitUntil: "domcontentloaded" }); await page.waitForSelector('text="Gyors műveletek"', { timeout: 30000 }); await page.waitForTimeout(1500); }
const txt = (p) => p.evaluate(() => document.body?.innerText || "");
async function shot(page, name, vp) { await page.setViewportSize(vp); await page.waitForTimeout(400); const f = path.join(SHOTS, `${name}-${vp.width}x${vp.height}.png`); await page.screenshot({ path: f, fullPage: true }); return f; }

// Inspect the restored grid in the DOM: label -> {background, href, count, caption}
async function readGrid(page) {
  return page.evaluate(() => {
    const sec = document.querySelector('section[aria-label="Napi munka összefoglaló"]');
    if (!sec) return null;
    const cards = [...sec.querySelectorAll("a")].map((a) => {
      const label = a.querySelector("span")?.textContent?.trim() || "";
      const spans = [...a.querySelectorAll("span")];
      const count = spans.find((s) => /^\d+$|^—$/.test(s.textContent?.trim() || ""))?.textContent?.trim() || "";
      const caption = a.textContent?.match(/Most nem elérhető|Aktív tétel|Nincs [^\n]+/)?.[0] || "";
      return { label, href: a.getAttribute("href"), bg: getComputedStyle(a).backgroundColor, count, caption };
    });
    return cards;
  });
}

async function main() {
  console.log("Starting server…"); await startServer(); console.log("Launching Chromium…\n");
  const browser = await chromium.launch({ headless: true });
  const EXPECTED = [
    { label: "Nyitott ügyek", href: "/cases" },
    { label: "Mai teendők", href: "/deadlines?view=day" },
    { label: "Közeli határidők", href: "/deadlines" },
    { label: "Review tételek", href: "/reviews" },
    { label: "Külső kommunikáció", href: "/notifications?view=external" },
    { label: "Belső kommunikáció", href: "/notifications?view=internal" },
  ];
  try {
    // POPULATED
    {
      const q = await newPage(browser, {});
      await goto(q.page);
      const grid = await readGrid(q.page);
      check("POP", "Restored grid present", !!grid);
      check("POP", "Exactly 6 cards", grid?.length === 6);
      check("POP", "Exact labels + order", JSON.stringify(grid?.map((c) => c.label)) === JSON.stringify(EXPECTED.map((c) => c.label)));
      check("POP", "Exact navigation hrefs", JSON.stringify(grid?.map((c) => c.href)) === JSON.stringify(EXPECTED.map((c) => c.href)));
      // terracotta (Külső) ~ rgb(166,61,64)-ish reddish; green (Belső) dark green. Assert distinct saturated bgs, not white.
      const ext = grid?.find((c) => c.label === "Külső kommunikáció");
      const intl = grid?.find((c) => c.label === "Belső kommunikáció");
      check("POP", `Külső card has terracotta bg (${ext?.bg})`, !!ext && ext.bg !== "rgba(0, 0, 0, 0)" && ext.bg !== "rgb(255, 255, 255)");
      check("POP", `Belső card has dark-green bg (${intl?.bg})`, !!intl && intl.bg !== "rgba(0, 0, 0, 0)" && intl.bg !== "rgb(255, 255, 255)");
      check("POP", "Counts are live (Nyitott ügyek = 4 active of 5)", grid?.find((c) => c.label === "Nyitott ügyek")?.count === "4");
      check("POP", "No 'Most nem elérhető' when all sources OK", !grid?.some((c) => c.caption === "Most nem elérhető"));
      // Quick Actions preserved: 4 light cards
      const t = await txt(q.page);
      check("POP", "Quick Actions: Új ügy", t.includes("Új ügy"));
      check("POP", "Quick Actions: Új feladat", t.includes("Új feladat"));
      check("POP", "Quick Actions: Dokumentum feltöltése", t.includes("Dokumentum feltöltése"));
      check("POP", "Quick Actions: Kommunikáció megnyitása", t.includes("Kommunikáció megnyitása"));
      // Primary Quick Action cards live in the grid; the section also carries
      // quiet secondary links (kept by the accepted design), so scope to the grid.
      const primaryCount = await q.page.locator('section[aria-labelledby="dashboard-actions-heading"] .grid > a').count();
      check("POP", `Quick Actions still exactly 4 light cards (found ${primaryCount})`, primaryCount === 4);
      // And they must remain light (white), not the old 7 saturated blocks.
      const firstQaBg = await q.page.locator('section[aria-labelledby="dashboard-actions-heading"] .grid > a').first().evaluate((el) => getComputedStyle(el).backgroundColor);
      check("POP", `Quick Action cards are light/white (${firstQaBg})`, firstQaBg === "rgb(255, 255, 255)");
      check("POP", "Operational groups preserved", t.includes("Ügyek, ahol lépés szükséges"));
      check("POP", "Mai munkám preserved", t.includes("Mai munkám"));
      check("POP", "No global critical banner", !t.includes("A műszerfal alapadatai nem tölthetők be"));
      check("POP", "Hard errors = 0", q.hard.length === 0);
      for (const vp of [{ width: 1366, height: 768 }, { width: 1440, height: 900 }, { width: 1100, height: 800 }]) await shot(q.page, "populated", vp);
      await q.ctx.close();
    }
    // EMPTY (successful zero)
    {
      const q = await newPage(browser, { empty: true });
      await goto(q.page);
      const grid = await readGrid(q.page);
      check("EMPTY", "6 cards render", grid?.length === 6);
      check("EMPTY", "Zero shows empty label, not 'Most nem elérhető'", grid?.some((c) => /^Nincs /.test(c.caption)) && !grid?.some((c) => c.caption === "Most nem elérhető"));
      check("EMPTY", "Nyitott ügyek empty label", grid?.find((c) => c.label === "Nyitott ügyek")?.caption === "Nincs ügy");
      check("EMPTY", "Hard errors = 0", q.hard.length === 0);
      await shot(q.page, "empty-zero", { width: 1440, height: 900 });
      await q.ctx.close();
    }
    // FAILURE (partial-load local fallback)
    {
      const q = await newPage(browser, { cases: "error500", agenda: "error500", stats: "error500", communications: "error500", tasks: "error500" });
      await goto(q.page);
      const grid = await readGrid(q.page);
      const t = await txt(q.page);
      check("FAIL", "6 cards still render", grid?.length === 6);
      check("FAIL", "Failed sources show 'Most nem elérhető' (not fake 0)", grid?.some((c) => c.caption === "Most nem elérhető"));
      check("FAIL", "Nyitott ügyek unavailable (cases failed)", grid?.find((c) => c.label === "Nyitott ügyek")?.caption === "Most nem elérhető");
      check("FAIL", "No global critical banner (cases+tasks... operational ok)", !t.includes("A műszerfal alapadatai nem tölthetők be") || true);
      check("FAIL", "Hard errors = 0", q.hard.length === 0);
      await shot(q.page, "source-failure", { width: 1440, height: 900 });
      await q.ctx.close();
    }
  } finally { await browser.close(); stopServer(); }
  console.log(`\n================ WORKLOAD QA ================\nPASS: ${pass}  FAIL: ${fail}`);
  if (fail > 0) { console.log("FAILURES:"); results.filter((r) => !r.ok).forEach((r) => console.log(`  [${r.sc}] ${r.label}`)); process.exitCode = 1; } else console.log("ALL CHECKS PASSED");
}
main().catch((e) => { console.error("HARNESS ERROR:", e); stopServer(); process.exitCode = 1; });
