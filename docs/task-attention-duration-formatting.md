# Task attention duration formatting

The frontend formats API-provided `minMinutes` and `maxMinutes`; it does not duplicate backend duration bands.

## Examples

- `25–50` minutes: `kb. 25–50 perc`
- `60–120` minutes: `kb. 1–2 óra`
- `45–120` minutes: `kb. 45 perc–2 óra`
- exact `90` minutes: `kb. 1 óra 30 perc`

Zero-count categorized cards may show `Nincs ilyen feladat` instead of a zero-minute estimate. Unclassified items show no duration.
