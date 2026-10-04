// Run from Backend with Node 20. Receives only a deliberately isolated test URL.
import {spawnSync} from 'node:child_process';import {mkdirSync,writeFileSync} from 'node:fs';import {resolve} from 'node:path';
const url=new URL(process.env.WF10_TEST_DATABASE_URL||'');if(url.hostname!=='127.0.0.1'||url.port!=='55483'||url.username!=='wf10_pgtest'||url.pathname!=='/adminiculum_replay_wf10')throw Error('Unsafe WF10 test target');
const out=resolve('../work/evidence');mkdirSync(out,{recursive:true});
const tests=['durableWorkspace.integration','historyPolicy.integration','verifiedContext.integration','caseHistoryRead.route','caseHistoryProjection','workReports','anonymizeSafeContext','anonymizeRehydration','anonymizeClientCandidates','anonymizationEngine','documentVersionContentPipeline'].map(n=>`tests/${n}.test.ts`);
const sha=spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).stdout.trim();
const r=spawnSync(process.execPath,['node_modules/jest/bin/jest.js','--runInBand',...tests,'--json',`--outputFile=${resolve(out,'backend-results.json')}`],{env:{...process.env,DATABASE_URL:url.href},encoding:'utf8',timeout:300000,windowsHide:true});
writeFileSync(resolve(out,'backend-tests.log'),(r.stdout||'')+(r.stderr||''));writeFileSync(resolve(out,'backend-command.json'),JSON.stringify({sourceSha:sha,node:process.version,tests,exitCode:r.status,error:r.error?.message||null},null,2));console.log(JSON.stringify({sourceSha:sha,exitCode:r.status,error:r.error?.message||null}));process.exitCode=r.status??1;
