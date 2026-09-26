/**
 * Restrained, truthful copy for the Document Reader convergence surface.
 *
 * Keep wording product-level and honest: proposals are decision items, comments
 * are conversation, and completion never claims formal DocumentReview approval.
 */
export const readerCopy = {
  railTitle: 'Észrevételek',
  railOpenLabel: 'Észrevételek',
  railCloseLabel: 'Észrevételek bezárása',

  selectionComment: 'Megjegyzés hozzáadása',
  selectionProposal: 'Módosítási javaslat',

  commentComposerTitle: 'Megjegyzés',
  commentComposerPlaceholder: 'Írd le az észrevételed…',
  commentAdd: 'Hozzáadás',
  cancel: 'Mégse',

  proposalComposerTitle: 'Módosítási javaslat',
  proposalOriginalLabel: 'EREDETI',
  proposalSuggestedLabel: 'JAVASOLT SZÖVEG',
  proposalRationaleLabel: 'Indoklás',
  proposalRationalePlaceholder: 'Miért javaslod a módosítást? (nem kötelező)',
  proposalSubmit: 'Javaslat rögzítése',

  statusPending: 'Elbírálásra vár',
  statusAccepted: 'Elfogadva',
  statusRejected: 'Elutasítva',

  railComplete: 'Minden módosítási javaslat elbírálva.',
  railEmpty: 'Még nincs észrevétel ezen a verzión.',
  railEmptyHint: 'Jelölj ki szöveget a dokumentumban megjegyzés vagy módosítási javaslat rögzítéséhez.',
  railError: 'Az észrevételek most nem tölthetők be.',
  retry: 'Újrapróbálás',

  filterAll: 'Összes',
  filterComments: 'Megjegyzések',
  filterProposals: 'Javaslatok',

  countComments: 'Megjegyzések',
  countProposals: 'Javaslatok',
  countPending: 'Függőben',

  decisionAccept: 'Elfogadás',
  decisionReject: 'Elutasítás',
  rejectReasonLabel: 'Elutasítás indoka',
  rejectReasonRequired: 'Az elutasításhoz indok szükséges.',
  withdraw: 'Javaslat visszavonása',

  displayOnlyNotice: 'Ehhez az előnézethez nem hozható létre verziópontos észrevétel.',
  anchorUnavailable: 'A kijelölés nem képezhető le pontosan erre a verziószövegre. Próbáld újra.',
  historicalVersion: 'Korábbi verzió',

  repliesShow: 'Válaszok',
  replyPlaceholder: 'Válasz…',
  replySubmit: 'Válasz küldése',

  decisionForbidden: 'Ehhez a javaslathoz nincs döntési jogosultságod.',
  actionFailed: 'A művelet nem sikerült. Próbáld újra.',
} as const;
