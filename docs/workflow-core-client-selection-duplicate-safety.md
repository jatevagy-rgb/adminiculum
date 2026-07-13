# Client Selection & Duplicate Safety (WORKFLOW-CORE-INTAKE-MATTER-OPENING-1)

## Boundary

`GET /api/v1/clients/lookup?q=` — the only duplicate-safety lookup surface. Authenticated;
minimum query length 2 (`QUERY_TOO_SHORT` 400 below); maximum 10 candidates; deterministic
ordering (`name asc, id asc`); explicit scalar `select` only (no relations, no cases, no notes, no
house-style profile, no identity-document content, no raw JSON).

Access model matches the existing client list: identity managers (ADMIN/PARTNER) search all
clients; everyone else searches only clients present on their accessible cases. Users with no
accessible cases receive an empty candidate list without a DB scan.

## Match signals — human review only

| Signal | Source field | Semantics |
| --- | --- | --- |
| `EXACT_EMAIL` | `clients.email` (lowercased equality) | strong hint, still human-reviewed |
| `EXACT_TAX_ID` | `clients.taxNumber` (exact) | strong hint, still human-reviewed |
| `EXACT_REGISTRATION_ID` | `clients.companyRegistrationNumber` (exact) | strong hint, still human-reviewed |
| `SIMILAR_NAME` | `clients.name` contains query (case-insensitive) | **weak hint — never a duplicate label** |

Every candidate carries `warning: "REVIEW_REQUIRED"`. There is no "CONFIRMED_DUPLICATE" state
anywhere in the system. Candidates expose `displayName`, `email`, `phone` only — the tax and
registration identifiers are matched server-side but **not echoed** in the response.

## Rules

1. **A search match is not a duplicate confirmation.** Only a human decides equivalence.
2. **No automatic merge.** There is no merge endpoint; unique-field collision on create → 409
   `CONFLICT` and the user chooses (select existing vs. adjust input).
3. **No duplicate inference from name or e-mail alone.** Signals are displayed; nothing is decided.
4. **No unrelated-case leakage.** Candidates never include case lists or other clients' data.
5. **Client creation stays allow-listed and role-gated** (ADMIN/PARTNER via
   `requireClientIdentityManageAccess`); nested objects and relation writes are ignored; actor ID
   is never taken from the payload.
6. **Client selection does not prove identity verification.** No verification status exists in the
   schema (`identityStatus` is always `null`); the intake UI states this explicitly.

## Tests

`Backend/tests/clientLookup.test.ts` — bounded/deterministic query shape, minimum-length 400,
exact-email/tax signals, SIMILAR_NAME stays review-only, no identifier echo, non-manager access
restriction, empty accessible set, unauthorized create 403, malformed 400, P2002 → 409 with no
merge/update/delete side effect, allow-list creation.
