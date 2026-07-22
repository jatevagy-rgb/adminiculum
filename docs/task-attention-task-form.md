# Task attention form behavior

The Tasks workspace create/edit controls expose:

- `Figyelmi kategória`
- `Becsült idő`

## Category options

- `Nincs besorolva`
- `Gyors átfutás`
- `Jóváhagyás`
- `Aláírás`
- `Szerkesztés`
- `Részletes ellenőrzés`

## Estimate behavior

Users may leave `estimatedMinutes` empty. Empty means the backend/domain category default remains dynamic; the frontend does not write category-default minutes into `estimatedMinutes`.

Users may enter an exact override in minutes. The backend validates the accepted range.
