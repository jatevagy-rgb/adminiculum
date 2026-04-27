# PACK MANIFEST: Generation Draft

**Version:** v1.0.0
**Status:** ACTIVE
**Core dependency:** v1.x.x minimum

---

## Feature Flag

`ENABLE_GENERATION_DRAFT` — default: `false`

Set to `true` to activate persisted draft storage for contract generation.

---

## Route Prefix

`/api/v1/generation-drafts/`

---

## Primary Endpoints

| Method | Path | Feature Flag Required |
|--------|------|---------------------|
| GET | `/api/v1/generation-drafts/:caseId` | ✅ |
| GET | `/api/v1/generation-drafts/:caseId?templateId=xxx` | ✅ |
| PUT | `/api/v1/generation-drafts/:caseId` | ✅ |
| DELETE | `/api/v1/generation-drafts/:caseId` | ✅ |
| DELETE | `/api/v1/generation-drafts/:caseId?templateId=xxx` | ✅ |

---

## Prisma Models

- `GenerationDraft` — Persisted draft data for contract generation (caseId + templateId + form state JSON)

---

## Env Vars

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ENABLE_GENERATION_DRAFT` | Yes (to enable) | `false` | Enable/disable the pack |

---

## Disable Behavior

When `ENABLE_GENERATION_DRAFT != 'true'`, all routes at `/api/v1/generation-drafts/` return:

```json
{
  "error": "Not Implemented",
  "message": "Generation Draft feature is disabled. Set ENABLE_GENERATION_DRAFT=true to enable."
}
```

HTTP status: `501 Not Implemented`

---

## Replaceable Inner Implementation

**Yes.** The inner implementation (Prisma persistence, form-state JSON storage) can be replaced with an alternative storage backend (e.g., Redis, SharePoint document metadata) without changing the outer contract.

The outer contract (route prefix, flag name, `GenerationDraft` model shape) is the permanent API surface.

---

## Clean Removal

To remove this pack cleanly:
1. Set `ENABLE_GENERATION_DRAFT=false`
2. The `GenerationDraft` model remains in `schema.prisma` but becomes inert

---

## Current Status

**ACTIVE** — in production use.

---

## Standards Compliance

| Rule | Status |
|------|--------|
| `ENABLE_<FEATURE>` flag in env.example | ✅ |
| Guard middleware | ✅ |
| Returns `501` when disabled | ✅ |
| Route prefix `/api/v1/generation-drafts/` | ✅ |
| Prisma models with OPTIONAL PACK comment | ✅ |
| `PACK_MANIFEST.md` present | ✅ (added Phase 4A) |

---

## Changelog

- **v1.0.0** — Initial active status
- **Phase 4A** — Added this manifest
