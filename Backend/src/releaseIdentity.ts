import fs from 'node:fs';
import path from 'node:path';

type ReleaseIdentity = {
  commitSha: string;
  buildTime: string;
};

const SHA_PATTERN = /^[0-9a-f]{40}$/i;

function readReleaseIdentity(): ReleaseIdentity | null {
  const filePath = path.resolve(process.cwd(), 'release-identity.json');

  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !('commitSha' in parsed) ||
      !('buildTime' in parsed) ||
      typeof parsed.commitSha !== 'string' ||
      typeof parsed.buildTime !== 'string' ||
      !SHA_PATTERN.test(parsed.commitSha) ||
      Number.isNaN(Date.parse(parsed.buildTime))
    ) {
      return null;
    }

    return { commitSha: parsed.commitSha, buildTime: parsed.buildTime };
  } catch {
    return null;
  }
}

export function loadReleaseIdentity(): ReleaseIdentity | null {
  const identity = readReleaseIdentity();
  if (!identity) {
    return null;
  }

  process.env.APP_COMMIT_SHA = identity.commitSha;
  process.env.APP_BUILD_TIME = identity.buildTime;
  return identity;
}
