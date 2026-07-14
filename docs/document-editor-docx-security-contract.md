# Document Editor DOCX Security Contract

## Boundary

DOCX files are untrusted ZIP packages. The editor inspects them locally before conversion and never uploads imported content.

## Blocking checks

Reject wrong extension, suspicious MIME, malformed ZIP, missing `word/document.xml`, unsafe ZIP paths, excessive compressed size, excessive entry count, excessive entry size, excessive total uncompressed size where available, macros, embedded OLE objects, and remote images/external image relationships.

## Warning checks

Warn on comments, tracked changes, footnotes, endnotes, headers, footers, field codes, content controls, images, external hyperlinks, custom numbering and layout approximation.

## Logging

No document XML, text, filename, or generated content should be logged. UI errors are bounded and content-free.
