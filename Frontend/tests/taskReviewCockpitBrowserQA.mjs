// Real cockpit/components/API wrappers, controlled transport fixtures, Chromium.
// This verifies UI behavior, not production authentication or database authorization.
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwind from 'tailwindcss';
import { chromium } from 'playwright';

const destination = path.resolve('test-results/task-review-cockpit');
mkdirSync(destination, { recursive: true });
const bundle = await build({ stdin: { contents: `
import React from 'react';
import {createRoot} from 'react-dom/client';
import {TaskReviewWorkspace} from './src/components/tasks/TaskReviewWorkspace';
import {reviewFixture,workflowFixture} from './tests/fixtures/taskReviewCockpit.fixture';
const root=createRoot(document.getElementById('root'));
window.reset=(mode='reviewer')=>{
 window.mode=mode;window.review=reviewFixture();window.workflow=workflowFixture();window.calls=[];window.cockpitClosed=0;
 if(mode==='readonly'||mode==='self') {window.review.permittedActions.approve=false;window.review.permittedActions.return=false;}
 if(mode==='self') window.review.submission.assignedReviewer=window.review.submission.submittedBy;
 root.render(<TaskReviewWorkspace key={mode+Date.now()} item={{taskId:'task-1',submissionId:'submission-1'}} onClose={()=>window.cockpitClosed++} onQueueChanged={()=>undefined}/>);
};window.reset();
`, resolveDir: process.cwd(), sourcefile: 'cockpit-qa.tsx', loader: 'tsx' }, bundle: true, write: false, platform: 'browser', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"test"' }, plugins: [{ name: 'fixture-transport', setup(b) {
  b.onResolve({ filter: /^next\/link$/ }, () => ({ path: 'next-link', namespace: 'qa' }));
  b.onResolve({ filter: /^(\.\/api|@\/lib\/api)$/ }, () => ({ path: 'api', namespace: 'qa' }));
  b.onLoad({ filter: /.*/, namespace: 'qa' }, ({ path: name }) => ({ loader: 'jsx', resolveDir: process.cwd(), contents: name === 'next-link' ? `import React from 'react';export default function Link({children,href,...props}){return <a href={href} {...props}>{children}</a>;}` : `
export class ApiError extends Error {constructor(status,message,url,code){super(message);this.status=status;this.code=code;}}
export async function fetchApi(url,options={}) {
 window.calls.push({url,...options});
 if(url.endsWith('/workflow')) {if(window.mode==='context-error') throw new ApiError(403,'Forbidden',url);return window.workflow;}
 if(url.endsWith('/review')) {if(window.mode==='forbidden') throw new ApiError(403,'Forbidden',url);return structuredClone(window.review);}
 if(window.mode==='stale') {window.review.reviewVersion='review-etag-2';throw new ApiError(412,'Stale',url,'REVIEW_VERSION_STALE');}
 if(url.endsWith('/approve')) {window.review.submission.status='APPROVED';window.review.permittedActions.approve=false;window.review.permittedActions.return=false;return {idempotentReplay:false,review:structuredClone(window.review)};}
 if(url.endsWith('/return')) return {idempotentReplay:false,review:structuredClone(window.review)};
 throw new Error('Unexpected fixture request '+url);
}` }));
} }] });
const css = (await postcss([tailwind({ content: ['src/components/tasks/TaskReview*.tsx', 'src/components/tasks/WorkflowDialog.tsx', 'src/components/ui/{ViewportDialog,QuietLink}.tsx', 'src/components/adminiculum/{ui,OperationalPrimitives}.tsx'] })]).process(readFileSync('src/app/globals.css', 'utf8'), { from: 'src/app/globals.css' })).css;
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const width of [390, 768, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    const errors=[];page.on('pageerror', e=>errors.push(e.message));
    await page.setContent(`<html lang="hu"><head><style>${css}</style></head><body style="background:white"><main id="root" style="max-width:1280px;margin:auto;padding:16px"></main></body></html>`);
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    await page.getByTestId('review-cockpit').waitFor();
    assert.equal(await page.locator('[data-time-state]').getAttribute('data-time-state'), 'MISSING');
    assert.deepEqual(await page.locator('[data-review-section]').evaluateAll(nodes=>nodes.map(n=>n.dataset.reviewSection)), ['ReviewIdentity','DecisionSummary','SubmittedOutputs','VersionComparisonContext','OpenReviewPoints','WorkInstructionAndRisks','TimeSummary','DecisionActions','ContextDrawer']);
    assert.match(await page.getByRole('link',{name:'Beküldött pontos verzió megnyitása'}).getAttribute('href'), /documentId=document-1&versionId=version-2$/);
    await page.getByLabel('Kiválasztott eredmény').selectOption('output-legacy');
    assert.equal(await page.getByRole('link',{name:'Beküldött pontos verzió megnyitása'}).count(),0);
    assert.equal(await page.getByText('A leadott verzió nincs rögzítve.', {exact:true}).count(),1);
    await page.getByLabel('Kiválasztott eredmény').selectOption('output-1');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'horizontal overflow');
    if(width<1280) {
      const body=await page.getByRole('region',{name:'Leadás döntési adatai'}).boundingBox();
      const footer=await page.locator('[data-review-section="DecisionActions"]').boundingBox();
      assert.ok(body.y+body.height<=footer.y,'decision footer must not cover the scrollable source content');
    }
    await page.screenshot({path:path.join(destination,`cockpit-${width}.png`),fullPage:true});
    const returnButton=page.getByRole('button',{name:'Visszaküldés',exact:true});
    await returnButton.click();
    const dialog=page.getByRole('dialog');await dialog.waitFor();
    await page.keyboard.press('Escape');
    await dialog.waitFor({state:'hidden'});
    assert.equal(await returnButton.evaluate(node=>node===document.activeElement),true,'modal restores opener focus');
    await returnButton.click();await dialog.waitFor();
    assert.equal(await dialog.getByRole('button',{name:'Visszaküldés',exact:true}).isDisabled(),true);
    await dialog.getByLabel('Review megjegyzés').fill('Kérem a felmondási feltétel javítását.');
    await dialog.getByLabel('Kért javítások').fill('Pontosítsa a határidőt.');
    await dialog.getByLabel('Javítási határidő (opcionális)').fill('2026-10-12');
    for(let tab=0;tab<12;tab++) {
      await page.keyboard.press('Tab');
      assert.equal(await dialog.evaluate(node=>node.contains(document.activeElement)),true,'modal focus containment');
    }
    await dialog.getByRole('button',{name:'Visszaküldés',exact:true}).click();
    await page.waitForFunction(()=>window.calls.some(c=>c.url.endsWith('/return')));
    const mutation=await page.evaluate(()=>window.calls.find(c=>c.url.endsWith('/return')));
    assert.equal(mutation.headers['If-Match'],'"review-etag-1"');assert.ok(mutation.headers['Idempotency-Key']);
    assert.deepEqual(JSON.parse(mutation.body),{note:'Kérem a felmondási feltétel javítását.',requestedCorrections:'Pontosítsa a határidőt.',requiresFullReview:true,correctionDeadline:'2026-10-12'});
    await page.evaluate(()=>window.reset('readonly'));await page.getByText('Csak megtekintés.',{exact:false}).waitFor();
    assert.equal(await page.getByRole('button',{name:'Jóváhagyás',exact:true}).count(),0);
    await page.evaluate(()=>window.reset('self'));await page.getByText('Csak megtekintés.',{exact:false}).waitFor();
    assert.equal(await page.getByRole('button',{name:'Visszaküldés',exact:true}).count(),0);
    await page.evaluate(()=>window.reset('context-error'));await page.getByText('A munkautasítás jelenleg nem érhető el.').waitFor();
    await page.evaluate(()=>window.reset('stale'));await page.getByRole('button',{name:'Jóváhagyás',exact:true}).click();
    await page.getByRole('dialog').getByLabel('Jóváhagyási megjegyzés (opcionális)').fill('Megőrzendő döntési megjegyzés');
    await page.getByRole('dialog').getByRole('button',{name:'Jóváhagyás',exact:true}).click();
    await page.getByText('A Review időközben megváltozott.',{exact:false}).waitFor();
    assert.equal(await page.evaluate(()=>window.calls.filter(c=>c.method==='POST').length),1,'stale state must not auto-retry');
    assert.equal(await page.getByRole('dialog').getByLabel('Jóváhagyási megjegyzés (opcionális)').inputValue(),'Megőrzendő döntési megjegyzés');
    await page.getByRole('dialog').getByRole('button',{name:'Mégse',exact:true}).click();
    await page.evaluate(()=>window.reset('reviewer'));await page.getByRole('button',{name:'Jóváhagyás',exact:true}).click();
    await page.getByRole('dialog').getByRole('button',{name:'Jóváhagyás',exact:true}).click();
    const publication=page.getByRole('link',{name:'Ügyfélnek közzététel előkészítése'});await publication.waitFor();
    assert.match(await publication.getAttribute('href'),/documentId=document-1&versionId=version-2&mode=review/);
    assert.equal(await page.evaluate(()=>window.calls.filter(c=>c.method==='POST').length),1,'approval does not publish');
    assert.equal(await page.evaluate(()=>window.cockpitClosed),0,'approval retains its exact context');
    await page.evaluate(()=>window.reset('forbidden'));await page.getByRole('alert').waitFor();
    assert.equal(await page.getByTestId('review-cockpit').count(),0,'forbidden review must not show stale or empty review content');
    assert.deepEqual(errors,[]);
    results.push({width,status:'PASS',assertions:'exact identity, missing time, DOM order, output selection, return fields/headers, read-only, self-review projection, unavailable context, stale ETag, explicit publication, overflow, modal focus'});
    await page.close();
  }
} finally { await browser.close(); }
writeFileSync(path.join(destination,'results.json'),JSON.stringify(results,null,2));
console.log(JSON.stringify(results,null,2));
