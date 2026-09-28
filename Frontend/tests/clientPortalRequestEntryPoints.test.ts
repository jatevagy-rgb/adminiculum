import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  customerRequestDetailHref,
  customerRequestKindLabel,
  dedupeCustomerItems,
  selectCustomerPublishedDocuments,
  selectCustomerRequestDocuments,
  selectCustomerSubmissionDocuments,
} from "../src/components/client-portal/OrganizationPortalViews";
import type { PortalWorkspaceDocument } from "../src/lib/clientPortalApi";

/**
 * Entry-point repair: every canonical customer-actionable ClientRequest type
 * (document upload / missing document / correction / information / data form /
 * question response) must be reachable from the portal Teendők list, each row
 * navigating into the already-merged canonical request detail journey. The list
 * stays an entry point: no inline response form, no second upload or submission
 * path, no duplicate rows, and no internal request fields.
 */

const root = process.cwd();
const read = (relative: string) => readFileSync(path.join(root, relative), "utf8");

function doc(overrides: Partial<PortalWorkspaceDocument> & { id: string; kind: PortalWorkspaceDocument["kind"] }): PortalWorkspaceDocument {
  return {
    title: overrides.id,
    matterId: "pub-1",
    matterTitle: "Közzétett ügy",
    description: null,
    status: null,
    publishedAt: null,
    actionUrl: `/portal/documents/${overrides.id}`,
    clientUploaded: false,
    isCompliancePolicy: false,
    ...overrides,
  };
}

const samples: PortalWorkspaceDocument[] = [
  doc({ id: "shared-1", kind: "SHARED_DOCUMENT", title: "Aláírt szerződés" }),
  doc({ id: "req-doc", kind: "DOCUMENT_REQUEST", title: "Cégkivonat bekérése", status: "Teendő", actionUrl: "/portal/matters/pub-1" }),
  doc({ id: "req-correction", kind: "CORRECTION_REQUEST", title: "Hiánypótlás", status: "Javítás szükséges", actionUrl: "/portal/matters/pub-1" }),
  doc({ id: "req-info", kind: "INFORMATION_REQUEST", title: "Adja meg az érintett szervezeteket", status: "Teendő", dueAt: "2026-09-30T08:00:00.000Z", actionUrl: "/portal/matters/pub-1" }),
  doc({ id: "req-form", kind: "DATA_FORM", title: "NIS2 adatlap", status: "Teendő", actionUrl: "/portal/matters/pub-1" }),
  doc({ id: "req-question", kind: "QUESTION_RESPONSE", title: "Kérdés megválaszolása", status: "Teendő", actionUrl: "/portal/matters/pub-1" }),
  doc({ id: "sub-1", kind: "SUBMISSION", title: "Beküldött dokumentum vagy adat", status: "Beküldve" }),
  doc({ id: "sub-2", kind: "CORRECTION_SUBMISSION", title: "Javítandó beküldés", status: "Javítás szükséges" }),
];

const requestIds = ["req-doc", "req-correction", "req-info", "req-form", "req-question"];

function sliceFn(src: string, name: string): string {
  const marker = `function ${name}(`;
  const start = src.indexOf(marker);
  assert.ok(start > -1, `${name} not found`);
  const rest = src.slice(start + marker.length);
  const next = rest.search(/\r?\n(export )?(async )?function /);
  return next === -1 ? rest : rest.slice(0, next);
}

describe("portal Teendők request entry points", () => {
  it("1. surfaces every canonical actionable request type in the Teendők list", () => {
    const requests = selectCustomerRequestDocuments(samples);
    assert.deepEqual(requests.map((item) => item.id), requestIds);
  });

  it("2. keeps the existing document/correction request entries unchanged", () => {
    const requests = selectCustomerRequestDocuments(samples);
    assert.deepEqual(
      requests.filter((item) => item.kind === "DOCUMENT_REQUEST" || item.kind === "CORRECTION_REQUEST").map((item) => item.id),
      ["req-doc", "req-correction"],
    );
  });

  it("3. never routes non-request and unknown kinds into the Teendők request list", () => {
    const requests = selectCustomerRequestDocuments(samples);
    assert.equal(requests.some((item) => item.kind === "SHARED_DOCUMENT"), false);
    assert.equal(requests.some((item) => item.kind === "SUBMISSION" || item.kind === "CORRECTION_SUBMISSION"), false);
    const unknown = doc({ id: "other-1", kind: "OTHER_THING" as PortalWorkspaceDocument["kind"] });
    assert.deepEqual(selectCustomerRequestDocuments([unknown]), []);
  });

  it("4. keeps the published document library boundary and submission history intact", () => {
    assert.deepEqual(selectCustomerPublishedDocuments(samples).map((item) => item.id), ["shared-1"]);
    assert.deepEqual(selectCustomerSubmissionDocuments(samples).map((item) => item.id), ["sub-1", "sub-2"]);
  });

  it("5. labels every canonical request kind for the row", () => {
    assert.equal(customerRequestKindLabel("DOCUMENT_REQUEST"), "Dokumentumkérés");
    assert.equal(customerRequestKindLabel("CORRECTION_REQUEST"), "Javításkérés");
    assert.equal(customerRequestKindLabel("INFORMATION_REQUEST"), "Információkérés");
    assert.equal(customerRequestKindLabel("DATA_FORM"), "Adatlap");
    assert.equal(customerRequestKindLabel("QUESTION_RESPONSE"), "Válaszadás");
    assert.equal(customerRequestKindLabel("INTERNAL_SOMETHING"), null);
  });

  it("6. links every request row to the canonical request detail journey", () => {
    assert.equal(customerRequestDetailHref("pub-1", "req-info"), "/portal/matters/pub-1/requests/req-info");
    const body = sliceFn(read("src/components/client-portal/OrganizationPortalViews.tsx"), "OrganizationTasks");
    assert.match(body, /customerRequestDetailHref\(item\.matterId, item\.id\)/);
  });

  it("7. the request list adds no response logic of its own", () => {
    const body = sliceFn(read("src/components/client-portal/OrganizationPortalViews.tsx"), "OrganizationTasks");
    assert.doesNotMatch(body, /RequestResponseCard/);
    assert.doesNotMatch(body, /customerInteractionApi/);
    assert.doesNotMatch(body, /uploadFile|submitSubmission|declareUnavailable|createSubmission|submitAnswers/);
    assert.doesNotMatch(body, /type="file"|<form|onSubmit/);
    assert.match(body, /Bekérés megnyitása/);
  });

  it("8. never renders the same canonical request twice", () => {
    const duplicated = [...samples, ...selectCustomerRequestDocuments(samples)];
    const deduped = dedupeCustomerItems(duplicated);
    for (const id of requestIds) {
      assert.equal(deduped.filter((item) => item.id === id).length, 1, `${id} must appear once`);
    }
  });

  it("9. backend projects all six canonical request types and excludes terminal requests", () => {
    const routes = read("../Backend/src/routes/clientPortal.ts");
    const entry = routes.slice(routes.indexOf("CUSTOMER_REQUEST_ROW_KINDS"), routes.indexOf("function customerRequestStatus"));
    for (const type of ["DOCUMENT_UPLOAD", "MISSING_DOCUMENT_REQUEST", "CORRECTION_REQUEST", "INFORMATION_REQUEST", "DATA_FORM", "QUESTION_RESPONSE"]) {
      assert.ok(entry.includes(`${type}:`), `${type} must be projected`);
    }
    assert.match(entry, /COMPLETED_REQUEST_STATUSES\.has\(String\(request\.rawStatus\)\)/);
    assert.doesNotMatch(entry, /rawStatus:/);
    for (const internal of ["caseId:", "documentSpec:", "fields:", "assignedInternalUserId:", "createdById:", "audienceSnapshot:", "reviewerNotes:"]) {
      assert.ok(!entry.includes(internal), `entry row must not expose ${internal}`);
    }
  });

  it("10. backend resolves requests only through the per-matter customer grant", () => {
    const routes = read("../Backend/src/routes/clientPortal.ts");
    assert.match(routes, /resolveActiveCustomerGrant\(identityId, matter\.caseId, portalActor\.workspaceId \|\| ''\)/);
    assert.match(routes, /listCustomerRequests\(context\)/);
    const service = read("../Backend/src/modules/client-interaction/requestService.ts");
    const list = service.slice(service.indexOf("export async function listCustomerRequests"));
    assert.match(list, /where: \{ caseId: ctx\.caseId, clientId: ctx\.clientId/);
  });

  it("11. the merged #270 request detail journey is untouched", () => {
    const detail = read("src/components/client-portal/CustomerRequestDetail.tsx");
    const card = read("src/components/client-portal/CustomerInteractionCard.tsx");
    assert.match(detail, /RequestResponseCard/);
    assert.match(card, /export function RequestResponseCard/);
    assert.match(card, /customerInteractionApi\.uploadFile\(/);
    assert.match(card, /customerInteractionApi\.submitSubmission\(/);
    assert.match(detail + card, /declareUnavailable/);
  });

  it("12. the INDIVIDUAL documents card labels the new request kinds truthfully", () => {
    const shell = read("src/components/client-portal/ClientPortalShell.tsx");
    assert.match(shell, /WORKSPACE_DOCUMENT_KIND_LABELS/);
    for (const label of ["Információkérés", "Adatlap", "Válaszadás", "Dokumentumkérés", "Javítás", "Beküldés"]) {
      assert.ok(shell.includes(label), `missing label ${label}`);
    }
  });
});

describe("Teendők inline canonical request response", () => {
  const orgViews = () => read("src/components/client-portal/OrganizationPortalViews.tsx");
  const inline = () => read("src/components/client-portal/TeendokInlineRequestDetail.tsx");

  it("13. expands the canonical interaction from the Teendők request row", () => {
    const body = sliceFn(orgViews(), "OrganizationTasks");
    assert.match(body, /TeendokInlineRequestDetail/);
    assert.match(body, /data-testid="teendok-request-toggle"/);
    assert.ok(body.includes("aria-expanded={expanded}"));
    assert.match(body, /data-testid="teendok-inline-request"/);
    assert.match(body, /Válaszadás itt/);
    assert.match(body, /Bezárás/);
  });

  it("14. reuses the existing canonical detail and response component instead of cloning it", () => {
    const src = inline();
    assert.match(src, /import \{ CustomerRequestDetail \} from "\.\/CustomerRequestDetail"/);
    assert.match(src, /<CustomerRequestDetail/);
    assert.doesNotMatch(src, /export function RequestResponseCard/);
    const card = read("src/components/client-portal/CustomerInteractionCard.tsx");
    assert.equal(card.match(/export function RequestResponseCard/g)?.length, 1, "RequestResponseCard has exactly one canonical implementation");
    const detail = read("src/components/client-portal/CustomerRequestDetail.tsx");
    assert.match(detail, /<RequestResponseCard/);
  });

  it("15. text, upload, unavailable and correction flows stay on the canonical #270 implementation", () => {
    const card = read("src/components/client-portal/CustomerInteractionCard.tsx");
    const detail = read("src/components/client-portal/CustomerRequestDetail.tsx");
    assert.match(card, /customerInteractionApi\.submitAnswers\(/);
    assert.match(card, /customerInteractionApi\.uploadFile\(/);
    assert.match(card, /customerInteractionApi\.submitSubmission\(/);
    assert.match(card, /correctionReason/);
    assert.match(detail, /declareUnavailable/);
    assert.match(detail, /unavailable-declaration-state/);
  });

  it("16. adds no second submission or upload state machine in the inline path", () => {
    const src = inline() + sliceFn(orgViews(), "OrganizationTasks");
    assert.doesNotMatch(src, /createSubmission|submitAnswers|uploadFile|declareUnavailable|submitSubmission/);
    assert.doesNotMatch(src, /type="file"/);
    assert.doesNotMatch(src, /localStorage|sessionStorage/);
  });

  it("17. inline fetch uses only canonical customer APIs with truthful loading and fallback states", () => {
    const src = inline();
    assert.match(src, /getPortalMatter\(matterId\)/);
    assert.match(src, /customerInteractionApi\.getRequest\(matter\.caseId, requestId\)/);
    assert.match(src, /customerInteractionApi\.listSubmissions\(matter\.caseId, requestId\)/);
    assert.match(src, /A bekérés betöltése…/);
    assert.match(src, /nem érhető el ezen az ügyfélfelületen/);
    assert.doesNotMatch(src, /w-\[\d+px\]/, "no fixed-width layout that would break the mobile Teendők list");
  });

  it("18. the canonical deep link stays available next to the inline action", () => {
    const body = sliceFn(orgViews(), "OrganizationTasks");
    assert.match(body, /customerRequestDetailHref\(item\.matterId, item\.id\)/);
    assert.match(body, /Bekérés megnyitása/);
    assert.match(body, /Válaszadás itt/);
  });
});
