# Dashboard Operational List Visual Contract

## Authoritative Groups

The UI preserves the backend order and labels for:

- `Határidő közeleg`
- `Nálunk van a következő lépés`
- `Review alatt`
- `Ügyfélre várunk`
- `Nincs meghatározott következő lépés`

No counterparty, authority, or court waiting state is inferred.

## Bounded Presentation

- First pass: one item from each non-empty group.
- Second pass: at most one additional item per group.
- Maximum: six visible cases and two per group.
- The remaining count is computed as actual affected items minus visible items.
- `Nyitott ügyek` remains a quiet link to `/cases`.

## Row Contract

Rows prioritize case title, client/case number, status, responsible person, workflow evidence, deadline/waiting state, and one text action. Raw known case-type suffixes are mapped to Hungarian display labels, including `LITIGATION`, `OTHER`, and `CONTRACT_DRAFTING`; source values remain unchanged.

Client color is a narrow identity rail. Workflow badges and overdue text use separate semantic presentation. Overdue meaning is expressed in text, not color alone.
