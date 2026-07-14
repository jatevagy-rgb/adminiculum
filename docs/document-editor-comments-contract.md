# Document Editor Comments Contract

## Current state

Professional editor comments are unavailable. The endpoint returns `canComment: false`, `comments: false`, and `anchoredComments: false`.

## Why

The existing generic `Comment.content` model is not sufficient proof for document-editor anchored comments, selection anchors, authorization semantics, audit/logging redaction, resolve/reopen workflow, or version-aware comments.

## Future requirements

A future comments implementation needs document access checks, bounded plain-text bodies, no HTML, no hidden content storage, no fake anchors, author/time DTOs, resolve/reopen semantics, content-minimal audit, and tests for wrong-document and wrong-case access.
