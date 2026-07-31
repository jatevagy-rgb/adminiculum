import { getScanner, scannerConfigured, isAcceptableFileStatus, setScanner } from '../src/modules/client-interaction/scannerAdapter';
import { getMailSender, mailConfigured, MailProviderError, setMailSender, DEFAULT_NOTIFICATION_BODY } from '../src/modules/client-interaction/mailAdapter';
import { detectMimeFromMagicBytes, looksUnsafe, validateUploadFile, ACCEPTED_UPLOAD_MIME } from '../src/modules/client-interaction/fileValidation';

afterEach(() => { setScanner(null); setMailSender(null); });

describe('malware scanner adapter (unconfigured)', () => {
  it('never returns CLEAN and reports SCANNER_NOT_CONFIGURED', async () => {
    const result = await getScanner().scan({ sizeBytes: 10, detectedMimeType: 'application/pdf' });
    expect(result.outcome).toBe('SCAN_FAILED');
    expect(result.provider).toBe('NONE');
    expect(result.codeSafe).toBe('SCANNER_NOT_CONFIGURED');
    expect(scannerConfigured()).toBe(false);
  });
  it('only CLEAN files are acceptable into a matter', () => {
    expect(isAcceptableFileStatus('CLEAN')).toBe(true);
    for (const s of ['SCANNING', 'SCAN_FAILED', 'INFECTED', 'UNSUPPORTED', 'UPLOADED', 'REJECTED']) {
      expect(isAcceptableFileStatus(s)).toBe(false);
    }
  });
});

describe('mail adapter (unconfigured)', () => {
  it('throws a retryable MAIL_PROVIDER_NOT_CONFIGURED and never fakes SENT', async () => {
    expect(mailConfigured()).toBe(false);
    await expect(getMailSender().send({ to: 'x@example.com', subjectSafe: 's', bodyTextSafe: 'b', idempotencyKey: 'k' }))
      .rejects.toMatchObject({ codeSafe: 'MAIL_PROVIDER_NOT_CONFIGURED', retryable: true });
  });
  it('exposes a safe default body with no sensitive content or bearer link', () => {
    expect(DEFAULT_NOTIFICATION_BODY).toMatch(/ügyfélportál/i);
    expect(DEFAULT_NOTIFICATION_BODY).not.toMatch(/token|bearer|http/i);
  });
  it('MailProviderError carries retryable + codeSafe', () => {
    const e = new MailProviderError('X', 'm', false);
    expect(e.retryable).toBe(false);
    expect(e.codeSafe).toBe('X');
  });
});

describe('file validation (magic bytes, not declared MIME)', () => {
  const pdf = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const heic = Buffer.concat([Buffer.from([0, 0, 0, 0]), Buffer.from('ftypheic', 'ascii'), Buffer.from([0, 0, 0, 0])]);

  it('detects accepted formats from magic bytes', () => {
    expect(detectMimeFromMagicBytes(pdf)).toBe('application/pdf');
    expect(detectMimeFromMagicBytes(jpeg)).toBe('image/jpeg');
    expect(detectMimeFromMagicBytes(png)).toBe('image/png');
    expect(detectMimeFromMagicBytes(heic)).toBe('image/heic');
    for (const m of ['application/pdf', 'image/jpeg', 'image/png', 'image/heic']) expect(ACCEPTED_UPLOAD_MIME.has(m)).toBe(true);
  });

  it('flags script/markup/executable content as unsafe', () => {
    expect(looksUnsafe(Buffer.from('<svg xmlns="...">', 'utf8'))).toBe(true);
    expect(looksUnsafe(Buffer.from('<!DOCTYPE html>', 'utf8'))).toBe(true);
    expect(looksUnsafe(Buffer.from([0x4d, 0x5a, 0, 0]))).toBe(true); // MZ exe
    expect(looksUnsafe(pdf)).toBe(false);
  });

  it('accepts a valid pdf and rejects mismatches/oversize/unsafe/unknown', () => {
    expect(validateUploadFile({ buffer: pdf, originalFileName: 'a.pdf', declaredMimeType: 'application/pdf' }).ok).toBe(true);
    // declared says pdf but content is png -> extension mismatch
    expect(validateUploadFile({ buffer: png, originalFileName: 'a.pdf' }).codeSafe).toBe('EXTENSION_MISMATCH');
    // svg -> unsafe
    expect(validateUploadFile({ buffer: Buffer.from('<svg>', 'utf8'), originalFileName: 'a.svg' }).codeSafe).toBe('UNSAFE_CONTENT');
    // unknown bytes -> unsupported
    expect(validateUploadFile({ buffer: Buffer.from([1, 2, 3, 4, 5]), originalFileName: 'a.bin' }).codeSafe).toBe('UNSUPPORTED_TYPE');
    // oversize
    expect(validateUploadFile({ buffer: jpeg, originalFileName: 'a.jpg', maxFileBytes: 2 }).codeSafe).toBe('FILE_TOO_LARGE');
    // empty
    expect(validateUploadFile({ buffer: Buffer.from([]), originalFileName: 'a.pdf' }).codeSafe).toBe('EMPTY_FILE');
  });
});
