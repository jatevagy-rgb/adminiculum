# PACK MANIFEST: Contract Generation

**Version:** v1.0.0
**Status:** ACTIVE
**Core dependency:** v1.x.x minimum

---

## Feature Flag

`ENABLE_CONTRACT_GENERATION` — default: `false`

Set to `true` to activate contract generation features.

---

## Route Prefix

`/api/v1/contracts/`

---

## Primary Endpoints

| Method | Path | Feature Flag Required |
|--------|------|---------------------|
| GET | `/api/v1/contracts/templates` | ✅ |
| GET | `/api/v1/contracts/templates/:id` | ✅ |
| GET | `/api/v1/contracts/templates/adasvetel/variables` | ✅ |
| POST | `/api/v1/contracts/templates` | ✅ |
| POST | `/api/v1/contracts/generate` | ✅ |
| POST | `/api/v1/contracts/preview` | ✅ |
| GET | `/api/v1/contracts/case/:caseId` | ✅ |
| GET | `/api/v1/contracts/:id/download` | ✅ |
| POST | `/api/v1/contracts/:id/upload-sharepoint` | ✅ |
| POST | `/api/v1/contracts/cleanup` | ✅ (admin) |
| POST | `/api/v1/contracts/:id/finalize` | ✅ |
| POST | `/api/v1/contracts/:id/create-revision` | ✅ |
| GET | `/api/v1/contracts/case/:caseId/bundle-download` | ✅ |
| POST | `/api/v1/contracts/:id/reject-approval` | ✅ |
| POST | `/api/v1/contracts/:id/back-to-review` | ✅ |
| GET | `/api/v1/contracts/:id/timeline` | ✅ |

---

## Prisma Models

- `ContractTemplate` — DOCX template definitions stored in the database
- `ContractGeneration` — Generated contract records with file path, status, and metadata

---

## Env Vars

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ENABLE_CONTRACT_GENERATION` | Yes (to enable) | `false` | Enable/disable the pack |
| `TEMPLATES_PATH` | When enabled | `./templates` | Path to DOCX template files |
| `OUTPUT_DIR` | No | `./output` | Path for generated output |
| `MAX_FILE_SIZE` | No | `52428800` | Max file size in bytes (50MB default) |

---

## Disable Behavior

When `ENABLE_CONTRACT_GENERATION != 'true'`, all routes registered at `/api/v1/contracts/` return:

```json
{
  "error": "Not Implemented",
  "message": "Contract generation is disabled. Set ENABLE_CONTRACT_GENERATION=true to enable."
}
```

HTTP status: `501 Not Implemented`

---

## Replaceable Inner Implementation

**Yes.** The inner implementation (DOCX processing via docxtemplater/pizzip, local file storage, SharePoint upload) can be replaced without changing the outer contract.

The outer contract (route prefix, flag name, `ContractTemplate`/`ContractGeneration` models) is the permanent API surface.

To replace the inner implementation: swap `Backend/src/modules/contracts/services.ts` logic while keeping the same route signatures and Prisma model shapes.

---

## Clean Removal

To remove this pack cleanly:
1. Set `ENABLE_CONTRACT_GENERATION=false`
2. Optionally drop `contract_templates` and `contract_generations` tables via manual SQL
3. The `ContractTemplate` and `ContractGeneration` models remain in `schema.prisma` but become inert (no routes reference them)

**Note:** Schema models cannot be removed via Prisma migrate without a migration. For full removal, a manual SQL migration is needed to drop the tables. This is intentional — protects against accidental data loss.

---

## Current Status

**ACTIVE** — in production use.

---

## Standards Compliance

| Rule | Status |
|------|--------|
| `ENABLE_<FEATURE>` flag in env.example | ✅ |
| Guard middleware (`requireContractsEnabled`) | ✅ |
| Returns `501` when disabled | ✅ (corrected in Phase 4A — was `503`) |
| Route prefix `/api/v1/contracts/` | ✅ |
| Prisma models with OPTIONAL PACK comment | ✅ |
| `PACK_MANIFEST.md` present | ✅ (added Phase 4A) |
| Compatibility Declaration | ✅ (this file) |

---

## Changelog

- **v1.0.0** — Initial active status
- **Phase 4A** — Corrected disabled response from `503` to `501` to match standard; added this manifest

## Editor Capability Endpoint

`GET /api/v1/contracts/editor-template-capabilities` is intentionally mounted before the contracts storage gate so authenticated clients can render a truthful disabled/readiness state. It performs no Prisma query, file read, generation, download, SharePoint call, or audit write.
