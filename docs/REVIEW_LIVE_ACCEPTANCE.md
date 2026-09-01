# Review Live Acceptance Harness

Deterministic operator-facing harness to validate deployed production release identities and fail-closed public boundaries.

---

## 1. Quick Start

### Direct Execution with CLI Flags

```bash
node scripts/review-live-acceptance.mjs \
  --backend-url https://<backend-app>.azurewebsites.net \
  --frontend-url https://<frontend-app>.azurewebsites.net \
  --expected-sha <canonical-40-char-git-sha> \
  [--scanner-url https://<scanner-app>.azurewebsites.net]
```

### Execution via Environment Variables

```bash
export BACKEND_BASE_URL="https://<backend-app>.azurewebsites.net"
export FRONTEND_BASE_URL="https://<frontend-app>.azurewebsites.net"
export EXPECTED_SHA="<canonical-40-char-git-sha>"
export SCANNER_HEALTH_URL="https://<scanner-app>.azurewebsites.net" # optional

node scripts/review-live-acceptance.mjs
```

---

## 2. Environment Variables & Options

| Variable / Flag | Required | Purpose |
|-----------------|----------|---------|
| `BACKEND_BASE_URL` / `--backend-url` | **YES** | Backend base URL (probes `/health`, `/health/version`, `/api/v1/*`) |
| `FRONTEND_BASE_URL` / `--frontend-url` | **YES** | Frontend base URL (probes `/api/release-identity`) |
| `EXPECTED_SHA` / `--expected-sha` | **YES** | 40-character canonical Git commit SHA for this release |
| `SCANNER_HEALTH_URL` / `--scanner-url` | Optional | Malware scanner URL (probes `/health/ready`). If omitted, reports `SKIPPED (UNPROVABLE)` |
| `ACCEPTANCE_TIMEOUT_MS` / `--timeout` | Optional | HTTP request timeout in ms (default: `10000`) |

---

## 3. Expected Output

### Success (All Gates Passed)

```text
EXPECTED_SHA=4bfb3071a12a296fe385c1e8aff8e50b40a70d7d
BACKEND_SHA=4bfb3071a12a296fe385c1e8aff8e50b40a70d7d
FRONTEND_SHA=4bfb3071a12a296fe385c1e8aff8e50b40a70d7d

BACKEND_HEALTH=PASS
BACKEND_RELEASE_IDENTITY=PASS
FRONTEND_RELEASE_IDENTITY=PASS
CANONICAL_DEPLOYED_EQUALITY=PASS

AUTH_GATE=PASS
SCANNER_HEALTH=SKIPPED (UNPROVABLE: SCANNER_HEALTH_URL not provided)

PUBLIC_ACCEPTANCE_PASS=YES
```

Exit code: `0`

---

## 4. Failure Examples

### SHA Mismatch Example

```text
EXPECTED_SHA=4bfb3071a12a296fe385c1e8aff8e50b40a70d7d
BACKEND_SHA=4bfb3071a12a296fe385c1e8aff8e50b40a70d7d
FRONTEND_SHA=215b31a56e28bfc30a94b916d426e25d62cf75da

BACKEND_HEALTH=PASS
BACKEND_RELEASE_IDENTITY=PASS
FRONTEND_RELEASE_IDENTITY=PASS
CANONICAL_DEPLOYED_EQUALITY=FAIL

AUTH_GATE=PASS
SCANNER_HEALTH=SKIPPED (UNPROVABLE: SCANNER_HEALTH_URL not provided)

PUBLIC_ACCEPTANCE_PASS=NO

--- FAILURE DETAILS ---
- SHA mismatch between backend (4bfb3071a12a296fe385c1e8aff8e50b40a70d7d) and frontend (215b31a56e28bfc30a94b916d426e25d62cf75da).
```

Exit code: `1`

### Auth Gate Violation Example

```text
EXPECTED_SHA=4bfb3071a12a296fe385c1e8aff8e50b40a70d7d
BACKEND_SHA=4bfb3071a12a296fe385c1e8aff8e50b40a70d7d
FRONTEND_SHA=4bfb3071a12a296fe385c1e8aff8e50b40a70d7d

BACKEND_HEALTH=PASS
BACKEND_RELEASE_IDENTITY=PASS
FRONTEND_RELEASE_IDENTITY=PASS
CANONICAL_DEPLOYED_EQUALITY=PASS

AUTH_GATE=FAIL
SCANNER_HEALTH=SKIPPED (UNPROVABLE: SCANNER_HEALTH_URL not provided)

PUBLIC_ACCEPTANCE_PASS=NO

--- FAILURE DETAILS ---
- SECURITY VIOLATION: Protected endpoint /api/v1/cases returned HTTP 200 without credentials.
```

Exit code: `1`

---

## 5. Scope & Manual Gates

The public acceptance harness verifies **publicly verifiable release identities, health, auth gate fail-closed behavior, and scanner readiness**.

The following capabilities require authenticated access or explicit operations and remain **separate authenticated/manual acceptance steps**:
- **Authenticated workforce journey**: Login with Azure/MSAL workforce account and create/view cases.
- **SharePoint integration**: Live document upload, download, and virus scan quarantine validation.
- **EICAR malware rejection**: Live upload of EICAR test string to verify rejection by scanner.
- **Database migration state**: Validated via migration replay CI gates and WebJob deployment logs.
- **Client portal publication**: Explicit portal publication actions and client access tokens.
