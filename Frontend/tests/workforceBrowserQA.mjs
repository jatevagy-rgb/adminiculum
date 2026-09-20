/**
 * Production-server workforce browser contract QA.
 *
 * This is UI mode: the browser receives a deterministic synthetic workforce
 * session and contract-compatible API responses. It never contacts Azure,
 * PostgreSQL, or production data.
 */
import { chromium } from "playwright";
import { spawn, spawnSync } from "node:child_process";
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
  try {
    if (process.platform === "win32" && server.pid) {
      spawnSync("taskkill", ["/F", "/T", "/PID", String(server.pid)], { stdio: "ignore" });
    } else {
      server.kill("SIGKILL");
    }
  } catch {}
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
      operationalStatus: "RESOLVED",
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
        findingCount: 0,
        importantFindings: [],
      }],
      contracts: [{ id: "qa-contract", title: "QA szerződés", status: "ACTIVE", type: "SERVICE" }],
      obligations: [{ id: "qa-obligation", title: "QA határidő", status: "OPEN", nextDueDate: "2026-02-01T00:00:00.000Z" }],
      organization: { groupCount: 0, personCount: 0, activePersonCount: 0, keyPersons: [] },
      gaps: {
        contractsWithoutOwnerCount: 0, obligationsWithoutOwnerCount: 0, inactiveOwnerCount: 0,
        contractsWithoutOwner: [], obligationsWithoutOwner: [], inactiveOwnerPersons: [],
      },
      initiatives: [],
      milestones: [],
      cases: [{ id: WORKFORCE_FIXTURE.case.id, title: WORKFORCE_FIXTURE.case.title, status: "ACTIVE" }],
      attention: [],
      },
    };
  }
  if (url.includes(`/company-workspace/clients/${WORKFORCE_FIXTURE.client.id}/data-room`)) {
    if (mode === "unavailable") return { status: 503, body: { status: 503, code: "QA_UNAVAILABLE" } };
    const empty = mode === "empty";
    return {
      status: 200,
      body: {
        clientIdentity: { id: WORKFORCE_FIXTURE.client.id, name: WORKFORCE_FIXTURE.client.name, company: WORKFORCE_FIXTURE.client.name, companyRegistrationNumber: null, taxNumber: null, vatNumber: null, address: null },
        operatingProfile: { status: "ACTIVE", complianceEnrollmentStatus: "NOT_ENROLLED", summary: null, lastReviewedAt: null, nextReviewAt: null, review: { rule: "nextReviewAt", ruleDefined: false, state: "UNKNOWN" } },
        facts: empty ? [] : [
          { id: "qa-fact-unknown", type: "EMPLOYEE_COUNT", value: null, answerStatus: "UNKNOWN", factDefinition: { key: "employee_count", domainCode: "COMPANY_PROFILE", valueType: "NUMBER" }, scopeType: "CLIENT", factSubjectId: null, verificationStatus: null, observedAt: null, effectiveAt: null, validFrom: null, validTo: null, provenance: { sourceKind: "UNKNOWN", hasSourceDocument: false, evidenceCount: 0, evidenceSourceTypes: [], determinationMethod: null, recordedAt: null, verifiedAt: null }, freshness: { rule: null, ruleDefined: false, state: "NO_RULE" }, conflicts: { overlapPolicy: null, sameSubjectCurrentFactCount: 0, hasCanonicalSelection: false, reviewRequired: false } },
          { id: "qa-fact-unanswered", type: "MAIN_ACTIVITY", value: null, answerStatus: "UNANSWERED", factDefinition: { key: "main_activity", domainCode: "COMPANY_PROFILE", valueType: "TEXT" }, scopeType: "CLIENT", factSubjectId: null, verificationStatus: null, observedAt: null, effectiveAt: null, validFrom: null, validTo: null, provenance: { sourceKind: "MANUAL", hasSourceDocument: false, evidenceCount: 0, evidenceSourceTypes: [], determinationMethod: "USER_PROVIDED", recordedAt: "2026-01-01T00:00:00.000Z", verifiedAt: null }, freshness: { rule: "OBSERVATION", ruleDefined: false, state: "NO_RULE" }, conflicts: { overlapPolicy: "DISALLOW", sameSubjectCurrentFactCount: 1, hasCanonicalSelection: false, reviewRequired: false } },
        ],
        dataQuality: { answerStateSummary: { answered: empty ? 0 : 0, unknown: empty ? 0 : 1 }, coverageAvailable: false, relevantDataCoverage: { available: false, relevantDefinitionCount: 0, answeredCount: 0, unknownCount: empty ? 0 : 1, unansweredCount: empty ? 0 : 1, undeterminedCount: 0, derivedAnsweredCount: 0 }, stale: null, staleAvailable: false, conflictingAvailable: true, conflictingFactCount: 0, provenance: { basis: "ClientFact.sourceReference + ClientFact.sourceDocumentVersionId + EvidenceRecord", documentSourceCount: 0, portalAnswerCount: 0, manualSourceCount: 1, unknownSourceCount: 1, evidenceLinkedCount: 0 }, freshness: { basis: "FactDefinition.temporalPolicy", ruleDefinedCount: 0, noRuleCount: 2 } },
        organization: { groupCount: empty ? 0 : 1, activeGroupCount: empty ? 0 : 1, personCount: empty ? 0 : 1, activePersonCount: empty ? 0 : 1, groups: empty ? [] : [{ id: "qa-group", name: "QA egység", description: null, status: "ACTIVE", parentGroupId: null }], people: empty ? [] : [{ id: "qa-person", name: "QA személy", jobTitle: "Munkatárs", employmentStatus: "ACTIVE", organizationGroupId: "qa-group", organizationGroupName: "QA egység" }] },
        processes: empty ? [] : [{ id: "qa-process", name: "QA folyamat", category: "OPERATIONS", description: null, criticality: "NORMAL", frequency: "MONTHLY", status: "ACTIVE", owner: null, organizationGroup: null, stepCount: 1, approvalStepCount: 0, unassignedStepCount: 1, estimatedTotals: { activeMinutes: 10, waitingMinutes: 5, stepsWithActiveEstimate: 1, stepsWithWaitingEstimate: 1 }, steps: [{ id: "qa-step", position: 1, name: "QA lépés", stepType: "MANUAL", responsiblePerson: null, system: null, estimatedActiveMinutes: 10, estimatedWaitingMinutes: 5, isApproval: false }], latestMeasuredSnapshot: { id: "qa-snapshot", observedAt: "2026-01-01T00:00:00.000Z", metricVersion: "1", snapshotDigest: "0".repeat(64), provenanceSource: "CANONICAL_BUSINESS_PROCESS", metrics: [{ code: "TOTAL_ACTIVE_MINUTES", nameHu: "Összes aktív munkaidő", value: 10, unit: "MINUTES", metricVersion: "1" }] } }],
        systems: empty ? [] : [{ id: "qa-system", name: "QA rendszer", category: "OTHER", vendor: null, purpose: null, status: "ACTIVE", owner: null, relatedProcessStepCount: 0 }],
        documents: { documentCount: empty ? 0 : 1, currentVersionCount: empty ? 0 : 1, evidenceLinkedRecordCount: 0 }, contracts: { totalCount: 0, byStatus: [] },
        complianceSummary: { currentOnly: true, evaluatedAt: null, evaluatedCount: 0, applies: 0, doesNotApply: 0, insufficientFacts: 0, legalReviewRequired: 0, technicalReviewRequired: 0, sourceSupportInsufficient: 0, openFindings: 0, openProposals: 0 },
        evidenceSummary: { totalCount: 0, bySourceType: [], byStatus: [] },
        developmentSummary: { initiativeCount: 0, activeInitiativeCount: 0, milestoneCount: 0, plannedMilestoneCount: 0, initiatives: [], milestones: [], opportunityCountsByStatus: [] },
        measurementSummary: { nonSyntheticOutcomeCount: 0, byBasis: [], assumedCount: 0, outcomes: [] },
      },
    };
  }
  if (url.includes(`/compliance/clients/${WORKFORCE_FIXTURE.client.id}/overview`)) {
    return { status: 200, body: { findings: mode === "empty" ? [] : complianceFindings() } };
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
  if (url.includes(`/client-identity/admin/workspaces?clientId=${WORKFORCE_FIXTURE.client.id}`)) return { status: 200, body: { items: [{ id: "qa-workspace", clientId: WORKFORCE_FIXTURE.client.id, mode: "ORGANIZATION", status: "ACTIVE" }] } };
  if (url.endsWith(`/clients/${WORKFORCE_FIXTURE.client.id}`)) return { status: 200, body: WORKFORCE_FIXTURE.client };
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
    if (mode === "loading" && route.request().url().includes("/company-workspace/clients/") && route.request().url().includes("/data-room")) {
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
    await qa.page.getByTestId("data-room-loading").waitFor({ state: "visible", timeout: 5000 });
    await qa.page.waitForLoadState("networkidle");
  }
  await checkPage(qa.page, target, `Compliance ${mode} ${viewport.width}`);
  const body = await qa.page.locator("body").innerText();
    if (mode === "populated") {
    for (const label of ["Áttekintés", "Vállalati profil", "Folyamatok", "Rendszerek", "Dokumentumok és bizonyítékok"]) {
      if (!body.includes(label)) throw new Error(`Missing Company OS primary label: ${label}`);
    }
    for (const label of ["Szervezet", "Megfelelőség", "Fejlesztés"]) {
      if (!body.includes(label)) throw new Error(`Missing cross-domain module summary label: ${label}`);
    }
    // The fact-engine audit and legacy views stay reachable from the secondary control.
    await qa.page.locator('[data-testid="company-os-advanced-views"] > summary').click();
    const advancedViews = await qa.page.locator('[data-testid="company-os-advanced-views"]').innerText();
    for (const label of ["Adatok", "Adatminőség", "Operatív áttekintés"]) {
      if (!advancedViews.includes(label)) throw new Error(`Missing advanced Company OS view: ${label}`);
    }
    if (!body.includes("Ismeretlen") || !body.includes("Nincs még adat")) throw new Error("UNKNOWN and UNANSWERED states were not separated");
    if (!body.includes("Becsült értékek") || !body.includes("Mért pillanatkép")) throw new Error("Estimated and measured values were merged");
    if (body.match(/score|percentage|maturity|kockázati pontszám/i)) throw new Error("Data Room contains an invented score");
  }
  if (mode === "empty" && !body.includes("Nincs rögzített folyamat")) {
    throw new Error("Data Room empty state was not rendered");
  }
  if (mode === "unavailable" && !body.includes("A vállalati működés adatai jelenleg nem tölthetők be")) {
    throw new Error("Data Room unavailable state was not rendered");
  }
  if (mode === "unavailable") {
    if (!await qa.page.locator('[data-testid="legacy-operational-overview"]').isVisible()) throw new Error("Legacy operational view disappeared with Data Room failure");
    if (!body.includes(WORKFORCE_FIXTURE.case.title)) throw new Error("Legacy case context disappeared with Data Room failure");
    if (!await qa.page.locator('[data-testid="compliance-overview"]').count()) throw new Error("Legacy compliance overview disappeared with Data Room failure");
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

    // 4. Test real section tab navigation & browser back/forward on Company Workspace
    console.log("Verifying real tab cockpit navigation and history state...");
    const navQa = await newPage(browser, "populated", VIEWPORTS[0]);
    const cwTarget = `/clients/${WORKFORCE_FIXTURE.client.id}/vallalati-mukodes`;
    await navQa.page.goto(`${BASE_URL}${cwTarget}`, { waitUntil: "networkidle" });

    // Verify default active section is overview
    const initialUrl = navQa.page.url();
    if (!initialUrl.includes("section=overview") && initialUrl.includes("section=")) {
      throw new Error("Default section should be overview");
    }
    if (!await navQa.page.locator('[data-section-id="overview"]').isVisible()) {
      throw new Error("Overview panel should be visible by default");
    }
    // Verify other panels are not in DOM / not visible
    if (await navQa.page.locator('[data-section-id="processes"]').isVisible()) {
      throw new Error("Processes panel should NOT be visible when overview is active");
    }

    // Adatok is an advanced view: reach it through the compact secondary control.
    await navQa.page.locator('[data-testid="company-os-advanced-views"] > summary').click();
    await navQa.page.locator('button[data-testid="workspace-tab-data"]').click();
    await navQa.page.waitForTimeout(300);
    if (!navQa.page.url().includes("section=data")) {
      throw new Error("URL query parameter did not update to section=data");
    }
    if (!await navQa.page.locator('[data-section-id="data"]').isVisible()) {
      throw new Error("Data panel did not become visible after clicking tab");
    }
    if (await navQa.page.locator('[data-section-id="overview"]').isVisible()) {
      throw new Error("Overview panel should NOT be visible when data is active");
    }

    // Verify typed fact rendering on Adatok tab (no raw JSON)
    const dataPanelText = await navQa.page.locator('[data-section-id="data"]').innerText();
    if (dataPanelText.includes("{") && dataPanelText.includes("}")) {
      throw new Error("Adatok section contains raw JSON formatting");
    }

    // Click on Folyamatok tab
    await navQa.page.locator('button[data-testid="workspace-tab-processes"]').click();
    await navQa.page.waitForTimeout(300);
    if (!navQa.page.url().includes("section=processes")) {
      throw new Error("URL query parameter did not update to section=processes");
    }
    if (!await navQa.page.locator('[data-section-id="processes"]').isVisible()) {
      throw new Error("Processes panel did not become visible after clicking tab");
    }

    // Test Browser Back button
    await navQa.page.goBack();
    await navQa.page.waitForTimeout(300);
    if (!navQa.page.url().includes("section=data")) {
      throw new Error("Browser Back did not restore section=data in URL");
    }
    if (!await navQa.page.locator('[data-section-id="data"]').isVisible()) {
      throw new Error("Browser Back did not restore visible Data section");
    }

    // Test Browser Forward button
    await navQa.page.goForward();
    await navQa.page.waitForTimeout(300);
    if (!navQa.page.url().includes("section=processes")) {
      throw new Error("Browser Forward did not restore section=processes in URL");
    }
    if (!await navQa.page.locator('[data-section-id="processes"]').isVisible()) {
      throw new Error("Browser Forward did not restore visible Processes section");
    }

    // Switch to Operatív áttekintés (advanced view behind the secondary control)
    if (!await navQa.page.locator('button[data-testid="workspace-tab-operational"]').isVisible()) {
      await navQa.page.locator('[data-testid="company-os-advanced-views"] > summary').click();
    }
    await navQa.page.locator('button[data-testid="workspace-tab-operational"]').click();
    await navQa.page.waitForTimeout(300);
    if (!await navQa.page.locator('[data-testid="legacy-operational-overview"]').isVisible()) {
      throw new Error("Legacy operational overview should be visible when operational tab is selected");
    }

    // Legacy deep links keep reaching the advanced fact/audit views unchanged.
    await navQa.page.goto(`${BASE_URL}${cwTarget}?section=data-quality`, { waitUntil: "networkidle" });
    await navQa.page.waitForTimeout(300);
    if (!navQa.page.url().includes("section=data-quality")) {
      throw new Error("?section=data-quality deep link did not preserve the query parameter");
    }
    if (!await navQa.page.locator('[data-section-id="data-quality"]').isVisible()) {
      throw new Error("?section=data-quality deep link did not reach the data quality view");
    }
    await navQa.page.goto(`${BASE_URL}${cwTarget}#operational`, { waitUntil: "networkidle" });
    await navQa.page.waitForTimeout(300);
    if (!await navQa.page.locator('[data-testid="legacy-operational-overview"]').isVisible()) {
      throw new Error("#operational hash deep link did not reach the legacy operational view");
    }

    await navQa.context.close();

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
