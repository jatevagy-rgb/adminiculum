# Production DB Metadata — Read-Access Resolution

Date: 2026-07-22 (updated after operator enabled Entra dual auth)
Branch: `claude/task-attention-migration-audit-1`
Scope: read-only metadata access attempt via the current Azure identity's Entra
token. No app credential, no mutation.

## Timeline

1. **Initial state (prior ticket):** Entra auth Disabled → `ENTRA_ACCESS_BLOCKER`.
2. **Operator action:** the user enabled Entra dual auth via the Azure Portal and
   reported assigning themselves as Entra administrator.
3. **This attempt:** Entra-token TLS connection attempted → **blocked by the
   server firewall** (network). No metadata obtained.

## Current outcome

`PRODUCTION_DB_METADATA_NETWORK_BLOCKER`

The read-only metadata connection could not be established because the client's
egress IP is not in the PostgreSQL server firewall allow-list. The TCP connection
to port 5432 timed out (`ETIMEDOUT`) before any authentication handshake, so the
Entra admin mapping could not even be exercised yet.

## Verified state (read-only control-plane)

| Item | Value |
|---|---|
| `activeDirectoryAuth` | **Enabled** (operator-enabled) |
| `passwordAuth` | **Enabled** (preserved) |
| Server state | Ready |
| Version | PostgreSQL 15 |
| Entra admin via `microsoft-entra-admin list` | **`[]` (empty)** — no admin returned by CLI; possibly Portal→ARM propagation lag; **unverified** because the firewall blocked the connection before auth |
| Public network access | Enabled |
| Firewall allow-list | `allowAzureAppService` (68.210.130.64–68.210.171.1), Azure-services (0.0.0.0), `MyIP` 37.76.11.42, 31.46.244.157, 84.1.28.45 |
| **This client egress IP** | **`37.76.6.18`** — **NOT** in any allow rule |

## Connection attempt (Entra token, TLS)

- Client: `pg` (Node PostgreSQL driver) from the local backend `node_modules`
  (no repository package/lockfile change; no GUI).
- Credential: an **ephemeral** Microsoft Entra OSS-RDBMS access token for
  `hubay.gyula@balintfy.onmicrosoft.com`, held only in a process env var, **never**
  printed, logged, written to disk, or committed; unset immediately after the run.
- SSL: required (TLS).
- Result: `ETIMEDOUT` to `…:5432` — firewall drop (not an auth error).
- Read-only safety: the session was designed to `SET default_transaction_read_only
  = on` + `BEGIN TRANSACTION READ ONLY` and verify `transaction_read_only = on`
  before any query; **the connection never opened**, so no query ran.

## Metadata result

**None obtained.** No server/db identity, migration head, enum, `tasks` columns,
indexes, or size were read. **No Task content was accessed. No mutation occurred.**

## Remaining blocker & next step (requires separate approval)

The only barrier is a **network firewall allow rule** for this client's egress IP.
Changing production firewall rules requires separate approval, so it was **not**
performed here. To unblock, an operator can add the IP (Portal or CLI):

```
az postgres flexible-server firewall-rule create \
  --resource-group Adminiculum-RG --name adminiculum \
  --rule-name metadata-audit-client --start-ip-address 37.76.6.18 --end-ip-address 37.76.6.18
```
(The egress IP may change between sessions — confirm the current value first.)

After the rule exists, the same read-only Entra-token inspection can be retried in
one attempt. If the Entra admin list is still empty at that point, the admin
mapping itself must be re-checked (it could not be tested through the firewall).

## Migration audit status

Remains `TASK_ATTENTION_MIGRATION_METADATA_BLOCKER` / `…_METADATA_INCOMPLETE` — the
live enum/columns/indexes/head are still unconfirmed pending the firewall allow
rule.
