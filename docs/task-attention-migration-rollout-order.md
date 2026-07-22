# Task Attention Migration — Backend Compatibility & Rollout Order (Phase 13)

Date: 2026-07-22

## Compatibility matrix

| Case | Backend | Schema | Safe? | Why |
|---|---|---|---|---|
| A | old (no fields) | old (no columns) | ✅ | current production baseline |
| B | old (no fields) | **new (columns present)** | ✅ | additive nullable columns; old backend never selects/writes them; Prisma old client ignores unknown DB columns on explicit selects |
| C | new, **not reading** fields | new | ✅ | candidate backend built with the fields in the client but no runtime path reads/writes them |
| D | future, **reading** fields | new | ✅ | fields exist in DB → reads/writes succeed |
| E | future, **reading** fields | **old (no columns)** | ❌ | selecting/writing `attentionCategory`/`estimatedMinutes` against a table lacking them → SQL error |

Expected: **B safe, E unsafe** — confirmed.

## Safe rollout order

1. **Additive migration** (columns [+ optional/deferred index]) against the
   current production head.
2. **Verify** columns/index/enum + `_prisma_migrations` record (metadata read).
3. **Backend runtime rollout** (the field-reading API — a later slice) — only
   after the schema is confirmed present, so case E never occurs.
4. **Frontend rollout** (Task form, Tasks badges/filter, Dashboard workload
   block) — after the backend serves the fields.

Rationale: schema-first guarantees every backend/frontend state is B/C/D (all
safe) and never E. Additive+nullable means step 1 is safe with the **current**
backend already running (case B) — no coordinated downtime.

## Rollback direction

Reverse: if a later backend reads the fields, roll back the **backend** first,
then (only if required) the schema — never drop columns while a field-reading
backend is live (that would create case E).

## No deployment here

This ticket performs none of steps 1–4. It documents the exact ordering for the
future approved execution + rollout tickets.
