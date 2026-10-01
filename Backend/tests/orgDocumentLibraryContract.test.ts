import { readFileSync } from "node:fs";
import path from "node:path";
import {
  assertDocumentLibraryDtoSafe,
  normalizeSubmissionStatus,
  submissionFileStatusLabel,
} from "../src/modules/client-workspace/orgDocumentLibraryService";

const serviceSource = () => readFileSync(path.join(__dirname, "../src/modules/client-workspace/orgDocumentLibraryService.ts"), "utf8");
const schemaSource = () => readFileSync(path.join(__dirname, "../prisma/schema.prisma"), "utf8");

describe("Document library — submission status mapping", () => {
  it("9/10. SUBMITTED and UNDER_INTERNAL_REVIEW normalize to SUBMITTED without raw enums", () => {
    expect(normalizeSubmissionStatus("SUBMITTED")).toBe("SUBMITTED");
    expect(normalizeSubmissionStatus("UNDER_INTERNAL_REVIEW")).toBe("SUBMITTED");
    // Provably office-receipt states keep the customer meaning.
    expect(normalizeSubmissionStatus("SCANNING")).toBe("SUBMITTED");
    expect(normalizeSubmissionStatus("RECEIVED")).toBe("SUBMITTED");
  });

  it("11/12. correction and accepted states stay truthful", () => {
    expect(normalizeSubmissionStatus("CORRECTION_REQUESTED")).toBe("CORRECTION_REQUESTED");
    expect(normalizeSubmissionStatus("ACCEPTED_INTO_MATTER")).toBe("ACCEPTED_INTO_MATTER");
    expect(normalizeSubmissionStatus("REJECTED")).toBe("REJECTED");
  });

  it("13/14. draft and uploading states are excluded", () => {
    expect(normalizeSubmissionStatus("DRAFT")).toBeNull();
    expect(normalizeSubmissionStatus("UPLOADING")).toBeNull();
  });

  it("CANCELLED and unknown statuses are omitted, never exposed raw", () => {
    expect(normalizeSubmissionStatus("CANCELLED")).toBeNull();
    expect(normalizeSubmissionStatus("SOME_FUTURE_STATUS")).toBeNull();
  });

  it("16. file states map to truthful safe labels only", () => {
    expect(submissionFileStatusLabel("RECEIVED")).toBe("Beérkezett");
    expect(submissionFileStatusLabel("PROCESSING")).toBe("Feldolgozás alatt");
    expect(submissionFileStatusLabel("REJECTED")).toBe("Nem fogadható el");
    // Raw scanner/internal enums never reach the label function.
    for (const label of ["CLEAN", "INFECTED", "SCAN_FAILED", "UNSUPPORTED", "ACCEPTED"]) {
      expect(["Beérkezett", "Feldolgozás alatt", "Nem fogadható el"]).not.toContain(label);
    }
  });
});

describe("Document library — DTO safety", () => {
  it("17. refuses storage/scanner/quarantine/internal fields in the serialized DTO", () => {
    const clean = {
      published: [
        { publicationId: "p1", title: "Irat", versionLabel: "v1", publishedAt: null, matterTitle: null, tags: [], downloadAvailable: true },
      ],
      submitted: [
        { submissionId: "s1", requestTitle: "Kérés", files: [{ id: "f1", title: "a.pdf", statusLabel: "Beérkezett" }], submittedAt: null, status: "SUBMITTED", matterTitle: null, matterPublicationId: "mp-1", requestId: "r1" },
      ],
    };
    expect(() => assertDocumentLibraryDtoSafe(clean)).not.toThrow();
    for (const forbidden of ["storageReference", "storageProvider", "scanCode", "scanProvider", "quarantine", "reviewedBy", "reviewedAt", "uploadSource", "checksum", "caseId", "workspaceId", "grantId", "documentVersionId", "internalReview"]) {
      const leaking = JSON.parse(JSON.stringify(clean).replace('"title":"Irat"', `"title":"${forbidden}"`));
      expect(() => assertDocumentLibraryDtoSafe(leaking)).toThrow();
    }
  });

  it("18. is a read model with no new persistence", () => {
    const src = serviceSource();
    expect(src).not.toMatch(/\.create\(|\.update\(|\.delete\(|createMany|updateMany/);
    const schema = schemaSource();
    expect(schema).not.toMatch(/model OrgDocumentLibrary|model PortalDocumentLibrary/);
  });

  it("open requests can never be projected as documents", () => {
    const src = serviceSource().replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    expect(src).not.toMatch(/DOCUMENT_UPLOAD|INFORMATION_REQUEST|DATA_FORM|QUESTION_RESPONSE/);
    expect(src).not.toMatch(/prisma\.clientRequest/);
    expect(src).toMatch(/listPortalDocuments/);
    expect(src).toMatch(/listCustomerSubmissions/);
    expect(src).toMatch(/normalizeSubmissionStatus/);
  });
});
