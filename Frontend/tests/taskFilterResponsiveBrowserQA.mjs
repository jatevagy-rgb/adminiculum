/**
 * TASK FILTER RESPONSIVE BROWSER QA (PR #488 continuation)
 *
 * Renders the ACTUAL /tasks page in headless Chromium with a synthetic,
 * route-intercepted backend and a seeded local-dev auth session. Measures the
 * five filter controls (search, case, status, priority, attention) at
 * 390x844, 768x1000 and 1440x1000 and verifies that every control fits inside
 * the viewport and the filter-section content boundary.
 *
 * Also exercises every control and asserts observable state changes so a PASS
 * cannot be produced from class names alone.
 *
 * QA-only synthetic fixtures; no real API, no live auth, no writes.
 */

import assert from "node:assert/strict";
import { chromium } from "playwright";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.TASK_FILTER_QA_PORT || 3141);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const SHOTS = path.join(os.tmpdir(), "task-filter-responsive-qa");
fs.mkdirSync(SHOTS, { recursive: true });

const VIEWPORTS = [
  { width: 390, height: 844, name: "390" },
  { width: 768, height: 1000, name: "768" },
  { width: 1024, height: 1000, name: "1024" },
  { width: 1280, height: 1000, name: "1280" },
  { width: 1440, height: 1000, name: "1440" },
];

const PROFILE = {
  id: "qa-user",
  email: "qa-user@adminiculum.test",
  name: "QA Felhasználó",
  role: "ADMIN",
};

const CASES = [
  { id: "case-a", caseNumber: "2026-0001", clientName: "Alfa Tanácsadó Kft.", clientId: "client-a", matterType: "CONTRACT", title: "Alfa ügy" },
  { id: "case-b", caseNumber: "2026-0002", clientName: "Hosszú Névvel Rendelkező Nemzetközi Befektetési Zrt.", clientId: "client-b", matterType: "LITIGATION", title: "Béta ügy" },
];

function task(overrides) {
  return {
    id: "qa-task-1",
    title: "Szerződés ellenőrzése",
    description: "Első verzió áttekintése",
    status: "IN_PROGRESS",
    priority: "HIGH",
    attentionCategory: "DETAILED_REVIEW",
    estimatedMinutes: 90,
    dueDate: "2026-10-20T00:00:00.000Z",
    assignedToId: "qa-user",
    case: { id: "case-a", caseNumber: "2026-0001", clientName: "Alfa Tanácsadó Kft.", matterType: "CONTRACT", clientId: "client-a", clientColorKey: null },
    submissionStatus: "SUBMITTED",
    currentSubmittedRevisionId: "rev-1",
    nextActionCode: "OPEN_REVIEW",
    assignedReviewer: { id: "qa-user", displayName: "QA Felhasználó", role: "ADMIN" },
    ...overrides,
  };
}

const TASKS = [
  task({ id: "qa-task-1" }),
  task({
    id: "qa-task-2",
    title: "Fellebbezés előkészítése",
    description: null,
    status: "PENDING",
    priority: "LOW",
    attentionCategory: null,
    estimatedMinutes: null,
    dueDate: null,
    submissionStatus: null,
    currentSubmittedRevisionId: null,
    nextActionCode: "START_TASK",
    assignedReviewer: null,
    case: { id: "case-b", caseNumber: "2026-0002", clientName: "Hosszú Névvel Rendelkező Nemzetközi Befektetési Zrt.", matterType: "LITIGATION", clientId: "client-b", clientColorKey: null },
  }),
  task({
    id: "qa-task-3",
    title: "Ügyfél tájékoztató levél",
    status: "DONE",
    priority: "URGENT",
    attentionCategory: "APPROVAL",
    dueDate: "2026-09-01T00:00:00.000Z",
    submissionStatus: "RETURNED",
    currentSubmittedRevisionId: null,
    nextActionCode: "CONTINUE_RETURNED_WORK",
    assignedReviewer: null,
  }),
];

const CONTROLS = [
  { key: "search", selector: 'input[aria-label="Feladatok keresése"]' },
  { key: "case", selector: 'select[aria-label="Ügy szűrő"]' },
  { key: "status", selector: 'select[aria-label="Feladatállapot szűrő"]' },
  { key: "priority", selector: 'select[aria-label="Prioritás szűrő"]' },
  { key: "attention", selector: 'select[aria-label="Figyelmi kategória szűrő"]' },
];

let server;

function startServer() {
  return new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      PORT: String(PORT),
      NEXT_PUBLIC_ENABLE_LOCAL_DEV_AUTH: "true",
      NEXT_PUBLIC_WORKFORCE_ENTRA_CLIENT_ID: "00000000-0000-0000-0000-000000000000",
      NEXT_PUBLIC_WORKFORCE_ENTRA_TENANT_ID: "00000000-0000-0000-0000-000000000000",
      NEXT_PUBLIC_BACKEND_BASE_URL: "",
    };
    server = spawn(
      process.execPath,
      ["node_modules/next/dist/bin/next", "dev", "-p", String(PORT), "--hostname", "127.0.0.1"],
      { cwd: ROOT, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
    );
    let ready = false;
    const logFile = fs.createWriteStream(path.join(SHOTS, "next-dev.log"), { flags: "a" });
    const onOutput = (chunk) => {
      const text = chunk.toString();
      logFile.write(text);
      if (!ready && /Ready in|- Local:|started server/i.test(text)) {
        ready = true;
        setTimeout(resolve, 1200);
      }
    };
    server.stdout?.on("data", onOutput);
    server.stderr?.on("data", onOutput);
    server.on("error", reject);
    server.on("exit", (code) => {
      if (!ready) reject(new Error(`next dev exited before ready with code: ${code}`));
    });
    setTimeout(() => {
      if (!ready) reject(new Error("Timed out waiting for next dev server"));
    }, 90000);
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

// Compile the route server-side before the browser arrives; cold dev compiles are
// what make the first in-browser navigation flaky.
async function warmRoute() {
  let lastError = "no response";
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(`${BASE_URL}/tasks`, { redirect: "manual" });
      if (response.status === 200) {
        await response.text().catch(() => {});
        return;
      }
      lastError = `status ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error(`route warmup failed: ${lastError}`);
}

function resolveResponse(rawUrl) {
  const url = new URL(rawUrl);
  const pathname = url.pathname.replace(/^\/api\/v1/, "");
  if (pathname === "/auth/me") return { status: 200, body: PROFILE };
  if (pathname === "/tasks") return { status: 200, body: TASKS };
  if (pathname === "/cases") return { status: 200, body: { data: CASES, total: CASES.length, page: 1, limit: 200 } };
  if (pathname === "/users") return { status: 200, body: { data: [] } };
  if (/^\/cases\/[^/]+\/responsible-candidates$/.test(pathname)) return { status: 200, body: { items: [] } };
  return { status: 200, body: {} };
}

async function createQaPage(browser, viewport) {
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
  const page = await context.newPage();
  page.setDefaultTimeout(120000);
  page.setDefaultNavigationTimeout(150000);
  const hardErrors = [];
  page.on("pageerror", (err) => hardErrors.push(`PAGEERROR: ${err.message}`));
  page.on("console", (msg) => {
    if (msg.type() === "error" && !msg.text().includes("[API]") && !msg.text().includes("Failed to load resource")) {
      hardErrors.push(`CONSOLE_ERROR: ${msg.text()}`);
    }
  });
  await page.addInitScript((profile) => {
    try {
      localStorage.setItem("adminiculum:auth_token:workforce", "qa-workforce-token");
      sessionStorage.setItem("adminiculum_auth_profile", JSON.stringify(profile));
    } catch {}
  }, PROFILE);
  await page.route("**/api/v1/**", async (route) => {
    const res = resolveResponse(route.request().url());
    await route.fulfill({ status: res.status, contentType: "application/json", body: JSON.stringify(res.body) });
  });
  return { context, page, hardErrors };
}

async function ensureTasksReady(page, label) {
  await page.goto(`${BASE_URL}/tasks`, { waitUntil: "domcontentloaded" }).catch(() => {});
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      await page.waitForSelector(CONTROLS[0].selector, { timeout: attempt === 0 ? 60000 : 30000 });
      return;
    } catch {
      await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
    }
  }
  await page.screenshot({ path: path.join(SHOTS, `tasks-${label}-FAILED.png`), fullPage: true }).catch(() => {});
  const bodyText = await page.evaluate(() => document.body.innerText).catch(() => "<no body>");
  throw new Error(`[${label}] controls not found. body text: ${JSON.stringify(bodyText)}`);
}

async function measure(page) {
  return page.evaluate((controls) => {
    const rect = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { left: Math.round(r.left * 10) / 10, right: Math.round(r.right * 10) / 10, width: Math.round(r.width * 10) / 10 };
    };
    const out = {};
    for (const control of controls) out[control.key] = rect(document.querySelector(control.selector));
    const grid = document.querySelector(controls[0].selector)?.parentElement || null;
    const section = grid?.parentElement || null;
    const main = section?.parentElement || null;
    return {
      innerWidth: window.innerWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      gridTemplateColumns: grid ? getComputedStyle(grid).gridTemplateColumns : null,
      gridRect: rect(grid),
      sectionRect: rect(section),
      sectionPaddingRight: section ? parseFloat(getComputedStyle(section).paddingRight) : null,
      mainRect: rect(main),
      controls: out,
    };
  }, CONTROLS);
}

function evaluateFits(measurement) {
  const issues = [];
  const limit = measurement.innerWidth + 0.5;
  const gridRight = measurement.gridRect ? measurement.gridRect.right + 0.5 : limit;
  for (const [key, r] of Object.entries(measurement.controls)) {
    if (!r) {
      issues.push(`${key}: missing`);
      continue;
    }
    if (r.left < -0.5) issues.push(`${key}: left ${r.left} < 0`);
    if (r.right > limit) issues.push(`${key}: right ${r.right} > innerWidth ${measurement.innerWidth}`);
    if (r.right > gridRight) issues.push(`${key}: right ${r.right} > grid content right ${gridRight}`);
  }
  return issues;
}

async function runViewport(browser, viewport) {
  const { context, page, hardErrors } = await createQaPage(browser, viewport);
  await ensureTasksReady(page, viewport.name);
  await page.waitForFunction(() => document.body.innerText.includes("tétel"), null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(600);

  const measurement = await measure(page);
  const issues = evaluateFits(measurement);

  // --- interactions (each control must produce an observable state change) ---
  const interactions = [];
  const rowCount = () => page.locator("table tbody tr").count();
  const expectRows = async (label, expected) => {
    const actual = await rowCount();
    assert.equal(actual, expected, `${label}: expected ${expected} rows, got ${actual}`);
    return actual;
  };

  const search = page.locator(CONTROLS[0].selector);
  await expectRows("baseline (default open view)", 2);
  await search.fill("alfa");
  assert.equal(await search.inputValue(), "alfa", "search value did not update");
  interactions.push({ control: "search", value: "alfa", rows: await expectRows("search=alfa", 1) });
  await search.fill("");
  await expectRows("search cleared", 2);

  const caseSelect = page.locator(CONTROLS[1].selector);
  await caseSelect.selectOption("case-a");
  assert.equal(await caseSelect.inputValue(), "case-a", "case filter value did not update");
  interactions.push({ control: "case", value: "case-a", rows: await expectRows("case=case-a", 1) });
  await caseSelect.selectOption("all");

  const statusSelect = page.locator(CONTROLS[2].selector);
  await statusSelect.selectOption("all");
  interactions.push({ control: "status", value: "all", rows: await expectRows("status=all", 3) });
  await statusSelect.selectOption("DONE");
  interactions.push({ control: "status", value: "DONE", rows: await expectRows("status=DONE", 1) });
  await statusSelect.selectOption("all");

  const prioritySelect = page.locator(CONTROLS[3].selector);
  await prioritySelect.selectOption("URGENT");
  interactions.push({ control: "priority", value: "URGENT", rows: await expectRows("priority=URGENT", 1) });
  await prioritySelect.selectOption("all");

  const attentionSelect = page.locator(CONTROLS[4].selector);
  await attentionSelect.selectOption("APPROVAL");
  interactions.push({ control: "attention", value: "APPROVAL", rows: await expectRows("attention=APPROVAL", 1) });
  await attentionSelect.selectOption("all");

  const overdueButton = page.getByRole("button", { name: /Lejárt/ }).first();
  const before = await overdueButton.getAttribute("aria-pressed");
  await overdueButton.click();
  const after = await overdueButton.getAttribute("aria-pressed");
  assert.notEqual(before, after, "quick filter aria-pressed did not change");
  interactions.push({ control: "quickFilter", ariaPressedBefore: before, ariaPressedAfter: after });

  // Re-measure after interactions to ensure nothing moved out of bounds.
  const afterMeasurement = await measure(page);
  const afterIssues = evaluateFits(afterMeasurement);

  await page.screenshot({ path: path.join(SHOTS, `tasks-${viewport.name}.png`), fullPage: true });
  assert.deepEqual(hardErrors, [], `page errors at ${viewport.name}: ${hardErrors.join(" | ")}`);
  await context.close();

  return { viewport: viewport.name, measurement, issues, afterIssues, interactions };
}

try {
  await startServer();
  await warmRoute();
  const browser = await chromium.launch({ headless: true });
  const results = [];
  let failed = false;
  try {
    // Warmup: pay the cold dev-compile cost once so per-viewport runs are stable.
    {
      const warm = await createQaPage(browser, VIEWPORTS[0]);
      await ensureTasksReady(warm.page, "warmup");
      await warm.context.close();
    }
    for (const viewport of VIEWPORTS) {
      const result = await runViewport(browser, viewport);
      results.push(result);
      const all = [...result.issues, ...result.afterIssues];
      if (all.length) failed = true;
    }
  } finally {
    await browser.close().catch(() => {});
  }

  console.log(JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2));
  fs.writeFileSync(path.join(SHOTS, "result.json"), JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2));

  for (const result of results) {
    const lines = [
      `[${result.viewport}] innerWidth=${result.measurement.innerWidth} scrollWidth=${result.measurement.documentScrollWidth}`,
      `  gridTemplateColumns=${result.measurement.gridTemplateColumns}`,
      `  gridRect=${JSON.stringify(result.measurement.gridRect)} sectionRect=${JSON.stringify(result.measurement.sectionRect)} mainRect=${JSON.stringify(result.measurement.mainRect)}`,
      ...Object.entries(result.measurement.controls).map(([k, r]) => `  ${k}: ${JSON.stringify(r)}`),
      `  fit-issues=${JSON.stringify([...result.issues, ...result.afterIssues])}`,
    ];
    console.log(lines.join("\n"));
  }

  if (failed) {
    console.error("TASK_FILTER_RESPONSIVE_QA_FAILED: one or more controls do not fit.");
    process.exitCode = 1;
  } else {
    console.log("TASK_FILTER_RESPONSIVE_QA_PASS");
  }
} catch (error) {
  console.error(`TASK_FILTER_RESPONSIVE_QA_ERROR: ${error instanceof Error ? error.stack : String(error)}`);
  process.exitCode = 1;
} finally {
  stopServer();
}
