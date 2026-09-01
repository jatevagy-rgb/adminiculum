import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { loadReleaseIdentity } from '../src/releaseIdentity';

describe('release identity loader', () => {
  const originalCwd = process.cwd();
  const originalCommitSha = process.env.APP_COMMIT_SHA;
  const originalBuildTime = process.env.APP_BUILD_TIME;
  let directory: string;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'adminiculum-release-identity-'));
    process.chdir(directory);
    delete process.env.APP_COMMIT_SHA;
    delete process.env.APP_BUILD_TIME;
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(directory, { recursive: true, force: true });
    if (originalCommitSha === undefined) delete process.env.APP_COMMIT_SHA;
    else process.env.APP_COMMIT_SHA = originalCommitSha;
    if (originalBuildTime === undefined) delete process.env.APP_BUILD_TIME;
    else process.env.APP_BUILD_TIME = originalBuildTime;
  });

  it('loads the exact artifact identity into runtime metadata', () => {
    fs.writeFileSync(
      path.join(directory, 'release-identity.json'),
      JSON.stringify({
        commitSha: 'a'.repeat(40),
        buildTime: '2026-08-26T10:00:00.000Z',
      })
    );

    expect(loadReleaseIdentity()).toEqual({
      commitSha: 'a'.repeat(40),
      buildTime: '2026-08-26T10:00:00.000Z',
    });
    expect(process.env.APP_COMMIT_SHA).toBe('a'.repeat(40));
    expect(process.env.APP_BUILD_TIME).toBe('2026-08-26T10:00:00.000Z');
  });

  it('returns no identity for missing or invalid metadata without inventing a SHA', () => {
    fs.writeFileSync(
      path.join(directory, 'release-identity.json'),
      JSON.stringify({ commitSha: 'release/editor-ops-workflow-1', buildTime: 'unknown' })
    );

    expect(loadReleaseIdentity()).toBeNull();
    expect(process.env.APP_COMMIT_SHA).toBeUndefined();
    expect(process.env.APP_BUILD_TIME).toBeUndefined();
  });
});
