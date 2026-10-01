/**
 * CP3 F8 D1 — company request projection matter-identity contract.
 *
 * Verifies that getCompanyClientRequestProjection attaches the canonical
 * customer route identity (matterPublicationId) derived from PUBLISHED matter
 * publications for the granted cases, preferring the workspace-scoped
 * publication, and that a granted case without any published matter yields a
 * truthful null (the frontend then falls back to the matter list — never an
 * internal case id in the customer route).
 *
 * Pure unit contract with a fake prisma; no database required.
 * Run: node --import tsx --test tests/cp3ContinuationMatterIdentity.unit.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { getCompanyClientRequestProjection } from "../src/modules/compliance/companyRequestProjection";

function fakePrisma(overrides: {
  grants?: Array<{ caseId: string }>;
  publications?: Array<{ id: string; caseId: string; workspaceId: string | null }>;
  requests?: Array<{ id: string; caseId: string }>;
}) {
  return {
    clientPortalGrant: {
      findMany: async () => (overrides.grants ?? []).map((grant) => ({ ...grant })),
    },
    clientMatterPublication: {
      findMany: async () =>
        (overrides.publications ?? []).map((publication) => ({
          ...publication,
          status: "PUBLISHED",
          currentRevisionId: "rev-1",
        })),
    },
    clientRequest: {
      findMany: async () =>
        (overrides.requests ?? []).map((row) => ({
          id: row.id,
          caseId: row.caseId,
          type: "DOCUMENT_UPLOAD",
          clientSafeTitle: `Bekért dokumentum ${row.id}`,
          clientSafeInstructions: null,
          dueAt: null,
          required: true,
          status: "PUBLISHED",
          documentSpec: null,
          publishedAt: new Date("2026-09-30T10:00:00Z"),
          fields: [],
          requirementVersion: null,
          clientControl: null,
          finding: null,
        })),
    },
  };
}

test("attaches the published matterPublicationId, preferring the workspace-scoped publication", async () => {
  const prisma = fakePrisma({
    grants: [{ caseId: "case-A" }],
    publications: [
      { id: "mp-legacy", caseId: "case-A", workspaceId: null },
      { id: "mp-workspace", caseId: "case-A", workspaceId: "ws-1" },
    ],
    requests: [{ id: "req-1", caseId: "case-A" }],
  });
  const result = await getCompanyClientRequestProjection("client-1", "id-1", "ws-1", prisma as any);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].caseId, "case-A");
  assert.equal(result.items[0].matterPublicationId, "mp-workspace");
});

test("accepts a legacy null-workspace publication when no workspace-scoped one exists", async () => {
  const prisma = fakePrisma({
    grants: [{ caseId: "case-B" }],
    publications: [{ id: "mp-legacy", caseId: "case-B", workspaceId: null }],
    requests: [{ id: "req-2", caseId: "case-B" }],
  });
  const result = await getCompanyClientRequestProjection("client-1", "id-1", "ws-1", prisma as any);
  assert.equal(result.items[0].matterPublicationId, "mp-legacy");
});

test("returns a truthful null matterPublicationId when no published matter exists", async () => {
  const prisma = fakePrisma({
    grants: [{ caseId: "case-C" }],
    publications: [],
    requests: [{ id: "req-3", caseId: "case-C" }],
  });
  const result = await getCompanyClientRequestProjection("client-1", "id-1", "ws-1", prisma as any);
  assert.equal(result.items[0].caseId, "case-C");
  assert.equal(result.items[0].matterPublicationId, null);
});

test("never crosses publications from another workspace when a workspace one exists", async () => {
  const prisma = fakePrisma({
    grants: [{ caseId: "case-D" }],
    publications: [
      { id: "mp-other-workspace", caseId: "case-D", workspaceId: "ws-OTHER" },
      { id: "mp-own", caseId: "case-D", workspaceId: "ws-1" },
    ],
    requests: [{ id: "req-4", caseId: "case-D" }],
  });
  const result = await getCompanyClientRequestProjection("client-1", "id-1", "ws-1", prisma as any);
  assert.equal(result.items[0].matterPublicationId, "mp-own");
});

test("returns an empty list when no grants exist, without consulting publications", async () => {
  const prisma = fakePrisma({ grants: [] });
  const result = await getCompanyClientRequestProjection("client-1", "id-1", "ws-1", prisma as any);
  assert.deepEqual(result.items, []);
  assert.equal(result.counts.awaitingCustomer, 0);
});
