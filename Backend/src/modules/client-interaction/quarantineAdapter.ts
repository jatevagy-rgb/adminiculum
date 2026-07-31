/**
 * Provider-independent quarantine storage for client uploads.
 *
 * Uploaded bytes are held in a quarantine location, separate from the matter
 * document store, until an internal reviewer accepts a CLEAN file. With no
 * quarantine store configured, put() throws QUARANTINE_NOT_CONFIGURED so the
 * upload is not silently accepted. Real providers (e.g. an isolated Graph/blob
 * container) implement QuarantineStore and are wired later. Storage references
 * are never exposed to customers.
 */

export interface QuarantinePutInput {
  submissionId: string;
  buffer: Buffer;
  checksum: string;
  detectedMimeType: string;
}

export class QuarantineError extends Error {
  readonly codeSafe: string;
  readonly retryable: boolean;
  constructor(codeSafe: string, message: string, retryable = true) {
    super(message);
    this.codeSafe = codeSafe;
    this.retryable = retryable;
  }
}

export interface QuarantineStore {
  readonly provider: string;
  put(input: QuarantinePutInput): Promise<{ reference: string; provider: string }>;
  get(reference: string): Promise<Buffer>;
}

class UnconfiguredQuarantine implements QuarantineStore {
  readonly provider = 'NONE';
  async put(): Promise<{ reference: string; provider: string }> {
    throw new QuarantineError('QUARANTINE_NOT_CONFIGURED', 'No quarantine storage is configured.', true);
  }
  async get(): Promise<Buffer> {
    throw new QuarantineError('QUARANTINE_NOT_CONFIGURED', 'No quarantine storage is configured.', true);
  }
}

let cached: QuarantineStore | null = null;

export function getQuarantineStore(_env: NodeJS.ProcessEnv = process.env): QuarantineStore {
  if (!cached) cached = new UnconfiguredQuarantine();
  return cached;
}

export function setQuarantineStore(store: QuarantineStore | null): void {
  cached = store;
}

export function quarantineConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return getQuarantineStore(env).provider !== 'NONE';
}
