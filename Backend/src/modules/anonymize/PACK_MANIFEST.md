# PACK MANIFEST: AI Anonymization

**Version:** v1.0.0
**Status:** ACTIVE
**Core dependency:** v1.x.x minimum

---

## Feature Flag

`ENABLE_AI_ANONYMIZATION` — default: `false`

Set to `true` to activate AI document anonymization and rehydration features.

---

## Route Prefix

`/api/v1/documents/` (sub-paths under existing documents namespace)

Pack endpoints are mounted at `/api/v1/documents/:documentId/anonymize` and `/api/v1/anonymous-documents/`.

---

## Primary Endpoints

| Method | Path | Feature Flag Required |
|--------|------|---------------------|
| POST | `/api/v1/documents/:documentId/anonymize` | ✅ |
| GET | `/api/v1/anonymous-documents/:id` | ✅ |
| POST | `/api/v1/anonymous-documents/:id/import-ai-response` | ✅ |
| POST | `/api/v1/anonymous-documents/:id/save-as-document` | ✅ |
| GET | `/api/v1/anonymous-documents?caseId=xxx` | ✅ |
| GET | `/api/v1/anonymous-documents?sourceDocId=xxx` | ✅ |
| GET | `/api/v1/clients/:clientId/redaction-profile` | ✅ |
| POST | `/api/v1/clients/:clientId/redaction-profile` | ✅ |

---

## Prisma Models

- `ClientRedactionProfile` — Per-client PII redaction rules (names, addresses, identifiers)
- `AnonymousDocument` — Anonymized document records with AI redaction state and rehydration tracking

---

## Env Vars

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ENABLE_AI_ANONYMIZATION` | Yes (to enable) | `false` | Enable/disable the pack |
| `OPENAI_API_KEY` | When enabled | — | OpenAI API key for PII detection |
| `CLAUDE_API_KEY` | No | — | Alternative AI provider (Anthropic) |

---

## Disable Behavior

When `ENABLE_AI_ANONYMIZATION != 'true'`, all routes return:

```json
{
  "error": "Not Implemented",
  "message": "AI Anonymization feature is disabled. Set ENABLE_AI_ANONYMIZATION=true to enable."
}
```

HTTP status: `501 Not Implemented`

---

## Replaceable Inner Implementation

**Yes.** The inner implementation (OpenAI/Claude API calls, redaction patterns, PII regex rules) can be replaced with a different AI provider or local model without changing the outer contract.

The outer contract (routes, flag name, `ClientRedactionProfile`/`AnonymousDocument` model shapes) is the permanent API surface.

---

## Clean Removal

To remove this pack cleanly:
1. Set `ENABLE_AI_ANONYMIZATION=false`
2. The `ClientRedactionProfile` and `AnonymousDocument` models remain in `schema.prisma` but become inert

---

## Current Status

**ACTIVE** — in production use.

---

## Standards Compliance

| Rule | Status |
|------|--------|
| `ENABLE_<FEATURE>` flag in env.example | ✅ |
| Guard middleware (`requireAnonymizeEnabled`) | ✅ |
| Returns `501` when disabled | ✅ |
| Route prefix | ✅ (extends `/documents/`) |
| Prisma models with OPTIONAL PACK comment | ✅ |
| `PACK_MANIFEST.md` present | ✅ (added Phase 4A) |

---

## Changelog

- **v1.0.0** — Initial active status
- **Phase 4A** — Added this manifest
