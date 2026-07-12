import fs from 'fs';
import path from 'path';

const repoRoot = path.resolve(process.cwd(), '..');

function readRepoFile(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function listMigrationDirectories(): string[] {
  return fs
    .readdirSync(path.join(repoRoot, 'Backend', 'prisma', 'migrations'), {
      withFileTypes: true,
    })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

const legacyModels = [
  'model ClientPortalUser',
  'model ClientPortalMembership',
  'model ClientVisibleArtifact',
  'model ClientPortalGrant',
  'model ClientSubmission',
  'model ClientSubmissionAttachment',
  'model ClientPortalAuditEvent',
];

const legacyEnums = [
  'enum ClientPortalUserStatus',
  'enum ClientPortalMembershipRole',
  'enum ClientPortalMembershipStatus',
  'enum ClientVisibleArtifactType',
  'enum ClientVisibleArtifactStatus',
  'enum ClientVisibleSourceType',
  'enum ClientPortalGrantAction',
  'enum ClientPortalGrantScope',
  'enum ClientPortalGrantStatus',
  'enum ClientSubmissionType',
  'enum ClientSubmissionStatus',
  'enum ClientSubmissionAttachmentScanStatus',
  'enum ClientSubmissionAttachmentStatus',
  'enum ClientPortalActorType',
  'enum ClientPortalAuditAction',
  'enum ClientPortalAuditOutcome',
];

const finalOnlyModels = [
  'model ClientPortalMatterGrant',
  'model ClientPortalMatterPublication',
  'model ClientPortalDocumentShare',
  'model ClientPortalUploadRequest',
  'model ClientPortalUploadedFile',
  'model ClientPortalTask',
];

describe('client portal CP-SCHEMA-1 block guards', () => {
  it('keeps the known legacy candidate block visible in schema.prisma until explicitly resolved', () => {
    const schema = readRepoFile('Backend/prisma/schema.prisma');

    for (const marker of legacyModels) {
      expect(schema).toContain(marker);
    }
    for (const marker of legacyEnums) {
      expect(schema).toContain(marker);
    }

    expect(schema).toContain('@@map("client_portal_users")');
    expect(schema).toContain('@@map("client_portal_audit_events")');
  });

  it('does not contain final-only CP-SCHEMA-1 models in schema.prisma', () => {
    const schema = readRepoFile('Backend/prisma/schema.prisma');

    for (const marker of finalOnlyModels) {
      expect(schema).not.toContain(marker);
    }
  });

  it('does not add a new CP-SCHEMA-1 migration folder while the block is unresolved', () => {
    const allowedLegacyMigration = '20260702140000_add_client_portal_foundation';
    const blockedMigrationNamePatterns = [
      /client_portal_cp_schema/i,
      /cp_schema_1/i,
      /client_portal_schema/i,
      /portal_schema/i,
    ];

    const unexpectedMigrations = listMigrationDirectories().filter(
      (directoryName) =>
        directoryName !== allowedLegacyMigration &&
        blockedMigrationNamePatterns.some((pattern) => pattern.test(directoryName))
    );

    expect(unexpectedMigrations).toEqual([]);
  });

  it('keeps the CP-SCHEMA-1 Prisma draft markdown-only and absent from schema.prisma', () => {
    const draft = readRepoFile('docs/client-portal-cp-schema-1-prisma-draft-nonapplied.md');
    const schema = readRepoFile('Backend/prisma/schema.prisma');

    expect(draft).toContain('# Client Portal CP-SCHEMA-1 Prisma Draft — Non-Applied');
    expect(draft).toMatch(/Do not copy into `schema\.prisma`/i);
    expect(draft).toContain('```prisma');
    expect(draft).toContain('model ClientPortalUser');
    expect(draft).toContain('model ClientPortalAuditEvent');

    for (const marker of finalOnlyModels) {
      expect(draft).toContain(marker);
      expect(schema).not.toContain(marker);
    }
  });

  it('keeps block-posture documentation present and explicitly no-go', () => {
    const requiredDocs = [
      'docs/client-portal-cp-schema-1-collision-resolution-and-patch-strategy.md',
      'docs/client-portal-cp-schema-1-schema-patch-review-checklist.md',
      'docs/client-portal-cp-schema-1-risk-register.md',
      'docs/client-portal-cp-schema-1-next-gates.md',
      'docs/client-portal-cp-schema-1-readiness-checkpoint-2.md',
    ];

    for (const relativePath of requiredDocs) {
      const fullPath = path.join(repoRoot, relativePath);
      expect(fs.existsSync(fullPath)).toBe(true);

      const content = fs.readFileSync(fullPath, 'utf8');
      expect(content).toMatch(/CP-SCHEMA-1/i);
      expect(content).toMatch(/blocked|NO-GO|not authorized/i);
      expect(content).toMatch(/production apply/i);
    }
  });
});
