# Template lifecycle és determinisztikus renderelési terv

`DRAFT_CANDIDATE -> LEGAL_REVIEW_REQUIRED -> APPROVED -> ACTIVE -> SUPERSEDED -> RETIRED`

Jelen csomag minden eleme `LEGAL_REVIEW_REQUIRED`. A későbbi backend csak `APPROVED` és `ACTIVE` template-verziót renderelhet, ügyvédi jóváhagyással és auditálható kiválasztással.

Tervezett nem-AI út:

`approved template + approved version + ClientFact / company data + explicit lawyer inputs -> rendered DOCX draft -> document review -> publication decision`

Az alkalmazhatósági engine eredménye nem bináris kényszer: `APPLIES`, `DOES_NOT_APPLY`, `LIKELY_APPLIES`, `REQUIRES_LEGAL_REVIEW`, `UNKNOWN`. Feltételes szövegvariánsok a `template-spec.json` fájlban, nem Word-prose `if` jelölésekben szerepelnek. A renderelő kizárólag egész, regisztrált placeholder tokeneket cserél; ismeretlen vagy hiányzó kötelező mezőnél hibával leáll.
