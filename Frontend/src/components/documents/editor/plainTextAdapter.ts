export function plainTextToParagraphs(text: string): string[] {
  if (!text) return [];
  return text.replace(/\r\n/g, "\n").split(/\n{2,}/).map((paragraph) => paragraph.trimEnd());
}

export function paragraphsToPlainText(paragraphs: string[]): string {
  return paragraphs.map((paragraph) => paragraph.trimEnd()).join("\n\n");
}
