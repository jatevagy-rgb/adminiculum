// Real components in Chromium; local synthetic transport, never live acceptance.
import { build } from 'esbuild';
import { chromium } from 'playwright';
import postcss from 'postcss';
import tailwind from 'tailwindcss';
import http from 'node:http';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';

const bundle = await build({ stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import {PortalActionCenter} from './src/components/client-portal-v3/actions/PortalActionCenter'; import {PortalRequestDetailV3} from './src/components/client-portal-v3/request/PortalRequestDetailV3'; const root=createRoot(document.getElementById('root')); window.showActions=()=>root.render(<PortalActionCenter/>); window.showRequest=(status,submissionStatus)=>root.render(<PortalRequestDetailV3 caseId="case-a" publicationId="matter-a" request={{id:'request-a',type:'INFORMATION_REQUEST',title:'Kért adat',instructions:'',status,fields:[]}} submission={{id:'submission-a',status:submissionStatus,files:[],answers:[]}} matter={{id:'matter-a',title:'Közzétett ügy',documents:[]}} canSendMessages={false} onChanged={async()=>{}}/>); window.showActions();`, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', define: { 'process.env': '{}' }, plugins: [{ name: 'fixture-api', setup(b) {
  b.onResolve({ filter: /^(?:@\/lib\/api|\.\/api)$/ }, () => ({ path: 'api', namespace: 'fixture' }));
  b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `export class ApiError extends Error {constructor(status){super('unavailable');this.status=status}}; export async function fetchApi(url,options={}){const r=await fetch('/api'+url,options);if(!r.ok)throw new ApiError(r.status);return r.json()}`, loader: 'js' }));
} }] });
const css = await postcss([tailwind({ content: ['./src/components/client-portal-v3/**/*.tsx', './src/components/ui/**/*.tsx'], corePlugins: { preflight: true } })]).process('@tailwind base; @tailwind components; @tailwind utilities;', { from: undefined });
const tokens = readFileSync('src/app/globals.css', 'utf8').match(/:root\s*\{[\s\S]*?\}/g)?.join('\n') || '';
const server = http.createServer((req,res)=>{res.setHeader('content-type',req.url==='/bundle.js'?'text/javascript':'text/html; charset=utf-8');res.end(req.url==='/bundle.js'?bundle.outputFiles[0].text:`<html lang="hu"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${tokens}\n${css.css}</style></head><body><main id="root"></main><script src="/bundle.js"></script></body></html>`);});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true});
const row={id:'request-a',sourceId:'r-a',sourceType:'CLIENT_REQUEST',domain:'LEGAL',kind:'ANSWER',title:'Kért adat',contextLabel:'Közzétett ügy',dueAt:null,urgency:'NORMAL',state:'OPEN',actionLabel:'Válasz megnyitása',href:'/portal/matters/matter-a/requests/r-a',canCompleteInPortal:true,matterPublicationId:'matter-a'};
try {
  const page=await browser.newPage();const errors=[];const writes=[];let denied=false;
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/**',async route=>{if(route.request().method()!=='GET')writes.push(route.request().method());await route.fulfill(denied?{status:403,json:{}}:{json:route.request().url().endsWith('/action-center')?{items:[row],counts:{open:1,overdue:0,dueSoon:0},informationItems:[{...row,id:'notice-a',title:'Közzétett tájékoztatás',canCompleteInPortal:false}]}:{items:[]}});});
  mkdirSync('test-results/portal-customer-truth',{recursive:true});
  for(const width of [390,768,1440]) {
    await page.setViewportSize({width,height:900});await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.getByText('összesen 1 nyitott teendő',{exact:true}).waitFor();
    assert.equal(await page.locator('[data-testid="portal-action-center-list"] [data-testid="portal-action-row"]').count(),1);
    assert.equal(await page.locator('[data-testid="portal-action-information"] [data-testid="portal-action-row"]').count(),1);
    assert.match(await page.locator('[data-testid="portal-action-information"]').innerText(),/Nem számítanak bele/);
    const link=page.getByRole('link',{name:'Válasz megnyitása'});await link.focus();assert.equal(await link.evaluate(el=>el===document.activeElement),true);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.screenshot({path:`test-results/portal-customer-truth/${width}.png`,fullPage:true});
    await page.evaluate(()=>window.showRequest('SUBMITTED','CORRECTION_REQUESTED'));
    await page.locator('[data-testid="portal-customer-truth"]').waitFor();
    assert.match(await page.locator('[data-testid="portal-customer-truth"]').innerText(),/Önre vár/);
    await page.evaluate(()=>window.showRequest('COMPLETED','ACCEPTED_INTO_MATTER'));
    await page.getByRole('heading',{name:'Elkészült',exact:true}).waitFor();
    assert.match(await page.locator('[data-testid="portal-customer-truth"]').innerText(),/nem jelent dokumentum-közzétételt/);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    console.log(`PASS ${width}: count/list parity, information, correction, completion, keyboard, overflow`);
  }
  denied=true;await page.evaluate(()=>window.showActions());await page.getByText('A teendők jelenleg nem tölthetők be. Próbálja újra.',{exact:true}).waitFor();
  assert.equal(await page.locator('[data-testid="portal-action-row"]').count(),0);assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
