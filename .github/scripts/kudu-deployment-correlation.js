'use strict';

const ACTIVE_STATUSES = new Set([0, 1, 2]);

function deploymentTime(deployment) {
  const value = deployment.start_time || deployment.startTime;
  const time = Date.parse(value || '');
  return Number.isFinite(time) ? time : null;
}

function containsSha(deployment, sha) {
  const text = [
    deployment.message,
    deployment.author,
    deployment.author_email,
    deployment.id,
  ]
    .filter((value) => typeof value === 'string')
    .join(' ');
  const matches = text.match(/[0-9a-f]{40}/gi) || [];
  return matches.length === 0 ? null : matches.some((value) => value.toLowerCase() === sha.toLowerCase());
}

function selectDeploymentCandidate({ before, after, requestStartedAt, expectedSha }) {
  const beforeIds = new Set(before.map((deployment) => deployment.id));
  const candidates = after.filter((deployment) => {
    if (!deployment.id || beforeIds.has(deployment.id)) return false;
    const startedAt = deploymentTime(deployment);
    return startedAt !== null && startedAt >= requestStartedAt;
  });

  if (candidates.length !== 1) {
    return { outcome: candidates.length === 0 ? 'none' : 'ambiguous' };
  }

  const [candidate] = candidates;
  const shaMatch = containsSha(candidate, expectedSha);
  if (shaMatch === false) return { outcome: 'wrong-identity' };

  const concurrent = after.some((deployment) => (
    deployment.id !== candidate.id && ACTIVE_STATUSES.has(Number(deployment.status))
  ));
  if (concurrent) return { outcome: 'ambiguous' };

  if (Number(candidate.status) === 3) {
    return { outcome: 'failed', id: candidate.id };
  }
  if (Number(candidate.status) !== 4 || candidate.complete !== true) {
    return { outcome: 'active', id: candidate.id };
  }

  return { outcome: 'success', id: candidate.id };
}

module.exports = { selectDeploymentCandidate };

if (require.main === module) {
  const fs = require('fs');
  const [beforePath, afterPath, requestStartedAt, expectedSha] = process.argv.slice(2);
  const before = JSON.parse(fs.readFileSync(beforePath, 'utf8'));
  const after = JSON.parse(fs.readFileSync(afterPath, 'utf8'));
  const result = selectDeploymentCandidate({
    before,
    after,
    requestStartedAt: Number(requestStartedAt),
    expectedSha,
  });
  process.stdout.write(JSON.stringify(result));
  process.exit(result.outcome === 'success' ? 0 : 1);
}
