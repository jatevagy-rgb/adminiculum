# T3A hourly rates

Privileged internal master data only. All routes require the existing authenticated
ADMIN/PARTNER role guard and an active persisted ADMIN/PARTNER user. Ordinary time
viewers and portal users receive no rate data or management permission.

## API

`GET /api/v1/hourly-rates/clients/:clientId?workDate=YYYY-MM-DD`

`GET /api/v1/hourly-rates/clients/:clientId/cases/:caseId?workDate=YYYY-MM-DD`

Both return the effective rate, its provenance, the next scheduled effective state
and the scope's append-only history. Omitted date means today's Budapest date.
Amounts are fixed-four-place decimal strings, never JSON numbers. Unresolved is
explicit (`status/scope=UNRESOLVED`, null amount/version/date).

POST to the same resource appends `{ effectiveFrom, currency: "HUF", mode,
hourlyRate }`. Explicit rates accept positive strings with up to 15 integral and
4 fractional digits. Case-only `INHERIT_CLIENT` takes a null/omitted amount.
Unknown fields, invalid days, non-HUF currency, numeric amounts and past effective
dates are rejected. There is no PUT, PATCH or DELETE. Duplicate scope/date is 409.
Future mistakes cannot be silently overwritten; schedule a later version.

## Semantics and preservation

The resolver accepts a TimeEntry's Date (converted to its Budapest calendar day)
or an explicit calendar date. Latest applicable explicit case rate wins. An
inheritance row/no case row resolves the latest applicable client rate. No
applicable client rate means unresolved. Current defaults never reprice past work.
The normal API intentionally cannot initialize a past rate retroactively; such
work stays unresolved until a separately authorized future billing-review decision.

SQL partial indexes enforce uniqueness for NULL client scopes and concrete case
scopes. SQL checks enforce HUF, positivity and valid inheritance combinations.
Database triggers forbid editing/deleting history and inconsistent case ownership.
Foreign keys retain referenced identities: deleting a client/case/author with rate
history or moving a rate-bearing case to another client is restricted. Ordinary
name/title edits and TimeEntry CRUD remain unchanged. No existing pending migration,
TimeEntry, requester, Department, OrganizationGroup, report or hours-preparation
logic changes. Money estimates require T3B; T4 overrides are not implemented here.

## Technical validation

After canonical local migration replay, set HOURLY_RATE_TEST_DATABASE_URL and
DATABASE_URL to the same disposable loopback `adminiculum_replay*` PostgreSQL DB:

`npx jest --runInBand tests/hourlyRates.test.ts tests/hourlyRates.integration.test.ts`

The integration suite can also use MIGRATION_REPLAY_DATABASE_URL. It refuses a
remote/non-disposable database. Data remains in the disposable test DB because
the production append-only guard is intentionally not bypassed by test cleanup.
CI workflow files are outside this slice; without an explicit integration DB URL
the PostgreSQL suite is skipped, not reported as database proof.

For Windows worktrees where Jest's rootDir glob mixes path separators, the local
command may add `--testMatch '**/tests/**/*.test.ts' --runTestsByPath`. The canonical
Jest configuration is unchanged.

Frontend technical tests: `node --import tsx --test tests/hourlyRates.test.ts`.
LIVE appearance, interaction and functionality acceptance belongs to the user.
