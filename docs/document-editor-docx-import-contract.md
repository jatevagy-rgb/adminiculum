# Document Editor DOCX Import Contract

## Supported subset

Local `.docx` import supports paragraphs, Heading1-3, bold/italic/underline/strike, visible text, simple tables, explicit page breaks, and conservative typed decimal legal clauses.

## Confirmation

Import always asks before replacing the current session. Dirty sessions and warning-bearing imports remain unchanged unless the user confirms.

## Not supported

Legacy `.doc`, macros, embedded objects, remote images, live tracked changes, Word comments, footnotes/endnotes, headers/footers/page numbers, arbitrary styles, semantic legal classification, and perfect Word round-trip are not supported.
