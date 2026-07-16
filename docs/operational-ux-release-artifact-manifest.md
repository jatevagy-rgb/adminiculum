# Operational UX Release Artifact Manifest

## Provenance

| Item | Value |
| --- | --- |
| Reviewed commit | `01949dc83e1267e8ded33282ff86326f027e94ec` |
| Source branch | `codex/operational-ux-review-1` |
| Production reference | `e447168f54b24aeca1da512a3b06a7dfb97e1f04` |
| Artifact model | Oryx/source ZIP |
| Deployment performed | No |

## Frontend Artifact

Path:

`C:\Users\hubay\AppData\Local\Temp\adminiculum-operational-ux-release\adminiculum-frontend-operational-ux-01949dc.zip`

SHA-256:

`e06fa54b9f47b09bc211580b2f5940bd324a19ee1dfbdd5e8d829c4a11472ccd`

Size: `2,400,525` bytes.

Files: `117`.

Included:

- frontend source;
- `public`;
- package files;
- Next/Tailwind/TypeScript config;
- production bundle env guard;
- `release-manifest.json`.

Excluded:

- `.next`;
- `node_modules`;
- `.env*`;
- Dockerfile;
- docs/Markdown;
- tests;
- backend;
- screenshots;
- audit outputs;
- ZIP files.

Extracted validation:

- `npm ci`: passed.
- production-env `npm run build`: passed.
- `npm run verify:prod-env`: passed.
- `next start -p 3100`: passed.
- 15/15 route smoke checks returned `200`.

The built `.next` output contains the production backend URL and no forbidden localhost API/auth target.

## Backend Artifact

Path:

`C:\Users\hubay\AppData\Local\Temp\adminiculum-operational-ux-release\adminiculum-backend-operational-ux-01949dc.zip`

SHA-256:

`06ab76abbee94f488037cd8e34490eb81d1ada4735d7164e2821def22735e753`

Size: `955,178` bytes.

Files: `143`.

Included:

- backend `src`;
- package files;
- TypeScript config;
- Prisma schema and unchanged tracked migration history;
- tracked contract templates;
- runtime OpenAPI YAML required by current startup code;
- `release-manifest.json`.

Excluded:

- frontend;
- `.env*`;
- Dockerfile;
- docs/Markdown;
- tests and Jest config;
- operational/helper scripts;
- seed helper files;
- audit outputs;
- ZIP files.

Extracted validation:

- `npm ci`: passed.
- `npm run build`: passed.
- local process-only start with unreachable dummy DB URL: passed.
- `GET /health`: `200`.
- unauthenticated communications: `401`.
- unauthenticated case workflow summary: `401`.
- no database query or mutation was required for smoke.

## Content Audit

| Check | Frontend | Backend |
| --- | --- | --- |
| Env files | 0 | 0 |
| Test files/directories | 0 | 0 |
| Markdown docs | 0 | 0 |
| Opposite component | 0 | 0 |
| Embedded manifest | yes | yes |
| Root package file | yes | yes |
| Local `.next` | 0 | n/a |
| Operational scripts | n/a | 0 |
| Seed helpers | n/a | 0 |
| Potential private-key/client-secret literal | 0 | 0 |
| Local PostgreSQL/file DB URL | 0 | 0 |

The frontend source ZIP contains intentional source-only `localhost` references in:

- `scripts/assert-production-bundle-env.js`, where they are forbidden-pattern rules;
- `AppProviders.tsx` and `AuthenticatedApp.tsx`, for local development behavior;
- `StitchLayout.tsx`, in a development placeholder;
- `api.ts`, in a comment/example.

These are not baked production API targets. The extracted production build passed `verify:prod-env`, and the expected production backend URL appeared in the runtime bundle.

The backend source retains existing development server/CORS/OpenAPI/redirect defaults. None changed relative to `e447168`, no local database connection string is present, and the protected OpenAPI/CORS/auth zero-diff gates are zero.

## Machine-Readable Evidence

Outside-repository files:

- `C:\Users\hubay\AppData\Local\Temp\adminiculum-operational-ux-release\artifact-hashes.json`
- `C:\Users\hubay\AppData\Local\Temp\adminiculum-operational-ux-release\artifact-file-inventory.json`
- `C:\Users\hubay\AppData\Local\Temp\adminiculum-operational-ux-release\frontend-artifact-route-smoke.json`
- `C:\Users\hubay\AppData\Local\Temp\adminiculum-operational-ux-release\backend-artifact-route-smoke.json`

## Deployment Status

Not deployed. No Azure command was run.
