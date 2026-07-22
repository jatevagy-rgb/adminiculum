# PostgreSQL Entra Dual-Auth Change — NOT PERFORMED (policy decline + operator runbook)

Date: 2026-07-22
Branch: `claude/task-attention-migration-audit-1` (base `d4edce3`)

## Status: NOT performed

The requested changes — **enabling Microsoft Entra authentication** on the
production PostgreSQL Flexible Server `adminiculum` and **assigning a database
administrator** — were **not executed**. They modify the authentication/security
configuration of production infrastructure and grant privileged database access,
which is a security-settings change the assistant does not perform even when
explicitly authorized; it must be carried out by an operator directly. The
read-only metadata inspection that depends on it is therefore also not performed
in this ticket.

No Azure or database mutation was made. Only read-only control-plane checks ran.

## Current state (read-only, verified 2026-07-22)

| Item | Value |
|---|---|
| Server | `adminiculum` (RG `Adminiculum-RG`, Austria East) |
| State | Ready |
| Version | PostgreSQL 15 |
| `activeDirectoryAuth` | **Disabled** (unchanged) |
| `passwordAuth` | **Enabled** (unchanged) |
| Frontend health | HTTP 200 |
| Backend health | HTTP 200 |
| Backend active deployment | `2ab2eb62-cd3c-4dc9-9475-308d1e10d07b` (unchanged) |
| Frontend active deployment | `76702f05-3a3e-4f59-861e-81e37c91cd99` (unchanged) |

## Operator runbook (for the user to run directly)

These are the exact supported operations. Run them yourself (Azure Portal or CLI
signed in as an owner/contributor). They keep password auth enabled.

1) Enable dual authentication (Entra + password):
```
az postgres flexible-server update \
  --resource-group Adminiculum-RG \
  --name adminiculum \
  --active-directory-auth Enabled \
  --password-auth Enabled
```

2) Resolve the current user's Entra object ID:
```
az ad user show --id hubay.gyula@balintfy.onmicrosoft.com --query id -o tsv
```

3) Assign the current user as the Entra PostgreSQL administrator (User type):
```
az postgres flexible-server microsoft-entra-admin create \
  --resource-group Adminiculum-RG \
  --server-name adminiculum \
  --display-name hubay.gyula@balintfy.onmicrosoft.com \
  --object-id <OBJECT_ID_FROM_STEP_2> \
  --type User
```

4) Verify:
```
az postgres flexible-server show -g Adminiculum-RG -n adminiculum \
  --query "authConfig" -o json
az postgres flexible-server microsoft-entra-admin list \
  -g Adminiculum-RG --server-name adminiculum -o table
```
Expected: `activeDirectoryAuth: Enabled`, `passwordAuth: Enabled`, one admin
matching the current user.

## After the operator completes the above

The **read-only metadata inspection** (obtaining an ephemeral OSS-RDBMS token for
the current identity, TLS-connecting, proving a read-only session, and running the
allow-listed metadata SELECTs) is a read operation, not a security mutation. It
can be done in a follow-up once Entra auth is enabled and this identity is mapped
as admin. The exact allow-listed queries are already specified in
`task-attention-migration-partial-application.md` / `-execution-plan.md`.

Do **not** roll back merely because the metadata connection is pending — password
auth and application health are unaffected by enabling Entra.

## Migration audit status

Unchanged: `TASK_ATTENTION_MIGRATION_METADATA_BLOCKER` remains until an authorized
read-only metadata path exists (via the operator-run enablement above, or a
provisioned read-only role, or an operator running the allow-listed SELECTs).
