/**
 * R0 — Production malware scanner adapter tests.
 *
 * Proves the provider-neutral HTTP scanner is fail-closed on every abnormal
 * path, that only an explicit CLEAN verdict allows continuation, that no
 * secret/URL/provider body reaches logs, and that user-facing rejections carry
 * only safe bounded copy (never internal scan codes).
 */

import {
  HttpMalwareScanner,
  httpScannerFromEnv,
} from '../src/modules/upload-security/httpMalwareScanner';
import {
  getWorkforceScanner,
  setWorkforceScanner,
  workforceScannerReadiness,
  shouldRejectWorkforceScan,
  type WorkforceScanInput,
} from '../src/modules/upload-security/scannerAdapter';
import {
  mapWorkforceUploadRejection,
  type WorkforceUploadResult,
} from '../src/modules/upload-security/uploadValidationCore';

const SCAN_INPUT: WorkforceScanInput = {
  buffer: Buffer.from('%PDF-1.4 clean content'),
  detectedMimeType: 'application/pdf',
  sizeBytes: 22,
  fileName: 'doc.pdf',
};

const URL = 'https://scanner.internal/secret-endpoint';
const KEY = 'SUPER_SECRET_API_KEY';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
}

const realFetch = global.fetch;
afterEach(() => {
  global.fetch = realFetch;
  jest.restoreAllMocks();
  setWorkforceScanner(null);
});

describe('HttpMalwareScanner — verdicts', () => {
  it('CLEAN: explicit clean → CLEAN, and receives the EXACT validated buffer', async () => {
    let sentBody: Uint8Array | null = null;
    global.fetch = jest.fn(async (_url: any, opts: any) => {
      sentBody = opts.body as Uint8Array;
      return jsonResponse({ result: 'clean' });
    }) as any;
    const scanner = new HttpMalwareScanner({ url: URL });
    const r = await scanner.scan(SCAN_INPUT);
    expect(r.outcome).toBe('CLEAN');
    expect(shouldRejectWorkforceScan(r)).toBe(false);
    expect(Buffer.from(sentBody!)).toEqual(SCAN_INPUT.buffer);
  });

  it('INFECTED → INFECTED (reject)', async () => {
    global.fetch = jest.fn(async () => jsonResponse({ result: 'infected' })) as any;
    const r = await new HttpMalwareScanner({ url: URL }).scan(SCAN_INPUT);
    expect(r.outcome).toBe('INFECTED');
    expect(shouldRejectWorkforceScan(r)).toBe(true);
  });

  it('UNSUPPORTED → UNSUPPORTED (reject)', async () => {
    global.fetch = jest.fn(async () => jsonResponse({ result: 'unsupported' })) as any;
    const r = await new HttpMalwareScanner({ url: URL }).scan(SCAN_INPUT);
    expect(r.outcome).toBe('UNSUPPORTED');
    expect(shouldRejectWorkforceScan(r)).toBe(true);
  });

  it('provider "error" → SCAN_FAILED (fail closed)', async () => {
    global.fetch = jest.fn(async () => jsonResponse({ result: 'error' })) as any;
    const r = await new HttpMalwareScanner({ url: URL }).scan(SCAN_INPUT);
    expect(r.outcome).toBe('SCAN_FAILED');
  });
});

describe('HttpMalwareScanner — fail-closed on abnormal paths', () => {
  it('TIMEOUT → SCAN_FAILED', async () => {
    global.fetch = jest.fn((_url: any, opts: any) =>
      new Promise((_resolve, reject) => {
        opts.signal.addEventListener('abort', () => {
          const e = new Error('aborted');
          (e as any).name = 'AbortError';
          reject(e);
        });
      }),
    ) as any;
    const r = await new HttpMalwareScanner({ url: URL, timeoutMs: 20 }).scan(SCAN_INPUT);
    expect(r.outcome).toBe('SCAN_FAILED');
    expect(r.codeSafe).toBe('HTTP_SCAN_TIMEOUT');
  });

  it('NETWORK_FAILURE → SCAN_FAILED', async () => {
    global.fetch = jest.fn(async () => {
      throw new Error('ECONNREFUSED');
    }) as any;
    const r = await new HttpMalwareScanner({ url: URL }).scan(SCAN_INPUT);
    expect(r.outcome).toBe('SCAN_FAILED');
    expect(r.codeSafe).toBe('HTTP_SCAN_NETWORK_ERROR');
  });

  it('BAD_STATUS (non-2xx) → SCAN_FAILED', async () => {
    global.fetch = jest.fn(async () => jsonResponse('', 500)) as any;
    const r = await new HttpMalwareScanner({ url: URL }).scan(SCAN_INPUT);
    expect(r.outcome).toBe('SCAN_FAILED');
    expect(r.codeSafe).toBe('HTTP_SCAN_BAD_STATUS');
  });

  it('MALFORMED_PROVIDER_RESPONSE (non-JSON) → SCAN_FAILED', async () => {
    global.fetch = jest.fn(async () => jsonResponse('not-json-at-all')) as any;
    const r = await new HttpMalwareScanner({ url: URL }).scan(SCAN_INPUT);
    expect(r.outcome).toBe('SCAN_FAILED');
    expect(r.codeSafe).toBe('HTTP_SCAN_BAD_RESPONSE');
  });

  it('unknown result value → SCAN_FAILED', async () => {
    global.fetch = jest.fn(async () => jsonResponse({ result: 'maybe' })) as any;
    const r = await new HttpMalwareScanner({ url: URL }).scan(SCAN_INPUT);
    expect(r.outcome).toBe('SCAN_FAILED');
    expect(r.codeSafe).toBe('HTTP_SCAN_BAD_RESPONSE');
  });

  it('OVERSIZE provider response → SCAN_FAILED', async () => {
    const huge = JSON.stringify({ result: 'clean', pad: 'x'.repeat(8192) });
    global.fetch = jest.fn(async () => jsonResponse(huge)) as any;
    const r = await new HttpMalwareScanner({ url: URL }).scan(SCAN_INPUT);
    expect(r.outcome).toBe('SCAN_FAILED');
    expect(r.codeSafe).toBe('HTTP_SCAN_BAD_RESPONSE');
  });
});

describe('secrets & provider detail never reach logs', () => {
  it('SECRET_NOT_LOGGED: fail-closed logs carry no api key, url, or provider body', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    global.fetch = jest.fn(async () => {
      throw new Error(`connect to ${URL} failed with ${KEY}`);
    }) as any;
    await new HttpMalwareScanner({ url: URL, apiKey: KEY }).scan(SCAN_INPUT);
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).not.toContain(KEY);
    expect(logged).not.toContain(URL);
    expect(logged).not.toContain('secret-endpoint');
    // Only stable metadata is logged.
    expect(logged).toContain('HTTP_SCAN_NETWORK_ERROR');
  });
});

describe('env selection & readiness (fail-closed default)', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
    setWorkforceScanner(null);
  });

  it('httpScannerFromEnv builds HTTP only when provider+url configured', () => {
    expect(httpScannerFromEnv({} as any)).toBeNull();
    expect(httpScannerFromEnv({ WORKFORCE_MALWARE_SCANNER: 'http' } as any)).toBeNull();
    const s = httpScannerFromEnv({ WORKFORCE_MALWARE_SCANNER: 'http', WORKFORCE_MALWARE_SCANNER_URL: URL } as any);
    expect(s?.provider).toBe('HTTP');
  });

  it('getWorkforceScanner uses HTTP when configured, else fail-closed NONE', () => {
    setWorkforceScanner(null);
    process.env.WORKFORCE_MALWARE_SCANNER = 'http';
    process.env.WORKFORCE_MALWARE_SCANNER_URL = URL;
    expect(getWorkforceScanner(process.env).provider).toBe('HTTP');

    setWorkforceScanner(null);
    delete process.env.WORKFORCE_MALWARE_SCANNER;
    delete process.env.WORKFORCE_MALWARE_SCANNER_URL;
    expect(getWorkforceScanner(process.env).provider).toBe('NONE');
    expect(workforceScannerReadiness(process.env)).toEqual({ configured: false, provider: 'NONE' });
  });
});

describe('mapWorkforceUploadRejection — safe user copy (RAW_PROVIDER_ERROR_NOT_LEAKED)', () => {
  const base: WorkforceUploadResult = { ok: false, detectedMimeType: 'application/pdf', sizeBytes: 10, codeSafe: '' };
  const FORBIDDEN = ['SCAN_SCAN_FAILED', 'SCANNER_NOT_CONFIGURED', 'HTTP_SCAN', 'SCAN_FAILED', 'provider', 'codeSafe'];

  const assertNoInternal = (msg: string) => FORBIDDEN.forEach((f) => expect(msg).not.toContain(f));

  // Stable SEC-2 contract preserved: every rejection is 400 + CONTENT_VALIDATION_FAILED;
  // differentiation for the user lives in the message only.
  it('scan cannot complete → fail-closed 4xx, retryable safe copy, no internal code', () => {
    const r = mapWorkforceUploadRejection({ ...base, codeSafe: 'SCAN_SCAN_FAILED', scanOutcome: 'SCAN_FAILED' });
    expect(r.status).toBe(400);
    expect(r.code).toBe('CONTENT_VALIDATION_FAILED');
    expect(r.message).toBe('A fájl biztonsági ellenőrzése most nem végezhető el. Próbálja meg később.');
    assertNoInternal(r.message);
  });

  it('infected → 4xx safe rejection copy, no internal code', () => {
    const r = mapWorkforceUploadRejection({ ...base, codeSafe: 'SCAN_INFECTED', scanOutcome: 'INFECTED' });
    expect(r.status).toBe(400);
    expect(r.code).toBe('CONTENT_VALIDATION_FAILED');
    expect(r.message).toContain('biztonsági ellenőrzésen');
    assertNoInternal(r.message);
  });

  it('unsupported scan → safe rejection copy, no internal code', () => {
    const r = mapWorkforceUploadRejection({ ...base, codeSafe: 'SCAN_UNSUPPORTED', scanOutcome: 'UNSUPPORTED' });
    expect(r.status).toBe(400);
    assertNoInternal(r.message);
  });

  it('validation failures map to safe copy without echoing internals', () => {
    for (const codeSafe of ['FILE_TOO_LARGE', 'UNSUPPORTED_TYPE', 'MACRO_ENABLED_DOCUMENT', 'EXTENSION_MISMATCH', 'UNSAFE_CONTENT']) {
      const r = mapWorkforceUploadRejection({ ...base, codeSafe });
      expect(r.status).toBe(400);
      expect(r.code).toBe('CONTENT_VALIDATION_FAILED');
      assertNoInternal(r.message);
    }
    const generic = mapWorkforceUploadRejection({ ...base, codeSafe: 'SOMETHING_WEIRD_INTERNAL' });
    expect(generic.message).not.toContain('SOMETHING_WEIRD_INTERNAL');
  });
});
