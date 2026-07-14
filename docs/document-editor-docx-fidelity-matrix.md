# Document Editor DOCX Fidelity Matrix

| Feature | Import | Export | Fidelity |
|---|---|---|---|
| Paragraph text | supported | supported | high within subset |
| Headings 1-3 | supported | supported | high within subset |
| Bold/italic/underline/strike | supported | supported | high within subset |
| Hyperlinks | flattened/removed | flattened | warning |
| Typed decimal legal clauses | structured where clear | generated visible numbers | medium |
| Custom Word numbering | normalized | simplified | warning |
| Tables | bounded support | bounded support | medium |
| Page breaks | supported | supported | medium |
| Headers/footers/page numbers | warning/removal | not generated | unsupported |
| Comments | warning/removal | not generated | unsupported |
| Tracked changes | flattened | not generated | unsupported |
| Images | warning/removal or reject remote | not generated | unsupported |
| Macros/OLE | rejected | not generated | rejected |
