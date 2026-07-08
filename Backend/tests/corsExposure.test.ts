import express, { Express } from 'express';
import cors from 'cors';
import http from 'http';
import {
  createCorsOptions,
  getConfiguredCorsAllowedOrigins,
  isAllowedCorsOrigin,
} from '../src/http/corsPolicy';

type TestResponse = {
  status: number;
  body: unknown;
  headers: http.IncomingHttpHeaders;
};

function createApp(nodeEnv: string, env: Record<string, string | undefined> = {}): Express {
  const app = express();
  app.use(cors(createCorsOptions({ nodeEnv, env })));
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });
  return app;
}

function requestJson(app: Express, origin?: string): Promise<TestResponse> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Test server address unavailable'));
        return;
      }

      const request = http.request(
        {
          hostname: '127.0.0.1',
          port: address.port,
          path: '/health',
          method: 'GET',
          headers: {
            ...(origin ? { origin } : {}),
          },
        },
        (response) => {
          const chunks: Buffer[] = [];
          response.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
          response.on('end', () => {
            server.close();
            const text = Buffer.concat(chunks).toString('utf8');
            resolve({
              status: response.statusCode || 0,
              body: text ? JSON.parse(text) : null,
              headers: response.headers,
            });
          });
        }
      );

      request.on('error', (error) => {
        server.close();
        reject(error);
      });
      request.end();
    });
  });
}

describe('CORS exposure policy', () => {
  it('allows only explicitly configured origins in production', () => {
    const env = {
      CORS_ALLOWED_ORIGINS: 'https://adminiculumfrontend-austriaeast-01.azurewebsites.net',
    };

    expect(isAllowedCorsOrigin('https://adminiculumfrontend-austriaeast-01.azurewebsites.net', {
      nodeEnv: 'production',
      env,
    })).toBe(true);
    expect(isAllowedCorsOrigin('https://evil.example', {
      nodeEnv: 'production',
      env,
    })).toBe(false);
  });

  it('does not allow arbitrary Azure hosts in production', () => {
    expect(isAllowedCorsOrigin('https://random.azurewebsites.net', {
      nodeEnv: 'production',
      env: {
        CORS_ALLOWED_ORIGINS: 'https://adminiculumfrontend-austriaeast-01.azurewebsites.net',
      },
    })).toBe(false);
  });

  it('fails closed for browser origins when the production allowlist is missing', () => {
    expect(getConfiguredCorsAllowedOrigins({})).toEqual([]);
    expect(isAllowedCorsOrigin('https://adminiculumfrontend-austriaeast-01.azurewebsites.net', {
      nodeEnv: 'production',
      env: {},
    })).toBe(false);
  });

  it('allows localhost development origins outside production', () => {
    expect(isAllowedCorsOrigin('http://localhost:3000', {
      nodeEnv: 'development',
      env: {},
    })).toBe(true);
    expect(isAllowedCorsOrigin('http://127.0.0.1:5173', {
      nodeEnv: 'test',
      env: {},
    })).toBe(true);
  });

  it('does not allow arbitrary HTTPS origins outside production without configuration', () => {
    expect(isAllowedCorsOrigin('https://evil.example', {
      nodeEnv: 'development',
      env: {},
    })).toBe(false);
  });

  it('emits CORS header only for configured production origins', async () => {
    const app = createApp('production', {
      CORS_ALLOWED_ORIGINS: 'https://adminiculumfrontend-austriaeast-01.azurewebsites.net',
    });

    const allowed = await requestJson(
      app,
      'https://adminiculumfrontend-austriaeast-01.azurewebsites.net'
    );
    const blocked = await requestJson(app, 'https://evil.example');

    expect(allowed.status).toBe(200);
    expect(allowed.headers['access-control-allow-origin']).toBe(
      'https://adminiculumfrontend-austriaeast-01.azurewebsites.net'
    );
    expect(blocked.status).toBe(200);
    expect(blocked.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('allows no-Origin server-to-server requests through the route', async () => {
    const response = await requestJson(createApp('production', {}));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
});
