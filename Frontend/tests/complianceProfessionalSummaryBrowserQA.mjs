// Real component and read clients, local fixture transport; no hosted system or credentials.
import { build } from 'esbuild';
import { chromium } from 'playwright';
import postcss from 'postcss';
import tailwind from 'tailwindcss';
import http from 'node:http';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';

const bundle = await build({ stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import {ComplianceProfessionalSummary} from './src/components/clients/compliance/ComplianceProfessionalSummary'; import {ComplianceWorkbench} from './src/components/clients/compliance/ComplianceWorkbench'; const root=createRoot(document.getElementById('root')); window.showClient=(id)=>root.render(<ComplianceProfessionalSummary clientId={id} clientName={'Ügyfél '+id} onNavigate={(v,rowId)=>{window.navigation=v;window.navTarget=rowId}}/>); window.showWorkItem=(id)=>root.render(<ComplianceWorkbench clientId="a" focusRowId={id} onNavigate={()=>{}} onChanged={()=>{}}/>); window.showClient('a');`, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', define: { 'process.env': '{}' }, plugins: [{ name: 'test-transport', setup(b) {
  b.onResolve({ filter: /^(?:@\/lib\/api|\.\/api)$/ }, () => ({ path: 'api', namespace: 'fixture' }));
  b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `export class ApiError extends Error {constructor(status){super('unavailable');this.status=status}}; export async function fetchApi(url,options={}){const response=await fetch('/api'+url,options);if(!response.ok)throw new ApiError(response.status);return response.json()}`, loader: 'js' }));
} }] });
const css = await postcss([tailwind({ content: ['./src/components/clients/compliance/ComplianceProfessionalSummary.tsx', './src/components/ui/QuietLink.tsx'], corePlugins: { preflight: true } })]).process('@tailwind base; @tailwind components; @tailwind utilities;', { from: undefined });
const tokens = readFileSync('src/app/globals.css', 'utf8').match(/:root\s*\{[\s\S]*?\}/g)?.join('\n') || '';
const server = http.createServer((req, res) => { res.setHeader('content-type', req.url === '/bundle.js' ? 'text/javascript' : 'text/html; charset=utf-8'); res.end(req.url === '/bundle.js' ? bundle.outputFiles[0].text : `<html lang="hu"><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${tokens}\n${css.css}</style></head><body><main id="root"></main><script src="/bundle.js"></script></body></html>`); });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true });
const area = { applicabilityId:'app-a', requirementVersionId:'req-version-a', requirementVersionKey:'v1',ruleVersionKey:'rule-v1',title:'Adatvédelmi követelmény',outcome:'INSUFFICIENT_FACTS',normativeStatement:'Rögzített szakmai követelmény.',domainLabel:'Adatvédelem',usedFacts:[{factKey:'flag',label:'Adatkezelés',value:'false'}],missingFacts:[{factKey:'missing',label:'Rögzítendő tény'}],citations:[{sourceTitle:'Rögzített jogforrás',versionLabel:'forrás-v1'}],evaluationAt:'2026-10-01T12:00:00Z',evaluationFreshness:'STALE' };
const row = {id:'proposal-a',sourceId:'proposal-a',clientId:'a',kind:'PROPOSAL',title:'Rögzített intézkedés',status:'PROPOSED',dueAt:null,ownerId:null,since:'2026-10-01T12:00:00Z',readOnly:false};
try {
  const page = await browser.newPage(); const errors=[]; const writes=[];
  mkdirSync('test-results/compliance-professional', { recursive: true });
  page.on('pageerror', e=>{errors.push(e.message);console.error(e.message);});
  let denied=false; let delayA=false; let releaseA; const gate = new Promise(resolve=>{releaseA=resolve;});
  await page.route('**/api/**', async route => {
    if(route.request().method()!=='GET') writes.push(route.request().method());
    const url=route.request().url();
    if(denied) {await route.fulfill({status:403,json:{}});return;}
    if(delayA && url.includes('/clients/a/')) await gate;
    const id=url.includes('/clients/b/')?'b':'a';
    await route.fulfill({json:url.endsWith('/workspace')?{areas:id==='a'?[area]:[],summary:{},evaluatedAt:null}:{clientId:id,rows:id==='a'?[row]:[],truncated:{proposals:true},generatedAt:'2026-10-09T12:00:00Z',acceptanceTargets:[]}});
  });
  for(const width of [390,768,1440]) {
    await page.setViewportSize({width,height:900}); await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.getByRole('heading',{name:'Következő rögzített lépések'}).waitFor();
    await page.getByText('Nincs rögzített határidő',{exact:true}).waitFor();
    assert.equal(await page.locator('section[aria-label="Tizennégy szakmai kérdés"] details').count(),14);
    await page.getByText('Adatvédelmi követelmény · Nincs elég adat',{exact:true}).click();
    await page.getByText('Adatkezelés: false',{exact:true}).waitFor();
    await page.getByLabel('Keresés a látható címben').fill('nincs találat');
    await page.getByText('Nincs látható értékelés a kiválasztott szűrőben.',{exact:true}).waitFor();
    await page.getByLabel('Keresés a látható címben').fill('');
    const summary=page.locator('section[aria-label="Tizennégy szakmai kérdés"] summary').first(); await summary.focus(); await page.keyboard.press('Enter');
    assert.equal(await summary.evaluate(el=>el.parentElement.open),true);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`overflow ${width}`);
    await page.screenshot({ path: `test-results/compliance-professional/${width}.png`, fullPage: true });
    await page.getByRole('button',{name:'Döntési munkalista megnyitása'}).click(); assert.equal(await page.evaluate(()=>window.navigation),'workbench');
    await page.getByRole('button',{name:'Pontos munkatétel megnyitása'}).click(); assert.equal(await page.evaluate(()=>window.navTarget),'proposal-a');
    console.log(`PASS ${width}: attention, profile filtering, 14 questions, keyboard disclosure, no overflow`);
  }
  delayA=true; await page.getByRole('button',{name:'Áttekintés frissítése'}).click();
  await page.evaluate(()=>window.showClient('b'));
  await page.getByRole('heading',{name:'Ügyfél b',exact:true}).waitFor(); await page.getByRole('heading',{name:'Következő rögzített lépések'}).waitFor();
  releaseA(); await page.waitForTimeout(100);
  assert.equal(await page.getByText('Rögzített intézkedés',{exact:true}).count(),0,'late A response cannot populate B');
  denied=true; await page.getByRole('button',{name:'Áttekintés frissítése'}).click(); await page.getByRole('alert').waitFor();
  assert.match(await page.getByRole('alert').innerText(),/ACCESS_LIMITED/);
  assert.equal(await page.getByText('Rögzített intézkedés',{exact:true}).count(),0);
  denied=false;delayA=false;
  await page.evaluate(()=>window.showWorkItem('proposal-a'));
  await page.locator('#compliance-work-proposal-a').waitFor();
  assert.equal(await page.evaluate(()=>document.activeElement.id),'compliance-work-proposal-a');
  await page.evaluate(()=>window.showWorkItem('unavailable'));
  await page.getByText('A kijelölt munkatétel nem látható ebben a friss munkalistában. Más tétel nem lett kiválasztva.',{exact:true}).waitFor();
  assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);
  console.log('PASS scope switch race, denied refresh clears data, read-only navigation');
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
