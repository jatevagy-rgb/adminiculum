import workReportRouter from '../src/modules/work-reports/routes';
import { randomUUID } from 'crypto';
import express from 'express';
import type { Server } from 'http';
import { prisma } from '../src/prisma/prisma.service';
import { caseWorkspaceRouter } from '../src/modules/case-workspace/routes';
import { validateTileSave } from '../src/modules/case-workspace/tiles.service';
// Test identities replace only MSAL token verification. Workforce and object
// authorization middleware are the production implementation against real PG.
jest.mock('../src/middleware/auth',()=>({ authenticate:(req:any,_res:any,next:any)=>{req.user={userId:req.headers['x-test-user'],role:req.headers['x-test-role']||'LAWYER'};next();} }));
const ids={manager:randomUUID(),reader:randomUUID(),outsider:randomUUID(),client:randomUUID(),case:randomUUID(),other:randomUUID(),tile:randomUUID()};
let server:Server;let base:string;
let snapshot:any;
async function call(method='GET',body?:unknown,user=ids.manager,caseId=ids.case,role='LAWYER'){
 const response=await fetch(`${base}/cases/${caseId}/tiles`,{method,headers:{'content-type':'application/json','x-test-user':user,'x-test-role':role},body:body===undefined?undefined:JSON.stringify(body)});return {status:response.status,body:await response.json() as any};
}
beforeAll(async()=>{
 const url=new URL(process.env.DATABASE_URL||'');if(url.hostname!=='127.0.0.1'||url.port!=='55483'||url.pathname!=='/adminiculum_replay_wf10')throw Error('Unsafe test DB');
 const identity=await prisma.$queryRaw<any[]>`SELECT current_database() db, current_user usr, inet_server_port() port`;
 expect(identity[0]).toMatchObject({db:'adminiculum_replay_wf10',usr:'wf10_pgtest',port:55483});
 process.env.ENABLE_DURABLE_CASE_WORKSPACE='true';
 for(const id of [ids.manager,ids.reader,ids.outsider])await prisma.user.create({data:{id,email:`${id}@wf10.invalid`,name:'Synthetic',role:'LAWYER',skills:[]}});
 await prisma.client.create({data:{id:ids.client,name:'WF10 synthetic client'}});
 for(const id of [ids.case,ids.other])await prisma.case.create({data:{id,caseNumber:id,title:'Synthetic case',clientId:ids.client,caseType:'OTHER',createdById:ids.manager}});
 await prisma.caseCollaborator.create({data:{caseId:ids.case,userId:ids.reader}});
 const app=express();app.use(express.json());app.use('/reports',workReportRouter);app.use(caseWorkspaceRouter);await new Promise<void>(resolve=>{server=app.listen(0,'127.0.0.1',()=>resolve())});base=`http://127.0.0.1:${(server.address() as any).port}`;
},30000);
afterAll(async()=>{if(server)await new Promise<void>(resolve=>server.close(()=>resolve()));await prisma.$disconnect();});
test('no layout derives canonical references and real authorization',async()=>{const r=await call();expect(r.status).toBe(200);expect(r.body.layoutRevision).toBe(0);expect(r.body.canManage).toBe(true);expect(r.body.placements.document).toContain('goal');snapshot=r.body;});
test('atomic save persists shared tile and both personal surfaces',async()=>{const r=await call('PUT',{layoutRevision:0,placements:{overview:['goal',ids.tile],document:[ids.tile]},tiles:[{id:ids.tile,revision:0,title:'Közös',text:'Synthetic private text',tone:'green',archived:false}]});expect(r.status).toBe(200);expect(r.body.layoutRevision).toBe(1);snapshot=r.body;expect((await prisma.caseWorkspaceTile.findUniqueOrThrow({where:{id:ids.tile}})).text).toBe('Synthetic private text');});
test('fresh requests share content but not personal arrangement',async()=>{const a=await call();const b=await call('GET',undefined,ids.reader);expect(a.body.placements.document).toEqual([ids.tile]);expect(b.body.tiles[0].id).toBe(ids.tile);expect(b.body.placements.document).toEqual(['current-state','subject','goal']);expect(b.body.canManage).toBe(false);});
test('reader changes own layout but cannot change shared content',async()=>{expect((await call('PUT',{layoutRevision:0,placements:{overview:[ids.tile],document:[]},tiles:[]},ids.reader)).status).toBe(200);expect((await call('PUT',{layoutRevision:1,placements:{overview:[],document:[]},tiles:[{id:ids.tile,revision:1,title:'hack',text:'hack',tone:'info',archived:false}]},ids.reader)).status).toBe(403);});
test('stale layout and tile updates roll back all changes',async()=>{expect((await call('PUT',{layoutRevision:0,placements:snapshot.placements,tiles:[]})).status).toBe(409);expect((await call('PUT',{layoutRevision:1,placements:{overview:[],document:[]},tiles:[{id:ids.tile,revision:0,title:'stale',text:'stale',tone:'info',archived:false}]})).status).toBe(409);expect((await call()).body.layoutRevision).toBe(1);});
test('cross-case references fail atomically without creating a layout',async()=>{expect((await call('PUT',{layoutRevision:0,placements:{overview:[ids.tile],document:[]},tiles:[]},ids.manager,ids.other)).status).toBe(400);expect(await prisma.caseWorkspaceLayout.count({where:{caseId:ids.other}})).toBe(0);});
test('other-user write fields, duplicates and unknown references rejected',async()=>{expect(()=>validateTileSave({layoutRevision:0,userId:ids.manager,placements:{overview:[],document:[]},tiles:[]})).toThrow();expect((await call('PUT',{layoutRevision:1,placements:{overview:['goal','goal'],document:[]},tiles:[]})).status).toBe(400);expect((await call('PUT',{layoutRevision:1,placements:{overview:['unknown'],document:[]},tiles:[]})).status).toBe(400);});
test('outsiders and customer roles denied',async()=>{expect((await call('GET',undefined,ids.outsider)).status).toBe(403);expect((await call('GET',undefined,ids.manager,ids.case,'CLIENT')).status).toBe(403);});
test('archive and restore preserve source case and shared tile identity',async()=>{for(const archived of [true,false]){const current=(await call()).body;const tile=current.tiles[0];const r=await call('PUT',{layoutRevision:current.layoutRevision,placements:current.placements,tiles:[{id:tile.id,revision:tile.revision,title:tile.title,text:tile.text,tone:tile.tone,archived}]});expect(r.status).toBe(200);expect(r.body.tiles[0].archived).toBe(archived);}expect(await prisma.case.count({where:{id:ids.case}})).toBe(1);});
test('disabled capability is explicit',async()=>{process.env.ENABLE_DURABLE_CASE_WORKSPACE='false';expect((await call()).status).toBe(503);process.env.ENABLE_DURABLE_CASE_WORKSPACE='true';});

test('owner persists independently, uses report default and rejects stale/cross-client assignment',async()=>{
 const person=await prisma.organizationPerson.create({data:{clientId:ids.client,name:'Synthetic client owner'}});
 const ownerCall=async(method:string,body?:unknown)=>{const r=await fetch(`${base}/cases/${ids.case}/owner`,{method,headers:{'content-type':'application/json','x-test-user':ids.manager},body:body?JSON.stringify(body):undefined});return {status:r.status,body:await r.json() as any}};
 expect((await ownerCall('PUT',{revision:0,personId:person.id})).status).toBe(200);
 expect((await ownerCall('GET')).body.personId).toBe(person.id);
 const report=async(override='')=>{const r=await fetch(base+'/reports/cases/'+ids.case+override,{headers:{'x-test-user':ids.manager,'x-test-role':'LAWYER'}});expect(r.status).toBe(200);return await r.json() as any;};
 expect((await report()).exportPreview.owner.personId).toBe(person.id);
 const alternate=await prisma.organizationPerson.create({data:{clientId:ids.client,name:'Explicit report override'}});
 expect((await report('?ownerPersonId='+alternate.id)).exportPreview.owner.personId).toBe(alternate.id);
 expect((await ownerCall('GET')).body.personId).toBe(person.id);
 const {savedOwnerPersonId}=await import('../src/modules/case-workspace/owner.service');
 expect(await savedOwnerPersonId(prisma,ids.case,ids.client)).toBe(person.id);
 expect((await ownerCall('PUT',{revision:0,personId:null})).status).toBe(409);
 const otherClient=await prisma.client.create({data:{name:'Other synthetic client'}});
 const outsider=await prisma.organizationPerson.create({data:{clientId:otherClient.id,name:'Other client person'}});
 expect((await ownerCall('PUT',{revision:1,personId:outsider.id})).status).toBe(422);
 await prisma.organizationPerson.update({where:{id:person.id},data:{employmentStatus:'INACTIVE'}});
 expect(await savedOwnerPersonId(prisma,ids.case,ids.client)).toBeNull();
 expect(await prisma.caseClientOwnerEvent.count({where:{caseId:ids.case}})).toBe(2);
 await prisma.organizationPerson.update({where:{id:person.id},data:{employmentStatus:'ACTIVE'}});
 expect(await savedOwnerPersonId(prisma,ids.case,ids.client)).toBeNull();
 expect((await ownerCall('PUT',{revision:2,personId:person.id})).status).toBe(200);
 await prisma.case.update({where:{id:ids.case},data:{clientId:otherClient.id}});
 expect(await savedOwnerPersonId(prisma,ids.case,otherClient.id)).toBeNull();
 expect(await prisma.caseClientOwnerEvent.count({where:{caseId:ids.case}})).toBe(4);
});

test('concurrent client change and owner assignment cannot leave an invalid pairing',async()=>{
 const c=await prisma.case.create({data:{caseNumber:randomUUID(),title:'Concurrent synthetic case',clientId:ids.client,caseType:'OTHER',createdById:ids.manager}});
 const person=await prisma.organizationPerson.create({data:{clientId:ids.client,name:'Concurrent owner'}});const nextClient=await prisma.client.create({data:{name:'Concurrent destination'}});
 const results=await Promise.allSettled([fetch(`${base}/cases/${c.id}/owner`,{method:'PUT',headers:{'content-type':'application/json','x-test-user':ids.manager},body:JSON.stringify({revision:0,personId:person.id})}),prisma.case.update({where:{id:c.id},data:{clientId:nextClient.id}})]);
 const current=await prisma.case.findUniqueOrThrow({where:{id:c.id}});const saved=await prisma.caseClientOwner.findUnique({where:{caseId:c.id}});
 if(saved?.personId){expect(saved.clientId).toBe(current.clientId);expect(person.clientId).toBe(current.clientId)}
 expect(results.every(r=>r.status==='fulfilled')).toBe(true);
 if(results[0].status==='fulfilled')expect([200,409,422]).toContain((results[0].value as Response).status);
});
