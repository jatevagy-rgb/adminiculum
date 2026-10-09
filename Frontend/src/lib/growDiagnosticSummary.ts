import type { DiagnosticWorkbenchDto } from "@/lib/diagnosticWorkbenchApi";

export function growDiagnosticSummary(data: DiagnosticWorkbenchDto) {
  const verifiedFacts = data.known.facts.filter((fact) => fact.verificationStatus === "VERIFIED" && fact.value && fact.value !== "UNKNOWN");
  const snapshots = data.observed.processSnapshots;
  const measured = snapshots.filter((snapshot) => snapshot.metrics.length > 0 && snapshot.metrics.every((metric) =>
    metric.value !== null &&
    (snapshot.metricSourceBasis?.find((basis) => basis.code === metric.code)?.sourceBasis ?? snapshot.sourceBasis) === "MEASURED"
  ));
  const unknown: string[] = [];
  if (data.missing.hasUnknownFacts) unknown.push("Ismeretlen vállalati tények");
  if (data.missing.hasConflictingEvidence) unknown.push("Ellentmondó bizonyítékok");
  if (data.missing.insufficientRecommendationCount > 0) unknown.push(`${data.missing.insufficientRecommendationCount} nem kellően alátámasztott javaslat`);
  if (data.problems.sufficiency.some((item) => item.decision === "NEEDS_MORE_DATA" || item.decision === "INSUFFICIENT_EVIDENCE")) unknown.push("Hiányos döntési alátámasztás");
  if (data.missing.unresolvedItems.length > 0) unknown.push(`${data.missing.unresolvedItems.length} nyitott kérdés`);
  const awaitingDecision = data.proposed.recommendations.filter((recommendation) => recommendation.status === "PENDING_REVIEW");
  const profileSummary = data.client.operatingProfile?.summary?.trim();

  return [
    { question: "Mit tudunk?", answer: verifiedFacts.length > 0
      ? `${verifiedFacts.length} ellenőrzött vállalati tény van rögzítve. ${profileSummary ? "A rögzített profil-összegzés és a tények érvényessége a részletekben olvasható." : "A részletekben az egyes tények érvényessége és forrása látható."}`
      : profileSummary ? "Van rögzített profil-összegzés, de ellenőrzött vállalati tény nincs rögzítve. Az összegzés a részletekben olvasható."
        : "Nincs ellenőrzött vállalati tény rögzítve ebben a nézetben." },
    { question: "Mi az ügyfél jelzése?", answer: data.observed.observations.length > 0
      ? `${data.observed.observations.length} deklarált megfigyelés van rögzítve. Ezek nem azonosak mért működési adatokkal.`
      : "Nincs rögzített deklarált megfigyelés; ebből nem következik, hogy az ügyfélnek nincs problémája." },
    { question: "Mit támaszt alá működési adat?", answer: measured.length > 0
      ? `${measured.length} teljesen mért forrásalapú folyamatpillanatkép látható. A további ${snapshots.length - measured.length} pillanatkép forrásalapját külön ellenőrizze.`
      : snapshots.length > 0
        ? `${snapshots.length} folyamatpillanatkép van, de egyik sem igazolt teljesen mért forrásalappal.`
        : "Nincs rögzített folyamatpillanatkép. Nem állítunk mért működési eredményt." },
    { question: "Mi bizonytalan?", answer: unknown.length > 0
      ? unknown.join(" · ")
      : "Nincs kifejezetten jelzett hiány vagy ellentmondás; ez nem bizonyítja az adatok teljes elégségességét." },
    { question: "Mi a következő szakmai ellenőrzés?", answer: data.missing.hasConflictingEvidence
      ? "Az ellentmondó bizonyítékok szakmai egyeztetése szükséges."
      : data.missing.hasUnknownFacts
        ? "Az ismeretlen tényeket ellenőrizni kell, mielőtt következtetés születik."
        : data.problems.sufficiency.some((item) => item.decision === "HUMAN_DOMAIN_REVIEW")
          ? "Szakértői területi felülvizsgálat szükséges."
          : data.missing.insufficientRecommendationCount > 0
            ? "A javaslatok alátámasztásához további bizonyíték ellenőrzése szükséges."
            : "Nincs külön kijelölt szakmai ellenőrzés ebben az adatkészletben." },
    { question: "Mi a következő emberi döntés?", answer: awaitingDecision.length > 0
      ? `${awaitingDecision.length} belső javaslat vár emberi felülvizsgálatra. Ebből nem következik automatikus ügyféloldali döntés.`
      : "Nincs új, emberi felülvizsgálatra váró javaslattervezet rögzítve." },
  ];
}
