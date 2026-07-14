# Document Editor Template Bridge Audit

## Classification

| Flow | Classification | Reason |
|---|---|---|
| Direct `ContractTemplate` to editor | `UNAVAILABLE` | Templates are backend DOCX/template-fill assets, not Tiptap source documents. |
| Existing generated DOCX downloaded by user | `DOWNLOAD_ONLY` | Existing authorized download can be imported locally by user action. |
| Automatic generated DOCX import | `FEATURE_GATED` | Would require explicit backend flow review and no automatic generation. |
| Editor-driven template fill | `UNAVAILABLE` | Would risk broad template data exposure and fake persistence. |

## Decision

No template bridge runtime was implemented. The safe V1 bridge is manual: authorized download first, then local DOCX import.
