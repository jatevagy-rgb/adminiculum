# Client Color API Contract

## Client DTOs

- List: `colorKey: ClientColorKey | null`.
- Detail: `colorKey: ClientColorKey | null`.
- Create: optional `colorKey`; omitted and `null` are valid.
- Update: optional `colorKey`; `null` clears the configured color.

Allowed values are the ten `ClientColorKey` enum members. Any other value returns HTTP `400` with code `CLIENT_COLOR_INVALID`; values are not silently normalized.

Explicit Prisma selects exclude the legacy arbitrary `color` field.

## Inherited Read DTOs

- Case list/detail: `clientColorKey` is projected from the related `Client.colorKey` in the existing case query.
- User task list: `case.clientColorKey` is projected from `Task.case.client.colorKey` in the existing task query.

No second request per row and no relation payload leak is introduced. The task projection removes the raw nested client relation before returning the DTO.

## Authorization

Existing authentication and client identity manager/read boundaries are unchanged. The color field does not widen access to clients, cases, or tasks.
