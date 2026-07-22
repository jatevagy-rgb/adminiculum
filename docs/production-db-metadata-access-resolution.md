# Production DB Metadata — Read-Access Resolution

Date: 2026-07-22
Branch: `claude/task-attention-migration-audit-1` (base `33aca42`)
Scope: determine whether an authorized, metadata-read-only path to the production
PostgreSQL database exists via the current Azure identity (no app credential).

## Outcome

**Entra (Azure AD) authentication is DISABLED on the production PostgreSQL
server.** The authorized path (current Azure identity → Entra access token → TLS
connection → metadata SELECTs) is architecturally closed. The only enabled
authentication is password auth, which requires the backend application's
database credential — explicitly out of scope for this ticket. **No authorized
read-only metadata connection could be established.**

Classification: `PRODUCTION_DB_METADATA_ENTRA_ACCESS_BLOCKER`.

## Phase 1 — Preflight (control-plane reads only)

| Item | Value |
|---|---|
| Azure identity | `hubay.gyula@balintfy.onmicrosoft.com` (type: **user**) |
| Tenant | `18b56834-dfea-4931-bdf8-e5ebb0cb4e0f` |
| Subscription | `6663573b-fcf7-497d-b2f5-c3498f4b019d` ("Azure subscription 1") |
| PostgreSQL flexible server | `adminiculum` (RG `Adminiculum-RG`) |
| FQDN | `adminiculum.postgres.database.azure.com` |
| Version | PostgreSQL **15** |
| State | Ready |
| Public network access | Enabled |
| **`authConfig.activeDirectoryAuth`** | **Disabled** |
| `authConfig.passwordAuth` | Enabled |
| `authConfig.tenantId` | null |
| `microsoft-entra-admin list` | `Bad Request` (invalid while AD auth is disabled) → no mapped Entra principal |

Only Azure control-plane read operations were used
(`az account show`, `az postgres flexible-server list/show`,
`az postgres flexible-server microsoft-entra-admin list`). No App Service
application settings or connection strings were read.

## Why the attempt stopped at Phase 1

The server returns `activeDirectoryAuth: Disabled`. An Azure/Entra access token
(Phase 3) cannot authenticate to a server that does not accept Entra auth, so:
- **Phase 3 (token)** was **not** performed — a token would be useless and there
  is no reason to materialize a credential that cannot connect.
- **Phase 4 (connection)** was **not** attempted — it could only succeed via the
  prohibited application password.
- **Phase 2 (client install)** was **not** performed — no authorized connection
  is possible, so no PostgreSQL client was needed or installed.

Enabling Entra auth or adding an Entra admin would be an **Azure mutation**
(prohibited by this ticket). Using the application DB credential is **prohibited**.

## Result classification (Phase 6)

Outcome **C** — "Entra authentication is unavailable or current identity is not
mapped. Do not use application credentials." →
`PRODUCTION_DB_METADATA_ENTRA_ACCESS_BLOCKER`.

## Security & cleanup (Phase 7)

- No database connection was opened.
- No Entra/PostgreSQL token was requested or written to disk, logs, source, or Git.
- No temporary credential files were created (none to delete).
- No Azure resource, server setting, DB role, or permission was changed.
- No App Service secret or connection string was read.
- Git worktrees remain clean.

## Metadata result

None obtainable via an authorized path. The metadata queries in
`task-attention-migration-*` (enum, `tasks` columns/indexes, `_prisma_migrations`
head, size) remain **unconfirmed** by a live read.

## Remaining blocker / paths forward (require separate explicit authorization)

To unblock the migration metadata audit, one of the following must be arranged
under a separate approved ticket — none performed here:
1. **Enable Microsoft Entra authentication** on the `adminiculum` server and map
   a read-only principal for the current identity (an Azure control-plane
   change).
2. Provision a **dedicated read-only PostgreSQL role** and supply its credential
   through an authorized channel (not the application credential).
3. Run the allow-listed metadata SELECTs from an already-authorized operator
   session and hand back the results.

Until then the migration audit stays at `TASK_ATTENTION_MIGRATION_METADATA_BLOCKER`.
