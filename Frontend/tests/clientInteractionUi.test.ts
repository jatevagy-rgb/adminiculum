import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  makeUploadItem,
  uploadReducer,
  uploadSummary,
  uploadStateMessage,
  humanFileSize,
  PAGE_SIDE_LABELS,
  ACCEPTED_UPLOAD_MIME,
  type UploadItem,
} from '../src/lib/customerUpload';
import { isFileAcceptable } from '../src/lib/clientInteractionApi';

const root = process.cwd();
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8');

describe('customerUpload state module', () => {
  const seed = (): UploadItem[] => [
    makeUploadItem({ fileName: 'a.pdf', sizeBytes: 2048, mimeType: 'application/pdf' }),
    makeUploadItem({ fileName: 'b.jpg', sizeBytes: 4096, mimeType: 'image/jpeg' }),
  ];

  it('adds, removes and relabels items immutably', () => {
    let state: UploadItem[] = [];
    const items = seed();
    state = uploadReducer(state, { type: 'add', items });
    assert.equal(state.length, 2);
    assert.equal(state[1].isImage, true); // jpeg
    assert.equal(state[0].isImage, false); // pdf
    const labelled = uploadReducer(state, { type: 'relabel', id: items[1].id, label: 'Hátlap' });
    assert.equal(labelled[1].label, 'Hátlap');
    assert.equal(state[1].label, ''); // original untouched (immutability)
    const removed = uploadReducer(labelled, { type: 'remove', id: items[0].id });
    assert.equal(removed.length, 1);
    assert.equal(removed[0].id, items[1].id);
    assert.equal(uploadReducer(removed, { type: 'reset' }).length, 0);
  });

  it('tracks per-file status and summary', () => {
    const items = seed();
    let state = uploadReducer([], { type: 'add', items });
    state = uploadReducer(state, { type: 'status', id: items[0].id, status: 'done', serverState: 'PROCESSING' });
    state = uploadReducer(state, { type: 'status', id: items[1].id, status: 'error' });
    const s = uploadSummary(state);
    assert.deepEqual({ total: s.total, done: s.done, failed: s.failed }, { total: 2, done: 1, failed: 1 });
  });

  it('never leaks scanner/provider codes in customer-facing wording', () => {
    // A file that uploaded but is still scanning shows a safe processing message.
    assert.match(uploadStateMessage({ status: 'done', serverState: 'PROCESSING' }), /biztonsági ellenőrzés/);
    assert.equal(uploadStateMessage({ status: 'uploading' }), 'Feltöltés folyamatban…');
    assert.match(uploadStateMessage({ status: 'error' }), /nem sikerült/);
    for (const state of ['SCAN_FAILED', 'SCANNER_NOT_CONFIGURED', 'PROCESSING', 'RECEIVED']) {
      const msg = uploadStateMessage({ status: 'done', serverState: state });
      assert.doesNotMatch(msg, /SCAN|SCANNER|QUARANTINE|provider|storage/i);
    }
  });

  it('formats human file sizes and exposes upload constraints', () => {
    assert.equal(humanFileSize(0), '—');
    assert.equal(humanFileSize(512), '512 B');
    assert.equal(humanFileSize(2048), '2 KB');
    assert.match(humanFileSize(3 * 1024 * 1024), /MB$/);
    assert.ok(PAGE_SIDE_LABELS.includes('Előlap'));
    assert.ok(PAGE_SIDE_LABELS.includes('Hátlap'));
    assert.deepEqual(ACCEPTED_UPLOAD_MIME, ['application/pdf', 'image/jpeg', 'image/png']);
  });
});

describe('client interaction API layer', () => {
  const api = () => read('src/lib/clientInteractionApi.ts');
  it('separates customer and workforce auth contexts and exposes thread reading', () => {
    const src = api();
    assert.match(src, /customerInteractionApi/);
    assert.match(src, /workforceInteractionApi/);
    assert.match(src, /getThread:/); // customer can read a single thread (sent answers)
    assert.match(src, /authContext: "customer"/);
    assert.match(src, /authContext: "workforce"/);
    // workforce retry present for notification failure queue
    assert.match(src, /retryNotification/);
  });

  it('exposes the internal question/submission/notification action surface', () => {
    const src = api();
    for (const method of ['getQuestion', 'draftAnswer', 'sendAnswer', 'closeQuestion', 'getSubmission', 'acceptFile', 'requestCorrection', 'rejectSubmission']) {
      assert.match(src, new RegExp(`${method}:`), `workforce API missing ${method}`);
    }
  });

  it('gates matter acceptance on a CLEAN scan status only', () => {
    assert.equal(isFileAcceptable('CLEAN'), true);
    for (const s of ['UPLOADING', 'RECEIVED', 'SCANNING', 'INFECTED', 'SCAN_FAILED', 'UNSUPPORTED']) {
      assert.equal(isFileAcceptable(s), false, `${s} must not be acceptable`);
    }
  });
});

describe('internal interaction actions (source contract)', () => {
  const comp = () => read('src/components/client-portal/ClientInteractionInternalActions.tsx');

  it('answers keep drafts hidden until an explicit send', () => {
    const src = comp();
    assert.match(src, /draftAnswer/);
    assert.match(src, /sendAnswer/);
    assert.match(src, /visibility === "DRAFT"/);
    assert.match(src, /az ügyfél nem látja/);
    assert.match(src, /Válasz elküldése/);
  });

  it('disables matter acceptance until CLEAN and shows the safe internal warning', () => {
    const src = comp();
    assert.match(src, /isFileAcceptable\(f\.status\)/);
    assert.match(src, /data-testid="accept-file-btn"/);
    assert.match(src, /disabled=\{busy \|\| !acceptable\}/);
    assert.match(src, /nem emelhető az ügy iratai közé/);
  });

  it('offers correction, rejection and notification retry', () => {
    const src = comp();
    assert.match(src, /requestCorrection/);
    assert.match(src, /rejectSubmission/);
    assert.match(src, /data-testid="retry-notification-btn"/);
  });
});

describe('customer portal interaction UI (source contract)', () => {
  const shell = () => read('src/components/client-portal/ClientPortalShell.tsx');

  it('renders single- and multiple-choice fields instead of a free-text box', () => {
    const src = shell();
    assert.match(src, /field\.type === 'SINGLE_CHOICE'/);
    assert.match(src, /field\.type === 'MULTIPLE_CHOICE'/);
    assert.match(src, /fieldOptions\(field\.options\)/);
  });

  it('lets the customer open a thread and read explicitly sent internal answers', () => {
    const src = shell();
    assert.match(src, /QuestionThreadRow/);
    assert.match(src, /customerInteractionApi\.getThread/);
    assert.match(src, /authorType === 'INTERNAL'/);
    assert.match(src, /Ügyvédi iroda/);
  });

  it('provides a real mobile upload experience (preview/label/progress/retry)', () => {
    const src = shell();
    assert.match(src, /capture="environment"/);
    assert.match(src, /data-testid="upload-item"/);
    assert.match(src, /URL\.createObjectURL/); // previews
    assert.match(src, /Eltávolítás/); // removal before submit
    assert.match(src, /PAGE_SIDE_LABELS/); // front/back page labels
    assert.match(src, /Sikertelen fájlok újraküldése/); // retry of failed files
    assert.match(src, /Feltöltve: \{summary\.done\}\/\{summary\.total\}/); // progress
  });

  it('contains no customer-facing approval controls or raw scanner codes', () => {
    const src = shell();
    assert.doesNotMatch(src, /APPROVAL_REQUEST|CONFIRMATION_REQUEST/);
    assert.doesNotMatch(src, /SCANNER_NOT_CONFIGURED|SCAN_FAILED|QUARANTINE_NOT_CONFIGURED/);
    // customer-facing wait wording, not raw enums
    assert.match(src, /Mire várunk\?/);
  });
});
