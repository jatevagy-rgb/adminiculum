// Actual HomeAttention and canonical styles; synthetic read DTOs, no service writes.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import postcss from 'postcss';
import tailwind from 'tailwindcss';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const output = 'test-results/home-attention-disclosure';
mkdirSync(output, { recursive: true });
const bundle = await build({ stdin: { contents: `
import React from 'react';
import {createRoot} from 'react-dom/client';
import {HomeAttention} from './src/components/agenda/HomeAttention';
const root=createRoot(document.getElementById('root'));
let revision=0;
window.show=(count,mode='populated')=>{
 const ids=Array.from({length:count},(_,i)=>String(i+1));
 const caseRef={id:'case-1',caseNumber:'QA/001',clientName:'Tesztügyfél'};
 const agenda={days:[{items:ids.map(id=>({id,title:'Sürgős '+id,sourceType:'TASK',sourceId:id,dueAt:'2026-10-09',temporalType:'DATE_ONLY',status:'OPEN',source:{displayName:'QA/001'},capabilities:{canOpen:true},href:'/tasks?taskId=urgent-'+id}))}],pagination:{hasMore:mode==='partial'}};
 const props={now:new Date('2026-10-09T10:00:00Z'),loading:mode==='loading',agenda,overdue:mode==='partial'?null:{days:[],pagination:{hasMore:false}},
 reviews:ids.map(id=>({id,taskId:'task-'+id,submissionId:'submission-'+id,source:'TASK_SUBMISSION',title:'Döntés '+id,status:'SUBMITTED',priority:'MEDIUM',case:caseRef})),
 tasks:ids.slice(0,Math.ceil(count/2)).map(id=>({id,title:'Elakadás '+id,status:'BLOCKED',case:caseRef})),
 operational:{items:ids.slice(Math.ceil(count/2)).map(id=>({id,title:'Várakozás '+id,groupCode:'CLIENT_WAITING',waitingLabel:'Ügyfélre vár',client:{displayName:'Tesztügyfél'},nextAction:{href:'/cases/waiting-'+id}})),resume:{item:count?{title:'Folytatható munka',taskId:'resume',nextActionCode:'OPEN_TASK',actionLabel:'Folytatás',href:'/tasks?taskId=resume',case:{caseNumber:'QA/001',client:{displayName:'Tesztügyfél'}}}:null}}};
 window.input=props;window.before=JSON.stringify(props);
 root.render(<HomeAttention key={++revision} {...props}/>);
};window.show(0);
`, loader: 'tsx', resolveDir: process.cwd() }, bundle: true, write: false, platform: 'browser', jsx: 'automatic', define: { 'process.env': '{}' }, plugins: [{ name: 'local-navigation', setup(b) {
  b.onResolve({ filter: /^next\/link$/ }, () => ({ path: 'link', namespace: 'fixture' }));
  b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `import React from 'react';export default function Link({children,...props}){return <a {...props}>{children}</a>}`, loader: 'jsx', resolveDir: process.cwd() }));
} }] });
const css = (await postcss([tailwind({ content: ['src/components/agenda/HomeAttention.tsx', 'src/components/ui/**/*.tsx', 'src/components/adminiculum/ui.tsx'] })]).process(readFileSync('src/app/globals.css', 'utf8'), { from: 'src/app/globals.css' })).css;
const browser = await chromium.launch({ headless: true });
const report = [];
try {
  for (const width of [390, 768, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, timezoneId: 'America/Los_Angeles' });
    const errors = [], requests = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/*', route => { requests.push(route.request().url()); return route.abort(); });
    await page.setContent(`<html lang="hu"><head><style>${css}</style></head><body><main id="root" style="padding:16px;max-width:1280px;margin:auto"></main></body></html>`);
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    assert.deepEqual(errors, []);
    const section = id => page.locator(`section[aria-labelledby="home-${id}"]`);
    const visibleRows = id => section(id).locator('li:visible');
    const limit = width < 1024 ? 3 : 5;
    for (const count of [0, 1, 3, 4, 5, 7]) {
      await page.evaluate(n => window.show(n), count);
      await page.waitForFunction(n => document.querySelector('#home-urgent-items').children.length === n, count);
      assert.deepEqual(await page.locator('h2').allTextContents(), ['Sürgős', 'Döntések', 'Elakadások és várakozás', 'Munka folytatása']);
      for (const id of ['urgent', 'decisions', 'waiting']) {
        assert.equal(await visibleRows(id).count(), Math.min(count, limit), `${id} initial rows at ${width}/${count}`);
        const linksBefore = await section(id).locator('li a').evaluateAll(nodes => nodes.map(n => n.getAttribute('href')));
        if (count > limit) {
          const more = section(id).getByRole('button', { name: `További ${count - limit} tétel`, exact: true });
          assert.equal(await more.getAttribute('aria-expanded'), 'false');
          assert.equal(await more.getAttribute('aria-controls'), `home-${id}-items`);
          await more.focus(); await page.keyboard.press('Enter');
          assert.equal(await visibleRows(id).count(), count, 'all loaded rows disclosed');
          assert.deepEqual(await section(id).locator('li a').evaluateAll(nodes => nodes.map(n => n.getAttribute('href'))), linksBefore, 'source order and canonical links unchanged');
          for (const other of ['urgent', 'decisions', 'waiting'].filter(other => other !== id)) assert.equal(await visibleRows(other).count(), Math.min(count, limit), 'expansion is section-local');
          const less = section(id).getByRole('button', { name: 'Kevesebb mutatása', exact: true });
          assert.equal(await less.getAttribute('aria-expanded'), 'true');
          await less.click();
          assert.equal(await visibleRows(id).count(), limit);
        } else assert.equal(await section(id).getByRole('button').count(), 0, 'no unnecessary disclosure');
      }
      assert.equal(await visibleRows('resume').count(), count ? 1 : 0);
      if (count) assert.equal(await section('decisions').locator('li a').first().getAttribute('href'), '/tasks?taskId=task-1&submissionId=submission-1&view=review');
      assert.equal(await page.evaluate(() => JSON.stringify(window.input) === window.before), true, 'no input mutation');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      report.push({ width, count, status: 'PASS' });
    }
    await page.screenshot({ path: `${output}/${width}-collapsed.png`, fullPage: true });
    await page.evaluate(() => window.show(7, 'partial'));
    await section('urgent').getByRole('status').waitFor();
    assert.equal(await visibleRows('urgent').count(), limit, 'available rows survive partial failure');
    await section('urgent').getByRole('button', { name: `További ${7-limit} tétel`, exact: true }).click();
    assert.equal(await visibleRows('urgent').count(), 7);
    assert.equal(await section('urgent').getByText(/Részleges előnézet/).count(), 1, 'unknown server remainder is not counted as loaded');
    await page.screenshot({ path: `${output}/${width}-expanded-partial.png`, fullPage: true });
    await page.evaluate(() => window.show(7, 'loading'));
    await page.waitForFunction(() => document.querySelectorAll('li').length === 0);
    assert.equal(await page.locator('li:visible').count(), 0);
    assert.equal(await page.getByRole('button').count(), 0);
    assert.deepEqual(errors, []); assert.deepEqual(requests, [], 'disclosure makes no network requests');
    await page.close();
  }
} finally { await browser.close(); }
writeFileSync(`${output}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ status: 'PASS', report }, null, 2));
