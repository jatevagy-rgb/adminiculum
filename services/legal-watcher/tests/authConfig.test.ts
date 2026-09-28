/**
 * Auth-mode configuration tests.
 *
 * CLIENT_SECRET (default, unset) is byte-for-byte compatible with the previous
 * contract. MANAGED_IDENTITY is explicit, secret-free, requires the runtime
 * identity endpoint/header and never silently falls back to a secret.
 */
import { ConfigError, parseArgs, parseAzureAuthMode, resolveConfig } from '../src/config';

const AUTH_ENV_KEYS = [
  'LEGAL_WATCHER_DELIVERY_MODE',
  'LEGAL_WATCHER_BACKEND_ENDPOINT',
  'LEGAL_WATCHER_AZURE_AUTH_MODE',
  'LEGAL_WATCHER_AZURE_TENANT_ID',
  'LEGAL_WATCHER_AZURE_CLIENT_ID',
  'LEGAL_WATCHER_AZURE_CLIENT_SECRET',
  'LEGAL_WATCHER_AZURE_SCOPE',
  'LEGAL_WATCHER_AZURE_RESOURCE',
  'LEGAL_WATCHER_AZURE_AUTHORITY_HOST',
  'IDENTITY_ENDPOINT',
  'IDENTITY_HEADER',
] as const;

function withCleanEnv(fn: () => void): void {
  const saved = new Map<string, string | undefined>();
  for (const key of AUTH_ENV_KEYS) {
    saved.set(key, process.env[key]);
    delete process.env[key];
  }
  try {
    fn();
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function setClientSecretEnv(): void {
  process.env.LEGAL_WATCHER_AZURE_TENANT_ID = 'tenant-id';
  process.env.LEGAL_WATCHER_AZURE_CLIENT_ID = 'client-id';
  process.env.LEGAL_WATCHER_AZURE_CLIENT_SECRET = 'client-secret';
  process.env.LEGAL_WATCHER_AZURE_SCOPE = 'api://adminiculum-backend/.default';
}

function setManagedIdentityRuntime(): void {
  process.env.IDENTITY_ENDPOINT = 'http://127.0.0.1:41898/msi/token';
  process.env.IDENTITY_HEADER = 'runtime-identity-header-value';
}

const DELIVER_ARGS = ['--manifest', 'm.json', '--deliver'];

describe('azure auth mode selection', () => {
  test('parseAzureAuthMode: unset/empty means CLIENT_SECRET, explicit modes validate', () => {
    expect(parseAzureAuthMode('')).toBe('CLIENT_SECRET');
    expect(parseAzureAuthMode('  ')).toBe('CLIENT_SECRET');
    expect(parseAzureAuthMode('CLIENT_SECRET')).toBe('CLIENT_SECRET');
    expect(parseAzureAuthMode('client_secret')).toBe('CLIENT_SECRET');
    expect(parseAzureAuthMode(' managed_identity ')).toBe('MANAGED_IDENTITY');
    expect(() => parseAzureAuthMode('SOMETIMES')).toThrow(ConfigError);
  });

  test('default (unset) DELIVER config is unchanged CLIENT_SECRET even with MI env present', () => {
    withCleanEnv(() => {
      process.env.LEGAL_WATCHER_BACKEND_ENDPOINT = 'https://backend.example.test';
      setClientSecretEnv();
      setManagedIdentityRuntime();
      process.env.LEGAL_WATCHER_AZURE_RESOURCE = 'api://someone-else';
      const config = resolveConfig(parseArgs(DELIVER_ARGS));
      // Exact equality: no mode/resource fields leak into the legacy shape.
      expect(config.tokenConfig).toEqual({
        tenantId: 'tenant-id',
        clientId: 'client-id',
        clientSecret: 'client-secret',
        scope: 'api://adminiculum-backend/.default',
      });
    });
  });

  test('explicit CLIENT_SECRET mode preserves the current required environment contract', () => {
    withCleanEnv(() => {
      process.env.LEGAL_WATCHER_BACKEND_ENDPOINT = 'https://backend.example.test';
      process.env.LEGAL_WATCHER_AZURE_AUTH_MODE = 'CLIENT_SECRET';
      setClientSecretEnv();
      const config = resolveConfig(parseArgs(DELIVER_ARGS));
      expect(config.tokenConfig).toEqual({
        tenantId: 'tenant-id',
        clientId: 'client-id',
        clientSecret: 'client-secret',
        scope: 'api://adminiculum-backend/.default',
      });
    });
  });

  test('CLIENT_SECRET mode still fails closed when any secret component is missing', () => {
    withCleanEnv(() => {
      process.env.LEGAL_WATCHER_BACKEND_ENDPOINT = 'https://backend.example.test';
      process.env.LEGAL_WATCHER_AZURE_AUTH_MODE = 'CLIENT_SECRET';
      setClientSecretEnv();
      delete process.env.LEGAL_WATCHER_AZURE_CLIENT_SECRET;
      expect(() => resolveConfig(parseArgs(DELIVER_ARGS))).toThrow(ConfigError);
    });
  });

  test('invalid auth mode fails closed without falling back', () => {
    withCleanEnv(() => {
      process.env.LEGAL_WATCHER_BACKEND_ENDPOINT = 'https://backend.example.test';
      setClientSecretEnv();
      process.env.LEGAL_WATCHER_AZURE_AUTH_MODE = 'MANAGED_IDENTITY_TYPO';
      expect(() => resolveConfig(parseArgs(DELIVER_ARGS))).toThrow(ConfigError);
    });
  });
});

describe('MANAGED_IDENTITY configuration', () => {
  test('requires no client secret and derives the Adminiculum resource from a terminal /.default scope', () => {
    withCleanEnv(() => {
      process.env.LEGAL_WATCHER_BACKEND_ENDPOINT = 'https://backend.example.test';
      process.env.LEGAL_WATCHER_AZURE_AUTH_MODE = 'MANAGED_IDENTITY';
      process.env.LEGAL_WATCHER_AZURE_SCOPE = 'api://adminiculum-backend/.default';
      setManagedIdentityRuntime();
      const config = resolveConfig(parseArgs(DELIVER_ARGS));
      expect(config.tokenConfig).toEqual({
        mode: 'MANAGED_IDENTITY',
        resource: 'api://adminiculum-backend',
        identityEndpoint: 'http://127.0.0.1:41898/msi/token',
        identityHeader: 'runtime-identity-header-value',
      });
    });
  });

  test('accepts a narrowly configured api:// resource without a scope', () => {
    withCleanEnv(() => {
      process.env.LEGAL_WATCHER_BACKEND_ENDPOINT = 'https://backend.example.test';
      process.env.LEGAL_WATCHER_AZURE_AUTH_MODE = 'managed_identity';
      process.env.LEGAL_WATCHER_AZURE_RESOURCE = 'api://11111111-2222-3333-4444-555555555555';
      setManagedIdentityRuntime();
      const config = resolveConfig(parseArgs(DELIVER_ARGS));
      expect(config.tokenConfig).toMatchObject({
        mode: 'MANAGED_IDENTITY',
        resource: 'api://11111111-2222-3333-4444-555555555555',
      });
    });
  });

  test('rejects non-api:// resources (Graph, ARM) and non-terminal scopes', () => {
    withCleanEnv(() => {
      process.env.LEGAL_WATCHER_BACKEND_ENDPOINT = 'https://backend.example.test';
      process.env.LEGAL_WATCHER_AZURE_AUTH_MODE = 'MANAGED_IDENTITY';
      setManagedIdentityRuntime();

      process.env.LEGAL_WATCHER_AZURE_RESOURCE = 'https://graph.microsoft.com';
      expect(() => resolveConfig(parseArgs(DELIVER_ARGS))).toThrow(ConfigError);
      process.env.LEGAL_WATCHER_AZURE_RESOURCE = 'https://management.azure.com/';
      expect(() => resolveConfig(parseArgs(DELIVER_ARGS))).toThrow(ConfigError);

      delete process.env.LEGAL_WATCHER_AZURE_RESOURCE;
      process.env.LEGAL_WATCHER_AZURE_SCOPE = 'https://graph.microsoft.com/.default';
      expect(() => resolveConfig(parseArgs(DELIVER_ARGS))).toThrow(ConfigError);
      process.env.LEGAL_WATCHER_AZURE_SCOPE = 'api://adminiculum-backend';
      expect(() => resolveConfig(parseArgs(DELIVER_ARGS))).toThrow(ConfigError);
      process.env.LEGAL_WATCHER_AZURE_SCOPE = 'api://adminiculum-backend/.default/.default';
      expect(() => resolveConfig(parseArgs(DELIVER_ARGS))).toThrow(ConfigError);
    });
  });

  test('fails closed when neither scope nor resource is provided', () => {
    withCleanEnv(() => {
      process.env.LEGAL_WATCHER_BACKEND_ENDPOINT = 'https://backend.example.test';
      process.env.LEGAL_WATCHER_AZURE_AUTH_MODE = 'MANAGED_IDENTITY';
      setManagedIdentityRuntime();
      expect(() => resolveConfig(parseArgs(DELIVER_ARGS))).toThrow(ConfigError);
    });
  });

  test('conflicting explicit resource and scope fail closed', () => {
    withCleanEnv(() => {
      process.env.LEGAL_WATCHER_BACKEND_ENDPOINT = 'https://backend.example.test';
      process.env.LEGAL_WATCHER_AZURE_AUTH_MODE = 'MANAGED_IDENTITY';
      process.env.LEGAL_WATCHER_AZURE_SCOPE = 'api://adminiculum-backend/.default';
      process.env.LEGAL_WATCHER_AZURE_RESOURCE = 'api://some-other-api';
      setManagedIdentityRuntime();
      expect(() => resolveConfig(parseArgs(DELIVER_ARGS))).toThrow(ConfigError);
    });
  });

  test('fails closed when IDENTITY_ENDPOINT is missing', () => {
    withCleanEnv(() => {
      process.env.LEGAL_WATCHER_BACKEND_ENDPOINT = 'https://backend.example.test';
      process.env.LEGAL_WATCHER_AZURE_AUTH_MODE = 'MANAGED_IDENTITY';
      process.env.LEGAL_WATCHER_AZURE_SCOPE = 'api://adminiculum-backend/.default';
      process.env.IDENTITY_HEADER = 'runtime-identity-header-value';
      expect(() => resolveConfig(parseArgs(DELIVER_ARGS))).toThrow(ConfigError);
    });
  });

  test('fails closed when IDENTITY_HEADER is missing', () => {
    withCleanEnv(() => {
      process.env.LEGAL_WATCHER_BACKEND_ENDPOINT = 'https://backend.example.test';
      process.env.LEGAL_WATCHER_AZURE_AUTH_MODE = 'MANAGED_IDENTITY';
      process.env.LEGAL_WATCHER_AZURE_SCOPE = 'api://adminiculum-backend/.default';
      process.env.IDENTITY_ENDPOINT = 'http://127.0.0.1:41898/msi/token';
      expect(() => resolveConfig(parseArgs(DELIVER_ARGS))).toThrow(ConfigError);
    });
  });

  test('MANAGED_IDENTITY never requires tenant/client id/client secret', () => {
    withCleanEnv(() => {
      process.env.LEGAL_WATCHER_BACKEND_ENDPOINT = 'https://backend.example.test';
      process.env.LEGAL_WATCHER_AZURE_AUTH_MODE = 'MANAGED_IDENTITY';
      process.env.LEGAL_WATCHER_AZURE_SCOPE = 'api://adminiculum-backend/.default';
      setManagedIdentityRuntime();
      const config = resolveConfig(parseArgs(DELIVER_ARGS));
      const tokenConfig = config.tokenConfig as { clientSecret?: string } | null;
      expect(tokenConfig?.clientSecret).toBeUndefined();
    });
  });

  test('DRY_RUN ignores auth configuration entirely and keeps tokenConfig null', () => {
    withCleanEnv(() => {
      process.env.LEGAL_WATCHER_AZURE_AUTH_MODE = 'MANAGED_IDENTITY';
      process.env.LEGAL_WATCHER_AZURE_SCOPE = 'api://adminiculum-backend/.default';
      setManagedIdentityRuntime();
      const config = resolveConfig(parseArgs(['--manifest', 'm.json']));
      expect(config.deliveryMode).toBe('DRY_RUN');
      expect(config.tokenConfig).toBeNull();
    });
  });
});
