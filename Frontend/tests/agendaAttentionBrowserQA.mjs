// Local UI contract fixtures only. No production network, credentials, or writes.
// Run against the local dev/production server: AGENDA_QA_URL=http://localhost:3091.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const origin = process.env.AGENDA_QA_URL || "http://localhost:3091";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(origin).hostname), "Local QA server required");
const output = path.resolve("test-results/agenda-attention");
fs.mkdirSync(output, { recursive: true });
const instant = new Date("2026-10-09T10:00:00Z");
const caseRef = { id: "qa-case", caseNumber: "QA-CASE", clientName: "QA client", matterType: "CONTRACT", title: "QA case" };
const user = { id: "qa-user", email: "qa-user@adminiculum.test", name: "QA Reviewer", role: "LAWYER" };
const task = { id: "qa-undated", title: "QA határidő nélküli munka", status: "PENDING", priority: "MEDIUM", case: caseRef };
const row = (id, dueAt) => ({ id, sourceType: "TASK", sourceId: id, caseId: caseRef.id, title: `QA ${id}`, dueAt, temporalType: "TIMESTAMP", allDay: false, status: "OPEN", urgency: "TODAY", importance: "NORMAL", legalSignificance: null, responsibility: {}, source: { type: "TASK", id, displayName: caseRef.caseNumber }, capabilities: { canOpen: true, canComplete: false, canReschedule: false, canCreateTask: false, canReopen: false, canCancel: false }, href: `/tasks?taskId=${id}` });
const agenda = (rows, hasMore = false, offset = 0, scope = "MY_WORK") => ({ generatedAt: instant.toISOString(), timezone: "Europe/Budapest", range: { from: "2026-10-09", to: "2026-10-23" }, scope, summary: { overdue: 0, today: 0, tomorrow: 0, thisWeek: 0, later: 0, completedRecently: 0 }, days: [{ date: "2026-10-09", items: rows }], pagination: { limit: 100, offset, hasMore }, availability: { taskDueDates: true, caseDeadlines: true, hearings: false, reminders: false, teamScope: false, externalCalendar: false } });
const review = { id: "qa-review", source: "TASK_SUBMISSION", taskId: "qa-review-task", submissionId: "qa-submission", title: "QA döntés pontos leadásról", status: "SUBMITTED", taskStatus: "IN_REVIEW", priority: "MEDIUM", dueDate: "2026-10-09T09:00:00Z", submittedAt: "2026-10-08T08:00:00Z", requestedAttention: "APPROVAL", linkedTimeMinutes: 0, readOnly: true, actionable: false, nextActionCode: "OPEN_REVIEW", case: caseRef };
const operational = {
  generatedAt: instant.toISOString(), summary: { openCaseCount: 1 }, groups: [], attentionWorkload: { categories: [], unclassified: { count: 0, nearestDeadline: null } },
  resume: { item: { id: "resume", taskId: task.id, submissionId: null, title: "QA munka folytatása", status: "IN_PROGRESS", nextActionCode: "OPEN_TASK", actionLabel: "Folytatás", href: `/tasks?taskId=${task.id}`, dueAt: null, case: { id: caseRef.id, caseNumber: caseRef.caseNumber, title: caseRef.title, client: { id: "qa-client", displayName: "QA client", clientColorKey: null } } } },
  items: [{ id: caseRef.id, caseNumber: caseRef.caseNumber, title: "QA ügyfélre várunk", client: { id: "qa-client", displayName: "QA client", clientColorKey: null }, responsible: null, status: "ACTIVE", priority: "MEDIUM", groupCode: "CLIENT_WAITING", groupLabel: "Ügyfélre várunk", waitingLabel: "Ügyfél válaszára vár", nearestDeadline: null, overdue: false, openTaskCount: 1, reviewCount: 0, oldestOpenActivityAt: instant.toISOString(), nextAction: { code: "CHECK_CLIENT_WAIT", label: "Várakozás ellenőrzése", href: "/cases/qa-case" }, openHref: "/cases/qa-case" }],
};
function respond(url, mode) {
  const pathname = url.pathname;
  if (pathname.endsWith("/auth/me")) return [200, user];
  if (pathname.endsWith("/agenda")) {
    if (mode === "error" && url.searchParams.get("queue") === "OVERDUE") return [403, { code: "FORBIDDEN", message: "No access" }];
    if (mode === "empty") return [200, agenda([])];
    if (url.searchParams.get("offset")) return [200, agenda([row("page-two", "2026-10-12T12:00:00Z")], false, 100)];
    if (url.searchParams.get("queue") === "OVERDUE") return [200, agenda([row("lejárt", "2026-10-08T12:00:00Z")])];
    return [200, agenda([row("mai", "2026-10-09T14:00:00Z"), row("következő", "2026-10-12T12:00:00Z"), row("későbbi", "2026-10-20T12:00:00Z")], true)];
  }
  if (pathname.endsWith("/tasks/review-queue")) return mode === "error" ? [403, { code: "FORBIDDEN" }] : [200, mode === "empty" ? [] : [review]];
  if (pathname.endsWith("/tasks/my/tasks")) return [200, mode === "empty" ? [] : [task, { ...task, id: "qa-blocked", title: "QA rögzített elakadás", status: "BLOCKED" }]];
  if (pathname.endsWith("/cases/dashboard/operational-overview")) return [200, operational];
  if (pathname.endsWith("/cases/dashboard/stats")) return [200, { stats: { totalCases: 1, inReview: 0, pendingClient: 1, completedThisMonth: 0 }, recentActivity: [] }];
  if (pathname.endsWith("/cases") || pathname.endsWith("/clients")) return [200, { data: [], total: 0, page: 1, totalPages: 1 }];
  if (pathname.endsWith("/communications")) return [200, { communications: [], total: 0 }];
  if (pathname.endsWith("/news-feed/legal")) return [200, { articles: [] }];
  if (pathname.includes("/notifications")) return [200, { notifications: [], unreadCount: 0 }];
  return [404, { code: "QA_UNMOCKED_ENDPOINT" }];
}
const report = [];
const browser = await chromium.launch({ headless: true });
let lastPage;
try {
  for (const width of [390, 768, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, timezoneId: "America/Los_Angeles" });
    const page = await context.newPage();
    lastPage = page;
    page.setDefaultTimeout(90_000);
    await page.clock.install({ time: instant });
    let mode = "populated";
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript((profile) => {
      localStorage.setItem("auth_token", "qa-only-token");
      localStorage.setItem("adminiculum:auth_token:workforce", "qa-only-token");
      sessionStorage.setItem("adminiculum_auth_profile", JSON.stringify(profile));
    }, user);
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.includes("/api/v1/")) {
        assert.equal(route.request().method(), "GET", "UI projection must not write");
        const [status, body] = respond(url, mode);
        return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
      }
      if (url.origin !== new URL(origin).origin) return route.abort();
      return route.continue();
    });
    for (const route of ["/agenda", "/reviews", "/"]) {
      await page.goto(origin + route, { waitUntil: "domcontentloaded", timeout: 180_000 });
      if (route === "/agenda") {
        await page.getByRole("heading", { name: "QA mai", exact: true }).waitFor();
        assert.equal(await page.locator("#agenda-TODAY").locator("..").getByText(task.title).count(), 0);
        assert.ok(await page.locator("#agenda-NO_RECORDED_DEADLINE").locator("..").getByText(task.title).count());
        await page.getByRole("button", { name: "További dátumos tételek", exact: true }).click();
        await page.getByRole("heading", { name: "QA page-two", exact: true }).waitFor();
        await page.getByText("Szűrés és dátumtartomány", { exact: true }).click();
        await page.getByLabel("Dátumcsoport", { exact: true }).selectOption("TODAY");
        assert.equal(await page.getByRole("heading", { name: "QA page-two", exact: true }).count(), 0);
        await page.getByLabel("Dátumcsoport", { exact: true }).selectOption("ALL");
        await page.getByLabel("Munkakör", { exact: true }).focus();
        assert.equal(await page.getByLabel("Munkakör", { exact: true }).evaluate((el) => el === document.activeElement), true);
        await page.getByText("Szűrés és dátumtartomány", { exact: true }).click();
      } else if (route === "/reviews") {
        await page.getByRole("link", { name: "Leadás megnyitása", exact: true }).waitFor();
        assert.equal(await page.getByRole("link", { name: "Leadás megnyitása", exact: true }).getAttribute("href"), "/tasks?taskId=qa-review-task&submissionId=qa-submission&view=review");
        assert.ok(await page.getByText("Csak megtekintés", { exact: true }).count());
        assert.ok(await page.getByText("Időállapot: a Leadás részleteiben", { exact: true }).count());
        await page.getByText("Döntési sor szűrése", { exact: true }).click();
        await page.getByLabel("Review sor keresése").fill("nonexistent");
        await page.getByText("Nincs találat a szűrőkkel.", { exact: true }).waitFor();
        await page.getByLabel("Review sor keresése").fill("");
        await page.getByText("Döntési sor szűrése", { exact: true }).click();
      } else {
        await page.getByText("QA rögzített elakadás", { exact: true }).waitFor();
        const order = await page.locator("[aria-label='Napi figyelem'] h2").allTextContents();
        assert.deepEqual(order, ["Sürgős", "Döntések", "Elakadások és várakozás", "Munka folytatása"]);
        assert.equal(await page.getByRole("heading", { name: "Gyors műveletek", exact: true }).isVisible(), false);
        await page.getByText("További munkanézetek és gyors műveletek", { exact: true }).click();
        assert.equal(await page.getByRole("heading", { name: "Gyors műveletek", exact: true }).isVisible(), true);
        await page.getByText("További munkanézetek és gyors műveletek", { exact: true }).click();
      }
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      assert.equal(overflow, false, `${route} overflow at ${width}`);
      await page.screenshot({ path: path.join(output, `${width}-${route === "/" ? "home" : route.slice(1)}.png`), fullPage: true });
      report.push({ width, route, mode, overflow, status: "PASS" });
    }
    mode = "error";
    await page.goto(origin + "/agenda", { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Az agenda részben nem tölthető be.", exact: true }).waitFor();
    await page.getByRole("heading", { name: "QA mai", exact: true }).waitFor();
    await page.screenshot({ path: path.join(output, `${width}-agenda-partial.png`), fullPage: true });
    mode = "populated";
    await page.getByRole("button", { name: "Újratöltés", exact: true }).click();
    await page.getByRole("heading", { name: "QA lejárt", exact: true }).waitFor();
    mode = "empty";
    await page.goto(origin + "/reviews", { waitUntil: "domcontentloaded" });
    await page.getByText("Nincs review-ra váró beküldés.", { exact: true }).waitFor();
    report.push({ width, partialRetry: "PASS", emptyReview: "PASS", pageErrors: errors });
    assert.deepEqual(errors, []);
    await context.close();
  }
} catch (error) {
  if (lastPage && !lastPage.isClosed()) {
    await lastPage.screenshot({ path: path.join(output, "failure.png"), fullPage: true });
    console.error((await lastPage.locator("body").innerText()).slice(0, 5000));
  }
  throw error;
} finally {
  await browser.close();
  fs.writeFileSync(path.join(output, "report.json"), JSON.stringify(report, null, 2));
}
console.log(JSON.stringify({ result: "PASS", assertions: "date truth, exact identity, read-only, filters, keyboard, source failure/retry, empty, no writes, no overflow", report }, null, 2));
