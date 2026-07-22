# Task Attention Production Verification

Date: 2026-07-22

Migration: `20260722135148_add_task_attention_category`

## Pre-Migration Metadata

- PostgreSQL: `15.18`.
- Database: `adminiculum`.
- Schema: `public`.
- User context: Microsoft Entra operator principal.
- Pre-apply migration head: `20260719120000_add_client_color_key`.
- `ReviewAttentionLevel` existed with:
  - `QUICK_SCAN`
  - `APPROVAL`
  - `SIGNATURE`
  - `EDITING`
  - `DETAILED_REVIEW`
- `tasks.attentionCategory`: absent.
- `tasks.estimatedMinutes`: absent.
- Attention-related indexes: none.
- `tasks` total size: `96 kB`.
- Read-only precheck transaction was rolled back.

## Post-Migration Metadata

`tasks.attentionCategory`:

- `data_type`: `USER-DEFINED`.
- `udt_name`: `ReviewAttentionLevel`.
- Nullable: `YES`.
- Default: none.

`tasks.estimatedMinutes`:

- `data_type`: `integer`.
- `udt_name`: `int4`.
- Nullable: `YES`.
- Default: none.

## Enum State

`ReviewAttentionLevel` remained unchanged:

- `QUICK_SCAN`
- `APPROVAL`
- `SIGNATURE`
- `EDITING`
- `DETAILED_REVIEW`

## Index State

- No attention-category index exists after the migration.
- This matches the first-migration requirement.

## App Health

- Backend `/health`: `200`.
- Frontend root: `200`.
- HTTP route smoke:
  - `/`: `200`.
  - `/tasks`: `200`.
  - `/cases`: `200`.
  - `/reviews`: `200`.

## Browser Smoke

- In-app browser smoke reached the production login shell for `/`, `/tasks`, `/cases`, and `/reviews`.
- No visible `Hitelesítési hiba`.
- No visible `Failed to fetch`.
- Browser console errors observed during this smoke: `0`.
- Authenticated in-browser app shell was not available in the claimed automation tab; route and backend health proof remained green.

## Partial-Application Check

- Both intended columns exist after migration.
- No duplicate migration record exists.
- No attention index exists.
- No enum mutation occurred.
- No rollback was required.
