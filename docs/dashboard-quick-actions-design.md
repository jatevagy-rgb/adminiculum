# Dashboard Quick Actions Design

## Primary Actions

Exactly four actions remain in the primary grid:

| Action | Truthful destination | Supporting copy |
| --- | --- | --- |
| Új ügy | `/cases?newCase=1` | Új ügy munkaterének létrehozása |
| Új feladat | `/tasks?newTask=1` | Teendő rögzítése ügyhöz |
| Dokumentum feltöltése | Active case documents route, otherwise `/cases` | Irat kapcsolása egy ügyhöz |
| Kommunikáció megnyitása | `/notifications` | Beérkező és kimenő tételek áttekintése |

Each card has a local line icon, title, concise support text, quiet arrow, hover elevation, and visible keyboard focus. Icons load no remote asset.

## Secondary Actions

`Review sor`, `Határidők`, and `Munkaórák` remain available as compact text links under `További műveletek`.

## Responsive Contract

- Four columns at wide desktop width.
- Two-by-two cards at 1100 px.
- No saturated seven-card strip and no horizontal scrolling.
