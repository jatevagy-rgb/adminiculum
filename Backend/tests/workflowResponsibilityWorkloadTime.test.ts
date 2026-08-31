import fs from 'fs';
import path from 'path';
import { deriveResponsibilityCapabilities } from '../src/modules/responsibility/capabilities';

const repoRoot = path.resolve(__dirname, '..', '..');

function readRepoFile(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('workflow responsibility/workload/time safety contract', () => {
  it('derives case staffing capabilities without using client-facing roles', () => {
    expect(deriveResponsibilityCapabilities(
      { userId: 'lawyer-1', role: 'LAWYER' },
      { assignedLawyerId: 'lawyer-1', createdById: 'creator-1', isCollaborator: false, hasMatter: true }
    )).toMatchObject({
      canChangeResponsibleLawyer: true,
      canAddCollaborator: true,
      canRemoveCollaborator: true,
      canChangeCollaboratorRole: false,
      canAssignWork: true,
      canRecordTime: true,
      canViewCaseTime: true,
      canViewTeamWorkload: false,
    });

    expect(deriveResponsibilityCapabilities(
      { userId: 'collab-1', role: 'LEGAL_ASSISTANT' },
      { assignedLawyerId: 'lawyer-1', createdById: 'creator-1', isCollaborator: true, hasMatter: false }
    )).toMatchObject({
      canChangeResponsibleLawyer: false,
      canAddCollaborator: false,
      canRemoveCollaborator: false,
      canAssignWork: true,
      canRecordTime: false,
      canViewCaseTime: false,
      canViewTeamWorkload: false,
    });
  });

  it('keeps team workload restricted to privileged internal roles', () => {
    expect(deriveResponsibilityCapabilities(
      { userId: 'partner-1', role: 'PARTNER' },
      { assignedLawyerId: null, createdById: 'creator-1', isCollaborator: false, hasMatter: true }
    ).canViewTeamWorkload).toBe(true);

    expect(deriveResponsibilityCapabilities(
      { userId: 'lawyer-1', role: 'LAWYER' },
      { assignedLawyerId: null, createdById: 'creator-1', isCollaborator: false, hasMatter: true }
    ).canViewTeamWorkload).toBe(false);
  });

  it('registers workload and case responsibility routes without schema or portal dependencies', () => {
    const index = readRepoFile('Backend/src/index.ts');
    const casesRoutes = readRepoFile('Backend/src/modules/cases/routes.ts');
    const service = readRepoFile('Backend/src/modules/responsibility/service.ts');

    expect(index).toContain("app.use('/api/v1/workload', workloadRoutes)");
    expect(casesRoutes).toContain("router.get('/:caseId/responsibility'");
    expect(service).not.toContain('workspaceText');
    expect(service).not.toContain('clientPortal');
    expect(service).not.toContain('performanceScore');
  });

  it('prevents hidden time ownership changes while resolving task time through persisted scope', () => {
    const timeEntries = readRepoFile('Backend/src/routes/timeEntries.ts');

    expect(timeEntries).toContain('TIME_ENTRY_USER_ID_NOT_ACCEPTED');
    expect(timeEntries).toContain('TIME_ENTRY_CONTEXT_NOT_SUPPORTED');
    expect(timeEntries).toContain('resolveTaskTimeAttribution');
    expect(timeEntries).toContain('TIME_ENTRY_TASK_CASE_MISMATCH');
    expect(timeEntries).not.toContain('Task, document and communication time links need a future persisted model');
    expect(timeEntries).not.toContain('fallbackUser');
  });

  it('keeps workload UI non-evaluative and free of passive tracking claims', () => {
    const workloadPage = readRepoFile('Frontend/src/app/workload/page.tsx');

    expect(workloadPage).toContain('Nem teljesítmény-rangsor');
    expect(workloadPage).toContain('Aktív/passzív időmérő nincs bekapcsolva');
    expect(workloadPage).not.toContain('AI');
    expect(workloadPage).not.toContain('n8n');
    expect(workloadPage).not.toContain('performanceScore');
  });
});
