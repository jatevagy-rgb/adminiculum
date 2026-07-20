# Client Color Performance Review

- Communications add at most one batched `Client.findMany` for the page's distinct `clientId` values.
- Unassigned-only pages skip that query.
- Review queue/detail extend existing selects; query count is unchanged.
- Dashboard introduces no API call and reuses already loaded cases/tasks/communications.
- Notifications perform no client query.
- Pagination and communication limits remain server-driven.

No per-row request, client preload waterfall, or N+1 lookup was introduced.
