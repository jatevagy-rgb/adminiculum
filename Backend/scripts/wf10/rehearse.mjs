import {spawnSync} from 'node:child_process';
// Isolated PG16 rehearsal. Never reads .env and never drops/resets a database.
import {Client} from 'pg';import {readFileSync,readdirSync,writeFileSync} from 'node:fs';import {resolve} from 'node:path';import {randomUUID} from 'node:crypto';
const url=new URL(process.env.WF10_PG_URL||'');const mode=process.argv[2];const runId=process.argv[3]||'initial';if(!['empty','upgrade'].includes(mode)||!/^[a-z0-9]{1,16}$/.test(runId))throw Error('Invalid isolated rehearsal mode/run');const expected=`adminiculum_replay_wf10_${mode}_${runId}`;
if(url.hostname!=='127.0.0.1'||url.port!=='55483'||url.username!=='wf10_pgtest'||url.pathname!==`/${expected}`)throw Error('Unsafe rehearsal identity');
const adminUrl=new URL(url);adminUrl.pathname='/postgres';const admin=new Client({connectionString:adminUrl.href});await admin.connect();
async function identity(db,name){const {rows:[r]}=await db.query('SELECT current_database() db,current_user usr,host(inet_server_addr()) host,inet_server_port() port,version() version');if(r.db!==name||r.usr!==url.username||r.host!==url.hostname||r.port!==Number(url.port)||!r.version.startsWith('PostgreSQL 16.'))throw Error('Identity mismatch');console.log(JSON.stringify(r));}
await identity(admin,'postgres');await admin.query(`CREATE DATABASE "${expected}"`);await admin.end();
const db=new Client({connectionString:url.href});await db.connect();await identity(db,expected);
if((await db.query("SELECT count(*)::int n FROM information_schema.tables WHERE table_schema='public'")).rows[0].n!==0)throw Error('Refused nonempty schema');
const root=process.cwd();const migrationRoot=resolve(root,'prisma/migrations');const baseline='20260726000000_current_schema_baseline';
const oldSchema=mode==='upgrade'?readFileSync(resolve(root,'../work/pre-wf10-schema.sql'),'utf8'):readFileSync(resolve(root,`prisma/baseline/${baseline}.sql`),'utf8');await identity(db,expected);await db.query(oldSchema);
const legacy={user:randomUUID(),client:randomUUID(),case:randomUUID(),doc:randomUUID(),version:randomUUID(),artifact:randomUUID()};
if(mode==='upgrade'){
 await identity(db,expected);await db.query('INSERT INTO users(id,email,name,role,skills,"updatedAt") VALUES($1,$2,$3,\'ADMIN\',ARRAY[]::text[],now())',[legacy.user,`${legacy.user}@wf10.invalid`,'Legacy test user']);
 await db.query('INSERT INTO clients(id,name,"updatedAt") VALUES($1,$2,now())',[legacy.client,'Synthetic preserved legacy client']);
 await db.query('INSERT INTO cases(id,"caseNumber",title,"caseType","clientId","createdById","updatedAt") VALUES($1,$1,$2,\'OTHER\',$3,$4,now())',[legacy.case,'Preserved legacy case',legacy.client,legacy.user]);
 await db.query('INSERT INTO documents(id,name,category,"caseId","clientId","updatedAt") VALUES($1,$2,\'OTHER\',$3,$4,now())',[legacy.doc,'Legacy name',legacy.case,legacy.client]);
 await db.query('INSERT INTO document_versions(id,version,name,"uploadedById","documentId") VALUES($1,1,$2,$3,$4)',[legacy.version,'Legacy v1',legacy.user,legacy.doc]);
 await db.query('INSERT INTO anonymous_documents(id,name,content,"sourceDocId","caseId","redactedItems","patternCount") VALUES($1,$2,$3,$4,$5,\'[]\'::jsonb,0)',[legacy.artifact,'Legacy unbound','Legacy text unchanged',legacy.doc,legacy.case]);
}
const before=mode==='upgrade'?(await db.query('SELECT row_to_json(a) row FROM anonymous_documents a WHERE id=$1',[legacy.artifact])).rows[0].row:null;const results=[];
for(const name of readdirSync(migrationRoot).filter(n=>n>(mode==='upgrade'?'20261001000000':baseline)&&!n.endsWith('.toml')).sort()){
 await identity(db,expected);await db.query('BEGIN');try{await db.query(readFileSync(resolve(migrationRoot,name,'migration.sql'),'utf8'));await db.query('COMMIT');results.push({name,pass:true});console.log('PASS',name);}catch(e){await db.query('ROLLBACK');results.push({name,pass:false,error:e.message});throw e;}
}
if(mode==='upgrade'){const after=(await db.query('SELECT row_to_json(a) row FROM anonymous_documents a WHERE id=$1',[legacy.artifact])).rows[0].row;if(JSON.stringify(before)!==JSON.stringify(after))throw Error('Legacy artifact modified');for(const table of ['case_workspace_tiles','case_workspace_layouts','case_client_owners','case_history_policies','anonymized_source_bindings'])if((await db.query(`SELECT count(*)::int n FROM ${table}`)).rows[0].n!==0)throw Error('Unexpected backfill');results.push({legacyRowsPreserved:true,legacyBinding:'NULL/unbound',automaticPublication:false});}
writeFileSync(resolve(root,`../work/evidence/${mode}-rehearsal.json`),JSON.stringify({sourceSha:spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).stdout.trim(),mode,database:expected,results},null,2));await db.end();
