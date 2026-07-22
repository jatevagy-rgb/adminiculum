# Task Attention Migration Firewall Cleanup

Date: 2026-07-22

## Temporary Firewall Rule

- Rule name: `task-attention-migration-client-20260722`.
- Server: `adminiculum`.
- Resource group: `Adminiculum-RG`.
- Allowed public IP: `37.76.6.18`.
- Scope: exact single-IP temporary production PostgreSQL access for the approved migration.

## Pre-Existing Rules

The following rules were present before the temporary rule was created and remained after cleanup:

- `allowAzureAppService`.
- `AllowAllAzureServicesAndResourcesWithinAzureIps_2026-2-17_10-37-15`.
- `MyIP`.
- `ClientIPAddress_2026-3-14_15-35-24`.
- `ClientIPAddress_2026-2-17_9-39-42`.

## Cleanup Result

- Temporary rule deletion succeeded.
- Post-cleanup lookup for `task-attention-migration-client-20260722` returned no rows.
- Server state after cleanup: Ready.
- `activeDirectoryAuth`: Enabled.
- `passwordAuth`: Enabled.

## Token and Environment Cleanup

Post-cleanup environment checks returned unset/false for:

- `PGTOKEN`.
- `PGHOST`.
- `PGDATABASE`.
- `PGUSER`.
- `PGPASSWORD`.
- `DATABASE_URL`.

No credential file was created and no token or connection string was recorded in Git.
