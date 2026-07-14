# Document Comments Acceptance

## Automated

- unauthenticated list returns `401`;
- missing document returns `404`;
- wrong-case user returns `403`;
- list uses bounded explicit DTOs;
- create trims plain text and derives author from authentication;
- client actor/status/document fields are rejected;
- HTML/oversized content is rejected;
- resolve/reopen transitions work for author/manager;
- repeated transitions return `409`;
- no timeline/notification writes are made.

## Manual

- `/documents/smoke-document/edit` shows the “Dokumentumszintű megjegyzések” tab;
- comment create does not alter the editor dirty-state pill;
- resolve/reopen updates only comment state;
- review confirmation remains visible for dirty editor content;
- compare still says “Mentett források összehasonlítása”;
- `/portal` remains unchanged.
