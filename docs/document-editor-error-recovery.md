# Document Editor Error Recovery

## Covered recoverable errors

- metadata load failure;
- template capability load failure;
- review work-item load failure;
- task transition failure;
- DOCX import rejection/failure;
- DOCX export failure;
- invalid editor structure before export.

## Rules

Errors must be bounded, Hungarian, and content-free. They must not include document text, editor JSON, DOCX XML, storage paths, prompts, or raw exception text.
