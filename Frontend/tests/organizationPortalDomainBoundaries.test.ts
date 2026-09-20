import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  customerRequestDetailHref,
  dedupeCustomerItems,
  isCustomerPublishedDocument,
  resolveMessageOrganizationUnit,
  selectCustomerPublishedDocuments,
  selectCustomerRequestDocuments,
  selectCustomerSubmissionDocuments,
} from "../src/components/client-portal/OrganizationPortalViews";
import type { PortalWorkspaceDocument } from "../src/lib/clientPortalApi";

/**
 * Organization customer portal domain boundaries.
 *
 * `workspace.documents` mixes office-published documents with customer requests
 * and customer submissions. Dokumentumok must show ONLY published/shared
 * documents; requests and submissions belong to Teendők / request history.
 *
 * Customer-safe isolation is preserved: communication is limited to explicit
 * portal threads, never the internal mailbox store.
 */

const root = process.cwd();
const read = (relative: string) => readFileSync(path.join(root, relative), "utf8");

function doc(overrides: Partial<PortalWorkspaceDocument> & { id: string; kind: PortalWorkspaceDocument["kind"] }): PortalWorkspaceDocument {
  return {
    title: overrides.title || overrides.id,
    matterId: "pub-1",
    matterTitle: "Közzétett ügy",
    explanation: null,
    description: null,
    status: null,
    publishedAt: null,
    actionUrl: `/portal/documents/${overrides.id}`,
    ...overrides,
  };
}

const samples: PortalWorkspaceDocument[] = [
  doc({ id: "shared-1", kind: "SHARED_DOCUMENT", title: "Aláírt szerződés", explanation: "Az iroda által megosztott példány.", publishedAt: "2026-09-01T10:00:00.000Z" }),
  doc({ id: "req-1", kind: "DOCUMENT_REQUEST", title: "Cégkivonat bekérése", status: "Teendő", publishedAt: "2026-09-02T10:00:00.000Z", actionUrl: "/portal/matters/pub-1" }),
  doc({ id: "req-2", kind: "CORRECTION_REQUEST", title: "Hiánypótlás", status: "Javítás szükséges", actionUrl: "/portal/matters/pub-1" }),
  doc({ id: "sub-1", kind: "SUBMISSION", title: "Beküldött dokumentum vagy adat", status: "Beküldve", publishedAt: "2026-09-03T10:00:00.000Z", actionUrl: "/portal/matters/pub-1" }),
  doc({ id: "sub-2", kind: "CORRECTION_SUBMISSION", title: "Javítandó beküldés", status: "Javítás szükséges", actionUrl: "/portal/matters/pub-1" }),
];

describe("organization portal document library boundary", () => {
  it("shows only office-published documents in Dokumentumok", () => {
    const shared = selectCustomerPublishedDocuments(samples);
    assert.deepEqual(shared.map((item) => item.id), ["shared-1"]);
    assert.ok(shared.every(isCustomerPublishedDocument));
    for (const kind of ["DOCUMENT_REQUEST", "CORRECTION_REQUEST", "SUBMISSION", "CORRECTION_SUBMISSION"] as const) {
      assert.equal(shared.some((item) => item.kind === kind), false, `${kind} must not be in the document library`);
    }
  });

  it("routes requests and submissions to the Teendők domain selectors", () => {
    assert.deepEqual(selectCustomerRequestDocuments(samples).map((item) => item.id), ["req-1", "req-2"]);
    assert.deepEqual(selectCustomerSubmissionDocuments(samples).map((item) => item.id), ["sub-1", "sub-2"]);
  });

  it("never renders the same item twice after dedupe", () => {
    const duplicated = [...samples, ...selectCustomerRequestDocuments(samples)];
    const deduped = dedupeCustomerItems(duplicated);
    const keys = deduped.map((item) => `${item.kind}:${item.id}`);
    assert.equal(new Set(keys).size, keys.length);
    const requestIds = deduped.filter((item) => item.kind === "DOCUMENT_REQUEST").map((item) => item.id);
    assert.deepEqual(requestIds, ["req-1"]);
  });

  it("links a request to its canonical detail route", () => {
    assert.equal(customerRequestDetailHref("pub-1", "req-1"), "/portal/matters/pub-1/requests/req-1");
    assert.equal(customerRequestDetailHref("pub-1", null), "/portal/matters/pub-1");
    assert.equal(customerRequestDetailHref("pub/1", "req/1"), "/portal/matters/pub%2F1/requests/req%2F1");
  });
});

function sliceFn(src: string, name: string): string {
  const marker = `function ${name}(`;
  const start = src.indexOf(marker);
  assert.ok(start > -1, `${name} not found`);
  const rest = src.slice(start + marker.length);
  const next = rest.search(/\r?\n(export )?(async )?function /);
  return next === -1 ? rest : rest.slice(0, next);
}

describe("organization portal domain composition (source contract)", () => {
  const orgViews = () => read("src/components/client-portal/OrganizationPortalViews.tsx");

  it("composes Dokumentumok from published documents only", () => {
    const body = sliceFn(orgViews(), "OrganizationDocuments");
    assert.match(body, /selectCustomerPublishedDocuments\(workspace\.documents\)/);
    assert.doesNotMatch(body, /DOCUMENT_REQUEST|CORRECTION_REQUEST|SUBMISSION|CORRECTION_SUBMISSION/);
    // The old, incorrect grouping is gone.
    assert.doesNotMatch(body, /Ügyek szerint/);
    assert.doesNotMatch(body, /Feltöltésre vár/);
    // No fabricated file metadata.
    assert.doesNotMatch(body, /fileSize|sizeBytes|versionLabel|category/i);
  });

  it("aggregates Teendők from actions, requests and submissions without duplication", () => {
    const body = sliceFn(orgViews(), "OrganizationTasks");
    // ORGANIZATION reuses the canonical Home customer-action projection so Home and
    // Teendők can never disagree about whether the customer has work to do; CASE_RELAY
    // keeps its pre-existing workspace action projection.
    assert.match(body, /canonicalTaskRows\(/);
    assert.match(body, /getPortalOrgHome\(\)/);
    assert.match(body, /workspaceTaskRows\(workspace\.actions\)/);
    assert.match(body, /Most szükséges/);
    assert.match(body, /selectCustomerRequestDocuments/);
    assert.match(body, /selectCustomerSubmissionDocuments/);
    assert.match(body, /dedupeCustomerItems/);
    assert.match(body, /customerRequestDetailHref/);
    // Never raw internal task sources.
    assert.doesNotMatch(body, /internal Task|taskStatus|workInstruction|sourceTaskId/);
  });

  it("uses the canonical Kommunikáció domain and explicit portal threads only", () => {
    const src = orgViews();
    const body = sliceFn(src, "OrganizationMessages");
    assert.match(body, /workspace\.messages/);
    assert.match(body, /Kommunikáció/);
    assert.match(body, /Portálos beszélgetések/);
    assert.match(body, /title="Beszélgetések"/);
    assert.match(body, /Itt tud az irodával az ügyeiről egyeztetni/);
    assert.doesNotMatch(src, /title="Kapcsolat"/);
    // Relation is resolved by explicit matter id, never by title/URL substring inference.
    assert.match(body, /resolveMessageOrganizationUnit/);
    assert.doesNotMatch(src, /matterTitle\.includes\(/);
    assert.doesNotMatch(src, /actionUrl\.includes\(/);
    for (const forbidden of ["Outlook", "Gmail", "mailbox", "internetMessageId", "providerMessageId", "graph"]) {
      assert.doesNotMatch(body, new RegExp(forbidden, "i"), `communication must not reference ${forbidden}`);
    }
  });

  it("uses a compact context bar on domain pages but keeps organization identity", () => {
    const src = orgViews();
    assert.match(src, /compact=\{view !== "home"\}/);
    assert.match(src, /data-testid="org-context-minimal"/);
    assert.match(src, /Szervezeti ügyfélfelület/);
    assert.match(src, /Szervezeti egységeim/);
  });

  it("preserves the #292 request separation independently of the message capability", () => {
    const body = sliceFn(orgViews(), "OrganizationMatterDetail");
    assert.match(body, /scope="requests"/);
    assert.match(body, /scope="questions"/);
    assert.match(body, /showMessages=\{detail\.capabilities\.showMessages\}/);
    assert.match(body, /showDocuments=\{detail\.capabilities\.showDocuments\}/);
    const requestsIndex = body.indexOf("requestsSection=");
    const communicationIndex = body.indexOf("communicationSection=");
    assert.ok(requestsIndex > -1 && communicationIndex > -1);
    assert.ok(requestsIndex < communicationIndex, "requests must render before the message slot");
  });
});

describe("organization portal message relation by explicit matter id", () => {
  const cases = [
    { matterPublicationId: "matter-1", organizationUnitName: "A egység", publicTitle: "Beszállítói szerződés" },
    { matterPublicationId: "matter-2", organizationUnitName: "B egység", publicTitle: "Beszállítói szerződés felülvizsgálata" },
  ];

  it("attaches only the exact matching case organization unit", () => {
    const message = { matterId: "matter-2", matterTitle: "Beszállítói szerződés" };
    assert.equal(resolveMessageOrganizationUnit(message, cases), "B egység");
  });

  it("never infers a relation from overlapping titles", () => {
    // The title is identical to case A's title, but the id points at case B.
    const message = { matterId: "matter-2", matterTitle: "Beszállítói szerződés" };
    assert.notEqual(resolveMessageOrganizationUnit(message, cases), "A egység");
  });

  it("omits the unit label when no exact matter id match exists", () => {
    assert.equal(resolveMessageOrganizationUnit({ matterId: "matter-unknown" }, cases), null);
    assert.equal(resolveMessageOrganizationUnit({ matterId: "" }, cases), null);
  });
});

describe("customer request detail preservation (source contract)", () => {
  const detail = () => read("src/components/client-portal/CustomerRequestDetail.tsx");

  it("keeps the request hero and all required sections", () => {
    const src = detail();
    for (const section of ["Ügyféli teendő", "Miért kérjük ezt?", "Amit meg kell tennie", "Válasz beküldése", "Kapcsolódó közzétett dokumentumok", "Kapcsolat és segítség", "Határidő", "Kapcsolódó ügy"]) {
      assert.ok(src.includes(section), `request detail is missing: ${section}`);
    }
    assert.doesNotMatch(src, /[Pp]rioritás|PRIORITY/);
  });

  it("keeps upload, answer, note, submit and unavailable declaration wired to the canonical API", () => {
    const src = detail() + read("src/components/client-portal/CustomerInteractionCard.tsx");
    assert.match(src, /RequestResponseCard/);
    assert.match(src, /onNote=\{setNote\}/);
    assert.match(src, /customerInteractionApi\.uploadFile\(/);
    assert.match(src, /customerInteractionApi\.submitSubmission\(/);
    assert.match(src, /declareUnavailable/);
    assert.match(src, /unavailable-declaration-state/);
    // Related documents stay on the published matter projection only.
    assert.match(src, /matter\.documents/);
    assert.doesNotMatch(src, /documentVersionId|clientDocumentPublications/);
  });
});

describe("organization portal customer-safe isolation", () => {
  it("never exposes mailbox, internal task or scanner internals", () => {
    const src = [
      read("src/components/client-portal/OrganizationPortalViews.tsx"),
      read("src/components/client-portal/CustomerInteractionCard.tsx"),
      read("src/components/client-portal/CustomerRequestDetail.tsx"),
    ].join("\n");
    for (const forbidden of ["workInstruction", "internalNotes", "internalStrategy", "taskNotes", "SCAN_FAILED", "QUARANTINE", "storageProvider", "quarantineStorageReference", "workforceInteractionApi"]) {
      assert.doesNotMatch(src, new RegExp(forbidden), `customer portal must not expose ${forbidden}`);
    }
  });
});
