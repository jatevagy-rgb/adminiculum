import { validateWorkforceUpload } from '../src/modules/upload-security/uploadValidationCore';
import { setScanner } from '../src/modules/upload-security/scannerAdapter';

describe('document intake security scan contract', () => {
  afterEach(() => setScanner(null));

  it('keeps local validation independent from scanner availability', async () => {
    setScanner({
      provider: 'TEST_UNAVAILABLE',
      scan: async () => ({ outcome: 'SCAN_FAILED', provider: 'TEST_UNAVAILABLE', codeSafe: 'TEST_FAILURE' }),
    });
    const result = await validateWorkforceUpload({
      buffer: Buffer.from('%PDF-1.7\n'),
      originalFileName: 'intake.pdf',
      declaredMimeType: 'application/pdf',
      scan: false,
    });
    expect(result.ok).toBe(true);
    expect(result.scanOutcome).toBeUndefined();
  });

  it('retains fail-closed behavior for the legacy synchronous contract', async () => {
    setScanner({
      provider: 'TEST_UNAVAILABLE',
      scan: async () => ({ outcome: 'SCAN_FAILED', provider: 'TEST_UNAVAILABLE', codeSafe: 'TEST_FAILURE' }),
    });
    const result = await validateWorkforceUpload({
      buffer: Buffer.from('%PDF-1.7\n'),
      originalFileName: 'legacy.pdf',
      declaredMimeType: 'application/pdf',
    });
    expect(result.ok).toBe(false);
    expect(result.scanOutcome).toBe('SCAN_FAILED');
  });
});
