import {randomUUID} from 'crypto';
import express from 'express';
import type {Server} from 'http';
import {prisma} from '../src/prisma/prisma.service';
import {verifiedContextRouter} from '../src/modules/anonymize/verifiedContext.routes';
import {setScanner} from '../src/modules/upload-security/scannerAdapter';
import driveService from '../src/modules/sharepoint/driveService';
jest.mock('../src/middleware/auth',()=>({authenticate:(req:any,_res:any,next:any)=>{req.user={userId:req.headers['x-test-user'],role:req.headers['x-test-role']||'ADMIN'};next()}}));
jest.mock('../src/modules/sharepoint/driveService',()=>({__esModule:true,default:{downloadDocument:jest.fn()}}));
const user=randomUUID(),client=randomUUID(),caseId=randomUUID(),documentId=randomUUID(),v1=randomUUID(),v2=randomUUID();
let server:Server,base:string,artifact:any;let infected=false;
beforeAll(async()=>{
 const url=new URL(process.env.DATABASE_URL||'');if(url.hostname!=='127.0.0.1'||url.port!=='55483'||url.pathname!=='/adminiculum_replay_wf10')throw Error('Unsafe DB');
 const identity=await prisma.$queryRaw<any[]>`SELECT current_database() db,current_user usr,inet_server_port() port`;expect(identity[0]).toMatchObject({db:'adminiculum_replay_wf10',usr:'wf10_pgtest',port:55483});
 process.env.ENABLE_AI_ANONYMIZATION='true';process.env.ENABLE_VERSION_BOUND_AI_CONTEXT='true';
 await prisma.user.create({data:{id:user,email:`${user}@wf10.invalid`,name:'Synthetic admin',role:'ADMIN',skills:[]}});
 await prisma.client.create({data:{id:client,name:'SecretClient Synthetic'}});
 await prisma.case.create({data:{id:caseId,caseNumber:caseId,title:'Private raw case',clientId:client,caseType:'OTHER',createdById:user}});
 await prisma.document.create({data:{id:documentId,caseId,clientId:client,name:'PRIVATE_FILENAME',category:'OTHER',mimeType:'text/plain'}});
 for(const [id,version,text] of [[v1,1,'V1Secret'],[v2,2,'V2Secret']] as const)await prisma.documentVersion.create({data:{id,documentId,version,name:'PRIVATE_TITLE',originalFileName:'private.txt',mimeType:'text/plain',uploadedById:user,storageReference:text,securityScanStatus:'CLEAN',isCurrent:version===2}});
 (driveService.downloadDocument as jest.Mock).mockImplementation(async(id:string)=>Buffer.from(`SecretClient Synthetic ${id} document text`));
 setScanner({provider:'WF10_SYNTHETIC_TEST',scan:async()=>({outcome:infected?'INFECTED':'CLEAN',provider:'WF10_SYNTHETIC_TEST',codeSafe:'TEST'})});
 const app=express();app.use(express.json());app.use(verifiedContextRouter);await new Promise<void>(resolve=>{server=app.listen(0,'127.0.0.1',()=>resolve())});base=`http://127.0.0.1:${(server.address() as any).port}`;
},30000);
afterAll(async()=>{setScanner(null);if(server)await new Promise<void>(r=>server.close(()=>r()));await prisma.$disconnect()});
async function call(path:string,body:unknown){const r=await fetch(base+path,{method:'POST',headers:{'content-type':'application/json','x-test-user':user},body:JSON.stringify(body)});return {status:r.status,body:await r.json() as any}}
const create=(version:string,body:unknown)=>call(`/documents/${documentId}/versions/${version}/anonymize-verified`,body);
const handoff=(body?:unknown)=>call(`/anonymous-documents/${artifact.anonymizedArtifactId}/verified-context`,body||{sourceDocumentId:documentId,sourceDocumentVersionId:v1,artifactRevision:1});
test('exact historic version bytes are redacted and provenance is persisted',async()=>{const r=await create(v1,{extraPhrases:['V1Secret']});expect(r.status).toBe(200);artifact=r.body;expect(artifact.sourceDocumentVersionId).toBe(v1);expect(artifact.isCurrentVersion).toBe(false);expect(JSON.stringify(artifact)).not.toMatch(/V1Secret|V2Secret|SecretClient|PRIVATE_FILENAME|PRIVATE_TITLE|redactedItems|profileDigest|sourceDigest/);expect((await prisma.anonymizedSourceBinding.findUniqueOrThrow({where:{artifactId:artifact.anonymizedArtifactId}})).sourceDocumentVersionId).toBe(v1);});
test('new version makes a different immutable artifact',async()=>{const r=await create(v2,{extraPhrases:['V2Secret']});expect(r.status).toBe(200);expect(r.body.anonymizedArtifactId).not.toBe(artifact.anonymizedArtifactId);expect(r.body.sourceVersionNumber).toBe(2);});
test('forged text/readiness and expected revisions are rejected',async()=>{expect((await create(v1,{sourceText:'forged',isReady:true,verifiedBy:['server']})).status).toBe(400);expect((await handoff({sourceDocumentId:documentId,sourceDocumentVersionId:v2,artifactRevision:1})).status).toBe(409);expect((await handoff({sourceDocumentId:documentId,sourceDocumentVersionId:v1,artifactRevision:2})).status).toBe(400);});
test('legacy rows remain unbound, never backfilled',async()=>{const legacy=await prisma.anonymousDocument.create({data:{sourceDocId:documentId,caseId,name:'Legacy',content:'legacy',redactedItems:[],patternCount:0}});expect((await call(`/anonymous-documents/${legacy.id}/verified-context`,{sourceDocumentId:documentId,sourceDocumentVersionId:v1,artifactRevision:1})).body.code).toBe('LEGACY_ARTIFACT_UNBOUND');});
test('quarantine and unavailable scanner fail closed at handoff',async()=>{infected=true;expect((await handoff()).status).toBe(409);infected=false;await prisma.documentVersion.update({where:{id:v1},data:{securityScanStatus:'PENDING_SCAN'}});expect((await handoff()).status).toBe(409);await prisma.documentVersion.update({where:{id:v1},data:{securityScanStatus:'CLEAN'}});});
test('changed bytes and profile invalidate outbound context',async()=>{(driveService.downloadDocument as jest.Mock).mockResolvedValueOnce(Buffer.from('changed bytes'));expect((await handoff()).status).toBe(409);await prisma.client.update({where:{id:client},data:{name:'Changed SecretClient'}});expect((await handoff()).status).toBe(409);});
test('bound artifact text cannot be silently replaced',async()=>{await expect(prisma.anonymousDocument.update({where:{id:artifact.anonymizedArtifactId},data:{content:'replacement'}})).rejects.toThrow();});

test('cross-document selection and a revoked case reader cannot obtain context',async()=>{
 const other=await prisma.document.create({data:{caseId,clientId:client,name:'Other source',category:'OTHER'}});
 expect((await call(`/documents/${other.id}/versions/${v1}/anonymize-verified`,{})).status).toBe(404);
 const outsider=await prisma.user.create({data:{email:`${randomUUID()}@wf10.invalid`,name:'Outsider',role:'LAWYER',skills:[]}});
 const r=await fetch(`${base}/anonymous-documents/${artifact.anonymizedArtifactId}/verified-context`,{method:'POST',headers:{'content-type':'application/json','x-test-user':outsider.id,'x-test-role':'LAWYER'},body:JSON.stringify({sourceDocumentId:documentId,sourceDocumentVersionId:v1,artifactRevision:1})});expect(r.status).toBe(403);
});
test('source scope change during extraction does not certify a mismatched artifact',async()=>{
 const other=await prisma.client.create({data:{name:'Different synthetic scope'}});const before=await prisma.anonymizedSourceBinding.count({where:{caseId}});
 (driveService.downloadDocument as jest.Mock).mockImplementationOnce(async()=>{await prisma.case.update({where:{id:caseId},data:{clientId:other.id}});return Buffer.from('SecretClient Synthetic V1Secret');});
 expect((await create(v1,{extraPhrases:['V1Secret']})).status).toBe(403);expect(await prisma.anonymizedSourceBinding.count({where:{caseId}})).toBe(before);await prisma.case.update({where:{id:caseId},data:{clientId:client}});
});
test('rehydration uses the exact stored artifact mapping',async()=>{
 const {importAIResponse}=await import('../src/modules/anonymize/services');const restored=await importAIResponse({anonymousDocId:artifact.anonymizedArtifactId,aiResponseText:artifact.sanitizedText,userId:user});expect(restored.success).toBe(true);expect(restored.rehydratedContent).toContain('V1Secret');expect(restored.rehydratedContent).not.toContain('V2Secret');
});