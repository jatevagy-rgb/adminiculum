// WF02 + WF04 journey QA on the real integrated routes (mock API, no backend).
// Owned by PR454 continuation: exercises the mounted case overview (wide
// communication leaf, explicit-document risk matrix, safe prompt copying) and
// the case-create route (team/task intake, due presets, partial-success retry).
// Baseline synthetic fixtures follow wordWorkflowBrowserQA.mjs.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.CASE_AI_BASE || "http://127.0.0.1:3112";
const CASE_ID = "44444444-4444-4444-8444-444444444444";
const NEW_CASE_ID = "44444444-4444-4444-8444-444444444445";
const AUTH_ME = {
  id: "33333333-3333-4333-8333-333333333333",
  name: "QA Ügyvéd",
  email: "qa@example.test",
  role: "ADMIN",
  organizationId: "55555555-5555-4555-8555-555555555555",
};

const CASE_TITLE = "QA ügy titka 2026";
const CLIENT_NAME = "Titkos Ügyfél Zrt.";
const DUE = "2026-10-02T10:30:00.000Z";
const DOC1 = { id: "qa-doc-1", caseId: CASE_ID, fileName: "bérleti_szerzodes.docx", documentType: "CLIENT_INPUT", securityScanStatus: "CLEAN", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };
const DOC2 = { id: "qa-doc-2", caseId: CASE_ID, fileName: "melleklet.docx", documentType: "CLIENT_INPUT", securityScanStatus: "CLEAN", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };
const NEW_DOC = { id: "new-doc-1", caseId: NEW_CASE_ID, fileName: "uj_u gy.docx", documentType: "CLIENT_INPUT", securityScanStatus: "CLEAN", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };

function workspaceFor(id) {
  const docs = id === CASE_ID ? [DOC1, DOC2] : id === NEW_CASE_ID ? [NEW_DOC] : [];
  return {
    case: {
      id, caseNumber: id === CASE_ID ? "QA-1" : "QA-2", title: CASE_TITLE, status: "ACTIVE", priority: "MEDIUM",
      matterType: null, clientRole: null, matterId: null, deadline: null,
      client: { id: "client-1", name: CLIENT_NAME, colorKey: null }, assignedLawyer: null,
      description: "Ügyvédi ellenőrzés folyamatban.", nextStep: null,
      startingContext: { originReason: "Bérleti szerződés felülvizsgálata", currentSituation: "A szerződés ügyvédi ellenőrzése folyamatban.", clientExpectation: "Egyértelmű és teljesíthető kötelezettségek", urgentAction: null, nextStep: null, legacyOnly: false, empty: false },
      createdAt: null, updatedAt: null,
    },
    metrics: { openTaskCount: 0, documentCount: docs.length, openDeadlineCount: 0, communicationCount: 1, reviewCount: null, loggedMinutes: null },
    tasks: [],
    documents: docs.map((d) => ({ id: d.id, fileName: d.fileName, mimeType: d.mimeType, type: null, category: null, version: null, uploadedAt: null, uploadedBy: null, summary: null, commentCount: null, reviewSummary: null })),
    deadlines: [],
    time: { available: true, loggedMinutes: 0, billableMinutes: null },
    communications: [{ id: "mail-1", type: "EMAIL", subject: "Szerződéses feltételek egyeztetése", contentPreview: "A felek a fizetési feltételeket pontosították.", sender: "teszt@example.test", timestamp: DUE, internal: false }],
    activity: [],
    comments: [],
    cockpit: {
      urgency: "STEADY",
      nextStep: null,
      responsible: null,
      kpi: {
        openTasks: { count: 0, urgentCount: 0, secondary: "Nincs nyitott feladat" },
        deadlines: { count: 0, nextDueAt: null, secondary: "Nincs határidő" },
        communication: { count: 1, replyNeededCount: 0, secondary: "1 kapcsolt levél" },
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

function responsibility(id) {
  return {
    case: { id, caseNumber: "QA-1", title: CASE_TITLE, status: "ACTIVE", deadline: null, matterId: null },
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

const USER_1 = { id: "user-1", name: "Munkatárs Egy", email: "egy@example.test", role: "LAWYER", status: "ACTIVE" };
const USER_2 = { id: "user-2", name: "Munkatárs Kettő", email: "ketto@example.test", role: "PARTNER", status: "ACTIVE" };

const CASE_TYPE = {
  id: "ct-1", name: "Szerződés átvilágítás", slug: "contract-review", description: "Átvilágítás", isActive: true,
};
const CREATION_OPTION = {
  caseTypeDefinition: { id: "ct-1", name: "Szerződés átvilágítás", slug: "contract-review", description: "Átvilágítás" },
  template: null,
  workPackage: null,
};

// ---- mock state -------------------------------------------------------------
const caseWrites = [];
const collaboratorWrites = [];
const taskWrites = [];
let analysisSeq = 0;
const analysesByDoc = new Map(); // docId -> [{ id, caseId, documentId, title, sourceType, status, analysisText }]
let failSecondTask = false; // partial-success mode: the second task fails once

function caseIdFrom(url) {
  const m = url.match(/\/cases\/([0-9a-fA-F-]+)/);
  return m ? m[1] : null;
}

function commList() {
  return {
    communications: [
      { id: "mail-1", type: "EMAIL", subject: "Szerződéses feltételek egyeztetése", senderName: "Ügyfél Képviselő", senderEmail: "ugyfel@example.test", recipientName: null, recipientEmail: null, summary: "Fizetési feltételek", contentPreview: "A felek a fizetési feltételeket pontosították.", caseId: CASE_ID, clientId: "client-1", clientColorKey: null, documentId: null, createdById: "u-1", createdAt: "2026-09-28T08:00:00.000Z", updatedAt: "2026-09-28T08:00:00.000Z", attachmentCount: 1, sourceTaskCount: 0, providerConversationId: null, direction: "INBOUND", receivedAt: "2026-09-28T08:00:00.000Z", sentAt: null, effectiveMessageAt: "2026-09-28T08:00:00.000Z" },
      { id: "mail-2", type: "PHONE", subject: "Telefonos egyeztetés", senderName: "QA Ügyvéd", senderEmail: "qa@example.test", recipientName: null, recipientEmail: null, summary: "Időpont egyeztetés", contentPreview: "Következő héten egyeztetünk.", caseId: CASE_ID, clientId: "client-1", clientColorKey: null, documentId: null, createdById: "u-1", createdAt: "2026-09-29T09:00:00.000Z", updatedAt: "2026-09-29T09:00:00.000Z", attachmentCount: 0, sourceTaskCount: 0, providerConversationId: null, direction: "OUTBOUND", receivedAt: null, sentAt: "2026-09-29T09:00:00.000Z", effectiveMessageAt: "2026-09-29T09:00:00.000Z" },
    ],
    pagination: { total: 2, limit: 100, offset: 0 },
  };
}

function mock(url, method) {
  const ok = (body) => ({ status: 200, body });
  const id = caseIdFrom(url);
  if (url.includes("/auth/me")) return ok(AUTH_ME);
  if (url.includes("/case-history/cases/")) return ok({ items: [{ sourceKey: "timeline:event-1", kind: "AUDIT", occurredAt: "2026-10-01T10:00:00Z", title: "Ügy létrehozva", detail: null, authorName: "QA Ügyvéd", minutes: null }], nextCursor: null, totalMinutes: 0 });
  if (url.includes(`/cases/${CASE_ID}/workspace`) || url.includes(`/cases/${NEW_CASE_ID}/workspace`)) return ok(workspaceFor(id));
  if (url.includes(`/cases/${id}/responsibility`) && id) return ok(responsibility(id));
  if (url.includes("/responsible-candidates")) return ok({ items: [] });
  if (url.includes(`/cases/${id}/comments`) && id) return ok({ comments: [
    { id: 'note-1', caseId: id, parentId: null, author: { id: 'worker', displayName: 'Teszt Munkatárs' }, content: 'Belső ügyjegyzet', status: 'OPEN', createdAt: '2026-10-01T10:00:00Z', updatedAt: null, capabilities: { canResolve: false, canReopen: false, canDelete: false } },
  ] });
  if (url.includes(`/cases/${id}/documents`) && id && method === "GET") {
    const docs = id === CASE_ID ? [DOC1, DOC2] : id === NEW_CASE_ID ? [NEW_DOC] : [];
    return ok(docs);
  }
  if (url.includes("/legal-analyses") && method === "POST") {
    const docId = url.match(/\/documents\/([0-9a-zA-Z-]+)\/legal-analyses/)?.[1];
    const rec = { id: `analysis-${++analysisSeq}`, caseId: id, documentId: docId, title: "Kockázati mátrix (Word-workflow; önálló)", sourceType: "MANUAL", status: "DRAFT", analysisText: "", createdAt: "2026-10-01T12:00:00.000Z" };
    return { status: 201, body: rec };
  }
  if (url.includes("/legal-analyses")) {
    const docId = url.match(/\/documents\/([0-9a-zA-Z-]+)\/legal-analyses/)?.[1];
    if (docId) return ok(analysesByDoc.get(docId) ?? []);
    const analysisId = url.match(/\/legal-analyses\/([0-9a-zA-Z-]+)/)?.[1];
    if (analysisId) {
      for (const list of analysesByDoc.values()) {
        const found = list.find((a) => a.id === analysisId);
        if (found) return ok(found);
      }
      return { status: 404, body: { message: "not found" } };
    }
  }
  if (url.includes(`/cases/${id}/timeline`) && id) return ok([]);
  if (url.includes(`/cases/${id}/work-items`) && id) return ok({ caseId: id, generatedAt: "2026-09-01T00:00:00.000Z", summary: { open: 0, mine: 0, overdue: 0, dueSoon: 0, blocked: 0, reviewRequired: 0, handoffRequired: 0, waiting: 0 }, items: [], availability: { taskTransitions: true, blockerState: true, waitingState: true, reviewWorkflow: true, handoffWorkflow: true } });
  if (url.includes(`/cases/${id}/activity`) && id) return ok({ caseId: id, generatedAt: "2026-09-01T00:00:00.000Z", pagination: { limit: 30, offset: 0, returned: 0 }, items: [] });
  if (url.includes(`/cases/${id}/workflow-summary`) && id) return ok({ caseId: id, generatedAt: "2026-09-01T00:00:00.000Z", case: { displayName: CASE_TITLE }, nextAction: null, waitingOn: null, nextDeadline: null, taskStats: { open: 0, overdue: 0, dueSoon: 0, blocked: 0, review: 0 }, latestCommunication: null, activeReview: null, responsibility: { responsibleLawyer: null, collaborators: [] }, handoff: null, availability: { tasks: true, deadlines: true, communications: true, reviews: true, collaborators: true, handoff: true } });
  if (url.includes("/ai-prompts/") && url.includes("/drafts")) return ok({ items: [] });
  if (url.includes("/ai-prompts/templates")) return ok({ items: [] });
  if (url.includes(`/billing-preparation/case/`)) return ok({ caseId: id, billableMinutes: 0, nonBillableMinutes: 0, needsReviewMinutes: 0, attributedMinutes: 0, byLawyer: [], rateStatus: "RATE_NOT_CONFIGURED", feeEstimate: null, billingReadiness: "NO_BILLABLE_TIME" });
  if (url.includes(`/cases/${id}/collaborators`) && id && method === "GET") return ok([]);
  if (url.includes(`/cases/${id}/workflow-graph`) && id) return ok({ nodes: [], edges: [] });
  if (url.includes(`/cases/${id}/workflow-history`) && id) return ok([]);
  if (url.includes(`/cases/${id}/work-package`) && id) return ok(null);
  if (url.includes("/hourly-rates/clients/")) return ok({ asOf: "2026-10-01T00:00:00.000Z", canManage: false, effective: { status: "UNRESOLVED", currency: "HUF", hourlyRate: null, scope: "UNRESOLVED", rateVersionId: null, effectiveFrom: null, caseMode: "EXPLICIT_RATE", caseVersionId: null }, next: null, history: [] });
  if (url.includes("/agenda")) return ok({ generatedAt: "2026-09-01T00:00:00.000Z", timezone: "Europe/Budapest", range: { from: "2026-09-01T00:00:00.000Z", to: "2026-10-01T00:00:00.000Z" }, scope: "CASE", summary: { overdue: 0, today: 0, tomorrow: 0, thisWeek: 0, later: 0, completedRecently: 0 }, days: [], pagination: { limit: 20, offset: 0, hasMore: false }, availability: { taskDueDates: true, caseDeadlines: true, hearings: true, reminders: true, teamScope: true, externalCalendar: false } });
  if (url.includes("/communications/") && method === "GET") {
    const commId = url.match(/\/communications\/([0-9a-zA-Z-]+)/)?.[1];
    if (commId === "mail-1") return ok({ ...commList().communications[0], content: "Tisztelt Ügyvéd Úr!\n\nA felek a fizetési feltételeket pontosították.\n\n-----Original Message-----\nFrom: korabbi@example.test\n> Korábbi szöveg az idézett előzményből.", recipients: [], mailboxAddress: null, mailboxConnectionId: null, mailboxProviderMessageId: null, bodyHtmlSanitized: null, attachments: [{ id: "att-1", fileName: "tervezet.pdf", fileType: "application/pdf", description: null, url: null, spItemId: null, communicationId: "mail-1", documentId: null, uploadedById: "u-1", createdAt: "2026-09-28T08:00:00.000Z" }], relatedTasks: [], timelineEvents: [] });
    if (commId === "mail-2") return ok({ ...commList().communications[1], content: "Következő héten egyeztetünk.", recipients: [], mailboxAddress: null, mailboxConnectionId: null, mailboxProviderMessageId: null, bodyHtmlSanitized: null, attachments: [], relatedTasks: [], timelineEvents: [] });
  }
  if (url.includes("/communications") && method === "GET") return ok(commList());
  if (url.includes("/contracts/editor-template-capabilities")) return ok({ availability: { catalog: false, templateDetail: false, variablePreview: false, generation: false, generatedDocxDownload: false, automaticLocalImport: false, clauseCatalog: false, customClauses: false }, featureFlags: { templateGenerationEnabled: false, documentProcessingEnabled: false } });
  if (url.includes("/contracts")) return ok([]);
  if (url.includes("/users")) return ok({ data: [USER_1, USER_2] });
  if (url.includes("/notifications/unread-count")) return ok({ unreadCount: 0 });
  if (url.includes("/anonymous-documents")) return ok([]);
  if (url.includes("/work-package-admin/case-types/creation-options")) return ok({ items: [CREATION_OPTION] });
  if (url.includes("/work-package-admin/case-types")) return ok({ items: [CASE_TYPE] });
  if (url.includes("/clients?") || url.endsWith("/clients")) return ok({ data: [{ id: "client-1", name: CLIENT_NAME, colorKey: null, status: "ACTIVE" }] });
  if (url.includes("/clients/")) return ok(null);
  if (url.includes("/cases?page=")) {
    return ok({ data: [{ id: CASE_ID, caseNumber: "QA-1", title: CASE_TITLE, clientName: CLIENT_NAME, matterType: "", status: "ACTIVE", priority: "MEDIUM", deadline: null, clientRole: null, clientColorKey: null, createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z", clientId: "client-1", assignedLawyer: null }], page: 1, limit: 200, total: 1, totalPages: 1 });
  }
  if (url.endsWith(`/cases/${CASE_ID}`) || url.endsWith(`/cases/${NEW_CASE_ID}`)) {
    return ok({ id, caseNumber: id === CASE_ID ? "QA-1" : "QA-2", title: CASE_TITLE, clientName: CLIENT_NAME, matterType: "", status: "ACTIVE", priority: "MEDIUM", deadline: null, clientRole: null, clientColorKey: null, createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z", clientId: "client-1", assignedLawyer: null });
  }
  if (url.includes(`/cases/${id}/lifecycle`) && id) return ok({ caseId: id, status: "ACTIVE", lifecycleCategory: "ACTIVE", blockers: [], closureReadiness: { ready: false, reasons: [] }, capabilities: { canClose: false }, availability: {} });
  if (url.includes("/tasks") && method === "GET") return ok([]);
  if (url.includes("/work-context")) return ok({ id: "qa-doc-1", title: "Bérleti szerződés", fileName: "bérleti_szerzodes.docx", documentRole: null, workStatus: "TODO", workInstruction: null, workInstructionUpdatedAt: null, workInstructionUpdatedBy: null, responsible: null, reviewer: null, dueDate: null, workPriority: null, nextStep: null, category: null, documentType: null, currentVersion: null, updatedAt: null, linkedTasks: [], source: null });
  if (url.includes("/client-publications/") && url.includes("/overview")) return ok({ documentPublications: [], matterPublications: [], grants: [], gates: {}, warnings: [], history: [], clientId: null });
  if (url.endsWith("/milestones/draft")) return ok({ publicationId: null, publicationStatus: null, draft: [], publishedMilestones: [], publishedProgress: null });
  if (url.endsWith("/review-projection")) return ok(null);
  if (url.includes("/documents/") && url.includes("/versions")) return ok({ documentId: "qa-doc-1", versions: [] });
  if (url.includes("/review-rail")) return ok({ documentId: "qa-doc-1", documentVersionId: null, versionNumber: 1, counts: { commentCount: 0, modificationProposalCount: 0, pendingProposalCount: 0, acceptedProposalCount: 0, rejectedProposalCount: 0 }, readyForCorrection: false, comments: [], proposals: [] });
  if (url.endsWith("/annotations")) return ok({ items: [], pagination: { total: 0, limit: 50, offset: 0 } });
  if (url.endsWith("/client-house-style")) return ok(null);
  if (url.endsWith("/review-summary")) return ok(null);
  return ok({ items: [] });
}

const SHOTS = path.resolve(process.env.WF02_OUTPUT || "test-results/wf02wf04/browser");
fs.mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch({ headless: true, channel: "chrome" });
try {
  for (const width of (process.env.WF09_WIDTHS ? process.env.WF09_WIDTHS.split(",").map(Number) : [390, 768, 1440])) {
    // Reset all write state per width.
    caseWrites.length = 0; collaboratorWrites.length = 0; taskWrites.length = 0;
    analysesByDoc.clear(); analysisSeq = 0;
    failSecondTask = width === 768; // partial-success mode at exactly one width
    const context = await browser.newContext({ viewport: { width, height: 1000 }, locale: "hu-HU" });
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    const errors = [];
    page.on("pageerror", (e) => { errors.push(e.stack || e.message); console.error("PAGE_ERROR", e.stack || e.message); });
    page.on("console", (msg) => { if (msg.type() === "error") console.error(msg.text()); });
    await page.addInitScript((profile) => { localStorage.setItem("auth_token", "qa-workforce-token"); sessionStorage.setItem("adminiculum_auth_profile", JSON.stringify(profile)); }, AUTH_ME);
    await page.route("**/api/v1/**", (route) => {
      const req = route.request();
      const url = req.url();
      const method = req.method();
      const body = req.postDataJSON();
      // POST /cases/:id/collaborators — team additions (must precede the generic cases match)
      if (url.includes(`/api/v1/cases/${NEW_CASE_ID}/collaborators`) && method === "POST") {
        collaboratorWrites.push(body);
        return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ id: "collab-1", caseId: NEW_CASE_ID, userId: body.userId, role: body.role }) });
      }
      // POST /cases — create (canonical case creation)
      if (url.endsWith("/api/v1/cases") && method === "POST") {
        caseWrites.push(body);
        return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ id: NEW_CASE_ID, caseNumber: "QA-2", title: body.title, clientId: body.clientId, status: "ACTIVE" }) });
      }
      // POST /tasks — per-person tasks
      if (url.includes("/api/v1/tasks") && method === "POST") {
        taskWrites.push(body);
        if (failSecondTask && body.title === "Második feladat" && taskWrites.filter((w) => w.title === "Második feladat").length === 1) {
          return route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ message: "synthetic task failure" }) });
        }
        return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ id: "task-1", caseId: body.caseId, title: body.title, dueDate: body.dueDate ?? null, status: "TODO" }) });
      }
      // POST /documents/:id/legal-analyses — matrix create
      if (url.includes("/legal-analyses") && method === "POST") {
        const docId = url.match(/\/documents\/([0-9a-zA-Z-]+)\/legal-analyses/)?.[1];
        const rec = { id: `analysis-${++analysisSeq}`, caseId: body.caseId, documentId: docId, title: body.title, sourceType: body.sourceType, status: body.status ?? "DRAFT", analysisText: body.analysisText, createdAt: "2026-10-01T12:00:00.000Z" };
        if (!analysesByDoc.has(docId)) analysesByDoc.set(docId, []);
        analysesByDoc.get(docId).push(rec);
        return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(rec) });
      }
      if (url.includes("/legal-analyses") && method === "PATCH") {
        const analysisId = url.match(/\/legal-analyses\/([0-9a-zA-Z-]+)/)?.[1];
        for (const list of analysesByDoc.values()) {
          const found = list.find((a) => a.id === analysisId);
          if (found) { Object.assign(found, body); return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(found) }); }
        }
      }
      const r = mock(url, method);
      return route.fulfill({ status: r.status, contentType: "application/json", body: JSON.stringify(r.body) });
    });
    await page.route("https://**", (route) => route.abort());
    const noOverflow = async () => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `overflow at ${width}`);

    // ---------- 1. Case overview journey (WF04 mounts) ----------------------
    await page.goto(`${BASE}/cases/${CASE_ID}`, { waitUntil: "domcontentloaded", timeout: 120000 });
    await page.locator('[data-testid="word-case-context"]').waitFor();
    await page.getByText("Csak belső nézet", { exact: true }).waitFor();

    // Wide communication leaf: list + reader + quoted history.
    const leaf = page.locator('[data-testid="word-wide-communication-leaf"]');
    await leaf.waitFor();
    await leaf.getByText("Szerződéses feltételek egyeztetése", { exact: true }).first().waitFor();
    await leaf.locator('[data-testid="comm-thread-item-mail-1"]').click();
    await leaf.locator('[data-testid="comm-main-text"]').getByText("A felek a fizetési feltételeket pontosították.").waitFor();
    await leaf.locator('[data-testid="toggle-quoted-history-btn"]').click();
    await leaf.locator('[data-testid="comm-quoted-text"]').waitFor();
    assert.match(await leaf.locator('[data-testid="comm-quoted-text"]').innerText(), /Korábbi szöveg az idézett előzményből/);

    // Risk matrix: explicit scoped selector, save truthfully unavailable without a target.
    const matrixSection = page.locator('[data-testid="case-risk-matrix-section"]');
    await matrixSection.waitFor();
    const select = matrixSection.locator('[data-testid="risk-matrix-document-select"]');
    assert.equal(await select.inputValue(), "");
    const saveBtn = matrixSection.locator('[data-testid="save-risk-matrix-btn"]');
    await page.waitForFunction(() => document.querySelector('[data-testid="save-risk-matrix-btn"]')?.disabled === true, undefined, { timeout: 15000 });
    assert.match(await matrixSection.innerText(), /válasszon ki egy konkrét dokumentumot/i);
    await select.selectOption("qa-doc-1");
    await page.waitForFunction(() => document.querySelector('[data-testid="save-risk-matrix-btn"]')?.disabled === false, undefined, { timeout: 15000 });
    await matrixSection.locator('[data-testid="empty-add-risk-btn"]').click();
    await matrixSection.locator('textarea[aria-label="Kockázat leírása"]').fill("QA ügy saját kockázata");
    await saveBtn.click();
    await matrixSection.locator('[data-testid="risk-save-success-toast"]').waitFor();
    const analysisList = analysesByDoc.get("qa-doc-1") ?? [];
    assert.equal(analysisList.length, 1);
    assert.equal(analysisList[0].caseId, CASE_ID);
    assert.equal(analysisList[0].documentId, "qa-doc-1");
    assert.match(analysisList[0].analysisText, /QA ügy saját kockázata/);
    // Reload: the saved matrix is durable — selecting the same document again
    // reloads the persisted analysis (the host selection is not URL state).
    await page.reload({ waitUntil: "domcontentloaded", timeout: 120000 });
    await matrixSection.waitFor();
    assert.equal(await select.inputValue(), "", "document selection must be explicit again after a reload");
    await select.selectOption("qa-doc-1");
    await page.waitForFunction(() => document.querySelector('[data-testid="save-risk-matrix-btn"]')?.disabled === false, undefined, { timeout: 15000 });
    await matrixSection.locator('[data-testid="risk-matrix-table"]').getByText("QA ügy saját kockázata", { exact: true }).waitFor();

    // Prompt boundary: without a granted clipboard the copy must either land in
    // the clipboard or open the safe fallback — never publish or write.
    const promptBtn = page.locator('[data-testid="compact-prompt-btn-risk-matrix"]');
    const fallbackDialog = page.locator('[role="dialog"]', { has: page.locator('textarea[aria-label="Másolandó prompt szöveg"]') });
    const assertNeutralPrompt = (text) => {
      assert.match(text, /Kockázati mátrix/);
      assert.match(text, /Nem áll rendelkezésre külön anonimizált háttérszöveg/);
      assert.doesNotMatch(text, new RegExp(CASE_TITLE));
      assert.doesNotMatch(text, new RegExp(CLIENT_NAME));
      assert.doesNotMatch(text, /Bérleti szerződés felülvizsgálata/);
    };
    await promptBtn.click();
    const firstOutcome = await Promise.any([
      fallbackDialog.waitFor({ state: "visible", timeout: 8000 }).then(() => "dialog"),
      page.waitForFunction(() => document.querySelector('[data-testid="compact-prompt-btn-risk-matrix"]')?.textContent?.includes("Másolva"), undefined, { timeout: 8000 }).then(() => "copied"),
    ]).catch(() => "none");
    if (firstOutcome === "dialog") {
      assertNeutralPrompt(await fallbackDialog.locator("textarea").inputValue());
      await fallbackDialog.getByRole("button", { name: "Kész, bezárás" }).click();
    } else if (firstOutcome === "copied") {
      // transient copy state observed; wait for it to revert before the next step
      await page.waitForFunction(() => !document.querySelector('[data-testid="compact-prompt-btn-risk-matrix"]')?.textContent?.includes("Másolva"), undefined, { timeout: 8000 });
    } else {
      assert.fail("first copy must either open the fallback or show the copied state");
    }
    // Granted clipboard -> success is clipboard success; content stays neutral.
    await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE });
    await promptBtn.click();
    const grantedOutcome = await Promise.any([
      fallbackDialog.waitFor({ state: "visible", timeout: 8000 }).then(() => "dialog"),
      page.waitForFunction(() => document.querySelector('[data-testid="compact-prompt-btn-risk-matrix"]')?.textContent?.includes("Másolva"), undefined, { timeout: 8000 }).then(() => "copied"),
    ]).catch(() => "none");
    assert.notEqual(grantedOutcome, "none", "granted copy must either copy to the clipboard or open the fallback");
    if (grantedOutcome === "copied") {
      const clipboardText = await page.evaluate(() => navigator.clipboard.readText().catch(() => null));
      if (clipboardText !== null) assertNeutralPrompt(clipboardText);
    } else {
      assertNeutralPrompt(await fallbackDialog.locator("textarea").inputValue());
      await fallbackDialog.getByRole("button", { name: "Kész, bezárás" }).click();
    }
    assert.equal(caseWrites.length, 0, "a prompt copy must never write to the backend");
    assert.equal(analysesByDoc.get("qa-doc-1").length, 1, "a prompt copy must never publish an analysis");

    await page.screenshot({ path: path.join(SHOTS, `overview-journey-${width}.png`), fullPage: true });
    await noOverflow();
    await context.close();

    // ---------- 2. Case-create journey (WF02 intake) --------------------------
    const createContext = await browser.newContext({ viewport: { width, height: 1000 }, locale: "hu-HU" });
    const createPage = await createContext.newPage();
    createPage.setDefaultTimeout(30000);
    const createErrors = [];
    createPage.on("pageerror", (e) => { createErrors.push(e.stack || e.message); console.error("CREATE_PAGE_ERROR", e.stack || e.message); });
    createPage.on("console", (msg) => { if (msg.type() === "error") console.error("CREATE_CONSOLE", msg.text()); });
    await createPage.addInitScript((profile) => { localStorage.setItem("auth_token", "qa-workforce-token"); sessionStorage.setItem("adminiculum_auth_profile", JSON.stringify(profile)); }, AUTH_ME);
    await createPage.route("**/api/v1/**", (route) => {
      const req = route.request();
      const url = req.url();
      const method = req.method();
      const body = req.postDataJSON();
      if (url.includes(`/api/v1/cases/${NEW_CASE_ID}/collaborators`) && method === "POST") {
        collaboratorWrites.push(body);
        return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ id: "collab-1", caseId: NEW_CASE_ID, userId: body.userId, role: body.role }) });
      }
      if (url.endsWith("/api/v1/cases") && method === "POST") {
        caseWrites.push(body);
        return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ id: NEW_CASE_ID, caseNumber: "QA-2", title: body.title, clientId: body.clientId, status: "ACTIVE" }) });
      }
      if (url.includes("/api/v1/tasks") && method === "POST") {
        taskWrites.push(body);
        if (failSecondTask && body.title === "Második feladat" && taskWrites.filter((w) => w.title === "Második feladat").length === 1) {
          return route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ message: "synthetic task failure" }) });
        }
        return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ id: "task-1", caseId: body.caseId, title: body.title, dueDate: body.dueDate ?? null, status: "TODO" }) });
      }
      if (url.includes("/legal-analyses") && method === "POST") {
        const docId = url.match(/\/documents\/([0-9a-zA-Z-]+)\/legal-analyses/)?.[1];
        const rec = { id: `analysis-${++analysisSeq}`, caseId: body.caseId, documentId: docId, title: body.title, sourceType: body.sourceType, status: body.status ?? "DRAFT", analysisText: body.analysisText, createdAt: "2026-10-01T12:00:00.000Z" };
        if (!analysesByDoc.has(docId)) analysesByDoc.set(docId, []);
        analysesByDoc.get(docId).push(rec);
        return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(rec) });
      }
      const r = mock(url, method);
      return route.fulfill({ status: r.status, contentType: "application/json", body: JSON.stringify(r.body) });
    });
    await createPage.route("https://**", (route) => route.abort());

    await createPage.goto(`${BASE}/cases`, { waitUntil: "domcontentloaded", timeout: 120000 });
    const newCaseButton = createPage.getByRole("button", { name: "Új ügy" }).first();
    await newCaseButton.waitFor();
    // The Next dev overlay host can sit above the page even when empty; drop it
    // before interacting (dev-only artefact, never part of the product DOM).
    await createPage.evaluate(() => { document.querySelectorAll("nextjs-portal").forEach((el) => el.remove()); });
    await newCaseButton.click();
    const dialog = createPage.locator("form").filter({ has: createPage.locator('[data-testid="intake-team-tasks"]') });
    await dialog.locator('#existing-case-type').waitFor();
    // Client + title + type + responsible lawyer.
    await dialog.getByLabel(/Ügyfél/).selectOption("client-1");
    await dialog.getByLabel(/Ügy neve/).fill("Új ügy a tesztből");
    await dialog.getByLabel("Meglévő ügytípus kiválasztása").selectOption("ct-1");
    await dialog.getByLabel("Felelős ügyvéd").selectOption("user-1");
    // Team + tasks: responsible lawyer is distinct from collaborators.
    await dialog.locator('[data-testid="intake-team-tasks"] summary').click();
    await dialog.locator('[data-testid="responsible-lawyer-note"]').getByText("Munkatárs Egy").waitFor();
    assert.equal(await dialog.locator('[data-testid="collaborator-option"]').count(), 1, "responsible lawyer must not be a plain collaborator");
    assert.equal(await dialog.locator('[data-testid="collaborator-user-1"]').count(), 0);
    await dialog.locator('[data-testid="collaborator-user-2"]').check();
    // Empty task title blocks BEFORE any write.
    await dialog.locator('[data-testid="plan-add-task"]').click();
    await dialog.locator('[data-testid="planned-task-title"]').fill("Első feladat");
    await dialog.locator('[data-testid="planned-task-assignee"]').selectOption("user-1");
    await dialog.locator('[data-testid="due-preset-1h"]').click();
    assert.match(await dialog.locator('[data-testid="due-resolved-preview"]').innerText(), /1 óra/);
    await dialog.locator('[data-testid="plan-add-task"]').click();
    const rows = dialog.locator('[data-testid="planned-task-row"]');
    await rows.nth(1).locator('[data-testid="planned-task-title"]').fill("");
    await dialog.getByRole("button", { name: "Ügy létrehozása" }).click();
    await dialog.getByText("A feladat megnevezése kötelező.").waitFor();
    assert.equal(caseWrites.length, 0, "no case write before plan is valid");
    assert.equal(taskWrites.length, 0);
    // Fill the second row and submit; preset deadline resolves once to full ISO.
    await rows.nth(1).locator('[data-testid="planned-task-title"]').fill("Második feladat");
    await rows.nth(1).locator('[data-testid="planned-task-assignee"]').selectOption("user-2");
    await rows.nth(1).locator('[data-testid="due-preset-2d"]').click();
    const beforeSubmit = Date.now();
    await dialog.getByRole("button", { name: "Ügy létrehozása" }).click();
    if (failSecondTask) {
      await dialog.locator('[data-testid="intake-partial"]').waitFor();
      assert.equal(caseWrites.length, 1, "the case is created exactly once");
      assert.match(await dialog.locator('[data-testid="intake-partial"]').innerText(), /2 tétel|1 tétel|nem sikerült/);
      await dialog.locator('[data-testid="intake-partial-retry"]').click();
    }
    await createPage.waitForURL((u) => u.pathname.includes(`/cases/${NEW_CASE_ID}`), { timeout: 60000 });
    await createPage.locator('[data-testid="word-case-context"]').waitFor({ timeout: 60000 });
    assert.equal(caseWrites.length, 1, "retry must never re-create the case");
    assert.equal(collaboratorWrites.length, 1);
    assert.deepEqual(collaboratorWrites[0], { userId: "user-2", role: "COLLABORATOR" });
    const firstTaskWrites = taskWrites.filter((w) => w.title === "Első feladat");
    const secondTaskWrites = taskWrites.filter((w) => w.title === "Második feladat");
    assert.equal(firstTaskWrites.length, 1, "succeeded items are never re-sent");
    assert.ok(secondTaskWrites.length >= 1, "failed task is retried");
    for (const w of [firstTaskWrites[0], ...secondTaskWrites]) {
      assert.equal(w.caseId, NEW_CASE_ID);
      assert.match(w.dueDate, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/, "due date persists as a full resolved ISO timestamp");
    }
    const firstDue = new Date(firstTaskWrites[0].dueDate).getTime();
    assert.ok(firstDue >= beforeSubmit + 55 * 60000 && firstDue <= beforeSubmit + 70 * 60000, "1h preset resolves to ~1 hour from selection");
    const secondDue = new Date(secondTaskWrites[0].dueDate).getTime();
    assert.ok(secondDue >= beforeSubmit + 47 * 3600000 && secondDue <= beforeSubmit + 49 * 3600000, "2d preset resolves to ~48 hours from selection");
    await createPage.screenshot({ path: path.join(SHOTS, `create-journey-${width}.png`), fullPage: true });
    assert.deepEqual(createErrors, [], `create page errors at ${width}`);
    await createContext.close();
    console.log(`PASS ${width}: communication leaf, risk matrix identity+persistence, prompt boundary, intake plan validation, partial retry, resolved presets`);
  }
} finally {
  await browser.close();
}
