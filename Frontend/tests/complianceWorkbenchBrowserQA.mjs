// Isolated browser interaction test of the real workbench and API clients.
// Only network/auth transport is substituted; no hosted system is contacted.
import { build } from 'esbuild';
import { chromium } from 'playwright';
import http from 'node:http';
import assert from 'node:assert/strict';
const built = await build({
  stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import {ComplianceWorkbench} from './src/components/clients/compliance/ComplianceWorkbench'; createRoot(document.getElementById('root')).render(<ComplianceWorkbench clientId="client-a" onNavigate={v => window.qaNavigation=v} onChanged={() => {}} />);`, resolveDir: process.cwd(), loader: 'tsx' },
  bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
  plugins: [{ name: 'isolated-api-transport', setup(b) {
    b.onResolve({ filter: /^(?:@\/lib\/api|\.\/api)$/ }, () => ({ path: 'api', namespace: 'test' }));
    b.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: `export async function fetchApi(url, options={}) { const response=await fetch('/api'+url, {...options,headers:{'content-type':'application/json'}}); if(!response.ok) throw new Error('Request failed'); return response.json(); } export class ApiError extends Error {}`, loader: 'js' }));
  } }],
});
const server = http.createServer((req,res) => { if(req.url === '/bundle.js') {res.setHeader('content-type','text/javascript');res.end(built.outputFiles[0].text);} else {res.setHeader('content-type','text/html');res.end('<!doctype html><html lang="hu"><head><meta charset="utf-8"></head><body><main id="root"></main><script src="/bundle.js"></script></body></html>');} });
await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
const browser = await chromium.launch({headless:true});
try {
  const page = await browser.newPage({viewport:{width:1100,height:900}});
  page.on('pageerror', error => console.error(error.message));
  const calls=[]; let decided=false;
  const source={observationId:'obs',legalSourceId:'source',legalSourceVersionId:'exact-version',versionKey:'V1',sourceKey:'CELEX fixture',event:'consolidated version',reviewedNote:'Human review completed',revision:'a'.repeat(64),requirementVersions:[{id:'req',title:'Exactly impacted requirement'}],proposals:[],decision:null};
  const row={id:'SOURCE_IMPACT:obs',kind:'SOURCE_IMPACT',sourceId:'obs',clientId:'client-a',title:'Reviewed source',status:'IMPACT_CONFIRMED',action:'IMPACT_DECISION',readOnly:false,source};
  await page.route('**/api/**',async route=>{
    const req=route.request();
    if(req.method()==='POST') {calls.push({url:new URL(req.url()).pathname,body:req.postDataJSON()});decided=true;await route.fulfill({json:{id:'receipt'}});return;}
    await route.fulfill({json:{clientId:'client-a',acceptanceTargets:[],truncated:{},rows:[{...row,readOnly:decided,reason:decided?'DECISION_RECORDED':null,source:{...source,decision:decided?{kind:'NO_ACTION',note:'Reviewed; no client work required.',result:{}}:null}}]}});
  });
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.getByText('Azonosító: exact-version',{exact:false}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Döntés rögzítése'}).isDisabled(),true);
  await page.getByLabel('Döntési indok').fill('Reviewed; no client work required.');
  await page.getByRole('button',{name:'Döntés rögzítése'}).click();
  await page.getByText('Csak olvasható:',{exact:false}).waitFor();
  assert.deepEqual(calls,[{url:'/api/compliance/clients/client-a/source-impacts/obs/decision',body:{sourceRevision:'a'.repeat(64),kind:'NO_ACTION',note:'Reviewed; no client work required.'}}]);
  assert.equal(await page.getByRole('button',{name:'Döntés rögzítése'}).count(),0);
  console.log('PASS browser: exact source shown, reason required, explicit canonical decision, single POST, read-only receipt after refresh.');
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
