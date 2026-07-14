# Document Comments Content Safety

Comments are plain text only.

## Limits and rejection rules

- minimum: non-empty after trim;
- maximum: 2000 characters;
- control characters removed before validation;
- excessive whitespace normalized;
- HTML tags, event handlers, scripts, `javascript:` URLs, base64 embedded data, very long URLs, editor JSON, selected text, anchors, arbitrary status, client author id, route document id overrides, and case id overrides are rejected.

Comment content is rendered as text with React escaping, never with `dangerouslySetInnerHTML`.
