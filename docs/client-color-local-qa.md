# Client Color Local QA

Environment: authenticated localhost frontend/backend with a disposable localhost PostgreSQL database and synthetic data only.

## Synthetic Matrix

- four clients: red, blue, green, and neutral;
- one case per client;
- one task per case;
- multiple case/task status values to keep lifecycle semantics visible.

No production, Azure, shared database, external provider, or real client data was accessed.

## Browser Flow

1. Clients loaded with four distinct/neutral cards.
2. One client changed from `RED` to `PURPLE` through the radio selector.
3. Save completed through the normal authenticated API.
4. Page refresh retained `Lila`.
5. Cases displayed the same purple accent from the related client.
6. Tasks displayed the same purple accent through case/client inheritance.
7. The client was cleared to `null`.
8. Refresh retained the neutral state on Clients, Cases, and Tasks.

No console error and no page-level horizontal overflow was observed.
