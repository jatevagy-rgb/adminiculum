/**
 * Document reader authoring flow — live acceptance browser QA.
 *
 * Drives a real `next start` server (expected at QA_BASE_URL, default
 * http://127.0.0.1:3098) with the synthetic workforce session pattern from
 * `workforceBrowserFixtures.mjs` (no Azure, no DB, no production data) and
 * mocks every /api/v1 call the reader needs.
 *
 * It exercises the real selection -> toolbar -> composer -> save -> rail reload
 * -> card pipeline in Chromium and asserts the acceptance contract:
 *   - deep-scroll comment/proposal composers open beside their selected text
 *     without moving the shared scroll container (<= 50px drift);
 *   - typing and saving never move the scroll container;
 *   - the saved cards stay beside their own anchors (<= 180px) and never land
 *     at the fallback top:0;
 *   - colliding cards stack locally near their shared anchor;
 *   - after a full browser reload every card still resolves to its own anchor.
 *
 * Screenshots land in `qa-screenshots-document-reader-authoring/`.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AUTH_ME } from "./workforceBrowserFixtures.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE_URL = process.env.QA_BASE_URL || "http://127.0.0.1:3098";
const SHOTS = path.join(ROOT, "qa-screenshots-document-reader-authoring");

const CASE_ID = "qa-reader-case";
const DOC_ID = "qa-reader-doc";
const VERSION_ID = "qa-reader-version-1";

const OPEN_SCROLL_TOLERANCE_PX = 50;
const ANCHOR_PROXIMITY_PX = 180;

function buildVersionText() {
  const paragraphs = [];
  for (let i = 1; i <= 150; i += 1) {
    paragraphs.push(
      `${i}. § A Felek a jelen keretszerződés alapján vállalják, hogy a megbízási jogviszony keretében felmerülő valamennyi kötelezettségüket jóhiszeműen, a szerződéses célokkal összhangban, a polgári jog általános elveinek megfelelően teljesítik, és a teljesítés során a másik fél jogos érdekeit is kellő gondossággal figyelembe veszik.`,
    );
    paragraphs.push(
      `A szerződés ${i}. pontja szerinti szolgáltatás díja a mellékletben rögzített díjtétel alapján kerül elszámolásra; a felek a számlázás gyakoriságát negyedévente felülvizsgálják, és az esetleges módosításokat írásban, közös megegyezéssel rögzítik a kiegészítő megállapodásban. A késedelmes teljesítés esetére a felek napi késedelmi kötbért kötnek ki, amelynek mértéke nem haladhatja meg a vonatkozó jogszabályi felső határt.`,
    );
  }
  return paragraphs.join("\n\n");
}

const VERSION_TEXT = buildVersionText();
const offsetOf = (needle) => VERSION_TEXT.indexOf(needle);

const CASE_RECORD = {
  id: CASE_ID,
  caseNumber: "QA-READER-001",
  title: "Reader QA Case",
  status: "ACTIVE",
  priority: "NORMAL",
  matterType: "CONTRACT",
  clientRole: "Ügyfél",
  matterId: null,
  deadline: "2026-12-31T00:00:00.000Z",
  client: { id: "qa-client", name: "QA Client", colorKey: null },
  assignedLawyer: { id: AUTH_ME.id, name: AUTH_ME.name },
  description: null,
  nextStep: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const DOC_ITEM = {
  id: DOC_ID,
  caseId: CASE_ID,
  fileName: "hosszu-keretszerzodes_vegleges.docx",
  documentType: "UPLOADED",
  spItemId: null,
  spWebUrl: null,
  version: "1",
  folder: "Feltöltve",
  isLatest: true,
  createdAt: "2026-08-20T09:00:00.000Z",
  updatedAt: "2026-08-20T09:00:00.000Z",
  securityScanStatus: "CLEAN",
  type: "CONTRACT",
  category: "szerzodes",
  mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

const VERSION_ITEM = {
  id: VERSION_ID,
  documentId: DOC_ID,
  versionNumber: 1,
  uploadedBy: { id: AUTH_ME.id, name: AUTH_ME.name },
  uploadedAt: "2026-08-20T09:00:00.000Z",
  originalFileName: "hosszu-keretszerzodes_vegleges.docx",
  mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  size: 1024,
  storageReference: "qa-storage-ref",
  previousVersionId: null,
  isCurrent: true,
  reviewStatus: "NONE",
  publicationStatus: "DRAFT",
  uploadSource: "UPLOAD",
  versionType: "IMMUTABLE",
  spItemId: null,
  spWebUrl: null,
  securityScanStatus: "CLEAN",
};

const WORK_CONTEXT = {
  id: DOC_ID,
  title: "Hosszú keretszerződés",
  fileName: DOC_ITEM.fileName,
  documentRole: null,
  workStatus: "IN_PROGRESS",
  workInstruction: null,
  workInstructionUpdatedAt: null,
  workInstructionUpdatedBy: null,
  responsible: { id: AUTH_ME.id, name: AUTH_ME.name },
  reviewer: null,
  dueDate: null,
  workPriority: null,
  nextStep: null,
  category: "szerzodes",
  documentType: "CONTRACT",
  currentVersion: 1,
  updatedAt: "2026-08-20T09:00:00.000Z",
  linkedTasks: [],
  source: null,
};

const state = {
  offsetById: {},
  comments: [
    {
      id: "qa-comment-legacy",
      reviewComment: "Régi észrevétel.",
      selectedText: "1. § A Felek a jelen keretszerződés alapján vállalják",
      startOffset: null,
      endOffset: null,
      textPrefix: null,
      textSuffix: null,
      contentFingerprint: null,
      createdBy: { id: "qa-legacy-user", name: "Korábbi ügyvéd" },
      createdAt: "2026-05-01T08:00:00.000Z",
      resolvedAt: null,
      replyCount: 0,
    },
    {
      id: "qa-comment-existing-mid",
      reviewComment: "Középső kikötés ellenőrizve.",
      selectedText: "75. § A Felek a jelen keretszerződés alapján vállalják, hogy a megbízási jogviszony keretében",
      startOffset: null,
      endOffset: null,
      textPrefix: "A szerződés 74. pontja szerinti szolgáltatás díja",
      textSuffix: "felmerülő valamennyi kötelezettségüket",
      contentFingerprint: null,
      createdBy: { id: AUTH_ME.id, name: AUTH_ME.name },
      createdAt: "2026-05-10T08:00:00.000Z",
      resolvedAt: null,
      replyCount: 1,
    },
  ],
  proposals: [
    {
      id: "qa-proposal-existing-deep",
      selectedText: "145. § A Felek a jelen keretszerződés alapján vállalják",
      proposedText: "145. § A Felek a jelen keretszerződés alapján kötelesek",
      rationale: "Egységes megfogalmazás a korábbi pontokkal.",
      status: "PENDING",
      decisionReason: null,
      decidedBy: null,
      decidedAt: null,
      createdBy: { id: "qa-reviewer", name: "Külső reviewer" },
      createdAt: "2026-05-12T09:00:00.000Z",
      startOffset: offsetOf("145. § A Felek a jelen keretszerződés alapján vállalják"),
      endOffset: offsetOf("145. § A Felek a jelen keretszerződés alapján vállalják") + 60,
      contentFingerprint: null,
    },
  ],
  commentCounter: 0,
  proposalCounter: 0,
};

function emptyRail() {
  return {
    documentId: DOC_ID,
    documentVersionId: VERSION_ID,
    versionNumber: 1,
    counts: {
      commentCount: state.comments.length,
      modificationProposalCount: state.proposals.length,
      pendingProposalCount: state.proposals.filter((p) => p.status === "PENDING").length,
      acceptedProposalCount: 0,
      rejectedProposalCount: 0,
      proposalDecisionComplete: false,
    },
    readyForCorrection: false,
    comments: state.comments,
    proposals: state.proposals,
  };
}

function respond(url, method, body) {
  if (url.includes("/auth/me")) return AUTH_ME;
  if (url.endsWith(`/cases/${CASE_ID}/client-house-style`)) return null;
  if (url.includes(`/cases/${CASE_ID}/documents`)) return [DOC_ITEM];
  if (url.includes(`/cases/${CASE_ID}/contracts`)) return [];
  if (url.includes(`/cases/${CASE_ID}/timeline`)) return [];
  if (url.includes(`/cases/${CASE_ID}/responsibility`)) {
    return {
      case: { id: CASE_ID, caseNumber: CASE_RECORD.caseNumber, title: CASE_RECORD.title, status: "ACTIVE", deadline: null, matterId: null },
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
  }
  if (url.includes(`/cases/${CASE_ID}/collaborators`)) return [];
  if (url.endsWith(`/cases/${CASE_ID}`)) return { ...CASE_RECORD, clientId: "qa-client", clientName: "QA Client" };
  if (url.includes("/cases?")) return { data: [{ ...CASE_RECORD, clientId: "qa-client" }], page: 1, limit: 200, total: 1, totalPages: 1 };
  if (url.includes(`/documents/${DOC_ID}/versions/${VERSION_ID}/review-rail`)) return emptyRail();
  if (url.includes(`/documents/${DOC_ID}/versions/${VERSION_ID}/review-comments`)) {
    if (method === "POST") {
      state.commentCounter += 1;
      state.offsetById[`qa-comment-${state.commentCounter}`] = body.startOffset ?? null;
      const createdAt = new Date().toISOString();
      state.comments.push({
        id: `qa-comment-${state.commentCounter}`,
        reviewComment: body.body ?? "",
        selectedText: body.selectedText ?? "",
        startOffset: body.startOffset ?? null,
        endOffset: body.endOffset ?? null,
        textPrefix: body.textPrefix ?? null,
        textSuffix: body.textSuffix ?? null,
        contentFingerprint: null,
        createdBy: { id: AUTH_ME.id, name: AUTH_ME.name },
        createdAt,
        resolvedAt: null,
        replyCount: 0,
      });
      return {
        id: `qa-comment-${state.commentCounter}`,
        documentId: DOC_ID,
        documentVersionId: VERSION_ID,
        annotationType: "REVIEW_COMMENT",
        anchorType: "TEXT_RANGE",
        status: "OPEN",
        visibility: "INTERNAL",
        headline: null,
        internalNote: null,
        reviewComment: body.body ?? "",
        modificationReason: null,
        clientExplanationDraft: null,
        legalRisk: null,
        openQuestion: null,
        decisionText: null,
        resolutionNote: null,
        selectedText: body.selectedText ?? null,
        normalizedSelectedText: null,
        textPrefix: body.textPrefix ?? null,
        textSuffix: body.textSuffix ?? null,
        startOffset: body.startOffset ?? null,
        endOffset: body.endOffset ?? null,
        pageNumber: null,
        pageIndex: null,
        rect: null,
        point: null,
        pageRotation: null,
        structuralPath: null,
        rendererVersion: null,
        contentFingerprint: null,
        createdBy: { id: AUTH_ME.id, name: AUTH_ME.name },
        assignedTo: null,
        resolvedBy: null,
        createdAt,
        updatedAt: createdAt,
        resolvedAt: null,
      };
    }
    if (url.includes("/replies")) {
      return {
        id: "qa-reply-1",
        annotationId: url.match(/review-comments\/([^/]+)\/replies/)?.[1] ?? "",
        body: "",
        createdBy: { id: AUTH_ME.id, name: AUTH_ME.name },
        createdAt: new Date().toISOString(),
        editedAt: null,
      };
    }
  }
  if (url.includes(`/documents/${DOC_ID}/versions/${VERSION_ID}/proposals`)) {
    if (method === "POST") {
      state.proposalCounter += 1;
      state.offsetById[`qa-proposal-${state.proposalCounter}`] = body.startOffset ?? null;
      const createdAt = new Date().toISOString();
      state.proposals.push({
        id: `qa-proposal-${state.proposalCounter}`,
        selectedText: body.selectedText ?? "",
        proposedText: body.proposedText ?? "",
        rationale: body.rationale ?? null,
        status: "PENDING",
        decisionReason: null,
        decidedBy: null,
        decidedAt: null,
        createdBy: { id: AUTH_ME.id, name: AUTH_ME.name },
        createdAt,
        startOffset: body.startOffset ?? 0,
        endOffset: body.endOffset ?? 0,
        contentFingerprint: null,
      });
      return {
        id: `qa-proposal-${state.proposalCounter}`,
        documentId: DOC_ID,
        documentVersionId: VERSION_ID,
        selectedText: body.selectedText ?? "",
        normalizedSelectedText: null,
        startOffset: body.startOffset ?? 0,
        endOffset: body.endOffset ?? 0,
        textPrefix: body.textPrefix ?? null,
        textSuffix: body.textSuffix ?? null,
        contentFingerprint: null,
        proposedText: body.proposedText ?? "",
        rationale: body.rationale ?? null,
        status: "PENDING",
        decisionReason: null,
        decidedBy: null,
        decidedAt: null,
        createdBy: { id: AUTH_ME.id, name: AUTH_ME.name },
        createdAt,
        updatedAt: createdAt,
        deletedAt: null,
      };
    }
  }
  if (url.includes(`/documents/${DOC_ID}/versions/${VERSION_ID}/annotations`)) {
    return {
      documentId: DOC_ID,
      documentVersionId: VERSION_ID,
      items: [],
      pagination: { total: 0, limit: 50, offset: 0 },
    };
  }
  if (url.includes(`/documents/${DOC_ID}/versions/${VERSION_ID}/text`)) {
    return {
      documentId: DOC_ID,
      versionId: VERSION_ID,
      versionNumber: 1,
      source: "UPLOADED",
      text: VERSION_TEXT,
      format: "DOCX",
      pageCount: 12,
      extractedAt: "2026-08-20T09:05:00.000Z",
    };
  }
  if (url.endsWith(`/documents/${DOC_ID}/versions`)) {
    return { documentId: DOC_ID, versions: [VERSION_ITEM] };
  }
  if (url.includes(`/documents/${DOC_ID}/work-context`)) return WORK_CONTEXT;
  if (url.includes(`/documents/${DOC_ID}/legal-analyses`)) return [];
  if (url.includes("/anonymous-documents/by-source/")) return [];
  if (url.includes("/tasks")) return [];
  if (url.includes("/users")) return { data: [AUTH_ME] };
  if (url.includes("/hourly-rates/")) {
    return {
      asOf: "2026-01-01T00:00:00.000Z",
      canManage: false,
      effective: {
        status: "UNRESOLVED", currency: "HUF", hourlyRate: null, scope: "UNRESOLVED",
        rateVersionId: null, effectiveFrom: null, caseMode: "INHERIT_CLIENT", caseVersionId: null,
      },
      next: null,
      history: [],
    };
  }
  return undefined;
}

async function installSession(page) {
  await page.addInitScript(({ profile }) => {
    localStorage.setItem("auth_token", "qa-workforce-token");
    sessionStorage.setItem("adminiculum_auth_profile", JSON.stringify(profile));
  }, { profile: AUTH_ME });
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    let body;
    try {
      body = request.method() === "GET" ? undefined : request.postDataJSON();
    } catch {
      body = undefined;
    }
    const payload = respond(request.url(), request.method(), body);
    if (payload === undefined) {
      await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ status: 404, code: "QA_UNMOCKED_ENDPOINT" }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(payload) });
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function scrollMetrics(page) {
  return page.evaluate(() => {
    const scroller = document.scrollingElement || document.documentElement;
    const scrollDiv = document.querySelector('[data-testid="document-reader-text"] div.overflow-y-auto');
    const marginBody = document.querySelector('[data-testid="document-review-margin-body"]');
    return {
      scrollTop: scroller ? scroller.scrollTop : null,
      clientHeight: scroller ? scroller.clientHeight : null,
      scrollHeight: scroller ? scroller.scrollHeight : null,
      innerScrollTop: scrollDiv ? scrollDiv.scrollTop : null,
      innerClientHeight: scrollDiv ? scrollDiv.clientHeight : null,
      innerScrollHeight: scrollDiv ? scrollDiv.scrollHeight : null,
      marginBodyTop: marginBody ? marginBody.getBoundingClientRect().top : null,
    };
  });
}

async function setDocumentScrollTop(page, top) {
  await page.evaluate((target) => {
    window.scrollTo({ top: target, behavior: "instant" });
  }, top);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

/**
 * Selects a phrase at `viewportOffsetY` inside the visible document using real
 * point-based range resolution (caretRangeFromPoint), then dispatches mouseup on
 * the reader surface so the React selection pipeline runs exactly as live.
 */
async function selectTextAtViewport(page, viewportOffsetY) {
  return page.evaluate((offsetY) => {
    const article = document.querySelector('[data-testid="document-reader-surface"]');
    if (!article) throw new Error("reader surface missing");
    const articleRect = article.getBoundingClientRect();
    const x1 = Math.max(articleRect.left + 120, 40);
    const x2 = Math.min(articleRect.right - 60, x1 + 260);
    const candidates = [offsetY];
    for (let delta = 40; delta <= 320; delta += 40) {
      candidates.push(offsetY + delta, offsetY - delta);
    }
    let best = null;
    for (const rawY of candidates) {
      const y = Math.max(60, Math.min(window.innerHeight - 80, rawY));
      const startRange = document.caretRangeFromPoint ? document.caretRangeFromPoint(x1, y) : null;
      const endRange = document.caretRangeFromPoint ? document.caretRangeFromPoint(x2, y) : null;
      if (!startRange || !endRange) continue;
      const range = document.createRange();
      const compare = startRange.compareBoundaryPoints(Range.START_TO_START, endRange);
      if (compare <= 0) {
        range.setStart(startRange.startContainer, startRange.startOffset);
        range.setEnd(endRange.endContainer, endRange.endOffset);
      } else {
        range.setStart(endRange.startContainer, endRange.startOffset);
        range.setEnd(startRange.endContainer, startRange.endOffset);
      }
      const text = range.toString();
      if (text.trim().length >= 20 && article.contains(range.startContainer) && article.contains(range.endContainer)) {
        best = { range, text };
        break;
      }
    }
    if (!best) throw new Error("could not resolve a usable text selection in the visible document");
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(best.range);
    article.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
    const rect = best.range.getBoundingClientRect();
    return {
      selectedText: best.text,
      rect: { top: rect.top, bottom: rect.bottom, left: rect.left },
    };
  }, viewportOffsetY);
}

async function rectOf(page, selector) {
  return page.evaluate((sel) => {
    const node = document.querySelector(sel);
    if (!node) return null;
    const rect = node.getBoundingClientRect();
    return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right };
  }, selector);
}

async function waitForToolbar(page) {
  await page.locator('[data-testid="reader-selection-toolbar"]').waitFor({ state: "visible", timeout: 5000 });
}

async function runCommentScenario(page, label) {
  const metricsBefore = await scrollMetrics(page);
  assert(metricsBefore.scrollTop > 1000, `${label}: precondition — document must be scrolled deeper than 1000px (was ${metricsBefore.scrollTop})`);

  const selection = await selectTextAtViewport(page, 430);
  assert(selection.selectedText.trim().length > 10, `${label}: selection must capture real text`);
  await waitForToolbar(page);

  await page.locator('[data-testid="reader-selection-comment"]').click();
  await page.locator('[data-testid="review-comment-composer"]').waitFor({ state: "visible", timeout: 5000 });
  const metricsAfterOpen = await scrollMetrics(page);
  const composerRect = await rectOf(page, '[data-testid="review-comment-composer"]');
  const openDrift = Math.abs(metricsAfterOpen.scrollTop - metricsBefore.scrollTop);
  const composerProximity = Math.abs(composerRect.top - selection.rect.top);

  await page.locator('[data-testid="review-comment-input"]').type("Kérlek ellenőrizd ezt a kikötést a következő egyeztetés előtt.", { delay: 8 });
  const metricsAfterTyping = await scrollMetrics(page);
  const typingDrift = Math.abs(metricsAfterTyping.scrollTop - metricsAfterOpen.scrollTop);

  await page.locator('[data-testid="review-comment-submit"]').click();
  await page.locator('[data-testid="document-review-margin"] [data-testid="reader-rail-comment"]').first().waitFor({ state: "visible", timeout: 8000 });
  const metricsAfterSave = await scrollMetrics(page);
  const saveDrift = Math.abs(metricsAfterSave.scrollTop - metricsBefore.scrollTop);

  const cardInfo = await page.evaluate(() => {
    const card = document.querySelector('[data-testid="document-review-margin"] [data-testid="reader-rail-comment"]');
    const marginBody = document.querySelector('[data-testid="document-review-margin-body"]');
    if (!card || !marginBody) throw new Error("saved comment card missing");
    const cardRect = card.getBoundingClientRect();
    const containerRect = marginBody.getBoundingClientRect();
    return {
      id: card.getAttribute("data-rail-item-id"),
      top: cardRect.top,
      containerTop: cardRect.top - containerRect.top,
    };
  });
  const cardProximity = Math.abs(cardInfo.top - selection.rect.top);
  assert(cardInfo.containerTop > 10, `${label}: saved card must not sit at the fallback top:0 (containerTop=${cardInfo.containerTop})`);

  await page.screenshot({ path: path.join(SHOTS, `${label}-final.png`), fullPage: false });

  return {
    label,
    scrollTopBefore: metricsBefore.scrollTop,
    selectionRectTop: selection.rect.top,
    selectedText: selection.selectedText.slice(0, 40),
    fullSelectedText: selection.selectedText,
    composerRectTop: composerRect.top,
    openDrift,
    composerProximity,
    typingDrift,
    saveDrift,
    cardTop: cardInfo.top,
    cardProximity,
    cardId: cardInfo.id,
  };
}

async function runProposalScenario(page, label) {
  const metricsBefore = await scrollMetrics(page);
  assert(metricsBefore.scrollTop > 1000, `${label}: precondition — document must be scrolled deeper than 1000px (was ${metricsBefore.scrollTop})`);

  const selection = await selectTextAtViewport(page, 430);
  assert(selection.selectedText.trim().length > 10, `${label}: selection must capture real text`);
  await waitForToolbar(page);

  await page.locator('[data-testid="reader-selection-proposal"]').click();
  await page.locator('[data-testid="proposal-composer"]').waitFor({ state: "visible", timeout: 5000 });
  const metricsAfterOpen = await scrollMetrics(page);
  const composerRect = await rectOf(page, '[data-testid="proposal-composer"]');
  const openDrift = Math.abs(metricsAfterOpen.scrollTop - metricsBefore.scrollTop);
  const composerProximity = Math.abs(composerRect.top - selection.rect.top);

  await page.locator('[data-testid="proposal-suggested-text"]').type("A díjtételt a negyedéves felülvizsgálat eredménye alapján módosítsuk.", { delay: 8 });
  const metricsAfterTyping = await scrollMetrics(page);
  const typingDrift = Math.abs(metricsAfterTyping.scrollTop - metricsAfterOpen.scrollTop);

  await page.locator('[data-testid="proposal-submit"]').click();
  await page.locator('[data-testid="document-review-margin"] [data-testid="reader-rail-proposal"]').first().waitFor({ state: "visible", timeout: 8000 });
  const metricsAfterSave = await scrollMetrics(page);
  const saveDrift = Math.abs(metricsAfterSave.scrollTop - metricsBefore.scrollTop);

  const cardInfo = await page.evaluate(() => {
    const card = document.querySelector('[data-testid="document-review-margin"] [data-testid="reader-rail-proposal"]');
    const marginBody = document.querySelector('[data-testid="document-review-margin-body"]');
    if (!card || !marginBody) throw new Error("saved proposal card missing");
    const cardRect = card.getBoundingClientRect();
    const containerRect = marginBody.getBoundingClientRect();
    return {
      id: card.getAttribute("data-rail-item-id"),
      top: cardRect.top,
      containerTop: cardRect.top - containerRect.top,
    };
  });
  const cardProximity = Math.abs(cardInfo.top - selection.rect.top);
  assert(cardInfo.containerTop > 10, `${label}: saved card must not sit at the fallback top:0 (containerTop=${cardInfo.containerTop})`);

  await page.screenshot({ path: path.join(SHOTS, `${label}-final.png`), fullPage: false });

  return {
    label,
    scrollTopBefore: metricsBefore.scrollTop,
    selectionRectTop: selection.rect.top,
    selectedText: selection.selectedText.slice(0, 40),
    fullSelectedText: selection.selectedText,
    composerRectTop: composerRect.top,
    openDrift,
    composerProximity,
    typingDrift,
    saveDrift,
    cardTop: cardInfo.top,
    cardProximity,
    cardId: cardInfo.id,
  };
}

async function runReloadScenario(page, label, offsetById) {
  await page.reload({ waitUntil: "networkidle" });
  await page.locator('[data-testid="document-reader-surface"]').waitFor({ state: "visible", timeout: 15000 });
  await page.locator('[data-testid="document-review-margin"] [data-testid="reader-rail-comment"]').first().waitFor({ state: "visible", timeout: 10000 });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

  const resolved = await page.evaluate((storedOffsets) => {
    const marginBody = document.querySelector('[data-testid="document-review-margin-body"]');
    const article = document.querySelector('[data-testid="document-reader-surface"]');
    if (!marginBody || !article) throw new Error("margin body missing after reload");
    const containerRect = marginBody.getBoundingClientRect();

    // Mirrors readerAnchorMeasure.offsetToTextPosition: resolves a character
    // offset in the article text to its container-relative Y.
    const measureOffsetTop = (offset) => {
      const walker = document.createTreeWalker(article, 4 /* SHOW_TEXT */);
      let remaining = offset;
      let node = walker.nextNode();
      let last = null;
      while (node) {
        last = node;
        if (remaining <= node.data.length) {
          const range = document.createRange();
          range.setStart(node, remaining);
          range.setEnd(node, remaining);
          const rect = range.getBoundingClientRect();
          return rect.top - containerRect.top;
        }
        remaining -= node.data.length;
        node = walker.nextNode();
      }
      if (last) {
        const range = document.createRange();
        range.setStart(last, last.data.length);
        range.setEnd(last, last.data.length);
        const rect = range.getBoundingClientRect();
        return rect.top - containerRect.top;
      }
      return null;
    };

    const cards = document.querySelectorAll('[data-testid="document-review-margin"] [data-rail-item-id]');
    const results = [];
    for (const card of cards) {
      const id = card.getAttribute("data-rail-item-id");
      const cardTop = card.getBoundingClientRect().top - containerRect.top;
      const exactMark = document.querySelector(`[data-testid="reader-review-anchor"][data-anchor-id="${id}"]`);
      let anchorTop = null;
      let anchorSource = null;
      if (exactMark) {
        anchorTop = exactMark.getBoundingClientRect().top - containerRect.top;
        anchorSource = "mark";
      } else {
        const offset = storedOffsets[id];
        if (typeof offset === "number") {
          anchorTop = measureOffsetTop(offset);
          anchorSource = "stored-offset";
        }
      }
      results.push({ id, cardTop, anchorTop, anchorSource, anchorFound: anchorTop !== null });
    }
    return results;
  }, offsetById);

  const cardCount = Object.keys(offsetById).length;
  assert(resolved.length >= cardCount, `${label}: all saved cards must exist after reload (found ${resolved.length}, expected ${cardCount})`);
  const tracked = resolved.filter((entry) => Object.prototype.hasOwnProperty.call(offsetById, entry.id));
  assert(tracked.length === cardCount, `${label}: every authored card must still be present after reload (${tracked.length}/${cardCount})`);
  for (const entry of tracked) {
    assert(entry.anchorFound, `${label}: card ${entry.id} must resolve to its own source text after reload (${entry.anchorSource})`);
    const drift = Math.abs(entry.cardTop - entry.anchorTop);
    assert(drift <= ANCHOR_PROXIMITY_PX, `${label}: card ${entry.id} resolves ${drift}px from its anchor after reload (max ${ANCHOR_PROXIMITY_PX}px)`);
  }
  await page.screenshot({ path: path.join(SHOTS, `${label}-final.png`), fullPage: false });
  return resolved;
}

async function main() {
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const consoleErrors = [];
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    page.on("pageerror", (error) => consoleErrors.push(error.stack || error.message));
    page.on("console", (message) => {
      if (message.type() === "error" && message.text().startsWith("Cannot")) consoleErrors.push(`console: ${message.text()}`);
    });

    await installSession(page);
    await page.goto(`${BASE_URL}/cases/${CASE_ID}/documents?documentId=${DOC_ID}`, { waitUntil: "networkidle" });
    await page.locator('[data-testid="document-reader-surface"]').waitFor({ state: "visible", timeout: 15000 });
    await page.locator('[data-testid="document-reader-rail-desktop"]').waitFor({ state: "visible", timeout: 5000 });
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

    const maxScroll = await scrollMetrics(page);
    assert(maxScroll.scrollHeight > 4000, `document must be long enough to scroll (scrollHeight=${maxScroll.scrollHeight})`);

    // Scenario 1: deep-scroll comment authoring.
    await setDocumentScrollTop(page, 4000);
    const comment = await runCommentScenario(page, "comment-deep");
    assert(comment.openDrift <= OPEN_SCROLL_TOLERANCE_PX, `comment open must not move the scroll container (drift ${comment.openDrift}px > ${OPEN_SCROLL_TOLERANCE_PX}px)`);
    assert(comment.typingDrift <= OPEN_SCROLL_TOLERANCE_PX, `comment typing must not move the scroll container (drift ${comment.typingDrift}px)`);
    assert(comment.saveDrift <= OPEN_SCROLL_TOLERANCE_PX, `comment save must not move the scroll container (drift ${comment.saveDrift}px)`);
    assert(comment.composerProximity <= ANCHOR_PROXIMITY_PX, `comment composer ${comment.composerProximity}px from anchor (max ${ANCHOR_PROXIMITY_PX}px)`);
    assert(comment.cardProximity <= ANCHOR_PROXIMITY_PX, `saved comment card ${comment.cardProximity}px from anchor (max ${ANCHOR_PROXIMITY_PX}px)`);
    console.log(`[comment-deep] scrollTopBefore=${comment.scrollTopBefore} openDrift=${comment.openDrift} typingDrift=${comment.typingDrift} saveDrift=${comment.saveDrift} composerProximity=${comment.composerProximity} cardProximity=${comment.cardProximity}`);

    // Scenario 2: deep-scroll proposal authoring (a different, deeper location).
    await setDocumentScrollTop(page, 7500);
    const proposal = await runProposalScenario(page, "proposal-deep");
    assert(proposal.openDrift <= OPEN_SCROLL_TOLERANCE_PX, `proposal open must not move the scroll container (drift ${proposal.openDrift}px > ${OPEN_SCROLL_TOLERANCE_PX}px)`);
    assert(proposal.typingDrift <= OPEN_SCROLL_TOLERANCE_PX, `proposal typing must not move the scroll container (drift ${proposal.typingDrift}px)`);
    assert(proposal.saveDrift <= OPEN_SCROLL_TOLERANCE_PX, `proposal save must not move the scroll container (drift ${proposal.saveDrift}px)`);
    assert(proposal.composerProximity <= ANCHOR_PROXIMITY_PX, `proposal composer ${proposal.composerProximity}px from anchor (max ${ANCHOR_PROXIMITY_PX}px)`);
    assert(proposal.cardProximity <= ANCHOR_PROXIMITY_PX, `saved proposal card ${proposal.cardProximity}px from anchor (max ${ANCHOR_PROXIMITY_PX}px)`);
    console.log(`[proposal-deep] scrollTopBefore=${proposal.scrollTopBefore} openDrift=${proposal.openDrift} typingDrift=${proposal.typingDrift} saveDrift=${proposal.saveDrift} composerProximity=${proposal.composerProximity} cardProximity=${proposal.cardProximity}`);

    // Scenario 3: collision — a second proposal at the same deep anchor as the
    // first comment must stack locally, never jump to the top or after unrelated cards.
    await setDocumentScrollTop(page, 4000);
    const collision = await runProposalScenario(page, "proposal-collision");
    assert(collision.openDrift <= OPEN_SCROLL_TOLERANCE_PX, `collision proposal open must not move the scroll container (drift ${collision.openDrift}px)`);
    assert(collision.saveDrift <= OPEN_SCROLL_TOLERANCE_PX, `collision proposal save must not move the scroll container (drift ${collision.saveDrift}px)`);
    assert(
      collision.cardTop > collision.selectionRectTop - 10 && collision.cardTop < collision.selectionRectTop + 700,
      `collision card must stack locally near its own anchor (cardTop=${collision.cardTop}, anchorTop=${collision.selectionRectTop})`,
    );
    console.log(`[proposal-collision] openDrift=${collision.openDrift} saveDrift=${collision.saveDrift} cardTop=${collision.cardTop} anchorTop=${collision.selectionRectTop}`);

    // Scenario 3b: paragraph-start boundary selection — the exact live trigger.
    // The selection starts at the first character of a paragraph that begins a
    // new text segment (the pre-existing deep proposal mark), so the anchor
    // offset lands on the end of the preceding trailing-newline text node.
    await page.evaluate(() => {
      const deepMark = document.querySelector('[data-testid="reader-review-anchor"][data-anchor-id="qa-proposal-existing-deep"]');
      if (!deepMark) throw new Error("deep anchor mark missing");
      const rect = deepMark.getBoundingClientRect();
      if (rect.top < 200 || rect.top > window.innerHeight - 200) {
        window.scrollTo({ top: window.scrollY + (rect.top - window.innerHeight / 2), behavior: "instant" });
      }
    });
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const boundary = await page.evaluate(() => {
      const article = document.querySelector('[data-testid="document-reader-surface"]');
      const deepMark = document.querySelector('[data-testid="reader-review-anchor"][data-anchor-id="qa-proposal-existing-deep"]');
      if (!article || !deepMark) throw new Error("deep anchor mark missing");
      const markRect = deepMark.getBoundingClientRect();
      const x1 = Math.max(article.getBoundingClientRect().left + 4, 8);
      const x2 = x1 + 200;
      const y = Math.max(60, Math.min(window.innerHeight - 80, markRect.top + 6));
      const startRange = document.caretRangeFromPoint(x1, y);
      const endRange = document.caretRangeFromPoint(x2, y);
      if (!startRange || !endRange) throw new Error("caretRangeFromPoint failed for boundary selection");
      const range = document.createRange();
      range.setStart(startRange.startContainer, startRange.startOffset);
      range.setEnd(endRange.endContainer, endRange.endOffset);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      article.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
      const rect = range.getBoundingClientRect();
      const startNode = startRange.startContainer;
      return {
        selectedText: range.toString(),
        top: rect.top,
        startsAtNodeStart: startRange.startOffset === 0 && startNode.nodeType === 3,
        offsetInNode: startRange.startOffset,
      };
    });
    console.log(`[boundary-select] startsAtNodeStart=${boundary.startsAtNodeStart} offsetInNode=${boundary.offsetInNode} text="${boundary.selectedText.slice(0, 40)}"`);
    await waitForToolbar(page);
    const scrollBeforeBoundary = (await scrollMetrics(page)).scrollTop;
    await page.locator('[data-testid="reader-selection-comment"]').click();
    await page.locator('[data-testid="review-comment-composer"]').waitFor({ state: "visible", timeout: 5000 });
    const boundaryMetrics = await scrollMetrics(page);
    const boundaryComposer = await rectOf(page, '[data-testid="review-comment-composer"]');
    const boundaryDrift = Math.abs(boundaryMetrics.scrollTop - scrollBeforeBoundary);
    const boundaryProximity = Math.abs(boundaryComposer.top - boundary.top);
    assert(boundaryDrift <= OPEN_SCROLL_TOLERANCE_PX, `boundary composer open must not move the scroll container (drift ${boundaryDrift}px)`);
    assert(boundaryProximity <= ANCHOR_PROXIMITY_PX, `boundary composer ${boundaryProximity}px from paragraph-start anchor (max ${ANCHOR_PROXIMITY_PX}px)`);
    await page.locator('[data-testid="review-comment-cancel"]').click();
    console.log(`[boundary-composer] drift=${boundaryDrift} proximity=${boundaryProximity}`);

    // Scenario 4: full browser reload — every card must resolve to its own anchor.
    const reloaded = await runReloadScenario(page, "reload", state.offsetById);
    console.log(`[reload] ${reloaded.map((entry) => `${entry.id}@${Math.round(entry.cardTop)}~${Math.round(entry.anchorTop)}`).join(" ")}`);

    assert(consoleErrors.length === 0, `page errors: ${consoleErrors.join("; ")}`);
    await context.close();
    console.log("Document reader authoring browser QA passed.");
    console.log(`Screenshots: ${path.relative(ROOT, SHOTS)}`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
