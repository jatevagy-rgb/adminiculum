# Document Editor Server Validation Contract

## Implemented module

`Backend/src/modules/documentEditor/contentSchema.ts` validates future `TIPTAP_JSON` envelopes as pure code. It does not persist, fetch, or log editor content.

## Validation scope

The validator checks envelope version, route document id agreement, allowed node/mark/attribute sets, bounded depth/node/text/byte sizes, table limits, legal clause ids, duplicate clause ids, field token allow-list, page break attrs, and link protocols.

## Rejections

The validator rejects scripts, iframe/object/embed-like content, JavaScript/data URLs, base64 file/image payloads, unknown schema elements, prototype-related keys, malformed tables, excessive depth, excessive size, and arbitrary field access expressions.

## Error handling

Errors are bounded and content-free. Rejected content is not returned and must not be logged by future routes.

## Drift detection

Backend tests cover the server allow-list. The frontend static/editor schema tests continue to guard the client schema. Future persistence work should add a shared fixture or generated allow-list comparison before enabling writes.
