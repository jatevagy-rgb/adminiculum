import { snapshotMissingFactKeys, snapshotFreshness, latestRelevantFactChange, approvedSourceUrl, complianceFactLabel } from '../src/modules/compliance/snapshotPresentation';
test('missing facts are recorded facts only; absent traces are unavailable, never inferred', () => {
  expect(snapshotMissingFactKeys({})).toBeNull();
  expect(snapshotMissingFactKeys({ missingFactKeys: [] })).toEqual([]);
  expect(snapshotMissingFactKeys({ missingFactKeys: ['a', 'a', 8] })).toEqual(['a']);
  expect(snapshotFreshness({}, new Date(), null)).toBe('UNAVAILABLE');
});
test('only a changed dependency in the exact subject scope makes an evaluation stale', () => {
 const evaluated=new Date('2026-09-01T12:00:00Z'), changed=new Date('2026-09-02T12:00:00Z');
 const facts=[{updatedAt:changed,scopeType:'COMPANY',factSubjectId:null,factDefinition:{key:'count'}}];
 expect(snapshotFreshness({missingFactKeys:['count']},evaluated,latestRelevantFactChange(facts,['count'],'COMPANY',null))).toBe('STALE');
 expect(snapshotFreshness({missingFactKeys:[]},evaluated,latestRelevantFactChange(facts,['other'],'COMPANY',null))).toBe('RECORDED');
 expect(latestRelevantFactChange(facts,['count'],'EMPLOYEE','person')).toBeNull();
});
test('source links require the reviewed exact version and approved source; unsafe URLs stay unavailable', () => {
 const version={status:'ACTIVE',reviewStatus:'APPROVED',legalSource:{status:'APPROVED'},captures:[{sourceUri:'https://example.org/exact/version'}]};
 expect(approvedSourceUrl(version)).toBe('https://example.org/exact/version');
 expect(approvedSourceUrl({...version,reviewStatus:'UNREVIEWED'})).toBeNull();
 expect(approvedSourceUrl({...version,captures:[{sourceUri:'javascript:alert(1)'}]})).toBeNull();
 expect(approvedSourceUrl({...version,captures:[{sourceUri:'https://secret@example.org/'}]})).toBeNull();
});
test('derived whistle sector has human wording without becoming a portal-answerable classification',()=>{
 expect(complianceFactLabel('whistle_special_sector')).toBe('Visszaélés-bejelentési szabályok ágazati érintettsége');
 expect(complianceFactLabel('future_internal')).toBeNull();
});
