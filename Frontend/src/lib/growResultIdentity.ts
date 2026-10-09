export function formatGrowCompletion(completedAt: string): string {
  const date = new Date(completedAt);
  if (Number.isNaN(date.getTime())) return "Befejezés ideje nem ismert";
  return new Intl.DateTimeFormat("hu-HU", {
    dateStyle: "medium", timeStyle: "medium", timeZone: "Europe/Budapest",
  }).format(date);
}
