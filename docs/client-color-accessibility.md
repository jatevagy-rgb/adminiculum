# Client Color Accessibility

## Selector

- Native radio inputs provide one keyboard-selectable group under the `Ügyfélszín` legend.
- Every option has a Hungarian accessible name.
- The selected option includes visible `Kiválasztva` text and native checked state.
- Focus is visible through `focus-within` outline styling.
- `Nincs színjelölés` is an explicit option.

## Rendering

- Client names remain visible on client cards and task/case rows.
- Accent bars are decorative; client-card bars use `aria-hidden`.
- Large areas are not saturated.
- Text colors remain independent of the selected client color.
- Task status, submission status, case status, priority, and actions retain their existing semantic styling.
- Neutral and malformed values render without a color cue and without a crash.

Color is therefore never the sole carrier of client identity or workflow state.
