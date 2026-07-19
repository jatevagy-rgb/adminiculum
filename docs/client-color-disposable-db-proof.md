# Client Color Disposable Database Proof

Date: 2026-07-19
Target: localhost-only disposable PostgreSQL
Production targeted: no

## Migration Proof

A release-base schema was created in a disposable local database, then only `20260719120000_add_client_color_key/migration.sql` was applied.

Observed:

- all ten enum values present;
- `clients.colorKey` exists with PostgreSQL type `ClientColorKey`;
- column is nullable;
- a pre-migration client remained `null` after apply;
- invalid enum input was rejected;
- no backfill occurred.

## Persistence And Inheritance Proof

Synthetic relation chain:

`Client -> Case -> Task`

Observed through authenticated UI/API reads:

- initial client accent inherited by case and task;
- `RED -> PURPLE` persisted after refresh and propagated to both lists;
- clearing to `null` persisted after refresh and returned neutral accents on all three surfaces.

The disposable database was dropped after QA. No migration command targeted production, and no database credential was printed or committed.
