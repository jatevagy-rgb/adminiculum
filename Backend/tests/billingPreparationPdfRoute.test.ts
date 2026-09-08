import express from 'express';
import http from 'node:http';
import { InteractionError } from '../src/modules/client-interaction/base';

const getPreparationPdf = jest.fn();
jest.mock('../src/middleware/auth', () => ({
  ROLES: { ADMIN: 'ADMIN', PARTNER: 'PARTNER' },
  authenticate: (req: any, _res: any, next: any) => { req.user = { userId: 'admin-1', role: 'ADMIN' }; next(); },
  requireRole: () => (_req: any, _res: any, next: any) => next(),
}));
jest.mock('../src/modules/billing-preparations/service', () => ({
  getPreparationPdf: (...args: unknown[]) => getPreparationPdf(...args),
  createPreparation: jest.fn(), getPreparation: jest.fn(), listPreparations: jest.fn(), patchItem: jest.fn(),
  refreshPreparation: jest.fn(), resyncItem: jest.fn(), setPreparationStatus: jest.fn(),
}));

import router from '../src/modules/billing-preparations/routes';

async function request(path: string) {
  const app = express();
  app.use(router);
  const server = await new Promise<http.Server>((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const address = server.address() as { port: number };
  try {
    return await new Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Buffer }>((resolve, reject) => {
      http.get({ host: '127.0.0.1', port: address.port, path }, (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        response.on('end', () => resolve({ status: response.statusCode ?? 0, headers: response.headers, body: Buffer.concat(chunks) }));
      }).on('error', reject);
    });
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
}

describe('billing preparation PDF route', () => {
  it('sends a PDF attachment only through the workforce billing router', async () => {
    getPreparationPdf.mockResolvedValue(Buffer.from('%PDF-test'));
    const response = await request('/prep-1/pdf');
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/^application\/pdf/);
    expect(response.headers['content-disposition']).toMatch(/^attachment;/);
    expect(response.body.subarray(0, 4).toString()).toBe('%PDF');
    expect(getPreparationPdf).toHaveBeenCalledWith({ userId: 'admin-1', role: 'ADMIN' }, 'prep-1');
  });

  it('keeps the CLOSED-only domain response', async () => {
    getPreparationPdf.mockRejectedValue(new InteractionError(409, 'BILLING_PREP_PDF_REQUIRES_CLOSED', 'Lezárás szükséges.'));
    const response = await request('/prep-1/pdf');
    expect(response.status).toBe(409);
    expect(JSON.parse(response.body.toString())).toMatchObject({ code: 'BILLING_PREP_PDF_REQUIRES_CLOSED' });
  });
});
