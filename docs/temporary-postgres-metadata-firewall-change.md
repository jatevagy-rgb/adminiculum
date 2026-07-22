# Temporary PostgreSQL Metadata Firewall Change

Date: 2026-07-22
Branch: `claude/task-attention-migration-audit-1`
Target server: `adminiculum`
Resource group: `Adminiculum-RG`
Database: `adminiculum`

## Executive summary

The approved temporary firewall metadata audit did **not** create a firewall
rule and did **not** connect to PostgreSQL. The run stopped during Entra
administrator proof because both Azure CLI and ARM returned an empty
administrator list.

## Authorized rule

| Item | Value |
|---|---|
| Rule name | `metadata-audit-client-20260722` |
| Intended start IP | `37.76.6.18` |
| Intended end IP | `37.76.6.18` |
| Rule created | No |
| Rule deleted | Not applicable; verified absent |

## Precheck

| Check | Result |
|---|---|
| PostgreSQL server state | Ready |
| Host | `adminiculum.postgres.database.azure.com` |
| PostgreSQL version setting | 15 |
| `activeDirectoryAuth` | Enabled |
| `passwordAuth` | Enabled |
| Tenant | `18b56834-dfea-4931-bdf8-e5ebb0cb4e0f` |
| Current Azure identity | `hubay.gyula@balintfy.onmicrosoft.com` |
| Frontend health | HTTP 200 |
| Backend health | HTTP 200 |
| Current public egress IP | `37.76.6.18` |
| Temporary rule pre-existence | absent |

Pre-existing firewall rules observed:

| Rule | Start IP | End IP |
|---|---:|---:|
| `allowAzureAppService` | `68.210.130.64` | `68.210.171.1` |
| `AllowAllAzureServicesAndResourcesWithinAzureIps_2026-2-17_10-37-15` | `0.0.0.0` | `0.0.0.0` |
| `MyIP` | `37.76.11.42` | `37.76.11.42` |
| `ClientIPAddress_2026-3-14_15-35-24` | `31.46.244.157` | `31.46.244.157` |
| `ClientIPAddress_2026-2-17_9-39-42` | `84.1.28.45` | `84.1.28.45` |

## Entra administrator proof

The required administrator proof failed:

- `az postgres flexible-server microsoft-entra-admin list` returned `[]`;
- ARM `Microsoft.DBforPostgreSQL/flexibleServers/administrators` returned `[]`.

The ticket required stopping if the Entra administrator list was still empty
unless the Portal assignment was independently confirmed. No such independent
Portal proof was available in this run.

## Token and connection handling

- No PostgreSQL token was requested.
- No token was printed, written, logged, or committed.
- No database password or application connection string was used.
- No TLS connection attempt was made.
- No read-only transaction was opened.
- No metadata query was executed.

## Cleanup proof

The temporary firewall rule `metadata-audit-client-20260722` was verified absent
after the stopped run. No firewall rule was created, modified, or deleted.

Post-cleanup state:

- server remained Ready;
- public network access remained Enabled;
- `activeDirectoryAuth` remained Enabled;
- `passwordAuth` remained Enabled;
- frontend health remained HTTP 200;
- backend health remained HTTP 200.

## Data and mutation boundary

No Task rows, legal content, business data, secrets, app settings, schema,
migrations, deployments, or runtime code were read or changed.

## Result

Network/security classification:
`POSTGRES_METADATA_AUTHENTICATION_BLOCKER`

Migration-audit classification:
`TASK_ATTENTION_MIGRATION_METADATA_INCOMPLETE`
