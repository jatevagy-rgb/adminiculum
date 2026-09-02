/**
 * Client Portal Authorization & Tenant Isolation Tests
 *
 * Validates fail-closed tenant boundary enforcement across all client portal routes:
 * 1. unauthenticated portal access (401)
 * 2. real canonical workforce authentication (Azure AD / local JWT) (200)
 * 3. real canonical Client Portal authentication path (Entra External ID RS256 JWKS) (200)
 * 4. individual client same-client access (200)
 * 5. organization workspace membership same-client access (200)
 * 6. Client A -> Client B summary blocked (403)
 * 7. Client A -> Client B department blocked (403)
 * 8. Client A -> Client B matter blocked (403)
 * 9. Client A -> Client B time log blocked (403)
 * 10. Client A -> Client B export blocked (403)
 * 11. SUSPENDED portal identity blocked (403)
 * 12. REVOKED portal identity blocked (403)
 * 13. unverified portal identity blocked (403)
 * 14. existing publication snapshot route preserved (200)
 * 15. internal portal preview behavior preserved (200)
 * 16. safe 404 for non-existent resources
 */

import express, { Express } from 'express';
import http from 'http';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { prisma } from '../src/prisma/prisma.service';
import clientPortalRoutes from '../src/routes/clientPortal';

// Generate real RSA key pair for testing canonical Entra External ID Client Portal tokens
const { privateKey: rsaPrivateKey, publicKey: rsaPublicKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

jest.mock('jwks-rsa', () => {
  return jest.fn().mockImplementation(() => ({
    getSigningKey: (_kid: string, cb: (err: any, key?: { getPublicKey: () => string }) => void) => {
      cb(null, { getPublicKey: () => rsaPublicKey });
    },
  }));
});

jest.mock('../src/modules/client-publication/publicationService', () => {
  const actual = jest.requireActual('../src/modules/client-publication/publicationService');
  return {
    ...actual,
    getPortalMatter: jest.fn().mockImplementation(async (_actor, id) => {
      if (id === 'pub-alpha-1') {
        return {
          id: 'pub-alpha-1',
          title: 'Published Project Alpha',
          statusLabel: 'Folyamatban',
        };
      }
      throw new actual.ClientPublicationError(404, 'PORTAL_RESOURCE_NOT_FOUND', 'Publication not found.');
    }),
  };
});

jest.mock('../src/prisma/prisma.service', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
    client: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    department: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    matter: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    timeEntry: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    clientPortalGrant: {
      findMany: jest.fn(),
    },
    clientPortalIdentity: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
    },
    clientPortalWorkspace: {
      findMany: jest.fn(),
    },
    clientPortalWorkspaceMembership: {
      findMany: jest.fn(),
    },
  },
}));

function createTestApp(): Express {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/client-portal', clientPortalRoutes);
  return app;
}

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-for-portal-tests-12345';
const TEST_JWT_SECRET = process.env.JWT_SECRET;
const TEST_PORTAL_ISSUER = 'https://adminiculum-test.ciamlogin.com/v2.0';
const TEST_PORTAL_AUDIENCE = 'adminiculum-client-portal';

function makeWorkforceToken(payload: { userId: string; email: string; role: string; name?: string }) {
  return jwt.sign(payload, TEST_JWT_SECRET, { expiresIn: '1h' });
}

function makeCustomerPortalToken(payload: {
  sub: string;
  email: string;
  name?: string;
  scp?: string;
  email_verified?: boolean;
}) {
  return jwt.sign(
    {
      sub: payload.sub,
      email: payload.email,
      name: payload.name || payload.email,
      scp: payload.scp || 'access_as_client',
      email_verified: payload.email_verified !== undefined ? payload.email_verified : true,
    },
    rsaPrivateKey,
    {
      algorithm: 'RS256',
      issuer: TEST_PORTAL_ISSUER,
      audience: TEST_PORTAL_AUDIENCE,
      keyid: 'portal-test-key-1',
      expiresIn: '1h',
    }
  );
}

function requestApp(
  app: Express,
  method: string,
  path: string,
  token?: string | null,
  headers: Record<string, string> = {}
): Promise<{ status: number; body: any; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Failed to bind test server'));
        return;
      }

      const reqHeaders: Record<string, string> = { ...headers };
      if (token) {
        reqHeaders['authorization'] = `Bearer ${token}`;
      }

      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: address.port,
          path,
          method,
          headers: reqHeaders,
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            server.close();
            let parsed = {};
            try {
              parsed = JSON.parse(data);
            } catch {
              parsed = data;
            }
            resolve({ status: res.statusCode || 500, body: parsed, headers: res.headers });
          });
        }
      );

      req.on('error', (err) => {
        server.close();
        reject(err);
      });
      req.end();
    });
  });
}

describe('Client Portal P0 Authorization & Tenant Isolation', () => {
  const CLIENT_A_ID = 'client-aaa-111';
  const CLIENT_B_ID = 'client-bbb-222';
  const USER_CLIENT_A_ID = 'user-client-a';
  const USER_CLIENT_B_ID = 'user-client-b';
  const USER_ADMIN_ID = 'user-admin-1';
  const IDENTITY_A_ID = 'cpi-aaa-111';

  const tokenWorkforceClientA = makeWorkforceToken({
    userId: USER_CLIENT_A_ID,
    email: 'client.a@example.com',
    role: 'CLIENT',
  });

  const tokenAdmin = makeWorkforceToken({
    userId: USER_ADMIN_ID,
    email: 'admin@adminiculum.hu',
    role: 'ADMIN',
  });

  const tokenCustomerClientA = makeCustomerPortalToken({
    sub: 'external-sub-client-a',
    email: 'portal.customer.a@example.com',
    name: 'Customer Alpha',
    scp: 'access_as_client',
    email_verified: true,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ENABLE_CLIENT_PORTAL = 'true';
    process.env.CLIENT_IDENTITY_ISSUER = TEST_PORTAL_ISSUER;
    process.env.CLIENT_IDENTITY_AUDIENCE = TEST_PORTAL_AUDIENCE;
    process.env.CLIENT_IDENTITY_JWKS_URI = 'https://adminiculum-test.ciamlogin.com/discovery/v2.0/keys';
    process.env.CLIENT_PORTAL_IDENTITY_REQUIRED_SCOPE = 'access_as_client';

    // Mock workforce grants
    (prisma.clientPortalGrant.findMany as jest.Mock).mockImplementation(async ({ where }) => {
      if (where?.clientUserId === USER_CLIENT_A_ID) {
        return [{ clientId: CLIENT_A_ID, status: 'ACTIVE' }];
      }
      if (where?.clientUserId === USER_CLIENT_B_ID) {
        return [{ clientId: CLIENT_B_ID, status: 'ACTIVE' }];
      }
      if (where?.clientPortalIdentityId === IDENTITY_A_ID) {
        return [{ clientId: CLIENT_A_ID, status: 'ACTIVE' }];
      }
      return [];
    });

    // Mock customer portal identity resolution
    (prisma.clientPortalIdentity.findUnique as jest.Mock).mockResolvedValue({
      id: IDENTITY_A_ID,
      issuer: TEST_PORTAL_ISSUER,
      subject: 'external-sub-client-a',
      normalizedEmail: 'portal.customer.a@example.com',
      displayName: 'Customer Alpha',
      accountType: 'INDIVIDUAL',
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
    });

    (prisma.clientPortalIdentity.upsert as jest.Mock).mockResolvedValue({
      id: IDENTITY_A_ID,
      issuer: TEST_PORTAL_ISSUER,
      subject: 'external-sub-client-a',
      normalizedEmail: 'portal.customer.a@example.com',
      displayName: 'Customer Alpha',
      accountType: 'INDIVIDUAL',
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
    });

    (prisma.clientPortalIdentity.update as jest.Mock).mockResolvedValue({
      id: IDENTITY_A_ID,
      status: 'ACTIVE',
    });

    (prisma.clientPortalWorkspaceMembership.findMany as jest.Mock).mockResolvedValue([
      { workspaceId: 'ws-alpha', status: 'ACTIVE' },
    ]);
    (prisma.clientPortalWorkspace.findMany as jest.Mock).mockResolvedValue([
      { id: 'ws-alpha', clientId: CLIENT_A_ID, status: 'ACTIVE' },
    ]);
    (prisma.client.findMany as jest.Mock).mockResolvedValue([]);
  });

  afterEach(() => {
    delete process.env.ENABLE_CLIENT_PORTAL;
    delete process.env.CLIENT_IDENTITY_ISSUER;
    delete process.env.CLIENT_IDENTITY_AUDIENCE;
    delete process.env.CLIENT_IDENTITY_JWKS_URI;
    delete process.env.CLIENT_PORTAL_IDENTITY_REQUIRED_SCOPE;
  });

  describe('1. Unauthenticated Requests', () => {
    it.each([
      ['GET', `/api/v1/client-portal/summary/${CLIENT_A_ID}`],
      ['GET', `/api/v1/client-portal/departments/${CLIENT_A_ID}`],
      ['GET', `/api/v1/client-portal/departments/dept-1/matters`],
      ['GET', `/api/v1/client-portal/matters/matter-1`],
      ['GET', `/api/v1/client-portal/matters/matter-1/time-log`],
      ['GET', `/api/v1/client-portal/export/${CLIENT_A_ID}`],
    ])('%s %s rejects with 401 when unauthenticated', async (method, path) => {
      const res = await requestApp(createTestApp(), method, path, null);
      expect(res.status).toBe(401);
      expect(res.body).toMatchObject({
        code: 'CLIENT_PORTAL_AUTH_REQUIRED',
      });
    });
  });

  describe('2. Real Canonical Client Portal Authentication (External ID RS256 JWKS)', () => {
    it('authenticates customer portal token through canonical authenticateClientPortal and authorizes client data', async () => {
      (prisma.client.findUnique as jest.Mock).mockResolvedValue({
        id: CLIENT_A_ID,
        name: 'Alpha Corp',
        matters: [],
        departments: [],
        cases: [],
      });

      const res = await requestApp(
        createTestApp(),
        'GET',
        `/api/v1/client-portal/summary/${CLIENT_A_ID}`,
        tokenCustomerClientA
      );

      expect(res.status).toBe(200);
      expect(res.body.client.id).toBe(CLIENT_A_ID);
      expect(res.body.client.name).toBe('Alpha Corp');
    });
  });

  describe('3. Active / Verified Client Portal Session Enforcement', () => {
    it('rejects unverified customer email with 403', async () => {
      const tokenUnverified = makeCustomerPortalToken({
        sub: 'unverified-sub',
        email: 'unverified@example.com',
        email_verified: false,
      });

      (prisma.clientPortalIdentity.findUnique as jest.Mock).mockResolvedValue({
        id: 'cpi-unverified',
        status: 'EMAIL_VERIFICATION_PENDING',
        emailVerifiedAt: null,
      });
      (prisma.clientPortalIdentity.upsert as jest.Mock).mockResolvedValue({
        id: 'cpi-unverified',
        status: 'EMAIL_VERIFICATION_PENDING',
        emailVerifiedAt: null,
      });

      const res = await requestApp(
        createTestApp(),
        'GET',
        `/api/v1/client-portal/summary/${CLIENT_A_ID}`,
        tokenUnverified
      );

      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({
        code: 'CLIENT_EMAIL_NOT_VERIFIED',
      });
    });

    it('rejects SUSPENDED customer identity with 403', async () => {
      const tokenSuspended = makeCustomerPortalToken({
        sub: 'suspended-sub',
        email: 'suspended@example.com',
      });

      (prisma.clientPortalIdentity.findUnique as jest.Mock).mockResolvedValue({
        id: 'cpi-suspended',
        status: 'SUSPENDED',
        emailVerifiedAt: new Date(),
      });
      (prisma.clientPortalIdentity.upsert as jest.Mock).mockResolvedValue({
        id: 'cpi-suspended',
        status: 'SUSPENDED',
        emailVerifiedAt: new Date(),
      });

      const res = await requestApp(
        createTestApp(),
        'GET',
        `/api/v1/client-portal/summary/${CLIENT_A_ID}`,
        tokenSuspended
      );

      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({
        code: 'CLIENT_IDENTITY_SUSPENDED',
      });
    });

    it('rejects REVOKED customer identity with 403', async () => {
      const tokenRevoked = makeCustomerPortalToken({
        sub: 'revoked-sub',
        email: 'revoked@example.com',
      });

      (prisma.clientPortalIdentity.findUnique as jest.Mock).mockResolvedValue({
        id: 'cpi-revoked',
        status: 'REVOKED',
        emailVerifiedAt: new Date(),
      });
      (prisma.clientPortalIdentity.upsert as jest.Mock).mockResolvedValue({
        id: 'cpi-revoked',
        status: 'REVOKED',
        emailVerifiedAt: new Date(),
      });

      const res = await requestApp(
        createTestApp(),
        'GET',
        `/api/v1/client-portal/summary/${CLIENT_A_ID}`,
        tokenRevoked
      );

      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({
        code: 'CLIENT_IDENTITY_REVOKED',
      });
    });
  });

  describe('4. Authorized Same-Client Access', () => {
    it('GET /summary/:clientId returns 200 for authorized client', async () => {
      (prisma.client.findUnique as jest.Mock).mockResolvedValue({
        id: CLIENT_A_ID,
        name: 'Alpha Corp',
        matters: [
          {
            id: 'matter-1',
            status: 'OPEN',
            timeEntries: [{ minutes: 120 }, { minutes: 60 }],
          },
        ],
        departments: [{ id: 'dept-1' }],
        cases: [{ id: 'case-1' }],
      });

      const res = await requestApp(
        createTestApp(),
        'GET',
        `/api/v1/client-portal/summary/${CLIENT_A_ID}`,
        tokenWorkforceClientA
      );

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        client: { id: CLIENT_A_ID, name: 'Alpha Corp' },
        totalMinutes: 180,
        totalHours: '3.00',
        activeMatters: 1,
        totalMatters: 1,
        casesCount: 1,
        departmentsCount: 1,
      });
    });

    it('GET /departments/:clientId returns 200 for authorized client', async () => {
      (prisma.client.findUnique as jest.Mock).mockResolvedValue({
        id: CLIENT_A_ID,
        name: 'Alpha Corp',
      });
      (prisma.department.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'dept-1',
          name: 'Legal',
          description: 'Legal Department',
          matters: [
            {
              id: 'matter-1',
              status: 'OPEN',
              timeEntries: [{ minutes: 90 }],
            },
          ],
        },
      ]);

      const res = await requestApp(
        createTestApp(),
        'GET',
        `/api/v1/client-portal/departments/${CLIENT_A_ID}`,
        tokenWorkforceClientA
      );

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({
        id: 'dept-1',
        name: 'Legal',
        totalMatters: 1,
        activeMatters: 1,
        totalMinutes: 90,
        totalHours: '1.50',
      });
    });

    it('GET /departments/:departmentId/matters returns 200 when department belongs to authorized client', async () => {
      (prisma.department.findUnique as jest.Mock).mockResolvedValue({
        id: 'dept-1',
        clientId: CLIENT_A_ID,
        matters: [
          {
            id: 'matter-1',
            title: 'Employment Matter',
            description: 'HR update',
            matterType: 'EMPLOYMENT',
            status: 'OPEN',
            openedAt: new Date().toISOString(),
            closedAt: null,
            totalMinutes: 60,
            timeEntries: [{ minutes: 60 }],
            _count: { cases: 2 },
          },
        ],
      });

      const res = await requestApp(
        createTestApp(),
        'GET',
        `/api/v1/client-portal/departments/dept-1/matters`,
        tokenWorkforceClientA
      );

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({
        id: 'matter-1',
        title: 'Employment Matter',
        type: 'EMPLOYMENT',
        status: 'OPEN',
        casesCount: 2,
      });
    });

    it('GET /matters/:id returns 200 when direct matter belongs to authorized client', async () => {
      (prisma.matter.findUnique as jest.Mock).mockResolvedValue({
        id: 'matter-1',
        clientId: CLIENT_A_ID,
        title: 'Contract Review Project',
        description: 'Reviewing vendor terms',
        matterType: 'CONTRACT',
        status: 'OPEN',
        openedAt: new Date().toISOString(),
        closedAt: null,
        totalMinutes: 150,
        client: { id: CLIENT_A_ID, name: 'Alpha Corp' },
        department: { id: 'dept-1', name: 'Commercial' },
        timeEntries: [
          {
            workType: 'LEGAL_RESEARCH',
            description: 'Clause analysis',
            minutes: 90,
            workDate: new Date().toISOString(),
            user: { name: 'Dr. Kovács' },
            department: { name: 'Commercial' },
          },
          {
            workType: 'DRAFTING',
            description: 'Contract editing',
            minutes: 60,
            workDate: new Date().toISOString(),
            user: { name: 'Dr. Nagy' },
            department: { name: 'Commercial' },
          },
        ],
      });

      const res = await requestApp(
        createTestApp(),
        'GET',
        `/api/v1/client-portal/matters/matter-1`,
        tokenWorkforceClientA
      );

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        id: 'matter-1',
        title: 'Contract Review Project',
        totalMinutes: 150,
        totalHours: '2.50',
      });
    });

    it('GET /matters/:matterId/time-log returns 200 for authorized client', async () => {
      (prisma.matter.findUnique as jest.Mock).mockResolvedValue({
        id: 'matter-1',
        clientId: CLIENT_A_ID,
      });
      (prisma.timeEntry.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'te-1',
          workType: 'CONSULTATION',
          description: 'Client meeting',
          minutes: 45,
          workDate: new Date().toISOString(),
          user: { name: 'Dr. Kovács' },
          department: { name: 'Legal' },
        },
      ]);
      (prisma.timeEntry.count as jest.Mock).mockResolvedValue(1);

      const res = await requestApp(
        createTestApp(),
        'GET',
        `/api/v1/client-portal/matters/matter-1/time-log`,
        tokenWorkforceClientA
      );

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        total: 1,
        hasMore: false,
        entries: [
          {
            id: 'te-1',
            workType: 'CONSULTATION',
            minutes: 45,
            hours: '0.75',
          },
        ],
      });
    });

    it('GET /export/:clientId returns 200 for authorized client', async () => {
      (prisma.client.findUnique as jest.Mock).mockResolvedValue({
        id: CLIENT_A_ID,
        name: 'Alpha Corp',
      });
      (prisma.department.findMany as jest.Mock).mockResolvedValue([
        {
          name: 'Legal',
          matters: [
            {
              title: 'Matter 1',
              matterType: 'CONTRACT',
              status: 'OPEN',
              openedAt: new Date().toISOString(),
              closedAt: null,
              totalMinutes: 60,
              timeEntries: [
                {
                  workType: 'DRAFTING',
                  description: 'Drafting doc',
                  minutes: 60,
                  workDate: new Date().toISOString(),
                  user: { name: 'Dr. Kovács' },
                  department: { name: 'Legal' },
                },
              ],
            },
          ],
        },
      ]);

      const res = await requestApp(
        createTestApp(),
        'GET',
        `/api/v1/client-portal/export/${CLIENT_A_ID}`,
        tokenWorkforceClientA
      );

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        client: { name: 'Alpha Corp' },
        summary: { totalMinutes: 60, totalHours: '1.00', activeMatters: 1 },
      });
    });
  });

  describe('5. Unauthorized Cross-Client Access (Tenant Isolation)', () => {
    it('Client A requesting Client B summary is rejected with 403', async () => {
      const res = await requestApp(
        createTestApp(),
        'GET',
        `/api/v1/client-portal/summary/${CLIENT_B_ID}`,
        tokenWorkforceClientA
      );

      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({
        code: 'CLIENT_ACCESS_FORBIDDEN',
      });
      expect(prisma.client.findUnique).not.toHaveBeenCalled();
    });

    it('Client A requesting Client B departments is rejected with 403', async () => {
      const res = await requestApp(
        createTestApp(),
        'GET',
        `/api/v1/client-portal/departments/${CLIENT_B_ID}`,
        tokenWorkforceClientA
      );

      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({
        code: 'CLIENT_ACCESS_FORBIDDEN',
      });
      expect(prisma.department.findMany).not.toHaveBeenCalled();
    });

    it('Client A requesting matters of a department belonging to Client B is rejected with 403', async () => {
      (prisma.department.findUnique as jest.Mock).mockResolvedValue({
        id: 'dept-b-1',
        clientId: CLIENT_B_ID,
        matters: [],
      });

      const res = await requestApp(
        createTestApp(),
        'GET',
        `/api/v1/client-portal/departments/dept-b-1/matters`,
        tokenWorkforceClientA
      );

      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({
        code: 'CLIENT_ACCESS_FORBIDDEN',
      });
    });

    it('Client A requesting a matter belonging to Client B is rejected with 403', async () => {
      (prisma.matter.findUnique as jest.Mock).mockResolvedValue({
        id: 'matter-b-1',
        clientId: CLIENT_B_ID,
        title: 'Confidential Client B Matter',
        timeEntries: [],
      });

      const res = await requestApp(
        createTestApp(),
        'GET',
        `/api/v1/client-portal/matters/matter-b-1`,
        tokenWorkforceClientA
      );

      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({
        code: 'CLIENT_ACCESS_FORBIDDEN',
      });
    });

    it('Client A requesting time log of a matter belonging to Client B is rejected with 403', async () => {
      (prisma.matter.findUnique as jest.Mock).mockResolvedValue({
        id: 'matter-b-1',
        clientId: CLIENT_B_ID,
      });

      const res = await requestApp(
        createTestApp(),
        'GET',
        `/api/v1/client-portal/matters/matter-b-1/time-log`,
        tokenWorkforceClientA
      );

      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({
        code: 'CLIENT_ACCESS_FORBIDDEN',
      });
      expect(prisma.timeEntry.findMany).not.toHaveBeenCalled();
    });

    it('Client A requesting export of Client B is rejected with 403', async () => {
      const res = await requestApp(
        createTestApp(),
        'GET',
        `/api/v1/client-portal/export/${CLIENT_B_ID}`,
        tokenWorkforceClientA
      );

      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({
        code: 'CLIENT_ACCESS_FORBIDDEN',
      });
      expect(prisma.client.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('6. Organization Mode Scope & Membership Resolution', () => {
    it('organization member user accesses only their organization workspace client scope', async () => {
      const tokenOrgUser = makeCustomerPortalToken({
        sub: 'org-member-sub',
        email: 'member@demo-kft.hu',
        name: 'Demo Org Member',
      });

      (prisma.clientPortalIdentity.findUnique as jest.Mock).mockResolvedValue({
        id: 'cpi-org-1',
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
      });
      (prisma.clientPortalIdentity.upsert as jest.Mock).mockResolvedValue({
        id: 'cpi-org-1',
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
      });
      (prisma.clientPortalWorkspaceMembership.findMany as jest.Mock).mockResolvedValue([
        { workspaceId: 'ws-demo-kft', status: 'ACTIVE' },
      ]);
      (prisma.clientPortalWorkspace.findMany as jest.Mock).mockResolvedValue([
        { id: 'ws-demo-kft', clientId: CLIENT_A_ID, status: 'ACTIVE' },
      ]);

      (prisma.client.findUnique as jest.Mock).mockResolvedValue({
        id: CLIENT_A_ID,
        name: 'Demo Kft.',
        matters: [],
        departments: [],
        cases: [],
      });

      // Allowed for Client A (Demo Kft.)
      const allowedRes = await requestApp(
        createTestApp(),
        'GET',
        `/api/v1/client-portal/summary/${CLIENT_A_ID}`,
        tokenOrgUser
      );
      expect(allowedRes.status).toBe(200);

      // Forbidden for Client B
      const forbiddenRes = await requestApp(
        createTestApp(),
        'GET',
        `/api/v1/client-portal/summary/${CLIENT_B_ID}`,
        tokenOrgUser
      );
      expect(forbiddenRes.status).toBe(403);
    });
  });

  describe('7. Internal Staff Access', () => {
    it('internal ADMIN user can access summary for any client', async () => {
      (prisma.client.findUnique as jest.Mock).mockResolvedValue({
        id: CLIENT_B_ID,
        name: 'Beta Corp',
        matters: [],
        departments: [],
        cases: [],
      });

      const res = await requestApp(
        createTestApp(),
        'GET',
        `/api/v1/client-portal/summary/${CLIENT_B_ID}`,
        tokenAdmin
      );

      expect(res.status).toBe(200);
      expect(res.body.client.id).toBe(CLIENT_B_ID);
    });
  });

  describe('8. Publication Snapshot Reads Preserved & Safe 404', () => {
    it('returns 404 when matter does not exist and no publication matches', async () => {
      (prisma.matter.findUnique as jest.Mock).mockResolvedValue(null);

      const res = await requestApp(
        createTestApp(),
        'GET',
        `/api/v1/client-portal/matters/non-existent-matter`,
        tokenWorkforceClientA
      );

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Matter not found');
    });

    it('returns 404 when department does not exist', async () => {
      (prisma.department.findUnique as jest.Mock).mockResolvedValue(null);

      const res = await requestApp(
        createTestApp(),
        'GET',
        `/api/v1/client-portal/departments/non-existent-dept/matters`,
        tokenWorkforceClientA
      );

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Department not found');
    });

    it('reads publication snapshot when direct matter is not found in matters table', async () => {
      (prisma.matter.findUnique as jest.Mock).mockResolvedValue(null);
      process.env.CLIENT_PORTAL_READ_ENABLED = 'true';

      const res = await requestApp(
        createTestApp(),
        'GET',
        `/api/v1/client-portal/matters/pub-alpha-1`,
        tokenCustomerClientA
      );

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        id: 'pub-alpha-1',
        title: 'Published Project Alpha',
        statusLabel: 'Folyamatban',
      });
      delete process.env.CLIENT_PORTAL_READ_ENABLED;
    });
  });
});
