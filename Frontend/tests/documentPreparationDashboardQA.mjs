/**
 * Focused browser QA for the Case Workspace document preparation surface
 * (DOCUMENT-PREP-DASHBOARD-1).
 *
 * Reuses the existing synthetic workforce session pattern from
 * `workforceBrowserFixtures.mjs` (no Azure, no DB, no production data) and
 * drives a real production `next start` server. The server is expected to be
 * already running: set QA_BASE_URL, or run the workforce QA first. This script
 * never starts or stops a server, so it can attach to the canonical QA server.
 *
 * It asserts:
 *   - no horizontal overflow at 1440 and 390;
 *   - the selected document dashboard renders all four tiles;
 *   - the no-risk / no-anonymization state is truthful;
 *   - selecting the second document switches to the recorded risk + anonymized
 *     state without a page reload;
 *   - the delete confirmation dialog opens.
 *
 * Screenshots land in `qa-screenshots-document-preparation/`.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AUTH_ME } from "./workforceBrowserFixtures.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE_URL = process.env.QA_BASE_URL || "http://127.0.0.1:3098";
const SHOTS = path.join(ROOT, "qa-screenshots-document-preparation");

const CASE_ID = "qa-case";
const DOC_A = "qa-doc-a";
const DOC_B = "qa-doc-b";

const WORKSPACE = {
  case: {
    id: CASE_ID,
    caseNumber: "QA-CASE-001",
    title: "QA Case",
    status: "ACTIVE",
    priority: "NORMAL",
    matterType: "CONTRACT",
    clientRole: "Ügyfél",
    matterId: null,
    deadline: "2026-10-01T00:00:00.000Z",
    client: { id: "qa-client", name: "QA Client", colorKey: null },
    assignedLawyer: { id: AUTH_ME.id, name: AUTH_ME.name },
    description: null,
    nextStep: null,
    startingContext: {
      originReason: null,
      currentSituation: null,
      clientExpectation: null,
      urgentAction: null,
      nextStep: null,
      legacyOnly: false,
      empty: true,
    },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  metrics: { openTaskCount: 1, documentCount: 2, openDeadlineCount: 0, communicationCount: 0, reviewCount: 0, loggedMinutes: 0 },
  tasks: [{
    id: "qa-task", title: "QA task", status: "TODO", priority: "NORMAL", attentionCategory: null,
    estimatedMinutes: null, dueDate: null, assignee: { id: AUTH_ME.id, name: AUTH_ME.name },
    documentId: null, requestedByOrganizationPerson: null, workflowStepKey: null, blockedPredecessors: null,
  }],
  documents: [
    {
      id: DOC_A,
      fileName: "munkaszerzodes_tervezet.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      type: "CONTRACT",
      category: "szerzodes",
      version: "2",
      uploadedAt: "2026-08-20T09:00:00.000Z",
      uploadedBy: { id: AUTH_ME.id, name: AUTH_ME.name },
      summary: null,
      commentCount: 0,
      workStatus: "IN_PROGRESS",
      workInstruction: null,
      responsible: { id: AUTH_ME.id, name: AUTH_ME.name },
      reviewer: null,
      dueDate: null,
      nextStep: null,
      reviewSummary: {
        documentId: DOC_A, caseId: CASE_ID, documentTitle: "Munkaszerződés tervezet", category: "szerzodes",
        workStatus: "IN_PROGRESS", currentVersionNumber: 2, currentVersionId: "v2",
        previousVersionNumber: 1, previousVersionId: "v1", reviewId: null, reviewVersionId: null,
        reviewStatus: null, openPointCount: 3, blockingPointCount: 1, comparisonId: null, comparisonStatus: null,
        totalSegments: 0, reviewedSegments: 0, unresolvedSegments: 0, aiPromptDraftId: null, aiDraftStatus: null,
        aiApproved: false, nextAction: { code: "START_REVIEW", label: "Review indítása", rationale: "QA" },
      },
    },
    {
      id: DOC_B,
      fileName: "adatfeldolgozasi_szerzodes.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      type: "CONTRACT",
      category: "adatvedelem",
      version: "1",
      uploadedAt: "2026-08-25T14:30:00.000Z",
      uploadedBy: { id: AUTH_ME.id, name: AUTH_ME.name },
      summary: null,
      commentCount: 0,
      workStatus: "APPROVED",
      workInstruction: null,
      responsible: { id: AUTH_ME.id, name: AUTH_ME.name },
      reviewer: null,
      dueDate: null,
      nextStep: null,
      reviewSummary: null,
    },
  ],
  deadlines: [],
  time: { available: true, loggedMinutes: 0, billableMinutes: null },
  communications: [],
  activity: [{
    id: "qa-act-1", actor: AUTH_ME.name, actionLabel: "Feltöltve", objectLabel: "Munkaszerződés tervezet",
    occurredAt: "2026-08-20T09:00:00.000Z", objectType: "DOCUMENT", objectId: DOC_A,
  }],
  comments: [],
  cockpit: {
    urgency: "STEADY", nextStep: null, responsible: { id: AUTH_ME.id, name: AUTH_ME.name },
    kpi: {
      openTasks: { count: 1, urgentCount: 0, secondary: "QA" },
      deadlines: { count: 0, nextDueAt: null, secondary: "QA" },
      communication: { count: 0, replyNeededCount: 0, secondary: "QA" },
      review: { count: 0, secondary: "QA" },
      activeDocuments: { count: 1, secondary: "QA" },
    },
    taskGroups: { immediate: ["qa-task"], today: [], later: [] },
    deadlineGroups: { today: [], tomorrow: [], thisWeek: [], later: [] },
    replyNeeded: [],
    activeDocuments: [{ id: DOC_A, fileName: "munkaszerzodes_tervezet.docx", reason: "REVIEW_PENDING" }],
  },
  warnings: [],
};

const WORK_CONTEXT = {
  [DOC_A]: {
    id: DOC_A, title: "Munkaszerződés tervezet", fileName: "munkaszerzodes_tervezet.docx",
    documentRole: "munkáltatói szerződés", workStatus: "IN_PROGRESS",
    workInstruction: "Ellenőrizd a próbaidőre és a felmondási időre vonatkozó kikötéseket.",
    workInstructionUpdatedAt: "2026-08-21T10:00:00.000Z",
    workInstructionUpdatedBy: { id: AUTH_ME.id, name: AUTH_ME.name },
    responsible: { id: AUTH_ME.id, name: AUTH_ME.name }, reviewer: null,
    dueDate: "2026-09-30T00:00:00.000Z", workPriority: "HIGH", nextStep: "Kikötések egyeztetése",
    category: "szerzodes", documentType: "CONTRACT", currentVersion: 2, updatedAt: "2026-08-22T10:00:00.000Z",
    linkedTasks: [{ linkId: "qa-link", taskId: "qa-task", title: "QA task", status: "TODO", dueDate: null, assignee: null }],
    source: null,
  },
  [DOC_B]: {
    id: DOC_B, title: "Adatfeldolgozási szerződés", fileName: "adatfeldolgozasi_szerzodes.docx",
    documentRole: "adatfeldolgozói szerződés", workStatus: "APPROVED",
    workInstruction: null, workInstructionUpdatedAt: null, workInstructionUpdatedBy: null,
    responsible: { id: AUTH_ME.id, name: AUTH_ME.name }, reviewer: null,
    dueDate: null, workPriority: null, nextStep: null, category: "adatvedelem", documentType: "CONTRACT",
    currentVersion: 1, updatedAt: "2026-08-25T14:30:00.000Z", linkedTasks: [], source: null,
  },
};

const LEGAL_ANALYSES = {
  [DOC_A]: [],
  [DOC_B]: [{
    id: "qa-analysis", caseId: CASE_ID, documentId: DOC_B, documentSourceType: "DOCUMENT",
    title: "Adatfeldolgozási kockázatok", analysisText: "QA", status: "APPROVED", sourceType: "PASTED_AI_OUTPUT",
    aiToolName: null, anonymizedInputSnapshot: null, riskMatrixDetected: true, missingDataDetected: false,
    suggestedChangesDetected: false, lawyerDecisionPointsDetected: false, createdById: null, reviewedById: null,
    reviewedAt: null, createdAt: "2026-08-26T08:00:00.000Z", updatedAt: "2026-08-27T08:00:00.000Z",
  }],
};

const ANONYMOUS = {
  [DOC_A]: [],
  [DOC_B]: [{
    id: "qa-anon", name: "Adatfeldolgozási szerződés (anonim)", sourceDocId: DOC_B, caseId: CASE_ID,
    aiTask: "REVIEW_RISKS", customPrompt: null, rehydrationStatus: null, rehydratedAt: null,
    createdAt: "2026-08-26T09:00:00.000Z", redactedText: "Anonimizált minta szöveg [SZEMÉLY_1] részére.",
    redactedItems: [
      { type: "PERSON", original: "QA Client", replacement: "[SZEMÉLY_1]", position: 0 },
      { type: "TAX", original: "12345678", replacement: "[ADO_1]", position: 20 },
    ],
  }],
};

const RESPONSIBILITY = {
  case: { id: CASE_ID, caseNumber: "QA-CASE-001", title: "QA Case", status: "ACTIVE", deadline: null, matterId: null },
  responsibleLawyer: { id: AUTH_ME.id, name: AUTH_ME.name, email: AUTH_ME.email, role: "ADMIN" },
  createdBy: null,
  collaborators: [],
  work: { openTaskCount: 0, overdueTaskCount: 0, dueSoonTaskCount: 0, reviewTaskCount: 0, blockedTaskCount: 0, assignedPeople: [] },
  time: { supported: true, matterId: null, totalMinutes: 0, currentUserMinutes: 0, activeTimerSupported: false },
  capabilities: {
    canChangeResponsibleLawyer: true, canAddCollaborator: true, canRemoveCollaborator: true,
    canChangeCollaboratorRole: true, canAssignWork: true, canRecordTime: true,
    canViewCaseTime: true, canViewTeamWorkload: true,
  },
};

function respond(url) {
  if (url.includes("/auth/me")) return AUTH_ME;
  if (url.includes("/cases?")) {
    return { data: [{ ...WORKSPACE.case, clientId: "qa-client" }], page: 1, limit: 200, total: 1, totalPages: 1 };
  }
  if (url.includes(`/cases/${CASE_ID}/responsibility`)) return RESPONSIBILITY;
  if (url.includes(`/cases/${CASE_ID}/collaborators`)) return [];
  if (url.includes(`/cases/${CASE_ID}/workflow-summary`)) return {
    caseId: CASE_ID, generatedAt: "2026-01-01T00:00:00.000Z",
    case: { displayName: "QA Case", reference: "QA-CASE-001", status: "ACTIVE" },
    nextAction: null, waitingOn: null, nextDeadline: null,
    taskStats: { open: 0, overdue: 0, dueSoon: 0, blocked: 0, review: 0 },
    latestCommunication: null, activeReview: null,
    responsibility: { responsibleLawyer: { id: AUTH_ME.id, displayName: AUTH_ME.name }, collaborators: [] },
    handoff: null,
    availability: { tasks: true, deadlines: true, communications: true, reviews: true, collaborators: true, handoff: true },
  };
  if (url.includes(`/cases/${CASE_ID}/work-items`)) return {
    caseId: CASE_ID, generatedAt: "2026-01-01T00:00:00.000Z",
    summary: { open: 0, mine: 0, overdue: 0, dueSoon: 0, blocked: 0, waiting: 0, reviewRequired: 0, handoffRequired: 0, completedRecently: 0 },
    items: [],
    availability: { taskTransitions: true, blockerState: true, waitingState: true, reviewWorkflow: true, handoffWorkflow: true },
  };
  if (url.includes(`/cases/${CASE_ID}/workflow-graph`)) return { caseId: CASE_ID, nodes: [], edges: [], currentStatus: "ACTIVE", possibleTransitions: [] };
  if (url.includes(`/cases/${CASE_ID}/workflow-history`)) return [];
  if (url.includes(`/cases/${CASE_ID}/workspace`)) return WORKSPACE;
  if (url.endsWith(`/cases/${CASE_ID}`) && !url.includes("/hourly-rates/")) return { ...WORKSPACE.case, clientId: "qa-client" };
  if (url.includes("/documents/") && url.includes("/work-context")) {
    const id = url.match(/\/documents\/([^/]+)\/work-context/)?.[1];
    return WORK_CONTEXT[id] || WORK_CONTEXT[DOC_A];
  }
  if (url.includes("/documents/") && url.includes("/legal-analyses")) {
    const id = url.match(/\/documents\/([^/]+)\/legal-analyses/)?.[1];
    return LEGAL_ANALYSES[id] || [];
  }
  if (url.includes("/anonymous-documents/by-source/")) {
    const id = url.match(/\/anonymous-documents\/by-source\/([^/?]+)/)?.[1];
    return ANONYMOUS[id] || [];
  }
  if (url.includes("/tasks")) return [];
  if (url.includes("/users")) return { data: [AUTH_ME] };
  if (url.includes("/hourly-rates/")) return {
    asOf: "2026-01-01T00:00:00.000Z",
    canManage: false,
    effective: {
      status: "UNRESOLVED", currency: "HUF", hourlyRate: null, scope: "UNRESOLVED",
      rateVersionId: null, effectiveFrom: null, caseMode: "INHERIT_CLIENT", caseVersionId: null,
    },
    next: null,
    history: [],
  };
  // Everything else fails closed (404), so the case-detail catch handlers
  // resolve them to null instead of receiving a wrong shape.
  return undefined;
}

async function installSession(page) {
  await page.addInitScript(({ profile }) => {
    localStorage.setItem("auth_token", "qa-workforce-token");
    sessionStorage.setItem("adminiculum_auth_profile", JSON.stringify(profile));
  }, { profile: AUTH_ME });
  await page.route("**/api/v1/**", async (route) => {
    const body = respond(route.request().url());
    if (body === undefined) {
      await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ status: 404, code: "QA_UNMOCKED_ENDPOINT" }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const consoleErrors = [];
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    page.on("pageerror", (error) => consoleErrors.push(error.stack || error.message));
    page.on("console", (message) => { if (message.type() === "error" && message.text().startsWith("Cannot")) consoleErrors.push(`console: ${message.text()}`); });

    await installSession(page);
    await page.goto(`${BASE_URL}/cases/${CASE_ID}`, { waitUntil: "networkidle" });

    const dashboard = page.locator('[data-testid="document-preparation-dashboard"]');
    try {
      await dashboard.waitFor({ state: "visible", timeout: 8000 });
    } catch (error) {
      const body = await page.locator("body").innerText().catch(() => "<no body>");
      console.error("DEBUG count:", await dashboard.count());
      console.error("DEBUG testids:", await page.evaluate(() => [...document.querySelectorAll("[data-testid]")].map((n) => n.getAttribute("data-testid")).join(",")));
      console.error("DEBUG body tail:", body.slice(-1200));
      console.error("DEBUG errors:", consoleErrors.join(" | "));
      throw error;
    }
    for (const tile of ["preparation-tile-feladat", "preparation-tile-helyzetallas", "preparation-tile-kockazat", "preparation-tile-anonim"]) {
      assert(await page.locator(`[data-testid="${tile}"]`).isVisible(), `${tile} must render`);
    }

    // 1. Selected document dashboard, no-risk / no-anonymization (doc A).
    const emptyRisk = await page.locator('[data-testid="preparation-risk-empty"]').innerText();
    assert(emptyRisk.includes("Még nincs kockázati mátrix."), "doc A must show the truthful empty risk state");
    const emptyAnon = await page.locator('[data-testid="preparation-anonymized-empty"]').innerText();
    assert(emptyAnon.includes("Nincs anonimizált változat."), "doc A must show the truthful empty anonymized state");
    const workInstruction = await page.locator('[data-testid="preparation-work-instruction"]').innerText();
    assert(workInstruction.includes("próbaidőre"), "Feladat tile must render the real work instruction");
    const owner = await page.locator('[data-testid="preparation-owner"]').innerText();
    assert(owner.includes(AUTH_ME.name), "Feladat tile must render the real responsible person");

    const overflow1440 = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    assert(!overflow1440, "1440 viewport must not overflow horizontally");
    await page.screenshot({ path: path.join(SHOTS, "selected-document-dashboard-1440.png"), fullPage: true });

    // 2. Delete confirmation dialog.
    await page.locator('[data-testid="preparation-delete"]').click();
    await page.getByText("Dokumentum törlése").first().waitFor({ state: "visible", timeout: 5000 });
    await page.screenshot({ path: path.join(SHOTS, "delete-confirmation-1440.png"), fullPage: true });
    await page.keyboard.press("Escape");

    // 3. Switch to the document that has a risk matrix and an anonymized copy.
    await page.locator('[data-testid="preparation-document-select"]').selectOption(DOC_B);
    await page.locator('[data-testid="preparation-risk-recorded"]').waitFor({ state: "visible", timeout: 10000 });
    const recorded = await page.locator('[data-testid="preparation-risk-recorded"]').innerText();
    assert(recorded.includes("Kockázati elemzés rögzítve"), "doc B must show the recorded risk state");
    await page.locator('[data-testid="preparation-anonymized-ready"]').waitFor({ state: "visible", timeout: 10000 });
    const meta = await page.locator('[data-testid="preparation-anonymized-meta"]').innerText();
    assert(meta.includes("2 elem anonimizálva"), "doc B must show the safe redacted item count");
    await page.screenshot({ path: path.join(SHOTS, "anonymized-and-risk-state-1440.png"), fullPage: true });

    // 4. Narrow layout — no horizontal overflow.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
    const overflow390 = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    assert(!overflow390, "390 viewport must not overflow horizontally");
    await page.screenshot({ path: path.join(SHOTS, "selected-document-dashboard-390.png"), fullPage: true });

    assert(consoleErrors.length === 0, `page errors: ${consoleErrors.join("; ")}`);
    await context.close();
    console.log("Document preparation browser QA passed.");
    console.log(`Screenshots: ${path.relative(ROOT, SHOTS)}`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
