/**
 * Case Workspace "AI eredmények" tile — browser QA against the real served
 * frontend with a deterministic synthetic session and contract-compatible API
 * mocks. Never touches Azure or PostgreSQL.
 *
 * Run against an already-served frontend (dev or built):
 *   npx next dev -p 3099
 *   CASE_AI_BASE=http://127.0.0.1:3099 node tests/caseWorkspaceAiResultsQA.mjs
 *
 * Verifies at desktop and narrow viewports:
 *   - the AI eredmények section renders canonical results only (imported
 *     responses; preparation-only drafts stay out);
 *   - title, type, status, createdAt and linked documents are shown;
 *   - prompt internals / anonymized previews / raw responses never reach the
 *     page;
 *   - Megnyitás opens the existing AI preparation modal result view;
 *   - the empty state is truthful and the AI előkészítés action remains;
 *   - no external AI provider is ever contacted;
 *   - #400 Megjegyzések and the Műveletek bar remain on the page.
 */
import { chromium } from "playwright";

const BASE = process.env.CASE_AI_BASE || "http://127.0.0.1:3099";
const CASE_ID = "44444444-4444-4444-8444-444444444444";
const AUTH_ME = {
  id: "33333333-3333-4333-8333-333333333333",
  name: "QA Ügyvéd",
  email: "qa@example.test",
  role: "ADMIN",
  organizationId: "55555555-5555-4555-8555-555555555555",
};

const DRAFT_RESULT = {
  id: "draft-1",
  caseId: CASE_ID,
  promptTemplateId: "tpl-1",
  promptTemplateStableKey: "contract-review",
  promptTemplateVersion: 3,
  promptTemplateSnapshot: { title: "Szerződés átvilágítás", legalWorkCategory: "CONTRACT_REVIEW" },
  sourceDocumentIds: ["qa-doc-1"],
  sourceDocumentVersionIds: [],
  sourceTaskId: null,
  sourceWorkPackageItemId: null,
  selectedContext: {},
  anonymizedPreview: "ANONIMIZÁLT TITKOS SZÖVEG",
  externalPromptText: "Prompt: Szerződés átvilágítás\n\nAnonimizált kontextus előkészítve.",
  importedResponse: "AZ AI NYERS VÁLASZA TITKOS",
  rehydratedResponse: "Ez a rehidratált jogi eredmény szövege.",
  rehydrationWarnings: [],
  status: "AI_DRAFT",
  reviewerNotes: null,
  preparedById: "u-1",
  importedById: "u-1",
  verifiedById: null,
  approvedById: null,
  createdAt: "2026-09-26T09:15:00.000Z",
  updatedAt: "2026-09-26T10:00:00.000Z",
};

const DRAFT_PREPARED = {
  ...DRAFT_RESULT,
  id: "draft-2",
  status: "PREPARED",
  importedResponse: null,
  rehydratedResponse: null,
  createdAt: "2026-09-27T08:00:00.000Z",
};

const TEMPLATE = {
  id: "tpl-1",
  stableKey: "contract-review",
  version: 3,
  title: "Szerződés átvilágítás",
  description: "QA template",
  legalWorkCategory: "CONTRACT_REVIEW",
  caseTypeKeys: [],
  workPackageModuleKeys: [],
  taskTypes: [],
  isActive: true,
  createdAt: "2026-09-01T00:00:00.000Z",
};

function workspace() {
  return {
    case: {
      id: CASE_ID, caseNumber: "QA-1", title: "QA ügy", status: "ACTIVE", priority: "MEDIUM",
      matterType: null, clientRole: null, matterId: null, deadline: null,
      client: null, assignedLawyer: null, description: null, nextStep: null,
      startingContext: { originReason: null, currentSituation: null, clientExpectation: null, urgentAction: null, nextStep: null, legacyOnly: false, empty: true },
      createdAt: null, updatedAt: null,
    },
    metrics: { openTaskCount: 0, documentCount: 1, openDeadlineCount: 0, communicationCount: 0, reviewCount: null, loggedMinutes: null },
    tasks: [],
    documents: [
      { id: "qa-doc-1", fileName: "bérleti_szerzodes.docx", mimeType: null, type: null, category: null, version: null, uploadedAt: null, uploadedBy: null, summary: null, commentCount: null, reviewSummary: null },
    ],
    deadlines: [],
    time: { available: true, loggedMinutes: 0, billableMinutes: null },
    communications: [],
    activity: [],
    comments: [],
    cockpit: {
      urgency: "STEADY",
      nextStep: null,
      responsible: null,
      kpi: {
        openTasks: { count: 0, urgentCount: 0, secondary: "Nincs nyitott feladat" },
        deadlines: { count: 0, nextDueAt: null, secondary: "Nincs határidő" },
        communication: { count: 0, replyNeededCount: 0, secondary: "Nincs kommunikáció" },
        review: { count: 0, secondary: "Nincs review" },
        activeDocuments: { count: 0, secondary: "Nincs aktív dokumentum" },
      },
      taskGroups: { immediate: [], today: [], later: [] },
      deadlineGroups: { today: [], tomorrow: [], thisWeek: [], later: [] },
      replyNeeded: [],
      activeDocuments: [],
    },
    warnings: [],
  };
}

function responsibility() {
  return {
    case: { id: CASE_ID, caseNumber: "QA-1", title: "QA ügy", status: "ACTIVE", deadline: null, matterId: null },
    responsibleLawyer: null,
    createdBy: null,
    collaborators: [],
    work: { openTaskCount: 0, overdueTaskCount: 0, dueSoonTaskCount: 0, reviewTaskCount: 0, blockedTaskCount: 0, assignedPeople: [] },
    time: { supported: true, matterId: null, totalMinutes: null, currentUserMinutes: 0, activeTimerSupported: false },
    capabilities: {
      canChangeResponsibleLawyer: false, canAddCollaborator: false, canRemoveCollaborator: false,
      canChangeCollaboratorRole: false, canAssignWork: false, canRecordTime: false,
      canViewCaseTime: false, canViewTeamWorkload: false,
    },
    availability: { tasks: true, deadlines: true, communications: true, reviews: true, collaborators: true, handoff: true },
  };
}

let draftsState = [DRAFT_RESULT, DRAFT_PREPARED];

function mock(url) {
  if (url.includes("/auth/me")) return { status: 200, body: AUTH_ME };
  if (url.endsWith(`/api/v1/cases/${CASE_ID}`)) {
    return {
      status: 200,
      body: {
        id: CASE_ID, caseNumber: "QA-1", title: "QA ügy", clientName: "", matterType: "", status: "ACTIVE",
        priority: "MEDIUM", deadline: null, clientRole: null, clientColorKey: null,
        createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z", clientId: null, assignedLawyer: null,
      },
    };
  }
  if (url.includes(`/cases/${CASE_ID}/workspace`)) return { status: 200, body: workspace() };
  if (url.includes(`/cases/${CASE_ID}/responsibility`)) return { status: 200, body: responsibility() };
  if (url.includes(`/cases/${CASE_ID}/responsible-candidates`)) return { status: 200, body: { items: [] } };
  if (url.includes("/documents/qa-doc-1/work-context")) {
    return {
      status: 200,
      body: {
        id: "qa-doc-1", title: "Bérleti szerződés", fileName: "bérleti_szerzodes.docx", documentRole: null,
        workStatus: "TODO", workInstruction: null, workInstructionUpdatedAt: null, workInstructionUpdatedBy: null,
        responsible: null, reviewer: null, dueDate: null, workPriority: null, nextStep: null,
        category: null, documentType: null, currentVersion: null, updatedAt: null,
        linkedTasks: [], source: null,
      },
    };
  }
  if (url.includes("/legal-analyses")) return { status: 200, body: [] };
  if (url.includes(`/cases/${CASE_ID}/comments`)) return { status: 200, body: { comments: [] } };
  if (url.includes(`/cases/${CASE_ID}/work-package`)) return { status: 200, body: null };
  if (url.includes(`/cases/${CASE_ID}/documents`)) return { status: 200, body: [{ id: "qa-doc-1", fileName: "bérleti_szerzodes.docx" }] };
  if (url.includes(`/cases/${CASE_ID}/timeline`)) return { status: 200, body: [] };
  if (url.includes(`/cases/${CASE_ID}/work-items`)) {
    return {
      status: 200,
      body: {
        caseId: CASE_ID, generatedAt: "2026-09-01T00:00:00.000Z",
        summary: { open: 0, mine: 0, overdue: 0, dueSoon: 0, blocked: 0, reviewRequired: 0, handoffRequired: 0, waiting: 0 },
        items: [],
        availability: { taskTransitions: true, blockerState: true, waitingState: true, reviewWorkflow: true, handoffWorkflow: true },
      },
    };
  }
  if (url.includes(`/cases/${CASE_ID}/activity`)) {
    return {
      status: 200,
      body: {
        caseId: CASE_ID, generatedAt: "2026-09-01T00:00:00.000Z",
        pagination: { limit: 30, offset: 0, returned: 0 }, items: [],
      },
    };
  }
  if (url.includes(`/cases/${CASE_ID}/workflow-summary`)) {
    return {
      status: 200,
      body: {
        caseId: CASE_ID, generatedAt: "2026-09-01T00:00:00.000Z",
        case: { displayName: "QA ügy" },
        nextAction: null, waitingOn: null, nextDeadline: null,
        taskStats: { open: 0, overdue: 0, dueSoon: 0, blocked: 0, review: 0 },
        latestCommunication: null, activeReview: null,
        responsibility: { responsibleLawyer: null, collaborators: [] },
        handoff: null,
        availability: { tasks: true, deadlines: true, communications: true, reviews: true, collaborators: true, handoff: true },
      },
    };
  }
  if (url.includes(`/ai-prompts/cases/${CASE_ID}/drafts`)) return { status: 200, body: { items: draftsState } };
  if (url.includes("/ai-prompts/drafts/draft-1")) return { status: 200, body: DRAFT_RESULT };
  if (url.includes("/ai-prompts/templates")) return { status: 200, body: { items: [TEMPLATE] } };
  if (url.includes(`/billing-preparation/case/${CASE_ID}`)) {
    return {
      status: 200,
      body: {
        caseId: CASE_ID, billableMinutes: 0, nonBillableMinutes: 0, needsReviewMinutes: 0, attributedMinutes: 0,
        byLawyer: [], rateStatus: "RATE_NOT_CONFIGURED", feeEstimate: null, billingReadiness: "NO_BILLABLE_TIME",
      },
    };
  }
  if (url.includes("/tasks")) return { status: 200, body: [] };
  if (url.includes(`/cases/${CASE_ID}/collaborators`)) return { status: 200, body: [] };
  if (url.includes(`/cases/${CASE_ID}/workflow-graph`)) return { status: 200, body: { nodes: [], edges: [] } };
  if (url.includes(`/cases/${CASE_ID}/workflow-history`)) return { status: 200, body: [] };
  if (url.includes("/cases?page=")) {
    return {
      status: 200,
      body: {
        data: [{
          id: CASE_ID, caseNumber: "QA-1", title: "QA ügy", clientName: "", matterType: "", status: "ACTIVE",
          priority: "MEDIUM", deadline: null, clientRole: null, clientColorKey: null,
          createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z", clientId: null, assignedLawyer: null,
        }],
        page: 1, limit: 200, total: 1, totalPages: 1,
      },
    };
  }
  if (url.includes(`/hourly-rates/clients/`)) return { status: 200, body: { asOf: null, canManage: false, effective: null, next: null, history: [] } };
  if (url.includes("/agenda")) {
    return {
      status: 200,
      body: {
        generatedAt: "2026-09-01T00:00:00.000Z", timezone: "Europe/Budapest",
        range: { from: "2026-09-01T00:00:00.000Z", to: "2026-10-01T00:00:00.000Z" }, scope: "CASE",
        summary: { overdue: 0, today: 0, tomorrow: 0, thisWeek: 0, later: 0, completedRecently: 0 },
        days: [],
        pagination: { limit: 20, offset: 0, hasMore: false },
        availability: { taskDueDates: true, caseDeadlines: true, hearings: true, reminders: true, teamScope: true, externalCalendar: false },
      },
    };
  }
  if (url.includes("/communications")) return { status: 200, body: { communications: [] } };
  if (url.includes("/contracts/editor-template-capabilities")) {
    return {
      status: 200,
      body: {
        availability: { catalog: false, templateDetail: false, variablePreview: false, generation: false, generatedDocxDownload: false, automaticLocalImport: false, clauseCatalog: false, customClauses: false },
        featureFlags: { templateGenerationEnabled: false, documentProcessingEnabled: false },
      },
    };
  }
  if (url.includes("/contracts")) return { status: 200, body: [] };
  if (url.includes("/users")) return { status: 200, body: { data: [] } };
  if (url.includes("/notifications/unread-count")) return { status: 200, body: { unreadCount: 0 } };
  if (url.includes("/anonymous-documents")) return { status: 200, body: [] };
  return { status: 200, body: { items: [] } };
}

const results = [];
const record = (name, pass, detail) => results.push(`${pass ? "PASS" : "FAIL"} | ${name}${detail ? " | " + detail : ""}`);

async function openPage(browser, width) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, locale: "hu-HU" });
  const page = await context.newPage();
  const external = [];
  const debugLog = [];
  page.on("request", (req) => {
    const u = req.url();
    if (u.includes("/api/v1")) debugLog.push(`REQ: ${u}`);
    if (!u.startsWith(BASE) && !u.includes("/_next/")) external.push(u);
  });
  page.on("console", (msg) => { if (msg.type() === "error") debugLog.push(`console.error: ${msg.text().slice(0, 400)}`); });
  page.on("pageerror", (err) => debugLog.push(`pageerror: ${err?.stack || String(err)}`));
  await page.addInitScript(({ profile }) => {
    localStorage.setItem("auth_token", "qa-workforce-token");
    sessionStorage.setItem("adminiculum_auth_profile", JSON.stringify(profile));
  }, { profile: AUTH_ME });
  await page.route("**/api/v1/**", (route) => {
    const r = mock(route.request().url());
    return route.fulfill({ status: r.status, contentType: "application/json", body: JSON.stringify(r.body) });
  });
  await page.goto(`${BASE}/cases/${CASE_ID}`, { waitUntil: "domcontentloaded", timeout: 120000 });
  try {
    await page.waitForSelector('[data-testid="matter-hero"]', { timeout: 90000 });
  } catch (error) {
    debugLog.push(`BODY: ${(await page.locator("body").innerText()).slice(0, 2000)}`);
    throw new Error(`hero not found; debug:\n${debugLog.slice(-40).join("\n")}\n${String(error)}`);
  }
  return { context, page, external, debugLog };
}

const AI_PROVIDER_PATTERN = /openai|anthropic|claude\.ai|gemini|api\.ai|deepseek|mistral/i;

async function run() {
  const browser = await chromium.launch({ headless: true });

  // ---- Scenario A: results present (desktop) -------------------------------
  draftsState = [DRAFT_RESULT, DRAFT_PREPARED];
  {
    const { context, page, external, debugLog } = await openPage(browser, 1440);
    try {
      await page.waitForSelector('text=AI eredmények', { timeout: 30000 });
    } catch (error) {
      const body = await page.locator("body").innerText();
      console.log("=== BODY SNAPSHOT ===\n" + body.slice(0, 1500));
      console.log("=== DEBUG LOG ===\n" + debugLog.slice(-30).join("\n"));
      console.log("=== ERROR ===\n" + String(error).slice(0, 500));
      await page.screenshot({ path: "tmp_qa_debug.png", fullPage: false });
      throw error;
    }

    const itemCount = await page.locator('[data-testid="ai-result-item"]').count();
    record("results render one row per canonical output", itemCount === 1, `rows=${itemCount} (PREPARED excluded)`);

    const body = await page.locator("body").innerText();
    record("canonical title shown", body.includes("Szerződés átvilágítás"));
    record("canonical status label shown", body.toLowerCase().includes("ai-válasz importálva"));
    record("canonical type label shown", body.includes("Szerződés-elemzés"));
    record("linked document shown", body.includes("bérleti_szerzodes.docx"));
    record("no prompt internals leak", !body.includes("TITKOS"), "no TITKOS markers on page");
    record("no raw response leak", !body.includes("AZ AI NYERS VÁLASZA"));
    record("notes surface (#400) present", body.includes("Megjegyzések"));
    record("Műveletek action bar present", body.includes("AI előkészítés") && body.includes("Munkaidő rögzítése"));

    await page.locator('[data-testid="ai-result-open"]').first().click();
    await page.waitForSelector('[role="dialog"]', { timeout: 30000 });
    const dialogText = await page.locator('[role="dialog"]').innerText();
    record("Megnyitás opens the canonical modal", dialogText.includes("AI előkészítés"));
    record("modal shows the rehydrated result", dialogText.includes("Ez a rehidratált jogi eredmény szövege."));
    record("modal does not leak the raw imported response", !dialogText.includes("AZ AI NYERS VÁLASZA TITKOS"));
    await page.locator('[role="dialog"]').getByText("Bezárás").click();

    const aiCalls = external.filter((u) => AI_PROVIDER_PATTERN.test(u));
    record("no external AI call on workspace open", aiCalls.length === 0, aiCalls.length ? aiCalls.slice(0, 3).join(" | ") : "0 external AI requests");
    await context.close();
  }

  // ---- Scenario B: empty state (desktop) -----------------------------------
  draftsState = [];
  {
    const { context, page } = await openPage(browser, 1440);
    await page.waitForSelector('text=AI eredmények', { timeout: 30000 });
    const body = await page.locator("body").innerText();
    record("empty state is truthful", body.includes("Még nincs AI-eredmény ezen az ügyön."));
    const itemCount = await page.locator('[data-testid="ai-result-item"]').count();
    record("empty state renders no fake results", itemCount === 0, `rows=${itemCount}`);
    await context.close();
  }

  // ---- Scenario C: results present (narrow viewport) -----------------------
  draftsState = [DRAFT_RESULT, DRAFT_PREPARED];
  {
    const { context, page } = await openPage(browser, 390);
    await page.waitForSelector('text=AI eredmények', { timeout: 30000 });
    const tile = page.locator('[data-testid="ai-results-list"]');
    await tile.scrollIntoViewIfNeeded();
    record("tile visible at narrow viewport", await tile.isVisible());
    const openBtn = page.locator('[data-testid="ai-result-open"]').first();
    record("Megnyitás reachable at narrow viewport", await openBtn.isVisible());
    await context.close();
  }

  await browser.close();
  const failed = results.filter((r) => r.startsWith("FAIL")).length;
  console.log(results.join("\n"));
  console.log(`\n${results.length - failed}/${results.length} browser QA checks passed`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((error) => {
  console.error("QA run failed:", error);
  process.exit(1);
});
