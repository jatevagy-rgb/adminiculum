// Real components with synthetic local read transport; no hosted system or credentials.
import { build } from 'esbuild';
import { chromium } from 'playwright';
import postcss from 'postcss';
import tailwind from 'tailwindcss';
import http from 'node:http';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';

const bundle=await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {OperationalMeasurementPanel} from './src/components/clients/OperationalMeasurementPanel';const root=createRoot(document.getElementById('root'));window.showClient=id=>root.render(<OperationalMeasurementPanel clientId={id}/>);window.showClient('a');`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',define:{'process.env':'{}'},plugins:[{name:'api-fixture',setup(b){b.onResolve({filter:/^(?:@\/lib\/api|\.\/api)$/},()=>({path:'api',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`export async function fetchApi(url,options={}){const r=await fetch('/api'+url,options);if(!r.ok)throw new Error('unavailable');return r.json()}`,loader:'js'}));}}]});
const css=await postcss([tailwind({content:['./src/components/clients/OperationalMeasurementPanel.tsx','./src/components/ui/**/*.tsx'],corePlugins:{preflight:true}})]).process('@tailwind base;@tailwind components;@tailwind utilities;',{from:undefined});
const tokens=readFileSync('src/app/globals.css','utf8').match(/:root\s*\{[\s\S]*?\}/g)?.join('\n')||'';
const server=http.createServer((req,res)=>{res.setHeader('content-type',req.url==='/bundle.js'?'text/javascript':'text/html; charset=utf-8');res.end(req.url==='/bundle.js'?bundle.outputFiles[0].text:`<html lang="hu"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${tokens}\n${css.css}</style></head><body><main id="root"></main><script src="/bundle.js"></script></body></html>`);});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const browser=await chromium.launch({headless:true});
const metric={metricKey:'CASE_CYCLE',definitionVersion:'1',scope:{clientId:'a',visibility:'AUTHORIZED_CASES'},period:{from:'2026-10-01',to:'2026-10-09',timeZone:'Europe/Budapest'},value:null,unit:'ELAPSED_MINUTES',numerator:null,denominator:null,sampleCount:0,missingCount:0,basis:'NO_RECORDED_SAMPLE',freshness:{calculatedAt:'2026-10-09T12:00:00Z',mode:'READ_SNAPSHOT'},sourceRefs:[],limitations:['Az eltelt idő nem munkaidő.']};
try {
  const page=await browser.newPage();const errors=[];const writes=[];let denied=false;let delay=false;let release;const gate=new Promise(r=>release=r);
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/**',async route=>{if(route.request().method()!=='GET')writes.push(route.request().method());const isA=route.request().url().includes('/clients/a/');if(delay&&isA)await gate;await route.fulfill(denied?{status:403,json:{}}:{json:{items:[{...metric,metricKey:isA?'CASE_CYCLE':'REVIEW_QUEUE_AGE'}],unavailable:[{metricKey:'EMAIL_TRIAGE_LABOUR',code:'METRIC_NEEDS_EVENT_TELEMETRY',reason:'Önkéntes alapfelmérés szükséges.'}]}});});
  mkdirSync('test-results/operational-measurement',{recursive:true});
  for(const width of [390,768,1440]) {
    await page.setViewportSize({width,height:900});await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.getByText('Nincs rögzített minta',{exact:true}).waitFor();
    const disclosure=page.locator('summary').filter({hasText:'Definíció és források'});await disclosure.focus();await page.keyboard.press('Enter');
    await page.getByText('Számláló: Ismeretlen · Nevező: Ismeretlen',{exact:true}).waitFor();
    await page.getByText('Önkéntes folyamat-alapfelmérés',{exact:true}).click();await page.getByRole('button',{name:'Sor hozzáadása'}).click();await page.getByRole('alert').waitFor();
    await page.getByLabel('Aktív munka perc',{exact:true}).fill('0');await page.getByRole('button',{name:'Sor hozzáadása'}).click();
    await page.getByText('Email triázs: 0 aktív perc · Mért',{exact:true}).waitFor();
    await page.getByLabel('Folyamat',{exact:true}).selectOption('Ügyfélre várakozás');await page.getByLabel('Mérési alap',{exact:true}).selectOption('ESTIMATED');await page.getByLabel('Eltelt perc',{exact:true}).fill('60');await page.getByRole('button',{name:'Sor hozzáadása'}).click();await page.getByText('Ügyfélre várakozás: 60 eltelt perc · Becsült',{exact:true}).waitFor();
    await page.getByText('Manuális indulási munkalap · 1.0',{exact:true}).click();assert.equal(await page.getByRole('checkbox').count(),12);await page.getByRole('checkbox').first().check();
    const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Munkalap exportálása'}).click();const download=await downloadPromise;const stream=await download.createReadStream();let raw='';for await(const part of stream)raw+=part;const exported=JSON.parse(raw);assert.equal(exported.persisted,false);assert.equal(exported.complianceDecision,null);assert.equal(exported.baseline.length,2);assert.deepEqual(exported.reviewedStepIndexes,[0]);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:`test-results/operational-measurement/${width}.png`,fullPage:true});console.log(`PASS ${width}: null, zero, estimated waiting, keyboard, manual manifest/export, no overflow`);
  }
  delay=true;await page.getByRole('button',{name:'Mutatók lekérdezése'}).click();await page.evaluate(()=>window.showClient('b'));await page.getByRole('heading',{name:'Nyitott ellenőrzés kora',exact:true}).waitFor();release();await page.waitForTimeout(100);assert.equal(await page.getByRole('heading',{name:'Ügy átfutási ideje',exact:true}).count(),0);
  denied=true;await page.getByRole('button',{name:'Mutatók lekérdezése'}).click();await page.getByRole('alert').waitFor();assert.equal(await page.locator('article').count(),0);assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);console.log('PASS late-scope response and denied-refresh clearing; zero writes');
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
