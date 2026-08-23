/**
 * Review workspace (/reviews) state hardening — Playwright browser QA.
 *
 * Renders the real production Next.js /reviews page and intercepts
 * /api/v1/tasks/review-queue with synthetic DTOs to prove the four states are
 * visually distinct: loading (skeleton, no empty claim), successful empty,
 * populated and unavailable (failed load never says "no review items", and no
 * raw error payload/endpoint is shown). Captures 1440×900 and 1100×800 and
 * checks horizontal overflow + console exceptions.
 *
 * Run: node tests/reviewsStateBrowserQA.mjs
 */
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = path.resolve(__dirname, "..");
const PORT = 3098;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const SHOTS = path.join(FRONTEND_DIR, "qa-screenshots-reviews");
const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 1100, height: 800 },
];

const AUTH_ME = { id: "user-qa-001", email: "qa@adminiculum.test", name: "QA Tesztelo", role: "ADMIN" };
const RAW_ERROR = {
  error: "Internal error",
  message: "PrismaClientKnownRequestError at reviewQueueService",
  endpoint: "/api/v1/tasks/review-queue",
  stack: "at Object.fetchApi (/app/dist/lib/api.js:42)",
};

const makeQueue = () =>
  Array.from({ length: 3 }, (_, i) => ({
    id: `task-${i + 1}`,
    source: "TASK_SUBMISSION",
    taskId: `task-${i + 1}`,
    submissionId: `submission-${i + 1}`,
    revisionNumber: 1,
    title: `Szintetikus leadas ${i + 1}`,
    status: "SUBMITTED",
    taskStatus: "IN_REVIEW",
    priority: "MEDIUM",
    dueDate: new Date(Date.now() + (i + 1) * 86400000).toISOString(),
    submittedAt: new Date(Date.now() - (i + 1) * 3600000).toISOString(),
    submittedBy: { id: "worker-1", displayName: "Munkatars", role: "LAWYER" },
    requestedAttention: ["QUICK_SCAN", "APPROVAL", "DETAILED_REVIEW"][i],
    workSummaryPreview: "Szintetikus munkaosszefoglalo.",
    submissionDocumentCount: 1,
    linkedTimeMinutes: 60,
    nextActionCode: "REVIEW_SUBMISSION",
    case: {
      id: `case-${i + 1}`,
      caseNumber: `QA-2026-${100 + i}`,
      title: `Szintetikus ugy ${i + 1}`,
      clientId: "client-a-001",
      clientName: "Szintetikus Kft.",
      clientColorKey: "jade",
      matterType: "CONTRACT",
    },
  }));

let server = null;
function startServer() {
  fs.mkdirSync(SHOTS, { recursive: true });
  return new Promise((res, rej) => {
    const bin = process.platform === "win32" ? "npx.cmd" : "npx";
    const p = spawn(bin, ["next", "start", "-p", String(PORT)], { cwd: FRONTEND_DIR, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, PORT: String(PORT) }, shell: true, detached: process.platform !== "win32" });
    server = p;
    let up = false;
    const on = (c) => { const t = c.toString(); if (!up && (t.includes("Ready") || t.includes(`:${PORT}`))) { up = true; setTimeout(res, 1500); } };
    p.stdout?.on("data", on); p.stderr?.on("data", on); p.on("error", rej);
    p.on("exit", (c) => { if (!up) rej(new Error(`server exited ${c}`)); });
    setTimeout(() => { if (!up) { up = true; res(); } }, 30000);
  });
}
function stopServer() {
  if (!server) return;
  try {
    if (process.platform === "win32") spawn("taskkill", ["/pid", String(server.pid), "/f", "/t"], { shell: true });
    else process.kill(-server.pid, "SIGTERM");
  } catch {}
  server = null;
}

let pass = 0, fail = 0;
function check(sc, label, cond) { if (cond) { pass++; console.log(`  PASS [${sc}] ${label}`); } else { fail++; console.log(`  FAIL [${sc}] ${label}`); } }

async function newPage(browser, mode, viewport = VIEWPORTS[0]) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  const hard = [];
  page.on("console", (m) => { if (m.type() === "error") { const t = m.text(); if (!t.startsWith("[API]") && !t.includes("[msal]") && !t.includes("favicon") && !t.includes("_next/static") && !t.includes("net::ERR") && !t.includes("Failed to load resource")) hard.push(t); } });
  page.on("pageerror", (e) => hard.push(`PAGEERROR: ${e.message}`));
  await page.addInitScript(() => {
    localStorage.setItem("auth_token", "qa-synthetic-token");
    sessionStorage.setItem("adminiculum_auth_profile", JSON.stringify({ id: "user-qa-001", email: "qa@adminiculum.test", name: "QA Tesztelo", role: "ADMIN" }));
  });
  await page.route("**/api/v1/**", async (route) => {
    const url = route.request().url();
    if (url.includes("/auth/me")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(AUTH_ME) });
    if (url.includes("/tasks/review-queue")) {
      if (mode === "slow") await new Promise((r) => setTimeout(r, 4000));
      if (mode === "error") return route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify(RAW_ERROR) });
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mode === "empty" ? [] : makeQueue()) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: [] }) });
  });
  return { ctx, page, hard };
}

const txt = (p) => p.evaluate(() => document.body?.innerText || "");
const overflow = (p) => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
async function shot(page, name, vp) { await page.setViewportSize(vp); await page.waitForTimeout(400); const f = path.join(SHOTS, `${name}-${vp.width}x${vp.height}.png`); await page.screenshot({ path: f, fullPage: true }); return f; }

async function main() {
  console.log("Starting server…");
  await startServer();
  const browser = await chromium.launch({ headless: true });
  try {
    // LOADING (slow response)
    {
      const q = await newPage(browser, "slow");
      await q.page.goto(`${BASE_URL}/reviews`, { waitUntil: "domcontentloaded" });
      await q.page.waitForSelector('[aria-busy="true"]', { timeout: 30000 });
      const t = await txt(q.page);
      check("LOADING", "Skeleton with loading copy", t.includes("Review tételek betöltése"));
      check("LOADING", "No empty claim while loading", !t.includes("Nincs review-ra váró Leadás."));
      check("LOADING", "No error claim while loading", !t.includes("nem érhetők el"));
      check("LOADING", "Counts are withheld (—)", t.includes("— Leadás") && t.includes("— tétel"));
      const skeletonBox = await q.page.locator('[aria-busy="true"]').boundingBox();
      for (const vp of VIEWPORTS) await shot(q.page, "loading", vp);
      await q.page.waitForSelector("text=Szintetikus leadas 1", { timeout: 30000 });
      const listBox = await q.page.locator('section[aria-labelledby="review-queue-title"] .space-y-2').first().boundingBox();
      check("LOADING", `Skeleton height close to loaded list (${Math.round(skeletonBox?.height || 0)} → ${Math.round(listBox?.height || 0)})`, Math.abs((skeletonBox?.height || 0) - (listBox?.height || 0)) < 140);
      check("LOADING", "Hard console errors = 0", q.hard.length === 0);
      await q.ctx.close();
    }
    // POPULATED
    {
      const q = await newPage(browser, "populated");
      await q.page.goto(`${BASE_URL}/reviews`, { waitUntil: "domcontentloaded" });
      await q.page.waitForSelector("text=Szintetikus leadas 1", { timeout: 30000 });
      const t = await txt(q.page);
      check("POPULATED", "All three items render", t.includes("Szintetikus leadas 1") && t.includes("Szintetikus leadas 3"));
      check("POPULATED", "Counts shown", t.includes("3 Leadás") && t.includes("3 tétel"));
      check("POPULATED", "No empty/error state", !t.includes("Nincs review-ra váró Leadás.") && !t.includes("nem érhetők el"));
      for (const vp of VIEWPORTS) { const f = await shot(q.page, "populated", vp); check("POPULATED", `No horizontal overflow @${vp.width} (${f})`, (await overflow(q.page)) <= 1); }
      check("POPULATED", "Hard console errors = 0", q.hard.length === 0);
      await q.ctx.close();
    }
    // EMPTY (successful zero)
    {
      const q = await newPage(browser, "empty");
      await q.page.goto(`${BASE_URL}/reviews`, { waitUntil: "domcontentloaded" });
      await q.page.waitForSelector("text=Nincs review-ra váró Leadás.", { timeout: 30000 });
      const t = await txt(q.page);
      check("EMPTY", "Calm empty state", t.includes("Nincs review-ra váró Leadás."));
      check("EMPTY", "Not presented as a failure", !t.includes("nem érhetők el") && !t.includes("sikertelen"));
      check("EMPTY", "Zero counts shown truthfully", t.includes("0 Leadás") && t.includes("0 tétel"));
      for (const vp of VIEWPORTS) { const f = await shot(q.page, "empty", vp); check("EMPTY", `No horizontal overflow @${vp.width} (${f})`, (await overflow(q.page)) <= 1); }
      check("EMPTY", "Hard console errors = 0", q.hard.length === 0);
      await q.ctx.close();
    }
    // UNAVAILABLE (failed load)
    {
      const q = await newPage(browser, "error");
      await q.page.goto(`${BASE_URL}/reviews`, { waitUntil: "domcontentloaded" });
      await q.page.waitForSelector("text=A review adatok most nem érhetők el.", { timeout: 30000 });
      await q.page.waitForTimeout(300);
      const t = await txt(q.page);
      check("FAILED", "Unavailable state shown", t.includes("A review adatok most nem érhetők el."));
      check("FAILED", "Never claims zero review items", !t.includes("Nincs review-ra váró Leadás."));
      check("FAILED", "Retry offered", await q.page.getByRole("button", { name: "Újratöltés" }).isVisible());
      check("FAILED", "Counts withheld, not 0", t.includes("— Leadás") && t.includes("— tétel") && !t.includes("0 Leadás"));
      for (const leak of ["PrismaClient", "fetchApi", "/api/v1", "Internal error", "dist/lib/api.js", "500"]) check("FAILED", `No raw error leak: ${leak}`, !t.includes(leak));
      for (const vp of VIEWPORTS) { const f = await shot(q.page, "failed", vp); check("FAILED", `No horizontal overflow @${vp.width} (${f})`, (await overflow(q.page)) <= 1); }
      check("FAILED", "Hard console errors = 0", q.hard.length === 0);
      await q.ctx.close();
    }
  } finally {
    await browser.close();
    stopServer();
  }
  console.log(`\n${pass} passed, ${fail} failed. Screenshots: ${SHOTS}`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((error) => { console.error(error); stopServer(); process.exitCode = 1; });
