/**
 * Intake visual tokens (CASE-INTAKE-VISUAL-CORRECTION-1).
 *
 * The first intake build read as fog: overlay, modal, sections, fields and list
 * rows were all near-identical white-greys, so nothing carried hierarchy. These
 * tokens fix the tonal ladder in one place — every intake surface derives its
 * appearance from here rather than from ad-hoc classes at each call site.
 *
 * Tonal ladder, darkest to lightest:
 *   overlay      neutral dark scrim, clearly behind the modal
 *   body         very light neutral, so white sections lift off it
 *   surface      clean white — the primary work areas
 *   secondary    distinct secondary surface for the detailed accordion
 *
 * Accents are functional, never decorative: petrol for matter/intake context,
 * terracotta for communication and attention, deep green reserved for the single
 * create action.
 */

export const ACCENTS = {
  petrol: '#1F5A66',
  terracotta: '#A8442A',
  green: '#1D5138',
  ochre: '#8E6A1B',
  ink: '#16201A',
} as const;

export const intake = {
  /** Scrim: neutral and dark enough that the modal reads as foreground. */
  overlay: 'fixed inset-0 z-[120] bg-[rgba(16,22,19,0.58)] backdrop-blur-[2px]',

  /** The one modal shell. Single scroll surface lives inside it. */
  shell:
    'mx-auto flex w-full max-w-[1000px] flex-col overflow-hidden rounded-xl bg-white ' +
    'shadow-[0_24px_70px_rgba(16,22,19,0.34)] max-h-[88vh]',

  /** Sticky header — strong, not another pale form row. */
  header:
    'sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 ' +
    'border-b border-[rgba(16,22,19,0.14)] bg-white px-5 py-3.5',
  headerTitle: 'font-serif text-[24px] font-semibold leading-none tracking-[-0.01em] text-[#16201A]',

  /** Modal body: very light neutral so the white content areas lift off it. */
  body: 'min-h-0 flex-1 overflow-y-auto bg-[#F4F6F4] px-5 py-4',

  /** A content area. Flat white with a top accent rule — not another big card. */
  area: 'rounded-lg bg-white px-4 py-3.5 shadow-[0_1px_2px_rgba(16,22,19,0.07)]',

  /** Section heading with a functional accent rule. */
  sectionTitle: 'flex items-center gap-2 text-[13px] font-bold uppercase tracking-[0.07em]',

  /** Field label — readable, not faint bureaucratic metadata. */
  label: 'block text-[12px] font-semibold tracking-[0.01em] text-[#2C3A31]',
  required: 'ml-0.5 text-[#A8442A]',

  /** Compact operational field. */
  field:
    'mt-1 w-full rounded-md border border-[rgba(16,22,19,0.20)] bg-white px-2.5 py-[7px] ' +
    'text-[13px] leading-[18px] text-[#16201A] transition-colors ' +
    'focus:border-[#1F5A66] focus:outline-none focus:ring-2 focus:ring-[#1F5A66]/20 ' +
    'disabled:bg-[#F4F6F4] disabled:text-[#7A8479]',

  /** Tight row rhythm — operational, not ceremonial. */
  grid: 'grid grid-cols-1 gap-x-4 gap-y-2.5 sm:grid-cols-2',

  /** The single create action. */
  primaryAction:
    'inline-flex items-center justify-center rounded-md bg-[#1D5138] px-5 py-2 text-[13.5px] font-semibold text-white ' +
    'transition-colors hover:bg-[#164029] focus-visible:outline-none focus-visible:ring-2 ' +
    'focus-visible:ring-[#1D5138] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-[#7A8479]',
  secondaryAction:
    'inline-flex items-center justify-center rounded-md border border-[rgba(16,22,19,0.22)] bg-white px-3.5 py-2 ' +
    'text-[13px] font-semibold text-[#2C3A31] transition-colors hover:bg-[#F4F6F4] ' +
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2C3A31] disabled:opacity-50',

  /** Detailed settings accordion — a distinct secondary surface, never a pale footer. */
  accordion:
    'w-full rounded-lg border border-[rgba(31,90,102,0.28)] bg-[#EDF2F3] px-4 py-3 text-left transition-colors hover:bg-[#E4EDEF]',
  accordionOpen: 'rounded-lg border border-[rgba(31,90,102,0.28)] bg-[#EDF2F3]',

  /** Compact communication summary row. */
  commRow:
    'flex flex-wrap items-center justify-between gap-3 rounded-md border border-[rgba(168,68,42,0.28)] bg-[#FBF0EC] px-3 py-2.5',
} as const;

/** Section accent rule shown before a section title. */
export function accentRule(color: string): string {
  return `inline-block h-3 w-[3px] shrink-0 rounded-full`;
}

export const ACCENT_BG: Record<string, string> = {
  petrol: 'bg-[#1F5A66]',
  terracotta: 'bg-[#A8442A]',
  green: 'bg-[#1D5138]',
  ochre: 'bg-[#8E6A1B]',
};
export const ACCENT_TEXT: Record<string, string> = {
  petrol: 'text-[#1F5A66]',
  terracotta: 'text-[#A8442A]',
  green: 'text-[#1D5138]',
  ochre: 'text-[#8E6A1B]',
};
