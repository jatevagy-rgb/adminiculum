# Client Color Palette Contract

Canonical frontend source: `Frontend/src/lib/clientColors.ts`.

| Key | Hungarian label | Accent family |
| --- | --- | --- |
| `RED` | Piros | red 600 |
| `ORANGE` | Narancs | orange 600 |
| `AMBER` | Borostyán | amber 500 |
| `GREEN` | Zöld | emerald 600 |
| `TEAL` | Türkiz | teal 600 |
| `BLUE` | Kék | blue 600 |
| `INDIGO` | Indigó | indigo 600 |
| `PURPLE` | Lila | purple 600 |
| `ROSE` | Rózsaszín | rose 600 |
| `SLATE` | Palaszürke | slate 600 |

Neutral option: `Nincs színjelölés`.

Each definition provides an explicit accent, left-border, subtle background, border, and focus-ring class. Backend values are resolved through an explicit lookup; they are never interpolated into CSS class names.

`null`, `undefined`, and unknown strings return the same neutral definition without throwing. The same key therefore renders identically on Clients, Cases, and Tasks.
