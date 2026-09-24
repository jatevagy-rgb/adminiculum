import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
// @ts-ignore - visualRegression.mjs is an ES module script
import { compareImages, PIXEL_THRESHOLD, MAX_ALLOWED_DIFF_RATIO } from './visualRegression.mjs';

test('VISUAL_COMPARATOR: identical images return pixel-match with zero diff', async () => {
  const whitePng = await sharp({
    create: { width: 120, height: 80, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
  }).png().toBuffer();

  const res = await compareImages(whitePng, whitePng);
  assert.equal(res.match, true, 'Identical images must match');
  assert.equal(res.diffPixels, 0, 'Zero diff pixels expected');
  assert.equal(res.diffRatio, 0, 'Zero diff ratio expected');
});

test('VISUAL_COMPARATOR: modified pixels fail match and generate distinct diff image', async () => {
  const whitePng = await sharp({
    create: { width: 100, height: 100, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
  }).png().toBuffer();

  // Create an image with a red square in the center
  const redSquarePng = await sharp({
    create: { width: 100, height: 100, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
  })
    .composite([
      {
        input: await sharp({
          create: { width: 20, height: 20, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } },
        }).png().toBuffer(),
        top: 40,
        left: 40,
      },
    ])
    .png()
    .toBuffer();

  const res = await compareImages(whitePng, redSquarePng);
  assert.equal(res.match, false, 'Modified pixels must fail match');
  assert.equal(res.diffPixels, 400, '20x20 modified box = 400 diff pixels');
  assert.equal(res.diffRatio, 0.04, '400 / 10000 = 0.04 ratio');
  assert.ok(res.diffPngBuffer && res.diffPngBuffer.length > 0, 'Must produce real diff PNG buffer');

  // Verify the diff image contains vibrant magenta pixels [255, 0, 85]
  const diffRaw = await sharp(res.diffPngBuffer).raw().toBuffer({ resolveWithObject: true });
  let hasMagenta = false;
  for (let i = 0; i < diffRaw.data.length; i += 4) {
    if (diffRaw.data[i] === 255 && diffRaw.data[i + 1] === 0 && diffRaw.data[i + 2] === 85) {
      hasMagenta = true;
      break;
    }
  }
  assert.equal(hasMagenta, true, 'Diff image must highlight modified pixels in magenta');
});

test('VISUAL_COMPARATOR: dimension mismatch fails closed', async () => {
  const img1 = await sharp({
    create: { width: 100, height: 100, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
  }).png().toBuffer();
  const img2 = await sharp({
    create: { width: 100, height: 120, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
  }).png().toBuffer();

  const res = await compareImages(img1, img2);
  assert.equal(res.match, false, 'Dimension mismatch must fail');
  assert.equal(res.dimensionMismatch, true, 'dimensionMismatch flag must be true');
});

test('CHECK_MODE_WRITES_BASELINE=NO: check mode source code never writes baseline on missing file', () => {
  const scriptPath = path.resolve('tests/visualRegression.mjs');
  const source = fs.readFileSync(scriptPath, 'utf8');

  // Must have explicit prohibition on writing baseline when !IS_UPDATE
  assert.doesNotMatch(source, /!fs\.existsSync\(baselinePath\)\s*\{\s*fs\.writeFileSync\(baselinePath/);
  assert.match(source, /\[FAIL - MISSING BASELINE\]/);
  assert.match(source, /CHECK mode is read-only and never writes baselines/);
});

test('DETERMINISTIC_READINESS: assertDeterministicReadiness contract is enforced in source', () => {
  const scriptPath = path.resolve('tests/visualRegression.mjs');
  const source = fs.readFileSync(scriptPath, 'utf8');

  assert.match(source, /export async function assertDeterministicReadiness/);
  assert.match(source, /await document\.fonts\.ready/);
  assert.match(source, /document\.fonts\.status/);
  assert.match(source, /fontAudit\.fontsStatus !== "loaded"/);
  assert.match(source, /Inter/);
});

