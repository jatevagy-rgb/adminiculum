/** Human copy only: classification remains an internal legal review. */
export function complianceFactQuestion(fact: { factKey: string; label: string | null }): string {
  if (fact.factKey === 'whistle_special_sector') return 'Kérjük, írja le a vállalat tevékenységi ágazatait. Az ágazati adatok alapján ügyvéd ellenőrzi a visszaélés-bejelentési szabályok érintettségét.';
  return fact.label ? 'Kérjük, adja meg vagy pontosítsa az alábbi adatot: ' + fact.label + '.' : 'Kérjük, egyeztesse ügyvédjével, milyen további vállalati adat szükséges ehhez a követelményhez.';
}
