/**
 * Production-server workforce browser contract QA.
 *
 * This is UI mode: the browser receives a deterministic synthetic workforce
 * session and contract-compatible API responses. It never contacts Azure,
 * PostgreSQL, or production data.
 */
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AUTH_ME, WORKFORCE_FIXTURE, assertFixtureContract } from "./workforceBrowserFixtures.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.WORKFORCE_QA_PORT || 3098);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const SHOTS = path.join(ROOT, "qa-screenshots-workforce");
const VIEWPORTS = [{ width: 1440, height: 900 }, { width: 1100, height: 800 }, { width: 390, height: 844 }];

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
  server.kill();
  server = undefined;
}

function complianceFindings() {
  const scoped = WORKFORCE_FIXTURE.findings.map((finding, index) => ({
    ...finding,
    subjectLabel: null,
    applicabilityStatus: ["APPLIES", "INSUFFICIENT_FACTS", "DOES_NOT_APPLY", null][index],
    description: "Synthetic, unsourced QA data only.",
    recommendation: "Review synthetic QA data.",
  }));
  return [
    ...scoped,
    {
      id: "qa-finding-manual-a",
      title: "QA manual finding",
      scopeType: "FUTURE_SCOPE",
      applicabilityStatus: "APPLIES",
      description: "Synthetic manual finding A.",
      recommendation: null,
    },
    {
      id: "qa-finding-manual-b",
      title: "QA manual finding",
      scopeType: "FUTURE_SCOPE",
      applicabilityStatus: null,
      description: "Synthetic manual finding B.",
      recommendation: null,
    },
  ];
}

function responseFor(url, mode = "populated") {
  if (url.includes("/auth/me")) return { status: 200, body: AUTH_ME };
  if (url.includes("/dashboard/stats")) return {
    status: 200,
    body: { stats: { totalCases: 1, inReview: 0, pendingClient: 0, completedThisMonth: 0 }, recentActivity: [] },
  };
  if (url.includes("/operational-overview")) return {
    status: 200,
    body: {
      generatedAt: "2026-01-01T00:00:00.000Z",
      resume: { item: null },
      summary: { openCaseCount: 1 },
      groups: [{ code: "OFFICE_ACTION", label: "QA routing", count: 1 }],
      items: [{
        id: WORKFORCE_FIXTURE.case.id,
        caseNumber: WORKFORCE_FIXTURE.case.caseNumber,
        title: WORKFORCE_FIXTURE.case.title,
        client: { id: WORKFORCE_FIXTURE.client.id, displayName: WORKFORCE_FIXTURE.client.name, clientColorKey: null },
        responsible: { id: AUTH_ME.id, displayName: AUTH_ME.name },
        status: "ACTIVE",
        priority: "NORMAL",
        groupCode: "OFFICE_ACTION",
        groupLabel: "QA routing",
        waitingLabel: null,
        nearestDeadline: null,
        overdue: false,
        openTaskCount: 1,
        reviewCount: 0,
        oldestOpenActivityAt: null,
        nextAction: { code: "OPEN_CASE", label: "Ügy megnyitása", href: `/cases/${WORKFORCE_FIXTURE.case.id}` },
        openHref: `/cases/${WORKFORCE_FIXTURE.case.id}`,
      }],
    },
  };
  if (url.includes(`/company-workspace/clients/${WORKFORCE_FIXTURE.client.id}/overview`)) {
    if (mode === "unavailable") return { status: 503, body: { status: 503, code: "QA_UNAVAILABLE" } };
    const findings = complianceFindings();
    return {
      status: 200,
      body: {
      client: WORKFORCE_FIXTURE.client,
      profile: null,
      factGroups: [],
      assessments: [{
        id: WORKFORCE_FIXTURE.assessment.id,
        type: "QA_INTERNAL",
        title: WORKFORCE_FIXTURE.assessment.title,
        status: WORKFORCE_FIXTURE.assessment.status,
        methodRef: null,
        startedAt: null,
        completedAt: "2026-01-01T00:00:00.000Z",
        reviewAt: null,
        findingCount: mode === "empty" ? 0 : findings.length,
        importantFindings: mode === "empty" ? [] : findings,
      }],
      contracts: [],
      obligations: [],
      organization: { groupCount: 0, personCount: 0, activePersonCount: 0, keyPersons: [] },
      gaps: {
        contractsWithoutOwnerCount: 0, obligationsWithoutOwnerCount: 0, inactiveOwnerCount: 0,
        contractsWithoutOwner: [], obligationsWithoutOwner: [], inactiveOwnerPersons: [],
      },
      initiatives: [],
      milestones: [],
      attention: [],
      },
    };
  }
  if (url.includes(`/compliance/proposals?clientId=${WORKFORCE_FIXTURE.client.id}`)) return {
    status: 200,
    body: [
      { id: "qa-proposed-no-case", clientId: WORKFORCE_FIXTURE.client.id, findingId: "qa-finding-company", proposalKind: "REMEDIATION", actionIntentKey: "REMEDIATE_COMPLIANCE_GAP", title: "QA javaslat ügy nélkül", status: "PROPOSED", case: null, taskId: null },
      { id: "qa-proposed-case", clientId: WORKFORCE_FIXTURE.client.id, findingId: "qa-finding-employee", proposalKind: "REVIEW", actionIntentKey: "REVIEW_APPLICABILITY", title: "QA javaslat ügyhöz kötve", status: "PROPOSED", case: WORKFORCE_FIXTURE.case, taskId: null },
      { id: "qa-stale", clientId: WORKFORCE_FIXTURE.client.id, findingId: "qa-finding-contract", proposalKind: "DOCUMENT_UPDATE", actionIntentKey: "UPDATE_DOCUMENTATION", title: "QA elavult javaslat", status: "STALE", case: WORKFORCE_FIXTURE.case, taskId: null },
      { id: "qa-rejected", clientId: WORKFORCE_FIXTURE.client.id, findingId: "qa-finding-workplace", proposalKind: "DISCLOSURE", actionIntentKey: "DISCLOSE_REQUIREMENT", title: "QA elutasított javaslat", status: "REJECTED", case: WORKFORCE_FIXTURE.case, taskId: null },
      { id: "qa-confirmed", clientId: WORKFORCE_FIXTURE.client.id, findingId: "qa-finding-company", proposalKind: "REMEDIATION", actionIntentKey: "REMEDIATE_COMPLIANCE_GAP", title: "QA megerősített javaslat", status: "CONFIRMED", case: WORKFORCE_FIXTURE.case, taskId: WORKFORCE_FIXTURE.task.id, task: WORKFORCE_FIXTURE.task },
    ],
  };
  if (url.includes(`/cases/${WORKFORCE_FIXTURE.case.id}/collaborators`)) return { status: 200, body: [] };
  if (url.includes(`/cases/${WORKFORCE_FIXTURE.case.id}/workflow-summary`)) return {
    status: 200,
    body: {
      caseId: WORKFORCE_FIXTURE.case.id,
      generatedAt: "2026-01-01T00:00:00.000Z",
      case: { displayName: WORKFORCE_FIXTURE.case.title, reference: WORKFORCE_FIXTURE.case.caseNumber, status: WORKFORCE_FIXTURE.case.status },
      nextAction: null, waitingOn: null, nextDeadline: null,
      taskStats: { open: 1, overdue: 0, dueSoon: 0, blocked: 0, review: 0 },
      latestCommunication: null, activeReview: null,
      responsibility: { responsibleLawyer: { id: AUTH_ME.id, displayName: AUTH_ME.name }, collaborators: [] },
      handoff: null,
      availability: { tasks: true, deadlines: true, communications: true, reviews: true, collaborators: true, handoff: true },
    },
  };
  if (url.includes(`/cases/${WORKFORCE_FIXTURE.case.id}/work-items`)) return {
    status: 200,
    body: {
      caseId: WORKFORCE_FIXTURE.case.id, generatedAt: "2026-01-01T00:00:00.000Z",
      summary: { open: 1, mine: 1, overdue: 0, dueSoon: 0, blocked: 0, waiting: 0, reviewRequired: 0, handoffRequired: 0, completedRecently: 0 },
      items: [],
      availability: { taskTransitions: true, blockerState: true, waitingState: true, reviewWorkflow: true, handoffWorkflow: true },
    },
  };
  if (url.includes(`/cases/${WORKFORCE_FIXTURE.case.id}/workflow-graph`)) return { status: 200, body: { caseId: WORKFORCE_FIXTURE.case.id, nodes: [], edges: [], currentStatus: "ACTIVE", possibleTransitions: [] } };
  if (url.includes(`/cases/${WORKFORCE_FIXTURE.case.id}/workflow-history`)) return { status: 200, body: [] };
  if (url.includes("/users")) return { status: 200, body: { data: [AUTH_ME] } };
  if (url.includes(`/tasks?`)) return { status: 200, body: [WORKFORCE_FIXTURE.task] };
  if (url.includes("/cases?")) return { status: 200, body: { data: [WORKFORCE_FIXTURE.case], page: 1, limit: 100, total: 1, totalPages: 1 } };
  if (url.includes(`/client-company/clients/${WORKFORCE_FIXTURE.client.id}/operating-profile`)) return { status: 200, body: null };
  if (url.includes(`/client-company/clients/${WORKFORCE_FIXTURE.client.id}/assessments`)) return {
    status: 200,
    body: { items: [{
      id: WORKFORCE_FIXTURE.assessment.id, type: "QA_INTERNAL", title: WORKFORCE_FIXTURE.assessment.title,
      status: WORKFORCE_FIXTURE.assessment.status, methodRef: null, startedAt: null,
      completedAt: "2026-01-01T00:00:00.000Z", reviewAt: null, itemCount: 0, findingCount: 4,
      updatedAt: "2026-01-01T00:00:00.000Z",
    }] },
  };
  if (url.includes(`/client-company/clients/${WORKFORCE_FIXTURE.client.id}/findings`)) return {
    status: 200,
    body: { items: WORKFORCE_FIXTURE.findings.map((finding) => ({
      ...finding, clientId: WORKFORCE_FIXTURE.client.id, assessmentId: WORKFORCE_FIXTURE.assessment.id,
      severity: "MEDIUM", description: "Synthetic, unsourced QA data only.",
      recommendation: "Review synthetic QA data.", status: "OPEN", developmentInitiativeId: null,
    })) },
  };
  if (url.includes(`/client-company/clients/${WORKFORCE_FIXTURE.client.id}/`)) return { status: 200, body: { items: [] } };
  if (url.includes("/clients")) return { status: 200, body: { data: [WORKFORCE_FIXTURE.client] } };
  if (url.includes(`/cases/${WORKFORCE_FIXTURE.case.id}/workspace`)) return {
    status: 200,
    body: {
      case: { ...WORKFORCE_FIXTURE.case, client: { id: WORKFORCE_FIXTURE.client.id, name: WORKFORCE_FIXTURE.client.name, colorKey: null }, startingContext: { originReason: null, currentSituation: null, clientExpectation: null, urgentAction: null, nextStep: null } },
      tasks: [{ ...WORKFORCE_FIXTURE.task, priority: "NORMAL", attentionCategory: null, estimatedMinutes: null, dueDate: null, assignee: { id: AUTH_ME.id, name: AUTH_ME.name }, documentId: null, workflowStepKey: null, blockedPredecessors: null }],
      documents: [], deadlines: [], communications: [], activity: [], comments: [],
      time: { available: true, loggedMinutes: 0, billableMinutes: null },
      cockpit: {
        urgency: "STEADY", nextStep: null, responsible: { id: AUTH_ME.id, name: AUTH_ME.name },
        kpi: {
          openTasks: { count: 1, urgentCount: 0, secondary: "QA" },
          deadlines: { count: 0, nextDueAt: null, secondary: "QA" },
          communication: { count: 0, replyNeededCount: 0, secondary: "QA" },
          review: { count: 0, secondary: "QA" },
          activeDocuments: { count: 0, secondary: "QA" },
        },
        taskGroups: { immediate: [WORKFORCE_FIXTURE.task.id], today: [], later: [] },
        deadlineGroups: { today: [], tomorrow: [], thisWeek: [], later: [] },
        replyNeeded: [], activeDocuments: [],
      },
      warnings: [],
    },
  };
  return { status: 404, body: { status: 404, code: "QA_UNMOCKED_ENDPOINT" } };
}

async function newPage(browser, mode = "populated", viewport = VIEWPORTS[0]) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const hardErrors = [];
  page.on("pageerror", (error) => hardErrors.push(error.message));
  page.on("console", (message) => {
      if (message.type() === "error" &&
        !message.text().includes("[API]") &&
        !message.text().includes("Failed to load resource")) {
        hardErrors.push(message.text());
      }
  });
  await page.addInitScript(({ profile }) => {
    localStorage.setItem("auth_token", "qa-workforce-token");
    sessionStorage.setItem("adminiculum_auth_profile", JSON.stringify(profile));
  }, { profile: AUTH_ME });
  await page.route("**/api/v1/**", async (route) => {
    const response = responseFor(route.request().url(), mode);
    if (mode === "loading" && route.request().url().includes("/company-workspace/")) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
    await route.fulfill({ status: response.status, contentType: "application/json", body: JSON.stringify(response.body) });
  });
  return { context, page, hardErrors };
}

async function checkPage(page, pathName, label) {
  await page.goto(`${BASE_URL}${pathName}`, { waitUntil: "networkidle" });
  const result = await page.evaluate(() => ({
    body: document.body?.innerText || "",
    overflow: document.documentElement.scrollWidth > window.innerWidth,
    harnessAttrs: document.querySelectorAll("[devin-hidden]").length,
    unnamedControls: [...document.querySelectorAll("a,button,[role='button']")]
      .filter((node) => {
        const style = getComputedStyle(node);
        return style.display !== "none" && style.visibility !== "hidden" &&
          !(node.getAttribute("aria-label") || node.getAttribute("title") || node.textContent || "").trim();
      }).length,
    nestedInteractive: [...document.querySelectorAll("a,button,[role='button']")].filter((node) =>
      node.parentElement?.closest("a,button,[role='button']") !== null).length,
  }));
  if (result.overflow) throw new Error(`${label} has horizontal overflow`);
  if (result.harnessAttrs) throw new Error(`${label} contains devin-hidden instrumentation`);
  if (result.unnamedControls) throw new Error(`${label} has unnamed interactive controls`);
  if (result.nestedInteractive) throw new Error(`${label} has nested interactive controls`);
  const firstControl = page.locator("a:visible,button:visible,[role='button']:visible").first();
  if (await firstControl.count()) {
    await firstControl.focus();
    const focus = await firstControl.evaluate((node) => {
      const style = getComputedStyle(node);
      return style.outlineStyle !== "none" || style.boxShadow !== "none";
    });
    if (!focus) throw new Error(`${label} has no visible focus indicator`);
  }
  const disclosure = page.locator("[aria-expanded]:visible").first();
  if (await disclosure.count()) {
    const before = await disclosure.getAttribute("aria-expanded");
    await disclosure.press("Enter");
    const after = await disclosure.getAttribute("aria-expanded");
    if (before === after) throw new Error(`${label} disclosure did not change aria-expanded`);
  }
  return result.body;
}

async function assertComplianceMode(browser, mode, viewport) {
  const qa = await newPage(browser, mode, viewport);
  const target = `/clients/${WORKFORCE_FIXTURE.client.id}/vallalati-mukodes`;
  await qa.page.goto(`${BASE_URL}${target}`, {
    waitUntil: mode === "loading" ? "domcontentloaded" : "networkidle",
  });
  if (mode === "loading") {
    await qa.page.getByText("Betöltés…").waitFor({ state: "visible", timeout: 5000 });
    await qa.page.waitForLoadState("networkidle");
  }
  await checkPage(qa.page, target, `Compliance ${mode} ${viewport.width}`);
  const body = await qa.page.locator("body").innerText();
    if (mode === "populated") {
    for (const label of ["Vállalat", "Munkavállaló", "Szerződés", "Munkahelyszín", "Nem azonosított hatókör"]) {
      if (!body.includes(label)) throw new Error(`Missing compliance scope label: ${label}`);
    }
    if (!body.includes("Belső értékelés szerint releváns")) throw new Error("Missing APPLIES framing");
    if (!body.includes("Nincs elég adat")) throw new Error("Missing insufficient-facts status");
    if (!body.includes("5 belső értékelési megállapítás")) throw new Error("Null applicability was not included in attention");
    const manualGroupCount = await qa.page.locator("button").filter({ hasText: "QA manual finding" }).count();
    if (manualGroupCount !== 2) throw new Error("Same-title manual findings collapsed");
    if (!body.includes("Nem releváns")) throw new Error("DOES_NOT_APPLY row missing after disclosure");
      if (/cikk|joghatóság|citation|sourceVersion|reviewStatus|Teendő indítása/i.test(body)) {
        throw new Error("Compliance output contains fake provenance or 7B actions");
      }
      const proposalRoot = qa.page.getByTestId("compliance-proposals");
      if (await proposalRoot.count()) {
        const findingSelect = proposalRoot.getByLabel("Megállapítás");
        if (await findingSelect.count() !== 1) throw new Error("Proposal finding selector missing");
        const options = await findingSelect.locator("option", {}).allTextContents({ timeoutMs: 5000 });
        if (options.some((option) => option.includes("QA manual"))) throw new Error("Manual finding offered as proposal candidate");
        if (!body.includes("A megerősítéshez előbb ügyet kell hozzárendelni.")) throw new Error("Missing no-case confirmation explanation");
        const confirm = proposalRoot.getByRole("button", { name: "Megerősítés" }).first();
        if (await confirm.count() !== 1 || await confirm.isEnabled()) throw new Error("No-case confirmation is not disabled");
        if (!body.includes("Elavult") || !body.includes("Elutasítva") || !body.includes("Megerősítve")) throw new Error("Proposal terminal statuses missing");
        if (await proposalRoot.getByText("Kapcsolt feladat megnyitása →").count() !== 1) throw new Error("Confirmed Task link missing");
      }
  }
  if (mode === "empty" && !body.includes("Nincs megjeleníthető belső értékelési megállapítás")) {
    throw new Error("Compliance empty state was not rendered");
  }
  if (mode === "unavailable" && !body.includes("A vállalati működés adatai jelenleg nem tölthetők be")) {
    throw new Error("Compliance unavailable state was not rendered");
  }
  await qa.context.close();
}

async function main() {
  assertFixtureContract();
  fs.mkdirSync(SHOTS, { recursive: true });
  await startServer();
  const browser = await chromium.launch({ headless: true });
  try {
    const pages = [
      { path: "/", label: "Dashboard", shot: "dashboard" },
      { path: `/clients/${WORKFORCE_FIXTURE.client.id}/vallalati-mukodes`, label: "Company Workspace", shot: "company-workspace" },
      { path: `/cases/${WORKFORCE_FIXTURE.case.id}`, label: "Case Workspace", shot: "case-workspace" },
    ];
    for (const target of pages) {
      const qa = await newPage(browser);
      for (const viewport of VIEWPORTS) {
        await qa.page.setViewportSize(viewport);
        await checkPage(qa.page, target.path, target.label);
        await qa.page.screenshot({ path: path.join(SHOTS, `${target.shot}-${viewport.width}.png`), fullPage: true });
      }
      if (qa.hardErrors.length) throw new Error(`${target.label} browser errors: ${qa.hardErrors.join("; ")}`);
      await qa.context.close();
    }
    for (const viewport of VIEWPORTS) {
      for (const mode of ["populated", "loading", "empty", "unavailable"]) {
        await assertComplianceMode(browser, mode, viewport);
      }
    }
    console.log("MOCK_WORKFORCE_QA=PASSED");
    console.log("SCREENSHOT_EVIDENCE=" + SHOTS);
    console.log("COMPLIANCE_OVERVIEW=POPULATED_LOADING_EMPTY_UNAVAILABLE_PASSED");
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
