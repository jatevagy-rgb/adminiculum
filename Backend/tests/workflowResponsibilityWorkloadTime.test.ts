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

  it('keeps the workload view non-evaluative: manual persisted time only, no ranking or passive tracking', () => {
    const workloadPage = readRepoFile('Frontend/src/app/workload/page.tsx');
    const workloadType = readRepoFile('Frontend/src/lib/api.ts');
    const service = readRepoFile('Backend/src/modules/responsibility/service.ts');

    // Only manually recorded, persisted time is shown — never a live/passive timer.
    expect(workloadPage).toContain('Aktív/passzív időmérő nincs bekapcsolva');
    expect(workloadPage).toContain('kézzel rögzített időbejegyzéseket');
    expect(workloadPage).toContain('recordedMinutes');
    expect(workloadType).toContain('recordedMinutes: number');
    expect(workloadType).toContain('passiveTracking: boolean');
    expect(workloadType).toContain('activeTimerSupported: boolean');
    expect(service).toContain('prisma.timeEntry.findMany');
    expect(service).toContain('recordedMinutes: 0');
    expect(service).toContain('activeTimerSupported: false');
    expect(service).toContain('activeTimer: false');
    expect(service).toContain('passiveTracking: false');

    // No performance score, ranking metric or AI/n8n evaluation can be introduced
    // silently — workload stays a descriptive operational view.
    const forbiddenEvaluationTokens = [
      'performanceScore',
      'performance_score',
      'productivityScore',
      'efficiencyScore',
      'rankingScore',
      'leaderboard',
    ];
    for (const token of forbiddenEvaluationTokens) {
      expect(workloadPage).not.toContain(token);
      expect(workloadType).not.toContain(token);
      expect(service).not.toContain(token);
    }
    expect(service).not.toMatch(/\b(performance|productivity|efficiency|ranking|leaderboard)[A-Za-z]*\s*[:=]/i);
    expect(workloadPage).not.toMatch(/\b(score|scoreboard|leaderboard|ranking)\b/i);
    expect(workloadPage).not.toContain('pontszám');
    expect(workloadPage).not.toContain('rangsorolás');
    expect(workloadPage).not.toMatch(/\bAI\b/);
    expect(workloadPage).not.toMatch(/n8n/i);
  });
});
