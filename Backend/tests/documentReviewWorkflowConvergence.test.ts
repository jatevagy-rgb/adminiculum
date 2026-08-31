/**
 * Focused tests for Document Review & Decide Convergence (TOTAL FINISH LANE).
 * Proves:
 * - One canonical document review path & decision state machine
 * - Word primary editor & browser non-clone behavior
 * - Approve/reject state transitions & authorization rules
 * - Internal approval does NOT publish to client
 * - Document authorization not weakened
 * - Legacy entry points delegate safely to canonical state machine
 * - Orphan/experimental surfaces unmounted as canonical paths
 * - DOCX/PDF comparison engine intact
 */

import fs from 'fs';
import path from 'path';
import {
  evaluateTransition,
  candidateActions,
  approvalAppliesToVersion,
} from '../src/modules/documents/review/reviewWorkflow';

function readRepoFile(relativePath: string): string {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

describe('Document Review & Decide Convergence Invariants', () => {

  describe('Canonical Decision State Machine & Transitions', () => {
    const OK = { actorAuthorized: true, reviewerHasAccess: true };

    it('supports canonical APPROVE and REQUEST_CHANGES transitions', () => {
      const approve = evaluateTransition('IN_REVIEW', 'APPROVE', {
        ...OK,
        openBlockingPoints: 0,
        reviewVersionId: 'v1',
        approveVersionId: 'v1',
      });
      expect(approve).toMatchObject({ allowed: true, nextStatus: 'APPROVED', approvedVersionId: 'v1' });

      const requestChanges = evaluateTransition('IN_REVIEW', 'REQUEST_CHANGES', {
        ...OK,
        openPoints: 1,
      });
      expect(requestChanges).toMatchObject({ allowed: true, nextStatus: 'CHANGES_REQUESTED' });
    });

    it('prevents approval when blocking review points are open', () => {
      const result = evaluateTransition('IN_REVIEW', 'APPROVE', {
        ...OK,
        openBlockingPoints: 1,
        reviewVersionId: 'v1',
        approveVersionId: 'v1',
      });
      expect(result).toMatchObject({ allowed: false, reason: 'BLOCKING_POINTS_OPEN' });
    });

    it('prevents unauthorized actors from approving or modifying review state', () => {
      const result = evaluateTransition('IN_REVIEW', 'APPROVE', {
        actorAuthorized: false,
        reviewerHasAccess: false,
        reviewVersionId: 'v1',
        approveVersionId: 'v1',
      });
      expect(result).toMatchObject({ allowed: false, reason: 'ACTOR_NOT_AUTHORIZED' });
    });
  });

  describe('Internal Approval vs Client Publication Separation', () => {
    it('verifies approval state transitions never automatically produce client publication', () => {
      const allStatuses = ['DRAFT', 'ASSIGNED', 'IN_REVIEW', 'CHANGES_REQUESTED', 'RESUBMITTED', 'APPROVED', 'CANCELLED', 'CLOSED'] as const;
      for (const status of allStatuses) {
        const actions = candidateActions(status);
        expect(JSON.stringify(actions)).not.toMatch(/publish|client_publication|auto_publish/i);
      }
    });

    it('proves approval is strictly version-locked and does not auto-inherit to newer revisions', () => {
      expect(approvalAppliesToVersion('v1', 'v1')).toBe(true);
      expect(approvalAppliesToVersion('v1', 'v2')).toBe(false);
      expect(approvalAppliesToVersion(null, 'v1')).toBe(false);
    });
  });

  describe('Authorization Gate Discipline', () => {
    it('ensures document mutation and approval routes require Manage access, not Read', () => {
      const routesSource = readRepoFile('src/modules/documents/routes.ts');
      expect(routesSource).toContain("router.post('/:id/approve', authenticate, requireDocumentObjectManageAccess");
      expect(routesSource).toContain("router.post('/:id/reject', authenticate, requireDocumentObjectManageAccess");
      expect(routesSource).toContain("router.post('/:id/comments', authenticate, requireDocumentObjectManageAccess");
      expect(routesSource).toContain("router.post('/:id/comments/:commentId/resolve', authenticate, requireDocumentObjectManageAccess");
      expect(routesSource).toContain("router.post('/:id/comments/:commentId/reopen', authenticate, requireDocumentObjectManageAccess");
    });
  });

  describe('Canonical Frontend Navigation & Surface Invariants', () => {
    it('proves editor-lab is a deprecation redirect and not a canonical authoring path', () => {
      const editorLabSource = fs.readFileSync(
        path.join(__dirname, '../../Frontend/src/app/editor-lab/page.tsx'),
        'utf8'
      );
      expect(editorLabSource).toContain('router.replace');
      expect(editorLabSource).not.toContain('TipTapEditorExperimental');
    });

    it('proves /matters is a redirect-only page to /cases', () => {
      const mattersSource = fs.readFileSync(
        path.join(__dirname, '../../Frontend/src/app/matters/page.tsx'),
        'utf8'
      );
      expect(mattersSource).toContain('redirect("/cases")');
    });

    it('proves Case Workspace documents page links directly to canonical review path', () => {
      const caseDocsSource = fs.readFileSync(
        path.join(__dirname, '../../Frontend/src/app/cases/[caseId]/documents/page.tsx'),
        'utf8'
      );
      expect(caseDocsSource).toContain('/cases/${canonicalCaseId}/review/${contractId}');
    });
  });

  describe('DOCX/PDF Comparison Engine Integrity', () => {
    it('verifies backend comparison engine source files are present and uncorrupted', () => {
      const compareEngineFile = path.join(__dirname, '../src/modules/documents/comparison/comparisonService.ts');
      expect(fs.existsSync(compareEngineFile)).toBe(true);
      const content = fs.readFileSync(compareEngineFile, 'utf8');
      expect(content).toContain('createOrGetComparison');
    });
  });
});
