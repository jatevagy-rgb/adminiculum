# Document Editor DOCX Numbering and Tables

## Numbering

V1 imports typed decimal legal numbering conservatively. It does not execute or fully reproduce Word numbering definitions. Ambiguous/custom numbering is normalized and warned.

## Legal clauses

Only unambiguous visible numbering becomes structured `legalClause` content. The importer does not infer legal meaning from text.

## Tables

Tables import/export within existing editor row/column limits. Oversized or complex tables are simplified or warned.
