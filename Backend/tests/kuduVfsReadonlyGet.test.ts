import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Deterministic behavior test for Backend/scripts/kudu-vfs-readonly-get.sh.
// curl is stubbed via a PATH-prefixed fake that replays a scripted scenario
// (one line per invocation: "exit:<rc>" transport failure, or "http:<code>").

const repoRoot = path.resolve(__dirname, '..', '..');
const helperPath = path.join(repoRoot, 'Backend', 'scripts', 'kudu-vfs-readonly-get.sh');

function runHelper(scenario: string[]) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kudu-vfs-test-'));
  const bin = path.join(dir, 'bin');
  fs.mkdirSync(bin);
  const scenarioFile = path.join(dir, 'scenario');
  const countFile = path.join(dir, 'count');
  const outFile = path.join(dir, 'out');
  fs.writeFileSync(scenarioFile, scenario.join('\n') + '\n');

  const fakeCurl = `#!/usr/bin/env bash
n=$(cat "$COUNT_FILE" 2>/dev/null || echo 0); n=$((n+1)); echo "$n" > "$COUNT_FILE"
line=$(sed -n "\${n}p" "$SCENARIO_FILE")
out=""
while [ $# -gt 0 ]; do
  case "$1" in -o) out="$2"; shift 2 ;; *) shift ;; esac
done
case "$line" in
  exit:*) rc="\${line#exit:}"; echo "curl: ($rc) fake transport failure" >&2; exit "$rc" ;;
  http:*) code="\${line#http:}"; printf 'remote-body' > "$out"; printf '%s' "$code"; exit 0 ;;
  *) exit 9 ;;
esac
`;
  fs.writeFileSync(path.join(bin, 'curl'), fakeCurl.replaceAll('$COUNT_FILE', countFile).replaceAll('$SCENARIO_FILE', scenarioFile));
  fs.chmodSync(path.join(bin, 'curl'), 0o755);

  const result = spawnSync('bash', [helperPath, 'https://app.scm.azurewebsites.net/api/vfs/site/wwwroot/prisma/migrations/x/migration.sql', outFile], {
    env: {
      ...process.env,
      PATH: `${bin}${path.delimiter}${process.env.PATH}`,
      KUDU_READ_TOKEN: 'test-token',
      KUDU_VFS_BACKOFF_SECONDS: '0 0 0',
    },
    encoding: 'utf8',
  });
  const attempts = fs.existsSync(countFile) ? Number(fs.readFileSync(countFile, 'utf8').trim()) : 0;
  const body = fs.existsSync(outFile) ? fs.readFileSync(outFile, 'utf8') : null;
  fs.rmSync(dir, { recursive: true, force: true });
  return { ...result, attempts, body };
}

describe('kudu-vfs-readonly-get.sh behavior', () => {
  it('retries a curl transport failure and returns the recovered 200 + body', () => {
    const r = runHelper(['exit:7', 'http:200']);
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe('200');
    expect(r.attempts).toBe(2);
    expect(r.stderr).toContain('KUDU_VFS_TRANSPORT_RETRY');
    expect(r.stderr).toContain('KUDU_VFS_READ_ATTEMPTS=2');
    expect(r.body).toBe('remote-body');
  });

  it('fails closed after bounded transport exhaustion (max 4 attempts)', () => {
    const r = runHelper(['exit:7', 'exit:7', 'exit:7', 'exit:7']);
    expect(r.status).toBe(1);
    expect(r.stdout.trim()).toBe('');
    expect(r.attempts).toBe(4);
    expect(r.stderr).toContain('KUDU_VFS_TRANSPORT_EXHAUSTED=YES');
    expect(r.stderr).toContain('KUDU_VFS_READ_ATTEMPTS=4');
    expect(r.body).toBeNull();
  });

  it('does not retry a confirmed HTTP 404 — returns it once for caller classification', () => {
    const r = runHelper(['http:404']);
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe('404');
    expect(r.attempts).toBe(1);
    expect(r.stderr).toContain('KUDU_VFS_HTTP_404_CONFIRMED=YES');
  });

  it('retries retryable HTTP statuses (5xx/429/408) then returns final status', () => {
    const r = runHelper(['http:503', 'http:429', 'http:200']);
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe('200');
    expect(r.attempts).toBe(3);
    expect(r.stderr.match(/KUDU_VFS_TRANSIENT_HTTP_RETRY/g)).toHaveLength(2);
    expect(r.body).toBe('remote-body');
  });

  it('does not retry authorization failures (401/403)', () => {
    for (const code of ['401', '403']) {
      const r = runHelper([`http:${code}`]);
      expect(r.status).toBe(0);
      expect(r.stdout.trim()).toBe(code);
      expect(r.attempts).toBe(1);
      expect(r.stderr).toContain('KUDU_VFS_AUTH_FAILURE=YES');
      expect(r.stderr).not.toContain('missing');
    }
  });

  it('an exhausted 5xx still returns the real status, never a fabricated code', () => {
    const r = runHelper(['http:500', 'http:502', 'http:503', 'http:500']);
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe('500');
    expect(r.attempts).toBe(4);
    expect(r.stderr).toContain('KUDU_VFS_TRANSIENT_HTTP_EXHAUSTED=YES');
  });
});
