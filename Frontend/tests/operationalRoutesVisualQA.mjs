import { chromium } from "playwright";
import { spawn, spawnSync, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.OPERATIONAL_QA_PORT || 3196);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const EVIDENCE_ROOT = "/home/ubuntu/ui-evidence/phase2a";
const SHA = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
const ROUTE_HEADINGS = {
  workload: ["Munkaterhelés", "Munkaszervezési központ"],
  notifications: ["Értesítések"],
  reviews: ["Review"],
  tasks: ["Feladatok"],
  deadlines: ["Határidők"],
  "time-entries": ["Munkaórák"],
};
const ROUTES = Object.keys(ROUTE_HEADINGS);
const ROUTE_ALIASES = {
  workload: "/workload",
  notifications: "/notifications",
  reviews: "/reviews",
  tasks: "/tasks",
  deadlines: "/deadlines",
  "time-entries": "/time-entries",
};

const args = process.argv.slice(2);
const labelIndex = args.indexOf("--label");
const routesIndex = args.indexOf("--routes");
const label = labelIndex >= 0 ? args[labelIndex + 1] : "after";
const selectedRoutes = routesIndex >= 0 ? args[routesIndex + 1].split(",").filter((route) => ROUTES.includes(route)) : ROUTES;
if (!["before", "after"].includes(label)) throw new Error("--label must be before or after");
if (!selectedRoutes.length) throw new Error("No valid routes selected");

const AUTH_ME = { id: "qa-user-1", email: "qa@example.invalid", name: "QA Ügyvéd", role: "LAWYER" };
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
        setTimeout(resolve, 500);
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
    if (process.platform === "win32" && server.pid) spawnSync("taskkill", ["/F", "/T", "/PID", String(server.pid)], { stdio: "ignore" });
    else server.kill("SIGKILL");
  } catch {}
  server = undefined;
}

const iso = (day, hour = 10) => new Date(Date.UTC(2026, 0, day, hour)).toISOString();
const timeIso = (day, hour = 10) => new Date(Date.UTC(2026, 8, day, hour)).toISOString();
const cases = [
  { id: "qa-case-1", caseNumber: "C-001", title: "Peres ügy", status: "OPEN", deadline: iso(20), matterId: "matter-1", responsibleLawyerId: "qa-user-1", openTaskCount: 2, overdueTaskCount: 1, dueSoonTaskCount: 1 },
  { id: "qa-case-2", caseNumber: "C-002", title: "Egyéb ügy", status: "OPEN", deadline: null, matterId: null, responsibleLawyerId: null, openTaskCount: 1, overdueTaskCount: 0, dueSoonTaskCount: 0 },
];
const tasks = [
  { id: "qa-task-1", title: "Lejárt feladat", description: null, status: "PENDING", priority: "HIGH", dueDate: iso(1), matterId: "matter-1", assignedToId: "qa-user-1", case: { id: "qa-case-1", caseNumber: "C-001", clientName: "QA Kft.", matterType: "LITIGATION", title: "Peres ügy", clientId: "client-1", clientColorKey: "BLUE" }, activeSubmissionId: null, currentSubmittedRevisionId: null, approvedRevisionId: null, nextActionCode: "START_TASK" },
  { id: "qa-task-2", title: "Beküldött feladat", description: null, status: "IN_REVIEW", priority: "NORMAL", dueDate: iso(25), matterId: null, assignedToId: "qa-user-1", case: { id: "qa-case-2", caseNumber: "C-002", clientName: "Másik Kft.", matterType: "OTHER", title: "Egyéb ügy", clientId: "client-2", clientColorKey: null }, activeSubmissionId: "submission-1", currentSubmittedRevisionId: "submission-1", approvedRevisionId: null, nextActionCode: "REVIEW_SUBMISSION" },
  { id: "qa-task-3", title: "Lezárt feladat", description: null, status: "DONE", priority: "LOW", dueDate: null, matterId: null, assignedToId: "qa-user-1", case: { id: "qa-case-1", caseNumber: "C-001", clientName: "QA Kft.", matterType: "LITIGATION", title: "Peres ügy", clientId: "client-1", clientColorKey: "BLUE" }, activeSubmissionId: null, currentSubmittedRevisionId: null, approvedRevisionId: null, nextActionCode: null },
];
const notifications = [
  { id: "qa-notification-1", type: "TASK_OVERDUE", title: "Lejárt feladat", message: "A feladat határideje lejárt.", link: "/tasks?taskId=qa-task-1", isRead: false, userId: AUTH_ME.id, createdAt: iso(2), clientColorKey: "BLUE" },
  { id: "qa-notification-2", type: "SYSTEM", title: "Rendszerüzenet", message: "A rendszer frissült.", link: null, isRead: true, userId: AUTH_ME.id, createdAt: iso(1), clientColorKey: null },
  { id: "qa-notification-3", type: "TASK_ASSIGNED", title: "Új feladat", message: "Új feladat érkezett.", link: "/tasks?taskId=qa-task-2", isRead: false, userId: AUTH_ME.id, createdAt: iso(1, 9), clientColorKey: null },
];
const reviews = [
  { id: "qa-review-1", source: "TASK_SUBMISSION", taskId: "qa-task-2", submissionId: "submission-1", title: "Beküldött revision", requestedAttention: "CRITICAL", submittedAt: iso(2), submissionDocumentCount: 1, linkedTimeMinutes: 30, submittedBy: { displayName: "QA Ügyvéd" }, case: { caseNumber: "C-002", clientName: "Másik Kft.", matterType: "OTHER", clientColorKey: null } },
  { id: "qa-review-2", source: "LEGACY_TASK", taskId: "qa-task-1", submissionId: null, title: "Korábbi review", requestedAttention: null, submittedAt: iso(1), submissionDocumentCount: 0, linkedTimeMinutes: 0, submittedBy: null, case: { caseNumber: "C-001", clientName: "QA Kft.", matterType: "LITIGATION", clientColorKey: "BLUE" } },
];
const deadlines = [
  { id: "qa-deadline-1", title: "Lejárt határidő", dueAt: iso(1), urgency: "OVERDUE", status: "OPEN", sourceType: "TASK", caseId: "qa-case-1", href: "/tasks?taskId=qa-task-1", safeDescription: "Teendő", source: { displayName: "Peres ügy" }, responsibility: { assignee: { displayName: "QA Ügyvéd" }, responsibleLawyer: null }, capabilities: { canComplete: true, canReschedule: true } },
  { id: "qa-deadline-2", title: "Mai határidő", dueAt: iso(2), urgency: "TODAY", status: "OPEN", sourceType: "CASE_DEADLINE", caseId: "qa-case-1", href: null, safeDescription: null, source: { displayName: "Peres ügy" }, responsibility: { assignee: null, responsibleLawyer: { displayName: "QA Ügyvéd" } }, capabilities: { canComplete: false, canReschedule: true } },
  { id: "qa-deadline-3", title: "Heti határidő", dueAt: iso(5), urgency: "THIS_WEEK", status: "OPEN", sourceType: "TASK", caseId: "qa-case-2", href: "/tasks?taskId=qa-task-2", safeDescription: null, source: { displayName: "Egyéb ügy" }, responsibility: { assignee: null, responsibleLawyer: null }, capabilities: { canComplete: true, canReschedule: false } },
];
const timeEntries = [
  { id: "qa-entry-1", workType: "LEGAL_RESEARCH", description: "Jogi kutatás", minutes: 45, workDate: timeIso(1), billable: true, userId: AUTH_ME.id, departmentId: null, createdAt: timeIso(1), updatedAt: timeIso(1), user: { id: "qa-user-1", name: "QA Ügyvéd" }, matter: { id: "matter-1", title: "Peres ügy", clientId: "client-1", client: { id: "client-1", name: "QA Kft." } }, case: { id: "qa-case-1", caseNumber: "C-001", title: "Peres ügy", clientId: "client-1", clientName: "QA Kft." } },
  { id: "qa-entry-2", workType: "REVIEW", description: "Dokumentum ellenőrzés", minutes: 30, workDate: timeIso(2), billable: false, userId: AUTH_ME.id, departmentId: null, createdAt: timeIso(2), updatedAt: timeIso(2), user: { id: "qa-user-1", name: "QA Ügyvéd" }, matter: { id: "matter-1", title: "Peres ügy", clientId: "client-1", client: { id: "client-1", name: "QA Kft." } }, case: { id: "qa-case-1", caseNumber: "C-001", title: "Peres ügy", clientId: "client-1", clientName: "QA Kft." } },
  { id: "qa-entry-3", workType: "CLIENT_CALL", description: "Ügyfélhívás", minutes: 20, workDate: timeIso(3), billable: true, userId: AUTH_ME.id, departmentId: null, createdAt: timeIso(3), updatedAt: timeIso(3), user: { id: "qa-user-1", name: "QA Ügyvéd" }, matter: { id: "matter-2", title: "Egyéb ügy", clientId: "client-2", client: { id: "client-2", name: "Másik Kft." } }, case: { id: "qa-case-2", caseNumber: "C-002", title: "Egyéb ügy", clientId: "client-2", clientName: "Másik Kft." } },
];

function workloadFixture() {
  return {
    scope: "MY_WORK", generatedAt: iso(2), summary: { caseCount: 2, openTaskCount: 3, overdueTaskCount: 1, dueSoonTaskCount: 1, recordedMinutes: 95, activeTimerSupported: false },
    people: [{ user: AUTH_ME, openTaskCount: 2, overdueTaskCount: 1, dueSoonTaskCount: 1, reviewTaskCount: 1, blockedTaskCount: 0, recordedMinutes: 95, caseCount: 2 }],
    cases, availability: { teamScope: true, caseTime: true, activeTimer: false, passiveTracking: false },
  };
}

function bodyFor(url) {
  if (url.includes("/auth/me")) return AUTH_ME;
  if (url.includes("/workload")) return workloadFixture();
  if (url.includes("/notifications/unread-count")) return { unreadCount: notifications.filter((item) => !item.isRead).length };
  if (url.includes("/notifications")) return { items: notifications, notifications, total: notifications.length, pagination: { total: notifications.length, limit: 50, offset: 0 } };
  if (url.includes("/tasks/review-queue")) return reviews;
  if (url.endsWith("/tasks") || url.includes("/tasks?")) return tasks;
  if (url.includes("/agenda")) {
    return {
      generatedAt: iso(2), timezone: "Europe/Budapest", range: { from: "2026-01-01", to: "2026-01-31" }, scope: "MY_WORK",
      summary: { overdue: 1, today: 1, tomorrow: 0, thisWeek: 1, later: 0, completedRecently: 0 },
      days: [{ date: "2026-01-01", items: [deadlines[0]] }, { date: "2026-01-02", items: [deadlines[1]] }, { date: "2026-01-05", items: [deadlines[2]] }],
      pagination: { limit: 100, offset: 0, hasMore: false },
      availability: { taskDueDates: true, caseDeadlines: true, hearings: false, reminders: false, teamScope: true, externalCalendar: false },
    };
  }
  if (url.includes("/time-entries")) return timeEntries;
  if (url.includes("/clients")) return { data: [{ id: "client-1", name: "QA Kft." }, { id: "client-2", name: "Másik Kft." }] };
  if (url.includes("/cases")) return { data: cases.map(({ id, caseNumber, title }) => ({ id, caseNumber, title, clientName: "QA Kft.", matterType: "LITIGATION" })), total: cases.length };
  if (url.includes("/users")) return { data: [AUTH_ME] };
  return undefined;
}

function createResponder(unmatched) {
  return async (route) => {
    const url = route.request().url();
    const body = bodyFor(url);
    if (body === undefined) {
      unmatched.add(`${route.request().method()} ${url}`);
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  };
}

function check(condition, message, counts) {
  if (condition) {
    counts.pass += 1;
    console.log(`PASS ${message}`);
  } else {
    counts.fail += 1;
    console.log(`FAIL ${message}`);
  }
}

async function runRoute(browser, routeName) {
  const unmatched = new Set();
  const counts = { pass: 0, fail: 0 };
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.addInitScript(({ profile }) => {
    localStorage.setItem("auth_token", "qa-operational-token");
    sessionStorage.setItem("adminiculum_auth_profile", JSON.stringify(profile));
  }, { profile: AUTH_ME });
  await page.route("**/api/v1/**", createResponder(unmatched));
  await page.goto(`${BASE_URL}${ROUTE_ALIASES[routeName]}`, { waitUntil: "networkidle" });
  const heading = page.getByRole("heading", { name: new RegExp(ROUTE_HEADINGS[routeName].join("|")) }).first();
  await heading.waitFor({ state: "visible", timeout: 15000 });
  check(await heading.isVisible(), `${routeName}: main heading visible`, counts);
  const rows = page.locator('[data-testid$="-row"], tbody tr, article');
  if (routeName === "workload") check(await page.getByText("QA Ügyvéd").count() > 0, "workload: person fixture rendered", counts);
  if (routeName === "notifications") {
    check(await page.locator('[data-testid="notification-row"]').count() === 3, "notifications: three rows rendered", counts);
    check(await page.getByRole("button", { name: "Összes olvasottként" }).count() > 0, "notifications: bulk action present", counts);
  } else if (routeName === "reviews") check(await page.getByText("Beküldött revision").count() > 0 && await page.getByText("Korábbi review").count() > 0, "reviews: queue fixtures rendered", counts);
  else if (routeName === "tasks") check(await rows.count() >= 2, "tasks: task fixtures rendered", counts);
  else if (routeName === "deadlines") check(await rows.count() >= 3, "deadlines: agenda fixtures rendered", counts);
  else if (routeName === "time-entries") check(await page.getByText("Jogi kutatás").count() > 0 && await page.getByText("Dokumentum ellenőrzés").count() > 0, "time-entries: entry fixtures rendered", counts);
  await page.screenshot({ path: path.join(EVIDENCE_ROOT, routeName, `${label}-${SHA}.png`), fullPage: true });
  await context.close();
  return { route: routeName, label, sha: SHA, path: path.join(EVIDENCE_ROOT, routeName, `${label}-${SHA}.png`), timestamp: new Date().toISOString(), pass: counts.pass, fail: counts.fail, unmatched: [...unmatched] };
}

async function main() {
  for (const route of selectedRoutes) fs.mkdirSync(path.join(EVIDENCE_ROOT, route), { recursive: true });
  await startServer();
  const browser = await chromium.launch({ headless: true });
  const entries = [];
  try {
    for (const route of selectedRoutes) {
      try {
        entries.push(await runRoute(browser, route));
      } catch (error) {
        console.log(`FAIL ${route}: ${error instanceof Error ? error.message : String(error)}`);
        entries.push({ route, label, sha: SHA, path: path.join(EVIDENCE_ROOT, route, `${label}-${SHA}.png`), timestamp: new Date().toISOString(), pass: 0, fail: 1, unmatched: [] });
      }
    }
  } finally {
    await browser.close();
    stopServer();
  }
  const manifestPath = path.join(EVIDENCE_ROOT, "manifest.json");
  const existing = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, "utf8")) : [];
  fs.writeFileSync(manifestPath, JSON.stringify([...existing, ...entries], null, 2));
  console.log(`\nPASS ${entries.reduce((sum, item) => sum + item.pass, 0)} FAIL ${entries.reduce((sum, item) => sum + item.fail, 0)}`);
  for (const entry of entries) for (const url of entry.unmatched) console.log(`UNMATCHED ${entry.route} ${url}`);
  process.exitCode = entries.some((entry) => entry.fail > 0) ? 1 : 0;
}

main().catch((error) => {
  console.error(error);
  stopServer();
  process.exitCode = 1;
});
