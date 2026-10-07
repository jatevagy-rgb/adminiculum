import { canRunGrowResearch, runResearchCycle, reviewRecommendation, startInitiativeFromOpportunity, recordOutcomeMeasurement } from '../src/modules/company-growth/research/service';
import { createOpportunityPublicationDraft, submitOpportunityPublication, approveOpportunityPublication, publishOpportunityPublication, revokeOpportunityPublication } from '../src/modules/company-growth/opportunityPublicationService';

const scopeReached = new Error('CLIENT_SCOPE_CHECK_REACHED');
const actor = (role: string) => ({ userId: 'actor', role });
function database() { return { client: { findUnique: jest.fn().mockRejectedValue(scopeReached) } } as any; }

const managerActions = [
  (role: string, db: any) => runResearchCycle(actor(role), 'client', {}, db),
  (role: string, db: any) => reviewRecommendation(actor(role), 'client', 'candidate', { decision: 'ACCEPT' }, db),
  (role: string, db: any) => reviewRecommendation(actor(role), 'client', 'candidate', { decision: 'REQUEST_MORE_INFO' }, db),
  (role: string, db: any) => startInitiativeFromOpportunity(actor(role), 'client', 'opportunity', {}, db),
  (role: string, db: any) => recordOutcomeMeasurement(actor(role), 'client', 'opportunity', { businessProcessId: 'process', beforeSnapshotId: 'snapshot' }, db),
];

describe.each(['ADMIN', 'PARTNER', 'LAWYER', 'COLLAB_LAWYER'])('unchanged Grow backend authority for %s', role => {
  test('manager-only research/review/more-info/handoff/outcomes never broaden to readers or publishers', async () => {
    const manager = ['ADMIN', 'PARTNER'].includes(role);
    expect(canRunGrowResearch(actor(role))).toBe(manager);
    for (const action of managerActions) {
      const db = database();
      if (manager) {
        await expect(action(role, db)).rejects.toBe(scopeReached);
        expect(db.client.findUnique).toHaveBeenCalled();
      } else {
        await expect(action(role, db)).rejects.toMatchObject({ status: 403, code: 'GROW_REVIEW_FORBIDDEN' });
        expect(db.client.findUnique).not.toHaveBeenCalled();
      }
    }
  });

  test('preparation/submission retains client-read scope while publication requires separate publisher role', async () => {
    await expect(createOpportunityPublicationDraft(actor(role), 'client', { opportunityId: 'opp', workspaceId: 'workspace', title: 'Title', summary: 'Summary' }, database())).rejects.toBe(scopeReached);
    await expect(submitOpportunityPublication(actor(role), 'client', 'publication', {}, database())).rejects.toBe(scopeReached);
    for (const action of [approveOpportunityPublication, publishOpportunityPublication, revokeOpportunityPublication]) {
      const db = database();
      if (role === 'COLLAB_LAWYER') {
        await expect(action(actor(role), 'client', 'publication', {}, db)).rejects.toMatchObject({ status: 403, code: 'PUBLICATION_NOT_AUTHORIZED' });
        expect(db.client.findUnique).not.toHaveBeenCalled();
      } else {
        await expect(action(actor(role), 'client', 'publication', {}, db)).rejects.toBe(scopeReached);
      }
    }
  });
});
